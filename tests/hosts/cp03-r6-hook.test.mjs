// CP-03 round 6 regressions that go through the shipped Stop hook with the real spine bundle.
// R6-S1-M13: a FIFO anywhere on the gate's read or append path must never hang the spine. Before the fix the
// spine blocked in open(2), the hook's 20 s timer fired, and the hook allowed the stop for every home.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(ROOT, 'core', 'spine', 'do-it.mjs');
const HOOKS = [path.join(ROOT, 'hosts', 'claude-code', 'hooks', 'stop-gate.mjs'), path.join(ROOT, 'plugins', 'do-it', 'hooks', 'stop-gate.mjs')];
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

cp.execFileSync(process.execPath, [path.join(ROOT, 'core', 'spine', 'build.mjs')], { stdio: 'ignore' });

const tmp = (p) => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); made.push(d); return d; };
const NO_FIFO = process.platform === 'win32' || cp.spawnSync('mkfifo', ['--help']).error ? 'mkfifo is not available' : false;
// a hook that hangs on a FIFO is cut by its own 20 s timer; anything near that is a hang
const FAST_MS = 8000;

function world() {
  const home = tmp('dit-r6-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(w.parent || (w.parent = tmp('dit-r6-parent-')), name);
  fs.mkdirSync(dir);
  cp.execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  cp.execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir, env: w.env });
  cp.execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, env: w.env });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  cp.execFileSync('git', ['add', '-A'], { cwd: dir, env: w.env });
  cp.execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env: w.env });
  return dir;
}

function sp(w, cwd, argv) {
  const r = cp.spawnSync(process.execPath, [BIN, ...argv, '--json'], { cwd, env: w.env, encoding: 'utf8', timeout: 30000 });
  const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
  let out = null;
  try { out = JSON.parse(lines[lines.length - 1]); } catch { /* not JSON */ }
  return { code: r.status, out, stdout: r.stdout };
}

function hook(w, hookFile, session, cwd) {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [hookFile], { input: JSON.stringify({ session_id: session, cwd, hook_event_name: 'Stop' }), cwd, env: w.env, encoding: 'utf8', timeout: 30000 });
  return { code: r.status, stderr: r.stderr, ms: Date.now() - t0 };
}

const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const patience = (dir, n) => writeJson(path.join(dir, '.do-it', 'settings.json'), { stop_gate: { patience: n } });
const startRun = (w, dir, session) => {
  const r = sp(w, dir, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session]);
  assert.equal(r.code, 0, r.stdout);
  const n = sp(w, dir, ['next', '--run', r.out.run_id]);
  assert.equal(n.code, 0, n.stdout);
  return r.out.run_id;
};
const state = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, '.do-it', 'runs', id, 'state.json'), 'utf8'));

// put a FIFO at `file` (keeping what was there), run fn, then put the file back
function withFifo(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const kept = fs.existsSync(file) ? file + '.kept' : null;
  if (kept) fs.renameSync(file, kept);
  cp.execFileSync('mkfifo', [file]);
  try { return fn(); } finally {
    fs.rmSync(file, { force: true });
    if (kept) fs.renameSync(kept, file);
  }
}

