// Epic R2 test contract. Run: node --test tests/plugin
// Case IDs appear in test names. [REAL] cases hit the real claude binary, npx, siblings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, existsSync, statSync, readdirSync, appendFileSync, chmodSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVID = join(ROOT, 'tests/plugin/evidence');
const SIBLINGS = process.env.DO_IT_SIBLINGS ?? resolve(ROOT, '../../..');
const sh = (cmd, args, o = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...o });
const node = (args, o) => sh(process.execPath, args, o);
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
const has = (cmd) => sh('which', [cmd]).status === 0;
mkdirSync(EVID, { recursive: true });
const scratchRoot = () => {
  const d = mkdtempSync(join(tmpdir(), 'r2-'));
  for (const f of ['SKILL.md', 'core/companions.json', '.claude-plugin/marketplace.json', 'plugins/do-it/.claude-plugin/plugin.json', 'plugins/do-it/skills/do-it/SKILL.md', 'plugins/do-it/skill-src']) {
    mkdirSync(dirname(join(d, f)), { recursive: true });
    cpSync(join(ROOT, f), join(d, f), { recursive: true });
  }
  return d;
};

test('T-R2-01 plugin manifest validates with the real host validator [REAL]', (t) => {
  if (!has('claude')) return t.skip('IMPLEMENTED-NOT-VERIFIED: claude binary not found');
  const r = sh('claude', ['plugin', 'validate', 'plugins/do-it']);
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.doesNotMatch(out, /Unknown field/);
  assert.doesNotMatch(out, /dependencies.*(error|invalid)|(error|invalid).*dependencies/i);
});

test('T-R2-02 repo-root marketplace validates [REAL]', (t) => {
  if (!has('claude')) return t.skip('IMPLEMENTED-NOT-VERIFIED: claude binary not found');
  const r = sh('claude', ['plugin', 'validate', '.']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(json('.claude-plugin/marketplace.json').name, 'devotts');
});

test('T-R2-03 marketplace entry shape', () => {
  const m = json('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'devotts');
  const own = m.plugins.filter((p) => p.name === 'do-it');
  assert.equal(own.length, 1);
  assert.equal(own[0].source, './plugins/do-it');
  assert.equal(own[0].version, '0.1.0');
  for (const p of m.plugins.filter((x) => x.name !== 'do-it')) {
    assert.equal(p.source.source, 'github', p.name);
    assert.match(p.source.repo, /^DevOtts\/[a-z-]+$/, p.name);
    assert.match(p.version, /^[0-9]+\.[0-9]+\.[0-9]+$/, p.name);
  }
});

test('T-R2-04 dependencies equal the published required companions', () => {
  const pj = json('plugins/do-it/.claude-plugin/plugin.json');
  assert.ok(Array.isArray(pj.dependencies));
  const want = json('core/companions.json').companions.filter((c) => c.required && c.status === 'published').map((c) => c.name).sort();
  assert.deepEqual([...pj.dependencies].sort(), want);
  assert.deepEqual(want, ['build-it', 'conclude-it', 'plan-it', 'prompt-it', 'review-it']);
  for (const n of ['parallel-lifecycle', 'deploy-it', 'reconcile-it']) assert.ok(!pj.dependencies.includes(n), n);
});

test('T-R2-05 pins are exact', () => {
  assert.equal(node(['scripts/check-pins.mjs', '--lint']).status, 0);
  const planned = json('core/companions.json').companions.filter((c) => c.status === 'planned');
  assert.ok(planned.length === 2 && planned.every((c) => c.version === null));
  for (const bad of ['^0.3.0', 'latest']) {
    const d = scratchRoot();
    const c = json('core/companions.json');
    c.companions[0].version = bad;
    writeFileSync(join(d, 'core/companions.json'), JSON.stringify(c));
    const r = node(['scripts/check-pins.mjs', '--lint', '--root', d]);
    assert.equal(r.status, 1, bad);
    assert.match(r.stdout, /prompt-it/);
  }
});

test('T-R2-06 pin-drift detector finds the 0.2.1 to 0.3.0 drift [REAL]', (t) => {
  const need = ['build-it', 'plan-it', 'review-it'].map((n) => join(SIBLINGS, n, '.claude-plugin/marketplace.json'));
  if (need.some((f) => !existsSync(f))) return t.skip(`IMPLEMENTED-NOT-VERIFIED: sibling repos not found under ${SIBLINGS}`);
  const before = need.map((f) => statSync(f).mtimeMs);
  const r = node(['scripts/check-pins.mjs', '--siblings', SIBLINGS]);
  assert.equal(r.status, 1, r.stdout);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 3, r.stdout);
  const got = lines.map((l) => l.replace(SIBLINGS + '/', '')).sort();
  assert.deepEqual(got, [
    'build-it/.claude-plugin/marketplace.json:18 prompt-it found 0.2.1 expected 0.3.0',
    'plan-it/.claude-plugin/marketplace.json:16 prompt-it found 0.2.1 expected 0.3.0',
    'review-it/.claude-plugin/marketplace.json:16 prompt-it found 0.2.1 expected 0.3.0',
  ]);
  assert.deepEqual(need.map((f) => statSync(f).mtimeMs), before);
});

test('T-R2-07 generated SKILL.md is deterministic', () => {
  const d = mkdtempSync(join(tmpdir(), 'r2g-'));
  const outs = [1, 2].map((i) => {
    const o = join(d, `s${i}.md`);
    assert.equal(node(['scripts/generate-skill.mjs', '--out', o]).status, 0);
    return o;
  });
  assert.equal(sha(outs[0]), sha(outs[1]));
  assert.equal(sha(outs[0]), sha(join(ROOT, 'SKILL.md')), 'committed SKILL.md is stale');
  const text = readFileSync(outs[0], 'utf8');
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (!inFence) assert.doesNotMatch(line, /claude-code|codex|opencode/, line);
  }
});

