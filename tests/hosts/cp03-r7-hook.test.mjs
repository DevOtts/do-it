// CP-03 round 7 regressions that go through the shipped Stop hook with the real spine bundle.
// R7-S1-M14: the spine reads state.json (and the board, the pack, the answers, the registry) through a capped
// reader. Before the fix nothing capped the write, so an agent-written READINESS.json with 80,000 slices made
// `gate build` write a 17 MiB state.json the spine could never read again: the run became "state unreadable"
// and every stop was allowed with every row open. Now every such write is refused above the reader's cap,
// the previous file stays intact, and the run stays gated.
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
const CAP = 16 * 1024 * 1024;
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

cp.execFileSync(process.execPath, [path.join(ROOT, 'core', 'spine', 'build.mjs')], { stdio: 'ignore' });

const tmp = (p) => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); made.push(d); return d; };

function world() {
  const home = tmp('dit-r7-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, DO_IT_USER_HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(tmp('dit-r7-parent-'), name);
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
const PLANS = {
  '80,000 slices': () => readiness(Array.from({ length: 80000 }, (_, i) => ({ id: 's' + i }))),
  'two slices, 1.3 M duplicate dependencies': () => readiness([{ id: 's0' }, { id: 's1', depends_on: Array(1300000).fill('s0') }]),
};

for (const [name, plan] of Object.entries(PLANS)) {
  test(`CP03 R7-S1-M14 gate build refuses a plan whose state would pass the read cap; state stays readable and the hook exits 2 (${name})`, { timeout: 240000 }, () => {
    const w = world();
    const X = repo(w, 'X');
    const id = startRun(w, X, 'big');
    const stateFile = path.join(X, '.do-it', 'runs', id, 'state.json');
    const before = fs.readFileSync(stateFile);
    writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), plan(), true);

    const g = sp(w, X, ['gate', 'build', '--run', id]);
    assert.equal(g.code, 1, g.stdout);
    assert.equal(g.out && g.out.outcome, 'READINESS_INVALID', g.stdout);
    assert.match(JSON.stringify(g.out.errors), /cap/);
    // the previous state is untouched and the spine still reads it
    assert.ok(fs.readFileSync(stateFile).equals(before), 'state.json must stay as it was');
    assert.ok(fs.statSync(stateFile).size <= CAP);
    const s = sp(w, X, ['status', '--run', id]);
    assert.equal(s.code, 0, s.stdout + s.stderr);
    assert.equal(s.out.status, 'INTAKE', s.stdout);
    // the run is still gated: the stop is refused, never "state unreadable"
    const stop = sp(w, X, ['gate', 'stop', '--session', 'big', '--cwd', X]);
    assert.equal(stop.out && stop.out.outcome, 'STOP_REFUSED', stop.stdout);
    for (const H of HOOKS) {
      const h = hook(w, H, 'big', X);
      assert.equal(h.code, 2, `${path.relative(ROOT, H)}: ${h.stderr}`);
      assert.doesNotMatch(h.stderr, /unreadable/);
    }
  });
}

test('CP03 R7-S1-M14 every capped spine write refuses above its read cap with STATE_TOO_LARGE and leaves the previous file intact', async () => {
  const fa = await import(path.join(ROOT, 'core', 'spine', 'src', 'fs-atomic.mjs'));
  const dir = tmp('dit-r7-unit-');
  const f = path.join(dir, 'state.json');
  fa.atomicWrite(f, '{"v":1}\n', { cap: fa.STATE_READ_CAP });
  const big = Buffer.alloc(fa.STATE_READ_CAP + 1, 0x20);
  assert.throws(() => fa.atomicWrite(f, big, { cap: fa.STATE_READ_CAP }), (e) => e.outcome === 'STATE_TOO_LARGE' && e.extra.cap === fa.STATE_READ_CAP);
  // JSON writes are capped at the state cap by default, and the registry at its own tighter cap
  assert.throws(() => fa.atomicWriteJson(f, { pad: 'x'.repeat(fa.STATE_READ_CAP) }), (e) => e.outcome === 'STATE_TOO_LARGE');
  assert.throws(() => fa.atomicWriteJson(f, { pad: 'x'.repeat(fa.REGISTRY_READ_CAP) }, { cap: fa.REGISTRY_READ_CAP }), (e) => e.outcome === 'STATE_TOO_LARGE' && e.extra.cap === fa.REGISTRY_READ_CAP);
  assert.equal(fs.readFileSync(f, 'utf8'), '{"v":1}\n');
  assert.deepEqual(fs.readdirSync(dir), ['state.json'], 'no temp file is left behind');
  // the write cap and the read cap are one constant: whatever is written is readable
  fa.atomicWrite(f, Buffer.alloc(fa.STATE_READ_CAP, 0x20), { cap: fa.STATE_READ_CAP });
  assert.equal(fa.readRegularFile(f, fa.STATE_READ_CAP).length, fa.STATE_READ_CAP);
});

