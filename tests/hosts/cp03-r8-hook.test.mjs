// CP-03 round 8 regressions (R8-S1-M15): CONTRACT 3.1 fails open only when state.json cannot be read. A run
// whose state was read and that gates with open rows is refused even when the gate's own bookkeeping cannot
// be written (STATE_TOO_LARGE, EACCES, ...); such a refusal is uncounted and never parks the run.
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

function world() {
  const home = tmp('dit-r8-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, DO_IT_USER_HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(tmp('dit-r8-parent-'), name);
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
  const r = cp.spawnSync(process.execPath, [BIN, ...argv, '--json'], { cwd, env: w.env, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
  let out = null;
  try { out = JSON.parse(lines[lines.length - 1]); } catch { /* not JSON */ }
  return { code: r.status, out, stdout: (r.stdout || '').slice(0, 2000), stderr: r.stderr };
}

function hook(w, hookFile, session, cwd) {
  const r = cp.spawnSync(process.execPath, [hookFile], { input: JSON.stringify({ session_id: session, cwd, hook_event_name: 'Stop' }), cwd, env: w.env, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, stderr: r.stderr };
}

const writeJson = (f, v, compact) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, compact ? 0 : 2) + '\n'); };
const startRun = (w, dir, session) => {
  writeJson(path.join(dir, '.do-it', 'settings.json'), { stop_gate: { patience: 50 } });
  const r = sp(w, dir, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session]);
  assert.equal(r.code, 0, r.stdout);
  const n = sp(w, dir, ['next', '--run', r.out.run_id]);
  assert.equal(n.code, 0, n.stdout);
  return r.out.run_id;
};
const readiness = (slices) => ({ decisions: [], preflight: { passed: true }, credentials: [], slices });
const statusOf = (X, id) => JSON.parse(fs.readFileSync(path.join(X, '.do-it', 'runs', id, 'state.json'), 'utf8'));
const AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0 ? 'root ignores file modes' : false;

// P1: the reviewer's near-cap plan. Before the fix it seeded a state 47 bytes under the cap; the gate's own
// refusal write then crossed it and the stop was allowed with every row open.
test('CP03 R8-S1-M15 P1 a near-cap plan is refused at gate build (1 MiB headroom) and the hook exits 2', { timeout: 300000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'p1');
  writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), readiness([{ id: 's0' }, { id: 's1', depends_on: Array(1198281).fill('s0') }]), true);
  const g = sp(w, X, ['gate', 'build', '--run', id]);
  assert.equal(g.out && g.out.outcome, 'READINESS_INVALID', g.stdout);
  assert.match(JSON.stringify(g.out.errors), /headroom/);
  assert.equal(statusOf(X, id).status, 'INTAKE');
  for (const H of HOOKS) {
    const h = hook(w, H, 'p1', X);
    assert.equal(h.code, 2, `${path.relative(ROOT, H)}: ${h.stderr}`);
  }
});

