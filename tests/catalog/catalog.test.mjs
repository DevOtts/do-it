// R3 Test Contract: T-R3-01..T-R3-16. Run: node --test "tests/catalog/*.test.mjs"
// Sibling plugin repos are read-only: nothing here writes under them (T-R3-16 proves it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, SIZES, parseSections, parseFields, parseTables, parseFenced, parseCitations, lint, toJson } from '../../scripts/lint-catalog.mjs';
import { validate } from './mini-schema.mjs';
import { resolveDoItHome } from './resolve-home.mjs';
import { runLeg, runDeploy, STATES, EXIT, digestOf } from './leg-reference.mjs';
import { checkState, apply, STATE_SCHEMA } from './reconcile-reference.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = join(ROOT, 'plugins/do-it/catalog/companion-changes.md');
const LINT = join(ROOT, 'scripts/lint-catalog.mjs');
const md = readFileSync(CATALOG, 'utf8');
const sections = parseSections(md);
const fenced = parseFenced(md);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
const tmp = (p) => mkdtempSync(join(realpathSync(tmpdir()), `r3-${p}-`));
const runLint = (file) => spawnSync('node', [LINT, file], { encoding: 'utf8' });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// sibling repos live next to the main checkout (the worktree's git common dir parent's parent)
const SIBLINGS = process.env.DO_IT_SIBLINGS ?? dirname(dirname(resolve(ROOT, git(ROOT, 'rev-parse', '--git-common-dir'))));
const REPOS = ['prompt-it', 'plan-it', 'build-it', 'review-it', 'conclude-it', 'parallel-lifecycle'];
const siblingsReadable = REPOS.every((r) => existsSync(join(SIBLINGS, r, 'SKILL.md')));

function snapshot() {
  const out = {};
  for (const r of REPOS) {
    const dir = join(SIBLINGS, r);
    let newest = 0;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p); else newest = Math.max(newest, statSync(p).mtimeMs);
      }
    };
    walk(dir);
    out[r] = { status: git(dir, 'status', '--porcelain'), newest };
  }
  return out;
}
const BEFORE = siblingsReadable ? snapshot() : null;

test('T-R3-01 catalog structure lints clean (G-14)', () => {
  const r = runLint(CATALOG);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([...sections.keys()].filter((n) => SECTIONS.includes(n)), SECTIONS);
  for (const name of SECTIONS) {
    const f = parseFields(sections.get(name));
    for (const k of ['Owner repo', 'Current state', 'Exact changes', 'Size', 'Verification case']) assert.ok(f[k], `${name}: ${k}`);
    assert.equal(f.Size.split(/\s+/)[0], SIZES[name], `${name} size`);
  }
  const json = JSON.parse(readFileSync(join(ROOT, 'plugins/do-it/catalog/companion-changes.json'), 'utf8'));
  assert.deepEqual(json, toJson(md), 'companion-changes.json is stale: rerun lint with --write-json');
  assert.equal(/herm(?:es)|open(?:claw)/i.test(md), false);
});

test('T-R3-02 lint rejects a malformed catalog', () => {
  const dir = tmp('lint');
  const sec = sections.get('deploy-it');
  const broken = sec.replace(/^\*\*Size:\*\*.*$/m, '').replace('T-R3-10', 'T-R3-10, T-R3-99');
  const file = join(dir, 'catalog.md');
  writeFileSync(file, md.replace(sec, broken));
  const r = runLint(file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /deploy-it: missing Size/);
  assert.match(r.stderr, /unknown case id T-R3-99/);
});

