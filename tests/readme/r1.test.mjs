// Epic R1 Test Contract. Run: node --test tests/readme/r1.test.mjs
// Network cases (T-R1-07, T-R1-14) and the live-host validation (T-R1-06) skip with a reason when unavailable.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as chk from '../../scripts/check-readme.mjs';
import { renderReport } from '../../scripts/morning-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const CHECKER = path.join(ROOT, 'scripts', 'check-readme.mjs');
const run = (args, opts) => cp.spawnSync(process.execPath, [CHECKER, ...args], { cwd: ROOT, encoding: 'utf8', ...opts });
const sh = (cmd, cwd) => cp.spawnSync('sh', ['-c', cmd], { cwd: cwd || ROOT, encoding: 'utf8', timeout: 120000 });
const tmpRoot = (readme) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-'));
  for (const f of ['tests/claims.json', 'tests/install-commands.json', 'LICENSE']) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(d, f)); }
  fs.writeFileSync(path.join(d, 'README.md'), readme);
  return d;
};
const tags = sh('git tag').stdout.trim();

test('T-R1-01 section order and claims ledger', () => {
  const r = run(['--order', '--claims']);
  assert.equal(r.status, 0, r.stdout);
  const bad = tmpRoot(README.replace('## Token economy', '## Token economy\n\nIt saves 73 percent of tokens.\n'));
  const b = run(['--claims', '--root', bad]);
  assert.equal(b.status, 1);
  assert.match(b.stdout, /digit-bearing claim without a ledger entry/);
  const swapped = tmpRoot(README.replace('## The spine', '## XSPINE').replace('## Token economy', '## The spine').replace('## XSPINE', '## Token economy'));
  assert.equal(run(['--order', '--root', swapped]).status, 1);
});

test('T-R1-02 length cap', () => {
  assert.equal(run(['--length']).status, 0);
  const long = tmpRoot(README + '\nx\n'.repeat(460));
  assert.equal(run(['--length', '--root', long]).status, 1);
});

test('T-R1-03 hero svg is well formed', () => {
  const f = path.join(ROOT, 'assets', 'do-it-hero.svg');
  assert.equal(sh('xmllint --noout ' + f).status, 0);
  const s = fs.readFileSync(f, 'utf8');
  assert.match(s, /viewBox="0 0 1200 600"/);
  assert.match(s, /<title[^>]*>[^<]+<\/title>/);
  assert.match(s, /<desc[^>]*>[^<]+<\/desc>/);
  assert.match(s, /role="img"/);
  for (const c of ['Claude Code', 'Codex', 'OpenCode', 'Engine']) assert.ok(s.includes('>' + c + '<'), c);
  assert.ok(s.includes('stop-color="#0b1220"') && s.includes('stop-color="#0d1a2b"'));
});

test('T-R1-04 pipeline svg is well formed', () => {
  const f = path.join(ROOT, 'assets', 'do-it-pipeline.svg');
  assert.equal(sh('xmllint --noout ' + f).status, 0);
  const s = fs.readFileSync(f, 'utf8');
  assert.match(s, /<title[^>]*>[^<]+<\/title>/);
  assert.match(s, /<desc[^>]*>[^<]+<\/desc>/);
  assert.match(s, /stroke-dasharray/);
  for (const l of ['spine', 'owner pack', 'finish line']) assert.ok(s.includes(l), l);
  assert.doesNotMatch(s, /href=/);
});

test('T-R1-05 links and anchors resolve', { skip: !fs.existsSync(path.join(ROOT, 'hosts', 'engine', 'README.md')) && 'IMPLEMENTED-NOT-VERIFIED: hosts/engine/README.md (lane L4, epic N3) is absent from this branch; the link is real and the checker names it' }, () => {
  assert.equal(run(['--links']).status, 0);
});

test('T-R1-05b broken link in a scratch copy is named', () => {
  const bad = tmpRoot(README.replace('(LICENSE)', '(NOPE.md)'));
  const r = run(['--links', '--root', bad]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NOPE\.md/);
  assert.doesNotMatch(chk.checkLinks(README, ROOT).join('\n'), /#/);
});

test('T-R1-06 Claude Code commands are valid [REAL]', (t) => {
  if (sh('command -v claude').status !== 0) return t.skip('IMPLEMENTED-NOT-VERIFIED: claude is not installed');
  for (const p of ['.', 'plugins/do-it']) { const r = sh('claude plugin validate ' + p); assert.equal(r.status, 0, r.stdout + r.stderr); }
  const cmds = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/install-commands.json'), 'utf8')).hosts['claude-code'].commands;
  assert.deepEqual(cmds, ['/plugin marketplace add DevOtts/do-it', '/plugin install do-it@devotts']);
  const block = README.split('### Claude Code (native)')[1].split('### Codex')[0];
  for (const c of cmds) assert.ok(block.includes(c));
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).name, 'devotts');
});