test('CP03 R7-S1-M14 a result file above the state cap is refused before any write and the run stays gated', { timeout: 120000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'res');
  const runDir = path.join(X, '.do-it', 'runs', id);
  const before = fs.readFileSync(path.join(runDir, 'state.json'));
  const res = path.join(X, 'result.json');
  fs.writeFileSync(res, JSON.stringify({ schema: 'it-result/1', run_id: id, status: 'ok', exit_code: 0, summary: 'x'.repeat(CAP) }));
  const r = sp(w, X, ['record', '--run', id, '--result', res]);
  assert.equal(r.code, 1, r.stdout);
  assert.equal(r.out && r.out.outcome, 'RESULT_UNREADABLE', r.stdout);
  assert.ok(fs.readFileSync(path.join(runDir, 'state.json')).equals(before));
  assert.ok(!fs.existsSync(path.join(runDir, 'record.journal.json')));
  for (const H of HOOKS) assert.equal(hook(w, H, 'res', X).code, 2);
});

// R7-S1-L5: once the state write holds the refusal, an events.jsonl or an owner-pack.json that cannot be
// written (a FIFO here) no longer opens the stop for its own run.
const NO_FIFO = process.platform === 'win32' || cp.spawnSync('mkfifo', ['--help']).error ? 'mkfifo is not available' : false;
function withFifo(file, fn) {
  const kept = fs.existsSync(file) ? file + '.kept' : null;
  if (kept) fs.renameSync(file, kept);
  cp.execFileSync('mkfifo', [file]);
  try { return fn(); } finally {
    fs.rmSync(file, { force: true });
    if (kept) fs.renameSync(kept, file);
  }
}

test('CP03 R7-S1-L5 a run whose events log or owner pack cannot be written still refuses its own stop', { skip: NO_FIFO, timeout: 120000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'ev');
  const runDir = path.join(X, '.do-it', 'runs', id);
  const status = () => JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8')).status;
  withFifo(path.join(runDir, 'events.jsonl'), () => {
    const g = sp(w, X, ['gate', 'stop', '--session', 'ev', '--cwd', X]);
    assert.equal(g.out && g.out.outcome, 'STOP_REFUSED', g.stdout);
    assert.ok(g.out.unwritable.some((u) => u.run_id === id && u.refused === true && /ENOTREG|ENXIO/.test(u.error)), g.stdout);
    for (const H of HOOKS) assert.equal(hook(w, H, 'ev', X).code, 2, path.relative(ROOT, H));
  });
  // patience reached and the park cannot be written: a plain refusal, never an allow, and the run is not parked
  writeJson(path.join(X, '.do-it', 'settings.json'), { stop_gate: { patience: 1 } });
  withFifo(path.join(runDir, 'owner-pack.json'), () => {
    for (const H of HOOKS) {
      const h = hook(w, H, 'ev', X);
      assert.equal(h.code, 2, `${path.relative(ROOT, H)}: ${h.stderr}`);
    }
    assert.equal(status(), 'INTAKE');
  });
  // the FIFO gone, the park goes through as before
  const p = hook(w, HOOKS[0], 'ev', X);
  assert.ok([0, 2].includes(p.code));
  assert.equal(status(), 'PARKED');
});

// R7-S1-L6: the bundled `file` secrets driver read .secrets/<name> with a raw read, so a FIFO there hung gate build.
test('CP03 R7-S1-L6 gate build with a FIFO credential file answers at once: the credential is missing, the run BLOCKED with that reason', { skip: NO_FIFO, timeout: 120000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'sec');
  writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), { ...readiness([{ id: 's0' }]), credentials: ['API_KEY'] });
  fs.mkdirSync(path.join(X, '.secrets'));
  cp.execFileSync('mkfifo', [path.join(X, '.secrets', 'API_KEY')]);
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [BIN, 'gate', 'build', '--run', id, '--json'], { cwd: X, env: w.env, encoding: 'utf8', timeout: 15000 });
  assert.ok(!r.error, 'gate build must not hang: ' + (r.error && r.error.code));
  assert.ok(Date.now() - t0 < 10000);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.outcome, 'BLOCKED', r.stdout);
  assert.deepEqual(out.missing, ['API_KEY']);
  // the same answer as a missing credential file (CONTRACT: BLOCKED carries its reason, and does not gate)
  const st = JSON.parse(fs.readFileSync(path.join(X, '.do-it', 'runs', id, 'state.json'), 'utf8'));
  assert.equal(st.status, 'BLOCKED');
  assert.match(st.status_reason.reason, /API_KEY/);
});
