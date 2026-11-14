// [REAL] cases of epics V1 and V2: real git worktrees (T-V1-16) and installed jest 29.7 through the A1 adapter
// (T-V1-17, T-V1-18, T-V2-16). Paths come only from env (CONTRACT §11 A11); an absent runner or an absent A1 adapter
// reports IMPLEMENTED-NOT-VERIFIED and skips, never a pass. Jest runs go through the real queue (no signal fixture).
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BIN, CORE_DIR, baseEnv, tmp } from '../helpers.mjs';
import { fileName, finishes, gate, rows, run, stubRepo } from './g2-helpers.mjs';

const JEST_ADAPTER = path.join(CORE_DIR, 'gates', 'adapters', 'jest', 'adapter.json');
const JEST_30 = path.join(CORE_DIR, 'gates', 'tests', 'fixtures', 'jest-30');
const FAKE_DECIDE = path.join(CORE_DIR, 'gates', 'tests', 'fake-decide.mjs');

function jestMissing() {
  const bin = process.env.DO_IT_REAL_JEST;
  if (!bin) return 'DO_IT_REAL_JEST not set';
  if (!fs.existsSync(bin)) return 'DO_IT_REAL_JEST does not exist';
  if (!fs.existsSync(JEST_ADAPTER)) return 'A1 jest adapter not shipped on this branch (core/gates/adapters/jest/adapter.json)';
  return null;
}

// node_modules of the installed jest (DO_IT_REAL_JEST), linked into each temp repository so jest resolves its own
// environment, sequencer and transforms there (the repository itself installs nothing).
function realNodeModules() {
  const real = fs.realpathSync(process.env.DO_IT_REAL_JEST);
  const i = real.lastIndexOf(path.sep + 'node_modules' + path.sep);
  return i < 0 ? null : real.slice(0, i) + path.sep + 'node_modules';
}

function notVerified(t, id, why) {
  t.diagnostic('IMPLEMENTED-NOT-VERIFIED: ' + id + ' ' + why);
  process.stdout.write('# IMPLEMENTED-NOT-VERIFIED: ' + id + ' ' + why + '\n');
  t.skip('IMPLEMENTED-NOT-VERIFIED: ' + why);
}

function git(dir, env, args) {
  return cp.execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A temp git repository with a 30-file jest leg (alphabetical sequencer, in band). Jest itself comes from env.
function jestRepo(t, files) {
  const dir = tmp('dit-g2-jest-');
  const home = tmp('dit-g2-jest-home-');
  const env0 = baseEnv(home);
  git(dir, env0, ['init', '-q', '-b', 'main']);
  git(dir, env0, ['config', 'user.email', 't@example.com']);
  git(dir, env0, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.do-it/\nnode_modules/\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'g2-jest-fixture', private: true }) + '\n');
  fs.writeFileSync(path.join(dir, 'sequencer.cjs'), "const Seq = require('@jest/test-sequencer').default;\nclass Alpha extends Seq { sort(tests) { return tests.slice().sort((a, b) => (a.path < b.path ? -1 : 1)); } }\nmodule.exports = Alpha;\n");
  fs.writeFileSync(path.join(dir, 'jest.config.js'), "module.exports = { testEnvironment: 'node', testMatch: ['<rootDir>/src/**/*.spec.js'], testSequencer: '<rootDir>/sequencer.cjs' };\n");
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (let i = 1; i <= 30; i++) {
    const f = fileName(i);
    fs.writeFileSync(path.join(dir, f), (files && files[f]) || "test('file " + i + "', () => { expect(" + i + ').toBe(' + i + '); });\n');
  }
  git(dir, env0, ['add', '-A']);
  git(dir, env0, ['commit', '-q', '-m', 'fixture']);
  fs.symlinkSync(realNodeModules(), path.join(dir, 'node_modules'));
  const env = { ...env0 };
  const repo = { dir, home, env, aux: home, store: path.join(dir, '.git', 'do-it', 'gate-results') };
  repo.rowsFile = path.join(repo.store, 'results.jsonl');
  t.after(() => { for (const d of [dir, home]) fs.rmSync(d, { recursive: true, force: true }); });
  return repo;
}