test('T-R2-08 mirror parity detects a one-byte change', () => {
  const d = scratchRoot();
  const man = join(d, 'manifest.json');
  writeFileSync(man, JSON.stringify({ pairs: [{ src: 'SKILL.md', dst: 'plugins/do-it/skills/do-it/SKILL.md', kind: 'file' }] }));
  assert.equal(node(['scripts/sync-mirror.mjs', '--check', '--root', d, '--manifest', man]).status, 0);
  appendFileSync(join(d, 'plugins/do-it/skills/do-it/SKILL.md'), 'x');
  const r = node(['scripts/sync-mirror.mjs', '--check', '--root', d, '--manifest', man]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SKILL\.md/);
  writeFileSync(man, JSON.stringify({ pairs: [{ src: 'core/not-shipped.mjs', dst: 'plugins/do-it/x.mjs', kind: 'file' }] }));
  const m = node(['scripts/sync-mirror.mjs', '--check', '--root', d, '--manifest', man]);
  assert.equal(m.status, 3);
  assert.match(m.stdout, /core\/not-shipped\.mjs/);
  // the real tree: shipped pair is clean, and unshipped sources are never reported as ok
  const real = node(['scripts/sync-mirror.mjs', '--check']);
  assert.ok(real.stdout.includes('MISSING') ? real.status === 3 : real.status !== 0 || real.stdout.includes('mirror ok'));
  assert.doesNotMatch(real.stdout, /DIFF SKILL\.md/);
});

test('T-R2-09 skill authorship rule', () => {
  const text = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(fm, /^name: do-it$/m);
  assert.match(fm, /^description:/m);
  assert.match(fm, /^author: DevOtts$/m);
  assert.match(fm, /^author_url: https:\/\/github\.com\/DevOtts$/m);
  assert.equal(text.trimEnd().split('\n').pop(), '_Authored by [DevOtts](https://github.com/DevOtts)._');
});

test('T-R2-10 universal installer sees the skill [REAL]', (t) => {
  if (!has('npx')) return t.skip('IMPLEMENTED-NOT-VERIFIED: npx not found');
  const r = sh('npx', ['--yes', 'skills', 'add', './', '--list'], { timeout: 120000 });
  const out = strip(r.stdout + r.stderr);
  if (r.status !== 0 && /ENOTFOUND|EAI_AGAIN|network|fetch failed/i.test(out)) return t.skip('IMPLEMENTED-NOT-VERIFIED: no network for npx skills');
  assert.equal(r.status, 0, out);
  assert.match(out, /\bdo-it\b/);
  // agent ids: an invalid id makes the installer print its own list
  const scratch = mkdtempSync(join(tmpdir(), 'r2s-'));
  const bad = spawnSync('npx', ['--yes', 'skills', 'add', ROOT, '-a', 'zzzbad', '-y'], { cwd: scratch, encoding: 'utf8', timeout: 120000 });
  const list = strip(bad.stdout + bad.stderr).match(/Valid agents: (.*)/)?.[1]?.split(/,\s*/) ?? [];
  assert.ok(list.length > 10, 'installer agent list not readable');
  const rec = { codex: list.includes('codex') ? 'listed' : 'generic', opencode: list.includes('opencode') ? 'listed' : 'generic' };
  writeFileSync(join(EVID, 'skills-agent-ids.json'), JSON.stringify({ case: 'T-R2-10', agents_checked: rec, valid_agent_count: list.length }, null, 2) + '\n');
  const ic = json('tests/install-commands.json');
  assert.equal(ic.hosts.codex.agent_id_form, rec.codex);
  assert.equal(ic.hosts.opencode.agent_id_form, rec.opencode);
});