test('T-R3-03 it-result/1 section matches CONTRACT (G-1)', () => {
  const contract = readFileSync(join(ROOT, 'delivery/CONTRACT.md'), 'utf8');
  const line = contract.split('\n').find((l) => l.startsWith('- **it-result/1**'));
  const fieldText = line.split(' fields ')[1].split('. exit_code')[0].replace(/\([^)]*\)/g, '');
  const want = fieldText.split(',').map((s) => s.trim()).filter(Boolean);
  const mine = sections.get('all companions').match(/^- it-result\/1 fields: (.+?)\.$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual([...mine].sort(), [...want].sort());
  assert.equal(want.length, 15);
  const map = Object.fromEntries([...sections.get('all companions').match(/^- exit_code mirror: (.+?)\.$/m)[1].matchAll(/(\w+) (\d)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(map, { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 });
});

test('T-R3-04 [REAL] DO_IT_HOME resolution on a real git worktree', () => {
  const dir = tmp('home');
  const main = join(dir, 'repo');
  mkdirSync(main);
  git(main, 'init', '-q');
  git(main, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const wt = join(dir, 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'feat', wt);
  const real = (p) => realpathSync(p);
  assert.equal(resolveDoItHome({ cwd: wt, env: { DO_IT_HOME: '/custom/home' } }), '/custom/home');
  assert.equal(real(dirname(resolveDoItHome({ cwd: wt, env: {} }))), real(main));
  assert.equal(resolveDoItHome({ cwd: wt, env: {} }).endsWith('/repo/.do-it'), true);
  assert.equal(real(dirname(resolveDoItHome({ cwd: main, env: {} }))), real(main));
  const txt = sections.get('all companions');
  for (const needle of ['DO_IT_HOME', 'git rev-parse --git-common-dir', '{repo}/.do-it']) assert.ok(txt.includes(needle), needle);
});

const TIER_WORD = /\b(T1|T2|T3|opus|sonnet|haiku|tier|tiers|tiering)\b/gi;
function citeCheck(c) {
  const line = readFileSync(join(SIBLINGS, c.path), 'utf8').split('\n')[c.line - 1];
  return line !== undefined && line.includes(c.text);
}

test('T-R3-05 [REAL] tier vocabulary current state is true', (t) => {
  const table = parseTables(sections.get('all companions')).find((x) => x.header[0] === 'Tier');
  assert.deepEqual(table.rows.map((r) => r.slice(0, 3)), [['T1', 'powerful', 'powerful'], ['T2', 'balanced', 'balanced'], ['T3', 'cheap', 'cheap']]);
  if (!siblingsReadable) return t.skip('IMPLEMENTED-NOT-VERIFIED: sibling SKILL.md files unreadable');
  for (const r of ['plan-it', 'build-it', 'review-it', 'conclude-it', 'prompt-it']) {
    const cell = parseFields(sections.get(r))['Current state'];
    const cites = parseCitations(cell).filter((c) => c.path === `${r}/SKILL.md` && /^(T1|T2|T3|opus|sonnet|haiku|tier|tiers|tiering)$/i.test(c.text));
    for (const c of cites) assert.ok(citeCheck(c), `${r}: ${c.path}:${c.line} does not contain «${c.text}»`);
    const text = readFileSync(join(SIBLINGS, r, 'SKILL.md'), 'utf8').split('\n');
    const found = new Map();
    text.forEach((l, i) => { for (const m of l.matchAll(TIER_WORD)) if (!found.has(m[0].toLowerCase())) found.set(m[0].toLowerCase(), i + 1); });
    if (!found.size) { assert.match(cell, /none found/); assert.equal(cites.length, 0); continue; }
    assert.deepEqual([...new Set(cites.map((c) => c.text.toLowerCase()))].sort(), [...found.keys()].sort(), `${r}: tier words listed vs found`);
  }
  // a stated line that does not exist must fail (negative control)
  assert.equal(citeCheck({ path: 'build-it/SKILL.md', line: 9999, text: 'sonnet' }), false);
  assert.equal(citeCheck({ path: 'build-it/SKILL.md', line: 3, text: 'no-such-word-xyz' }), false);
});

test('T-R3-06 [REAL] pin-drift finding is accurate (G-15)', (t) => {
  const cell = parseFields(sections.get('prompt-it'))['Current state'];
  const cites = parseCitations(cell).filter((c) => c.path.endsWith('marketplace.json'));
  const got = Object.fromEntries(cites.map((c) => [c.path, `${c.line} ${c.text}`]));
  assert.deepEqual(got, {
    'prompt-it/.claude-plugin/marketplace.json': '13 "version": "0.3.0"',
    'build-it/.claude-plugin/marketplace.json': '18 "version": "0.2.1"',
    'plan-it/.claude-plugin/marketplace.json': '16 "version": "0.2.1"',
    'review-it/.claude-plugin/marketplace.json': '16 "version": "0.2.1"',
  });
  assert.match(parseFields(sections.get('prompt-it'))['Exact changes'], /0\.3\.0/);
  if (!siblingsReadable) return t.skip('IMPLEMENTED-NOT-VERIFIED: sibling marketplace files unreadable');
  for (const c of cites) assert.ok(citeCheck(c), `${c.path}:${c.line} «${c.text}»`);
  // every citation anywhere in the catalog must be true (a stated line that does not exist fails)
  for (const c of parseCitations(md)) assert.ok(citeCheck(c), `${c.path}:${c.line} «${c.text}»`);
});

test('T-R3-07 deploy-it adapter.json schema', () => {
  const sec = sections.get('deploy-it');
  const { 'adapter-schema': schema, 'adapter-example': ex } = fenced;
  assert.deepEqual(validate(schema, ex), []);
  assert.deepEqual(schema.properties.legs.items.required, ['name', 'command', 'verify', 'rollback', 'risk']);
  const noLegs = { ...ex }; delete noLegs.legs;
  assert.match(validate(schema, noLegs).join(), /legs/);
  const noName = structuredClone(ex); delete noName.legs[0].name;
  assert.match(validate(schema, noName).join(), /name/);
  const states = sec.match(/Result states: (.+?)\.$/m)[1].split(/,\s*/);
  assert.deepEqual(states, ['DEPLOYED_VERIFIED', 'DEPLOYED_UNVERIFIED', 'HELD', 'FAILED', 'NEEDS_HUMAN']);
  assert.deepEqual(states, STATES);
});

const scratchLegs = () => {
  const d = tmp('leg');
  const f = join(d, 'artifact.txt');
  const claim = createHash('sha256').update('one').digest('hex');
  const ref = join(ROOT, 'tests/catalog/leg-reference.mjs');
  const write = `printf one > ${f}; printf '{"target":"${f}","sha256":"${claim}"}\\n'`;
  const verify = `node ${ref} --digest "$LEG_TARGET"`;
  return { d, f, claim, ref, write, verify };
};

test('T-R3-08 LEG protocol state mapping', () => {
  const { d, write, verify } = scratchLegs();
  const lock = join(d, 'router.lock'); writeFileSync(lock, 'held');
  const legs = [
    { name: 'verified', command: write, verify, rollback: null, risk: 'low' },
    { name: 'unverified', command: 'true', verify: null, rollback: null, risk: 'low' },
    { name: 'held', command: 'true', verify, rollback: null, risk: 'low', lock },
    { name: 'failed', command: 'exit 7', verify, rollback: null, risk: 'low' },
    { name: 'needs-human', command: 'true', verify, rollback: null, risk: 'high', needs: ['R3_TEST_CREDENTIAL_NEVER_SET'] },
  ];
  const res = legs.map((l) => runLeg(l));
  assert.deepEqual(res.map((r) => r.line.state), ['DEPLOYED_VERIFIED', 'DEPLOYED_UNVERIFIED', 'HELD', 'FAILED', 'NEEDS_HUMAN']);
  assert.deepEqual(res.map((r) => r.exit), [0, 0, 3, 1, 2]);
  for (const r of res) assert.deepEqual(Object.keys(r.line), ['leg', 'state', 'evidence', 'sha256']);
  // the CLI runner prints one JSON line per leg and exits with the worst code
  const file = join(d, 'legs.json'); writeFileSync(file, JSON.stringify(legs));
  const cli = spawnSync('node', [join(ROOT, 'tests/catalog/leg-reference.mjs'), file], { encoding: 'utf8' });
  assert.equal(cli.stdout.trim().split('\n').length, 5);
  assert.equal(cli.status, 3);
});

test('T-R3-09 failure cascade text equals CONTRACT M1', () => {
  const contract = readFileSync(join(ROOT, 'delivery/CONTRACT.md'), 'utf8');
  const m1 = contract.slice(contract.indexOf('## 8.'), contract.indexOf('## 9.'));
  const pairs = new Set();
  for (const stmt of m1.split(/[;\n]/)) {
    const chain = stmt.replace(/\([^)]*\)/g, '').split('-->').map((s) => s.trim().replace(/^\*\*.*\*\*\s*/, ''));
    for (let i = 0; i + 1 < chain.length; i++) pairs.add(`${chain[i]} --> ${chain[i + 1]}`);
  }
  const deployPairs = (set) => [...set].filter((p) => /PARTIAL_FAILURE|ROLLED_BACK/.test(p)).sort();
  const mine = new Set([...sections.get('deploy-it').matchAll(/^- transition: (\w+ --> \w+)$/gm)].map((m) => m[1]));
  const expect = ['DEPLOYING --> PARTIAL_FAILURE', 'PARTIAL_FAILURE --> ROLLED_BACK', 'ROLLED_BACK --> DEPLOYING', 'ROLLED_BACK --> ESCALATED'];
  assert.deepEqual(deployPairs(pairs), [...expect].sort());
  assert.deepEqual([...mine].sort(), [...expect].sort());
  // behaviour: pass + fail => PARTIAL_FAILURE then ROLLED_BACK; a failing rollback => ESCALATED
  const { d, write, verify } = scratchLegs();
  const marker = join(d, 'rolled');
  const ok = { name: 'a', command: write, verify, rollback: `touch ${marker}`, risk: 'low' };
  const bad = { name: 'b', command: 'exit 1', verify: null, rollback: null, risk: 'low' };
  const rb = runDeploy([ok, bad]);
  assert.deepEqual([rb.status, rb.trail], ['ROLLED_BACK', ['DEPLOYING', 'PARTIAL_FAILURE', 'ROLLED_BACK']]);
  assert.ok(existsSync(marker));
  const esc = runDeploy([{ ...ok, rollback: 'exit 1' }, bad]);
  assert.equal(esc.status, 'ESCALATED');
});

test('T-R3-10 adversarial verify is specified and works', () => {
  assert.match(sections.get('deploy-it'), /re-read after the claim/i);
  const { f, claim, ref, verify } = scratchLegs();
  const tamper = { name: 'tamper', command: `printf one > ${f}; printf '{"target":"${f}","sha256":"${claim}"}\\n'; printf two > ${f}`, verify, rollback: null, risk: 'low' };
  const bad = runLeg(tamper);
  const found = createHash('sha256').update('two').digest('hex');
  assert.equal(bad.line.state, 'FAILED');
  assert.equal(bad.line.evidence, `expected ${claim} found ${found}`);
  const clean = runLeg({ ...tamper, command: `printf one > ${f}; printf '{"target":"${f}","sha256":"${claim}"}\\n'` });
  assert.equal(clean.line.state, 'DEPLOYED_VERIFIED');
  assert.equal(digestOf(f), claim);
  assert.ok(ref.endsWith('leg-reference.mjs'));
});

test('T-R3-11 [REAL] one-line fixes apply cleanly to the real files', (t) => {
  if (!siblingsReadable) return t.skip('IMPLEMENTED-NOT-VERIFIED: sibling files unreadable');
  const files = ['build-it/.claude-plugin/marketplace.json', 'plan-it/.claude-plugin/marketplace.json', 'review-it/.claude-plugin/marketplace.json', 'build-it/SKILL.md'];
  const realSums = files.map((f) => sha(join(SIBLINGS, f)));
  const dir = tmp('apply');
  for (const f of files) { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(SIBLINGS, f), join(dir, f)); }
  git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'real copies');
  const diffs = [...md.matchAll(/^```diff (\S+)\n([\s\S]*?)^```/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(diffs.map((d) => d[0]), ['pin-build-it', 'pin-plan-it', 'pin-review-it', 'report-dir-build-it']);
  for (const [id, body] of diffs) {
    const p = join(dir, `${id}.patch`); writeFileSync(p, body);
    const chk = spawnSync('git', ['apply', '--check', p], { cwd: dir, encoding: 'utf8' });
    assert.equal(chk.status, 0, `${id}: ${chk.stderr}`);
  }
  for (const [id] of diffs) { const ap = spawnSync('git', ['apply', `${id}.patch`], { cwd: dir, encoding: 'utf8' }); assert.equal(ap.status, 0, `${id}: ${ap.stderr}`); }
  for (const f of files.slice(0, 3)) {
    const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.equal(m.plugins.find((p) => p.name === 'prompt-it').version, '0.3.0', f);
  }
  assert.match(readFileSync(join(dir, 'build-it/SKILL.md'), 'utf8'), /never create or write `\.fable-it-reports\/`/);
  const pins = spawnSync('node', [join(ROOT, 'scripts/check-pins.mjs'), '--siblings', dir], { encoding: 'utf8' });
  assert.equal(pins.status, 0, pins.stdout);
  assert.deepEqual(files.map((f) => sha(join(SIBLINGS, f))), realSums, 'real sibling files unchanged');
});

test('T-R3-12 plan-it readiness and Verify column', () => {
  const { 'readiness-schema': schema, 'readiness-example': ex } = fenced;
  assert.deepEqual(validate(schema, ex), []);
  const bad = (mut) => { const c = structuredClone(ex); mut(c); return validate(schema, c); };
  assert.match(bad((c) => { c.decisions[0].status = 'OPEN'; }).join(), /status/);
  assert.match(bad((c) => { c.preflight.passed = false; }).join(), /passed/);
  assert.match(bad((c) => { c.owner_dependent_slices = 1; }).join(), /owner_dependent_slices/);
  assert.match(bad((c) => { delete c.preflight; }).join(), /preflight/);
  const rows = parseTables(sections.get('plan-it')).find((t) => t.header.includes('Verify'));
  assert.ok(rows.rows.length >= 3);
  for (const r of rows.rows) assert.ok(['auto', 'attended', 'judgement'].includes(r[rows.header.indexOf('Verify')]));
  const dir = tmp('verify');
  const file = join(dir, 'c.md');
  writeFileSync(file, md.replace('| T-X-03 | copy matches brand voice | reviewer judgement | edge | judgement |', '| T-X-03 | copy matches brand voice | reviewer judgement | edge | manual |'));
  const r = runLint(file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Verify column value "manual"/);
});

test('T-R3-13 review-it owns ATTENDED-GATE.html', () => {
  const sec = sections.get('review-it');
  const t = parseTables(sec).find((x) => x.header[0] === 'Path');
  const row = t.rows.find((r) => r[0].includes('ATTENDED-GATE.html'));
  assert.equal(row[0], '`.do-it/review/ATTENDED-GATE.html`');
  assert.equal(row[1], 'review-it');
  assert.deepEqual(row[2].split(/,\s*/).sort(), ['build-it', 'conclude-it', 'do-it']);
  assert.match(sec, /re-cut/);
  assert.equal(new Set(t.rows.map((r) => r[0])).size, t.rows.length, 'one row per path');
  assert.match(sec, /^Severity classes: blocker, major, minor, nit\.$/m);
  const dir = tmp('own');
  const file = join(dir, 'c.md');
  writeFileSync(file, md.replace('| `.do-it/review/roteiro.json` | review-it | do-it |', '| `.do-it/review/roteiro.json` | review-it | do-it |\n| `.do-it/review/ATTENDED-GATE.html` | build-it | do-it |'));
  const r = runLint(file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ATTENDED-GATE\.html/);
});

test('T-R3-14 conclude-it, build-it and parallel-lifecycle sections', () => {
  const c = sections.get('conclude-it');
  assert.match(c, /refuse to close/); assert.match(c, /G-13/); assert.match(c, /unaccounted/); assert.match(c, /finish-line\.json/);
  const b = sections.get('build-it');
  assert.match(b, /`\.build-it-reports\/`/); assert.match(b, /`\.fable-it-reports\/` as legacy read-only/);
  const p = sections.get('parallel-lifecycle');
  assert.match(p, /stays a separate plugin \(ruling D14\)/);
  const ops = parseFields(p)['Exact changes'].match(/`isolation` driver contract with exactly three operations: `create`[^`]*`remove`[^`]*`path`/);
  assert.ok(ops, 'isolation contract names create, remove, path');
});

test('T-R3-15 reconcile-it contract', () => {
  const sec = sections.get('reconcile-it');
  for (const s of ['`scan`', '`plan`', '`apply --approved`', '.do-it/reconcile/state.json', '`apply` without `--approved` exits 2 and deletes nothing']) assert.ok(sec.includes(s), s);
  assert.deepEqual(STATE_SCHEMA.required, ['phase', 'inventory', 'dispositions', 'approved_at']);
  const ex = parseFenced(sec)['reconcile-state-example'];
  assert.deepEqual(checkState(ex), []);
  for (const k of STATE_SCHEMA.required) { const c = structuredClone(ex); delete c[k]; assert.match(checkState(c).join(), new RegExp(k)); }
  assert.match(checkState({ ...ex, phase: 'apply' }).join(), /approved_at/);
  const dir = tmp('reconcile');
  const victim = join(dir, 'victim'); writeFileSync(victim, 'x');
  const stateFile = join(dir, 'state.json'); writeFileSync(stateFile, JSON.stringify({ ...ex, phase: 'apply' }));
  const noFlag = apply([], stateFile, [victim]);
  assert.equal(noFlag.exit, 2); assert.ok(existsSync(victim));
  const unapproved = apply(['--approved'], stateFile, [victim]);
  assert.equal(unapproved.exit, 2); assert.ok(existsSync(victim));
  writeFileSync(stateFile, JSON.stringify({ ...ex, phase: 'apply', approved_at: '2026-10-14T00:00:00Z' }));
  const ok = apply(['--approved'], stateFile, [victim]);
  assert.equal(ok.exit, 0); assert.equal(existsSync(victim), false);
});

test('T-R3-16 [REAL] sibling repos stay untouched (fence)', (t) => {
  if (!siblingsReadable) return t.skip('IMPLEMENTED-NOT-VERIFIED: sibling repos unreadable');
  const after = snapshot();
  assert.deepEqual(after, BEFORE);
});