function settings(repo, gates) {
  fs.mkdirSync(path.join(repo.dir, '.do-it'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, '.do-it', 'settings.json'), JSON.stringify({ gates }));
}

test('T-V1-16 G-8 on real worktrees: worktree B reuses worktree A\'s rows from the one store under the git common dir', (t) => {
  const repo = stubRepo(t);
  const b = path.join(repo.aux, 'wt-b');
  git(repo.dir, repo.env, ['worktree', 'add', '-q', '--detach', b, 'HEAD']);
  fs.mkdirSync(path.join(b, 'node_modules'), { recursive: true });
  fs.copyFileSync(path.join(repo.dir, 'node_modules', '.package-lock.json'), path.join(b, 'node_modules', '.package-lock.json'));
  const ra = run(repo, []);
  assert.equal(ra.code, 0, ra.stdout);
  const rb = run(repo, [], { cwd: b });
  assert.equal(ra.out.store, rb.out.store);
  assert.equal(fs.realpathSync(ra.out.store), fs.realpathSync(repo.store));
  assert.match(rb.out.line, / · 28 reused from 1 run /, rb.out.line);
  assert.match(rb.out.line, / · 2 ran now · /);
  assert.equal(rb.out.outcome, 'GATE_PASS_COMPOSED');
  assert.equal(rb.code, 0);
  git(repo.dir, repo.env, ['worktree', 'remove', '--force', b]);
  t.diagnostic('T-V1-16 store ' + rb.out.store + ' | B: ' + rb.out.line);
});