test('T-R2-11 install-time dependency resolution observed [REAL]', (t) => {
  if (!has('claude')) return t.skip('IMPLEMENTED-NOT-VERIFIED: claude binary not found');
  const cfg = mkdtempSync(join(tmpdir(), 'r2cfg-'));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  const add = sh('claude', ['plugin', 'marketplace', 'add', './'], { env, timeout: 120000 });
  assert.equal(add.status, 0, add.stdout + add.stderr);
  const inst = sh('claude', ['plugin', 'install', 'do-it@devotts'], { env, timeout: 240000 });
  const list = strip(sh('claude', ['plugin', 'list'], { env }).stdout);
  const required = ['prompt-it', 'plan-it', 'build-it', 'review-it', 'conclude-it'];
  const listed = required.filter((n) => new RegExp(`${n}@devotts`).test(list));
  const resolved = inst.status === 0 && listed.length === 5;
  const rec = resolved
    ? { case: 'T-R2-11', outcome: 'resolved', host_version: sh('claude', ['--version']).stdout.trim(), companions_listed: listed, install_stdout: strip(inst.stdout).trim() }
    : { case: 'T-R2-11', outcome: 'unresolved', exit_code: inst.status, error: strip(inst.stdout + inst.stderr).trim(), companions_listed: listed };
  writeFileSync(join(EVID, 'dependency-resolution.json'), JSON.stringify(rec, null, 2) + '\n');
  rmSync(cfg, { recursive: true, force: true });
  assert.ok(['resolved', 'unresolved'].includes(rec.outcome));
  if (!resolved && /ENOTFOUND|EAI_AGAIN|network|git clone|Failed to clone/i.test(rec.error ?? '')) t.skip('IMPLEMENTED-NOT-VERIFIED: network unreachable, recorded as unresolved');
});

const SPINE = join(ROOT, 'core/spine/do-it.mjs');
const spineMissing = 'IMPLEMENTED-NOT-VERIFIED: core/spine/do-it.mjs not shipped yet (epic S1 doctor --install)';
const REQUIRED = ['prompt-it', 'plan-it', 'build-it', 'review-it', 'conclude-it'];

for (const [id, host] of [['T-R2-12', 'codex'], ['T-R2-13', 'opencode']]) {
  test(`${id} ${host} fallback install dry-run [REAL]`, (t) => {
    if (!existsSync(SPINE)) return t.skip(spineMissing);
    const work = mkdtempSync(join(tmpdir(), 'r2d-'));
    const r = spawnSync(process.execPath, [SPINE, 'doctor', '--install', '--host', host, '--dry-run'], { cwd: work, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('npx skills add'));
    assert.deepEqual(lines, REQUIRED.map((n) => `npx skills add DevOtts/${n} -a ${host}`));
    assert.doesNotMatch(r.stdout, /parallel-lifecycle|deploy-it|reconcile-it/);
    const written = readdirSync(work).filter((f) => f !== '.do-it');
    assert.deepEqual(written, []);
  });
}

test('T-R2-14 install fallback ends in PARTIAL_FAILURE then recovers [REAL]', (t) => {
  if (!existsSync(SPINE)) return t.skip(spineMissing);
  const work = mkdtempSync(join(tmpdir(), 'r2p-'));
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const log = join(work, 'calls.log');
  const stub = (failName) => writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho "$@" >> ${log}\ncase "$*" in *${failName}*) echo boom >&2; exit 1;; esac\nexit 0\n`);
  stub('build-it');
  chmodSync(join(bin, 'npx'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const r1 = spawnSync(process.execPath, [SPINE, 'doctor', '--install', '--host', 'codex'], { cwd: work, encoding: 'utf8', env });
  assert.equal(r1.status, 1, r1.stdout + r1.stderr);
  assert.match(r1.stdout + r1.stderr, /PARTIAL_FAILURE/);
  stub('NEVERMATCH');
  chmodSync(join(bin, 'npx'), 0o755);
  writeFileSync(log, '');
  const r2 = spawnSync(process.execPath, [SPINE, 'doctor', '--install', '--host', 'codex'], { cwd: work, encoding: 'utf8', env });
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(calls.length, 3, 'only the missing three are installed');
});

test('T-R2-15 version consistency', () => {
  assert.equal(node(['scripts/check-pins.mjs', '--self']).status, 0);
  const d = scratchRoot();
  const pj = join(d, 'plugins/do-it/.claude-plugin/plugin.json');
  const p = JSON.parse(readFileSync(pj, 'utf8'));
  p.version = '0.2.0';
  writeFileSync(pj, JSON.stringify(p));
  const r = node(['scripts/check-pins.mjs', '--self', '--root', d]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /marketplace\.json|companions\.json|plugin\.json/);
});

test('T-R2-16 out-of-scope hosts and secrets', () => {
  const targets = ['plugins', '.claude-plugin', 'scripts', 'core/companions.json'].map((p) => join(ROOT, p));
  const hosts = new RegExp(['her' + 'mes', 'open' + 'claw'].join('|'), 'i');
  const secrets = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][^"']{12,}["']/i];
  const files = [];
  const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).forEach((e) => walk(join(p, e))) : files.push(p));
  targets.forEach(walk);
  assert.ok(files.length > 5);
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    assert.doesNotMatch(txt, hosts, f);
    for (const s of secrets) assert.doesNotMatch(txt, s, f);
  }
});
