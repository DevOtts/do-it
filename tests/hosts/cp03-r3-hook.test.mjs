// CP-03 round 3 regressions that go through the shipped Stop hook with the real spine bundle.
// Each test replays the reviewer's commands and asserts the stop is refused.
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
  const home = tmp('r3-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(w.parent || (w.parent = tmp('r3-parent-')), name);
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
  const r = cp.spawnSync(process.execPath, [BIN, ...argv, '--json'], { cwd, env: w.env, encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  let out = null;
  try { out = JSON.parse(lines[lines.length - 1]); } catch { /* not JSON */ }
  return { code: r.status, out, stdout: r.stdout };
}

function hook(w, hookFile, session, cwd) {
  const r = cp.spawnSync(process.execPath, [hookFile], { input: JSON.stringify({ session_id: session, cwd, hook_event_name: 'Stop' }), cwd, env: w.env, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}

const startRun = (w, dir, session) => {
  const r = sp(w, dir, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session]);
  assert.equal(r.code, 0, r.stdout);
  const n = sp(w, dir, ['next', '--run', r.out.run_id]);
  assert.equal(n.code, 0, n.stdout);
  return r.out.run_id;
};
const state = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, '.do-it', 'runs', id, 'state.json'), 'utf8'));

// progress: close the first open row of the run, with evidence on disk
function closeOne(dir, runId) {
  const f = path.join(dir, '.do-it', 'finish-line.json');
  const fl = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(path.join(dir, 'ev.txt'), 'x\n');
  const row = fl.rows.find((r) => r.run_id === runId && r.state === 'OPEN');
  row.state = 'DONE';
  row.evidence = 'ev.txt';
  fs.writeFileSync(f, JSON.stringify(fl, null, 2) + '\n');
}

for (const H of HOOKS) {
  const which = path.relative(ROOT, H);

  test(`CP03 R3-S1-H5 two owned runs making progress are never parked by the hook; patience without progress parks each run (${which})`, () => {
    const w = world();
    const dir = repo(w, 'X');
    const a1 = startRun(w, dir, 'sess-A');
    const a2 = startRun(w, dir, 'sess-A');
    // the reviewer's loop: stop, then progress on both runs, four times
    for (let i = 1; i <= 4; i++) {
      const r = hook(w, H, 'sess-A', dir);
      assert.equal(r.code, 2, `stop ${i} with progress between stops must be refused: ${r.stderr}`);
      closeOne(dir, a1);
      closeOne(dir, a2);
    }
    for (const id of [a1, a2]) {
      assert.equal(state(dir, id).status, 'INTAKE', 'a run making progress is never parked');
      assert.ok(!fs.existsSync(path.join(dir, '.do-it', 'runs', id, 'park.json')));
    }
    assert.ok(!fs.existsSync(path.join(dir, '.do-it', 'host-claude-code', 'stop-refusals.json')), 'the hook keeps no counter');
    assert.equal(sp(w, dir, ['gate', 'stop', '--session', 'sess-A', '--cwd', dir]).out.outcome, 'STOP_REFUSED');
    // no progress now: the spine's per-run patience decides (T-S1-05 / T-S1-10)
    const st = [];
    for (let i = 0; i < 3; i++) st.push(hook(w, H, 'sess-A', dir).code);
    // the explicit check above was refusal 1 after the last progress; refusals 2 and 3, then patience parks
    assert.deepEqual(st, [2, 2, 0], 'at patience without progress the spine parks and the stop is allowed');
    for (const id of [a1, a2]) assert.equal(state(dir, id).status, 'PARKED', 'each run parked by the spine on its own');
  });

  test(`CP03 R3-S1-H5 single run: progress before every stop never parks it (${which})`, () => {
    const w = world();
    const dir = repo(w, 'X');
    const a = startRun(w, dir, 'sess-A');
    for (let i = 1; i <= 6; i++) {
      closeOne(dir, a);
      assert.equal(hook(w, H, 'sess-A', dir).code, 2, 'stop ' + i);
    }
    const s = state(dir, a);
    assert.equal(s.status, 'INTAKE');
    assert.equal(s.stop_refusals, 1, 'the spine resets its count on progress');
    assert.ok(!fs.existsSync(path.join(dir, '.do-it', 'runs', a, 'park.json')), 'no park record that says the opposite of what happened');
  });
}

for (const H of HOOKS) {
  const which = path.relative(ROOT, H);
  test(`CP03 R3-S1-H7 the hook refuses from repo X, a sibling repo Y and the non-git parent folder (${which})`, () => {
    const w = world();
    const x = repo(w, 'X');
    const y = repo(w, 'Y');
    const a = startRun(w, x, 'sess-A');
    for (const cwd of [x, y, w.parent]) {
      const r = hook(w, H, 'sess-A', cwd);
      assert.equal(r.code, 2, `stop from ${cwd} must be refused: ${r.stderr}`);
    }
    assert.equal(state(x, a).status, 'INTAKE');
    assert.ok(!fs.existsSync(path.join(y, '.do-it', 'host-claude-code')), 'the hook writes nothing in Y');
  });
}