// P3: a modest plan accepted at build, then a .secrets value that occurs 600,000 times in the state. The
// stop's write is measured after redaction and inflates past the cap: the stop is still refused, uncounted.
test('CP03 R8-S1-M15 P3 a redaction-inflated state: the plan is measured after redaction at build, and once accepted every stop is still refused (uncounted, never parked)', { timeout: 300000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'p3');
  writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), readiness([{ id: 'aaaaaa' }, { id: 's1', depends_on: Array(600000).fill('aaaaaa') }]), true);
  const secret = path.join(X, '.secrets', 'K'.repeat(40));
  fs.mkdirSync(path.dirname(secret));
  // with the secret present, gate build measures the state as written (after redaction) and refuses it
  fs.writeFileSync(secret, 'aaaaaa');
  let g = sp(w, X, ['gate', 'build', '--run', id]);
  assert.equal(g.out && g.out.outcome, 'READINESS_INVALID', g.stdout);
  assert.match(JSON.stringify(g.out.errors), /headroom/);
  // without it the plan is accepted (about 10.8 MB, well under the limit) and the gate counts as usual
  fs.rmSync(secret);
  g = sp(w, X, ['gate', 'build', '--run', id]);
  assert.equal(g.out && g.out.outcome, 'READINESS_OK', g.stdout);
  for (const H of HOOKS) assert.equal(hook(w, H, 'p3', X).code, 2);
  const counted = statusOf(X, id).stop_refusals;
  assert.equal(counted, 2);
  // the secret comes back: the stop's own write would be STATE_TOO_LARGE
  fs.writeFileSync(secret, 'aaaaaa');
  for (const H of HOOKS) {
    const h = hook(w, H, 'p3', X);
    assert.equal(h.code, 2, `${path.relative(ROOT, H)}: ${h.stderr}`);
    assert.match(h.stderr, /STATE_TOO_LARGE/);
    assert.match(h.stderr, /not counted/);
  }
  const s = sp(w, X, ['gate', 'stop', '--session', 'p3', '--cwd', X]);
  assert.equal(s.code, 1, s.stdout);
  assert.equal(s.out.outcome, 'STOP_REFUSED', s.stdout);
  assert.equal(s.out.refusal_uncounted, true);
  assert.ok(s.out.unwritable.some((u) => u.run_id === id && u.refusal_uncounted && /STATE_TOO_LARGE/.test(u.error)), s.stdout);
  assert.equal(s.out.stop_refusals, counted, 'the refusal is not counted');
  const ex = sp(w, X, ['gate', 'stop', '--run', id]);
  assert.equal(ex.out && ex.out.outcome, 'STOP_REFUSED', ex.stdout);
  assert.equal(ex.out.refusal_uncounted, true);
  // patience reached: the park cannot be written either, so it stays a refusal; the run is never parked
  writeJson(path.join(X, '.do-it', 'settings.json'), { stop_gate: { patience: 1 } });
  for (const H of HOOKS) assert.equal(hook(w, H, 'p3', X).code, 2);
  const st = statusOf(X, id);
  assert.equal(st.status, 'BUILDING');
  assert.equal(st.stop_refusals, counted);
  // the uncounted refusal is still logged
  const ev = fs.readFileSync(path.join(X, '.do-it', 'runs', id, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(ev.some((e) => e.event === 'stop_refused' && e.detail && e.detail.refusal_uncounted === true), 'an uncounted stop_refused event is appended');
});

// Any write error on a state that was read (here a read-only run folder): refused, uncounted, exit 2.
test('CP03 R8-S1-M15 a write failure on an accepted state refuses the stop (hook exit 2), on the hook and the explicit path', { skip: AS_ROOT, timeout: 120000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'ro');
  const runDir = path.join(X, '.do-it', 'runs', id);
  assert.equal(hook(w, HOOKS[0], 'ro', X).code, 2);
  fs.chmodSync(runDir, 0o555);
  try {
    for (const H of HOOKS) {
      const h = hook(w, H, 'ro', X);
      assert.equal(h.code, 2, `${path.relative(ROOT, H)}: ${h.stderr}`);
      assert.match(h.stderr, /EACCES/);
    }
    const s = sp(w, X, ['gate', 'stop', '--session', 'ro', '--cwd', X]);
    assert.equal(s.out && s.out.outcome, 'STOP_REFUSED', s.stdout);
    assert.equal(s.out.refusal_uncounted, true);
    assert.deepEqual(s.out.uncounted_runs, [id]);
    assert.equal(s.out.stop_refusals, 1);
    const ex = sp(w, X, ['gate', 'stop', '--run', id]);
    assert.equal(ex.out && ex.out.outcome, 'STOP_REFUSED', ex.stdout);
    assert.ok(ex.out.unwritable.some((u) => u.refusal_uncounted && /EACCES/.test(u.error)), ex.stdout);
  } finally { fs.chmodSync(runDir, 0o755); }
  assert.equal(statusOf(X, id).stop_refusals, 1, 'nothing was counted while the folder was read-only');
});

test('CP03 R8-S1-M15 the accept limit is the read cap less 1 MiB, measured as written', async () => {
  const fa = await import(path.join(ROOT, 'core', 'spine', 'src', 'fs-atomic.mjs'));
  assert.equal(fa.STATE_ACCEPT_CAP, fa.STATE_READ_CAP - 1024 * 1024);
  const rd = await import(path.join(ROOT, 'core', 'spine', 'src', 'readiness.mjs'));
  const at = (n) => ({ slices: [{ pad: 'x'.repeat(n) }] });
  const base = fa.jsonBytes(at(0)).length;
  assert.equal(rd.planTooLarge(at(fa.STATE_ACCEPT_CAP - base), { rows: [] }), null, 'exactly the limit is accepted');
  assert.match(rd.planTooLarge(at(fa.STATE_ACCEPT_CAP - base + 1), { rows: [] }).message, /headroom/);
});