test('T-R1-07 universal installer commands are valid [REAL]', (t) => {
  const r = sh('npx --yes skills add ./ --list');
  if (r.status !== 0) return t.skip('IMPLEMENTED-NOT-VERIFIED: npx skills unavailable: ' + (r.stderr || '').slice(0, 120));
  assert.match(r.stdout, /do-it/);
  const ev = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/plugin/evidence/skills-agent-ids.json'), 'utf8')).agents_checked;
  const ids = [...README.matchAll(/-a ([a-z{}]+)/g)].map((m) => m[1]).filter((i) => i !== '{agent}');
  for (const id of ids) assert.equal(ev[id], 'listed', id + ' is not in the installer list');
  assert.ok(README.includes('gh skill install DevOtts/do-it'));
});

test('T-R1-08 out-of-scope hosts are absent', () => {
  for (const f of ['README.md', 'assets/do-it-hero.svg', 'assets/do-it-pipeline.svg', 'tests/install-commands.json']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /hermes|openclaw/i, f);
  }
});

test('T-R1-09 header block structure', () => {
  assert.equal(run(['--header']).status, 0);
  assert.deepEqual(chk.checkHeader(README, { releaseExists: tags.length > 0 }), []);
  const shortAlt = README.replace(/alt="do-it hero:[^"]*"/, 'alt="hero"');
  assert.match(chk.checkHeader(shortAlt, { releaseExists: false }).join(), /alt text/);
});

test('T-R1-10 badges point at real targets', () => {
  assert.equal(run(['--badges']).status, 0);
  assert.match(chk.checkBadges(README.replace(/style=for-the-badge/, 'style=flat'), { releaseExists: false }).join(), /for-the-badge/);
});

test('T-R1-11 installation section covers the hosts', () => {
  const r = run(['--install']);
  assert.equal(r.status, 0, r.stdout);
});

test('T-R1-12 dependency claim is gated on evidence', () => {
  const ev = path.join(ROOT, 'tests/plugin/evidence/dependency-resolution.json');
  const resolved = JSON.parse(fs.readFileSync(ev, 'utf8')).outcome === 'resolved';
  assert.equal(/installs the family/.test(README), resolved);
  const ctx = { root: ROOT, installFile: path.join(ROOT, 'tests/install-commands.json'), depFile: '/nonexistent/dep.json' };
  const errs = chk.checkInstall(README, ctx).join('\n');
  assert.match(errs, /installs the family/);
  assert.match(errs, /do-it doctor --install/);
});

test('T-R1-13 footer and license', () => {
  assert.equal(run(['--footer']).status, 0);
  assert.equal(README.trimEnd().split('\n').pop(), '_Built by [DevOtts](https://github.com/DevOtts)._');
  assert.ok(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').startsWith('MIT License'));
});

test('T-R1-14 external links resolve [REAL]', async (t) => {
  const urls = [...new Set([...README.matchAll(/https:\/\/[^\s"')\]>]+/g)].map((m) => m[0].replace(/[.,]$/, '')))];
  const unpublished = [];
  const bad = [];
  try {
    for (const u of urls) {
      const res = await fetch(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (![200, 301, 302].includes(res.status)) {
        if (res.status === 404 && u === 'https://github.com/DevOtts/do-it') unpublished.push(u);
        else bad.push(u + ' ' + res.status);
      }
    }
  } catch (e) { return t.skip('IMPLEMENTED-NOT-VERIFIED: no network: ' + e.message); }
  assert.deepEqual(bad, []);
  if (unpublished.length) t.diagnostic('unpublished: ' + unpublished.join(','));
});

test('T-R1-15 morning report is real output, equals a fresh stub-host harness run [REAL]', () => {
  const out1 = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-fo-'));
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-wd-'));
  for (const [f, o] of [['feature-overnight', out1], ['weekly-drain', out2]]) {
    const r = sh('node tests/e2e/run.mjs --fixture ' + f + ' --out ' + o);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  const blocks = [...README.split('## What the morning report looks like')[1].split('## What')[0].matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], renderReport(out1));
  assert.equal(blocks[1], renderReport(out2));
  assert.match(blocks[1], /PARKED/);
  assert.match(blocks[0], /VERIFIED/);
});

test('T-R1-16 tone and placeholders', () => {
  assert.equal(run(['--tone']).status, 0);
  assert.match(chk.checkTone(README.replace('## Status', '## Status\n\nComing soon.\n')).join(), /tone/);
  assert.match(chk.checkTone(README.replace('## Status', '## Status\n\nSee <your-repo>.\n')).join(), /placeholder/);
});