test('T-V1-17 first vertical slice on installed jest: SIGKILL the gate group at 20 finish rows, resume runs exactly 10', async (t) => {
  const why = jestMissing();
  if (why) return notVerified(t, 'T-V1-17', why);
  const stall = "test('file 21', async () => { if (process.env.G2_STALL) await new Promise((r) => setTimeout(r, 120000)); expect(21).toBe(21); }, 180000);\n";
  const repo = jestRepo(t, { [fileName(21)]: stall });
  settings(repo, { reuse: { always_run: [fileName(25)], never_reuse: [fileName(26)] } });
  const argv = ['gate', 'run', '--scope', 'push', '--runner', 'jest', '--json', '--', process.env.DO_IT_REAL_JEST, '--ci', '--runInBand'];
  const child = cp.spawn(process.execPath, [BIN, ...argv], { cwd: repo.dir, env: { ...repo.env, G2_STALL: '1' }, detached: true, stdio: 'ignore' });
  let first = null;
  const t0 = Date.now();
  for (;;) {
    const all = rows(repo);
    const fin = all.filter((r) => r.type === 'finish');
    if (fin.length >= 20 && all.some((r) => r.type === 'start' && r.file === fileName(21))) { first = fin[0].run_id; break; }
    if (Date.now() - t0 > 600000) throw new Error('20 finish rows never appeared');
    await new Promise((r) => setTimeout(r, 50));
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  await new Promise((r) => child.on('close', r));
  const firstRows = finishes(repo, first);
  assert.equal(firstRows.length, 20, 'kill landed after exactly 20 finish rows: got ' + firstRows.length);
  const r2 = gate(repo, ['gate', 'run', '--scope', 'push', '--runner', 'jest', '--resume', '--', process.env.DO_IT_REAL_JEST, '--ci', '--runInBand']);
  assert.equal(r2.code, 0, r2.stdout + r2.stderr);
  const fresh = finishes(repo, r2.out.run_id).map((r) => r.file).sort();
  const want = [];
  for (let i = 21; i <= 30; i++) want.push(fileName(i));
  assert.deepEqual(fresh, want);
  const oldest = new Date(Date.parse(firstRows.map((r) => r.at).sort()[0])).toISOString().slice(0, 16) + 'Z';
  assert.equal(r2.out.line, '[COMPOSED push: 30/30 files PASS · 20 reused from 1 run (oldest ' + oldest + ') · 10 ran now · 0 skipped · 0 flaky-excluded] run=' + r2.out.run_id);
  t.diagnostic('T-V1-17 ' + r2.out.line);
});

test('T-V1-18 decide parity with A1\'s harness on the jest-30 fixture', (t) => {
  const why = jestMissing() || (!fs.existsSync(JEST_30) ? 'A1 fixture core/gates/tests/fixtures/jest-30 absent' : null) || (!fs.existsSync(FAKE_DECIDE) ? 'A1 core/gates/tests/fake-decide.mjs absent' : null);
  if (why) return notVerified(t, 'T-V1-18', why);
  const dir = tmp('dit-g2-j30-');
  const home = tmp('dit-g2-j30-home-');
  t.after(() => { for (const d of [dir, home]) fs.rmSync(d, { recursive: true, force: true }); });
  fs.cpSync(JEST_30, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.do-it/\n');
  fs.symlinkSync(realNodeModules(), path.join(dir, 'node_modules'));
  const env = { ...baseEnv(home), DO_IT_GATE_KEEP_RUN_DIR: '1', FIXTURE_JEST_CACHE: path.join(home, 'jest-cache') };
  git(dir, env, ['init', '-q', '-b', 'main']);
  git(dir, env, ['config', 'user.email', 't@example.com']);
  git(dir, env, ['config', 'user.name', 'T']);
  git(dir, env, ['add', '-A']);
  git(dir, env, ['commit', '-q', '-m', 'fixture']);
  const repo = { dir, home, env, store: path.join(dir, '.git', 'do-it', 'gate-results') };
  settings(repo, { reuse: { always_run: ['test/guards/**'] } });
  const go = () => gate(repo, ['gate', 'run', '--scope', 'push', '--runner', 'jest', '--', process.env.DO_IT_REAL_JEST, '--ci', '--runInBand']);
  const parity = (out) => {
    const snap = tmp('dit-g2-j30-snap-');
    try {
      fs.cpSync(repo.store, path.join(snap, 'store'), { recursive: true });
      for (const side of ['real', 'fake']) {
        fs.cpSync(out.run_dir, path.join(snap, side), { recursive: true });
        for (const n of ['run-list.json', 'decision.json']) fs.rmSync(path.join(snap, side, n), { force: true });
      }
      const sp = JSON.parse(fs.readFileSync(path.join(snap, 'real', 'spine.json'), 'utf8'));
      sp.store_dir = path.join(snap, 'store');
      fs.writeFileSync(path.join(snap, 'real', 'spine.json'), JSON.stringify(sp));
      const mf = JSON.parse(fs.readFileSync(path.join(snap, 'fake', 'manifest.json'), 'utf8'));
      mf.store_dir = path.join(snap, 'store');
      fs.writeFileSync(path.join(snap, 'fake', 'manifest.json'), JSON.stringify(mf));
      const a = cp.spawnSync(process.execPath, [BIN, 'gate', 'decide', '--run-dir', path.join(snap, 'real')], { cwd: dir, env, encoding: 'utf8' });
      const b = cp.spawnSync(process.execPath, [FAKE_DECIDE, '--run-dir', path.join(snap, 'fake')], { cwd: dir, env, encoding: 'utf8' });
      assert.equal(a.status, 0, a.stdout + a.stderr);
      assert.equal(b.status, 0, b.stdout + b.stderr);
      assert.equal(fs.readFileSync(path.join(snap, 'real', 'run-list.json'), 'utf8'), fs.readFileSync(path.join(snap, 'fake', 'run-list.json'), 'utf8'));
    } finally { fs.rmSync(snap, { recursive: true, force: true }); }
  };
  const r1 = go();
  assert.equal(r1.code, 0, r1.stdout);
  const d1 = JSON.parse(fs.readFileSync(path.join(r1.out.run_dir, 'decision.json'), 'utf8'));
  assert.equal(d1.files.length, 30);
  assert.ok(d1.files.every((d) => d.decision === 'run'));
  const r2 = go();
  assert.equal(r2.out.outcome, 'GATE_PASS_COMPOSED');
  const d2 = JSON.parse(fs.readFileSync(path.join(r2.out.run_dir, 'decision.json'), 'utf8'));
  for (const d of d2.files) if (d.decision === 'reuse') assert.equal(d.source.run_id, r1.out.run_id);
  const never = d2.files.filter((d) => d.why === 'never-set').map((d) => d.file);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r2.out.run_dir, 'run-list.json'), 'utf8')).files, never);
  parity(r2.out);
  const edited = d2.files.find((d) => d.decision === 'reuse').file;
  fs.appendFileSync(path.join(dir, edited), '\n// edited\n');
  const r3 = go();
  // the epic says "NEVER set plus the edited file"; any edit also changes the tree digest, so WIDE-class files run too
  // (CONTRACT §2.2: WIDE keys carry the tree). Reading: NEVER + edited + every WIDE file, nothing else.
  const d3 = JSON.parse(fs.readFileSync(path.join(r3.out.run_dir, 'decision.json'), 'utf8'));
  const wide = d3.files.filter((d) => d.class === 'WIDE').map((d) => d.file);
  const list3 = JSON.parse(fs.readFileSync(path.join(r3.out.run_dir, 'run-list.json'), 'utf8')).files.sort();
  assert.deepEqual(list3, Array.from(new Set([...never, edited, ...wide])).sort(), 'wide: ' + wide.join(','));
  assert.ok(list3.includes(edited));
  parity(r3.out);
  for (const o of [r1.out, r2.out, r3.out]) fs.rmSync(o.run_dir, { recursive: true, force: true });
  t.diagnostic('T-V1-18 run2 list ' + never.join(',') + ' · run3 +' + edited + ' + WIDE ' + d3.files.filter((d) => d.class === 'WIDE').map((d) => d.file).join(',') + ' · run-list bytes equal fake-decide for runs 2 and 3');
});