function refusedFast(w, H, session, dir, what) {
  const r = hook(w, H, session, dir);
  assert.ok(r.ms < FAST_MS, `${what}: the hook took ${r.ms} ms (a FIFO hung the spine): ${r.stderr}`);
  assert.equal(r.code, 2, `${what}: the stop must be refused: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /gave no answer/, what);
  return r;
}

for (const H of HOOKS) {
  const which = path.relative(ROOT, H);

  test(`CP03 R6-S1-M13 a FIFO on the gate's read or append path never hangs the spine; every stop is refused in seconds (${which})`, { skip: NO_FIFO }, () => {
    const w = world();
    const X = repo(w, 'X');
    const Y = repo(w, 'Y');
    patience(X, 50);
    patience(Y, 50);
    const a = startRun(w, X, 'ff-s');
    const b = startRun(w, Y, 'ff-s');
    const xHome = path.join(X, '.do-it');
    const yHome = path.join(Y, '.do-it');

    refusedFast(w, H, 'ff-s', X, 'baseline');
    // 1. the redaction set reads <home>/.env.example before any command
    withFifo(path.join(xHome, '.env.example'), () => refusedFast(w, H, 'ff-s', X, 'FIFO .env.example'));
    // 2. ... and <home>/plan/READINESS.json
    withFifo(path.join(xHome, 'plan', 'READINESS.json'), () => refusedFast(w, H, 'ff-s', X, 'FIFO READINESS.json'));
    // 3. the cwd run's events file: its refusal cannot be logged, so it fails open for that run alone; B still refuses
    withFifo(path.join(xHome, 'runs', a, 'events.jsonl'), () => {
      refusedFast(w, H, 'ff-s', X, 'FIFO in the cwd run events.jsonl');
      const g = sp(w, X, ['gate', 'stop', '--session', 'ff-s', '--cwd', X]);
      assert.equal(g.out && g.out.outcome, 'STOP_REFUSED', g.stdout);
      assert.ok(g.out.unwritable.some((u) => u.run_id === a && /ENOTREG|ENXIO/.test(u.error)), g.stdout);
    });
    // 4. the other home's events file must not take the cwd home down: X's refusal stands
    withFifo(path.join(yHome, 'runs', b, 'events.jsonl'), () => {
      refusedFast(w, H, 'ff-s', X, 'FIFO in the other home events.jsonl');
      const g = sp(w, X, ['gate', 'stop', '--session', 'ff-s', '--cwd', X]);
      assert.equal(g.out && g.out.outcome, 'STOP_REFUSED', g.stdout);
      assert.equal(g.out.run_id, a, 'the cwd run is the refusal shown');
      assert.ok(g.out.refused_homes.includes(xHome), g.stdout);
      assert.ok(g.out.unwritable.some((u) => u.run_id === b && u.home === yHome), g.stdout);
    });
    // 5. patience 1 and a FIFO owner-pack.json: the park cannot be written for A, which is left un-parked; B still refuses
    patience(X, 1);
    withFifo(path.join(xHome, 'runs', a, 'owner-pack.json'), () => {
      refusedFast(w, H, 'ff-s', X, 'FIFO owner-pack.json, 1st stop');
      refusedFast(w, H, 'ff-s', X, 'FIFO owner-pack.json, 2nd stop');
      assert.notEqual(state(X, a).status, 'PARKED');
    });
    // the FIFO gone, the gate is whole again
    patience(X, 50);
    refusedFast(w, H, 'ff-s', X, 'after the FIFOs are removed');
  });
}

test('CP03 R6-S1-M13 the spine readers and appender refuse a FIFO at once instead of blocking', { skip: NO_FIFO }, async () => {
  const fsa = await import(path.join(ROOT, 'core', 'spine', 'src', 'fs-atomic.mjs'));
  const dir = tmp('dit-r6-fifo-');
  const f = path.join(dir, 'p');
  cp.execFileSync('mkfifo', [f]);
  const t0 = Date.now();
  assert.throws(() => fsa.readJsonIfExists(f), (e) => e.code === 'ENOTREG');
  assert.throws(() => fsa.readText(f), (e) => e.code === 'ENOTREG');
  assert.throws(() => fsa.appendJsonLine(f, { a: 1 }), (e) => e.code === 'ENOTREG');
  assert.throws(() => fsa.appendLine(f, 'x'), (e) => e.code === 'ENOTREG');
  assert.ok(Date.now() - t0 < 2000);
  // a symlink to a FIFO is refused by the appender too (lstat, then O_NOFOLLOW)
  fs.symlinkSync(f, path.join(dir, 'l'));
  assert.throws(() => fsa.appendLine(path.join(dir, 'l'), 'x'), (e) => e.code === 'ENOTREG');
  // a regular file still appends, and a missing one is created
  fsa.appendJsonLine(path.join(dir, 'ok.jsonl'), { a: 1 });
  fsa.appendJsonLine(path.join(dir, 'ok.jsonl'), { a: 2 });
  assert.equal(fs.readFileSync(path.join(dir, 'ok.jsonl'), 'utf8'), '{"a":1}\n{"a":2}\n');
  assert.equal(fsa.readJsonIfExists(path.join(dir, 'missing.json')), null);
});