test('T-V2-16 README T-05 on installed jest: an order-dependent pass hidden by reuse is caught by the clean run', (t) => {
  const why = jestMissing();
  if (why) return notVerified(t, 'T-V2-16', why);
  const flag = "require('path').join(require('os').tmpdir(), 'g2-flag-' + process.env.G2_FLAG_ID)";
  const harmless = "test('polluter', () => { expect(1).toBe(1); });\n";
  const polluting = "const fs = require('fs');\ntest('polluter', () => { fs.writeFileSync(" + flag + ", 'x'); expect(1).toBe(1); });\n";
  const victim = "const fs = require('fs');\ntest('victim', () => { const f = " + flag + "; const there = fs.existsSync(f); if (there) fs.unlinkSync(f); expect(there).toBe(false); });\n";
  const files = {};
  for (let i = 29; i <= 30; i++) files[fileName(i)] = null;
  const repo = jestRepo(t, files);
  for (let i = 29; i <= 30; i++) fs.rmSync(path.join(repo.dir, fileName(i)));
  fs.writeFileSync(path.join(repo.dir, 'src', 'a-polluter.spec.js'), harmless);
  fs.writeFileSync(path.join(repo.dir, 'src', 'b-victim.spec.js'), victim);
  git(repo.dir, repo.env, ['add', '-A']);
  git(repo.dir, repo.env, ['commit', '-q', '-m', 'polluter and victim']);
  settings(repo, { reuse: {} });
  repo.env.G2_FLAG_ID = String(process.pid);
  const jest = (scope) => gate(repo, ['gate', 'run', '--scope', scope, '--runner', 'jest', '--', process.env.DO_IT_REAL_JEST, '--ci', '--runInBand']);
  assert.equal(jest('push').code, 0);
  fs.writeFileSync(path.join(repo.dir, 'src', 'a-polluter.spec.js'), polluting);
  git(repo.dir, repo.env, ['commit', '-qam', 'pollute']);
  const s2 = jest('push');
  assert.equal(s2.code, 0, s2.stdout);
  assert.match(s2.out.line, / · 29 reused from 1 run /);
  const s3 = jest('nightly');
  assert.equal(s3.code, 1, s3.out.line);
  assert.match(s3.out.line, /^\[FAIL nightly: 1 of 30 files FAIL \(src\/b-victim\.spec\.js\) · /);
  const res = gate(repo, ['gate', 'results']);
  assert.equal(res.out.files.find((f) => f.file === 'src/b-victim.spec.js').state, 'UNSTABLE_UNDER_REUSE');
  fs.writeFileSync(path.join(repo.dir, 'src', 'a-polluter.spec.js'), harmless);
  git(repo.dir, repo.env, ['commit', '-qam', 'revert']);
  const s5 = jest('nightly');
  assert.equal(s5.code, 0, s5.out.line);
  t.diagnostic('T-V2-16 step3 ' + s3.out.line);
});
