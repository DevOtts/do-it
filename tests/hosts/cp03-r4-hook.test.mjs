// CP-03 round 4 regressions that go through the shipped Stop hook (and its plugin mirror) with the real
// spine bundle. Each test replays the reviewer's commands and asserts the stop is refused (exit 2).
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
  const home = tmp('r4-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(w.parent || (w.parent = tmp('r4-parent-')), name);
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
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };

for (const H of HOOKS) {
  const which = path.relative(ROOT, H);

  test(`CP03 R4-S1-H8 run-level needs_human / blocked / failed results without a question or reason leave the hook refusing (${which})`, () => {
    const w = world();
    const dir = repo(w, 'X');
    const a = startRun(w, dir, 'S');
    assert.equal(sp(w, dir, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
    const r = path.join(dir, 'results', 'r.json');
    for (const [status, exit_code] of [['needs_human', 2], ['blocked', 3], ['failed', 1]]) {
      writeJson(r, { schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, status, exit_code, verdicts: [] });
      const rec = sp(w, dir, ['record', '--run', a, '--result', 'results/r.json']);
      assert.equal(rec.code, 1, status + ': ' + rec.stdout);
    }
    assert.equal(hook(w, H, 'S', dir).code, 2, 'the run is still BUILDING with 10 open rows');
  });

  test(`CP03 R4-S1-M7 a garbled registry and a garbled board in another home never open the hook (${which})`, () => {
    const w = world();
    w.env.DO_IT_USER_HOME = path.join(w.home, 'uh');
    const x = repo(w, 'X');
    const y = repo(w, 'Y');
    for (const d of [x, y]) writeJson(path.join(d, '.do-it', 'settings.json'), { stop_gate: { patience: 50 } });
    startRun(w, x, 'reg-1');
    assert.equal(hook(w, H, 'reg-1', x).code, 2);
    const legacy = path.join(w.env.DO_IT_USER_HOME, 'sessions', 'reg-1.json');
    fs.writeFileSync(legacy, '{"session_id":"reg-1","runs":[');
    assert.equal(hook(w, H, 'reg-1', x).code, 2, 'garbled registry');
    fs.rmSync(legacy); fs.mkdirSync(legacy);
    assert.equal(hook(w, H, 'reg-1', x).code, 2, 'registry is a directory');
    fs.rmSync(legacy, { recursive: true }); fs.writeFileSync(legacy, '{}'); fs.chmodSync(legacy, 0o000);
    assert.equal(hook(w, H, 'reg-1', x).code, 2, 'registry chmod 000');
    fs.chmodSync(legacy, 0o644);
    // two homes of one session; Y's board garbled
    startRun(w, x, 'xh-1');
    startRun(w, y, 'xh-1');
    const yfl = path.join(y, '.do-it', 'finish-line.json');
    fs.writeFileSync(yfl, '<<<<<<< HEAD\n' + fs.readFileSync(yfl, 'utf8'));
    assert.equal(hook(w, H, 'xh-1', x).code, 2, 'a garbled board in Y never opens X');
    assert.equal(hook(w, H, 'xh-1', y).code, 2, 'nor Y itself (fail closed)');
  });

  test(`CP03 R4-S1-M8 parallel starts of one session: every run is gated from the parent folder (${which})`, async () => {
    const w = world();
    w.env.DO_IT_USER_HOME = path.join(w.home, 'uh');
    const dirs = ['X', 'Y', 'Z', 'W'].map((n) => repo(w, n));
    const outs = await Promise.all(dirs.map((d) => new Promise((resolve) => {
      const c = cp.spawn(process.execPath, [BIN, 'start', '--preset', 'feature', '--request', 'race', '--session', 'race-e2e', '--json'], { cwd: d, env: w.env });
      let out = '';
      c.stdout.on('data', (b) => { out += b; });
      c.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop())));
    })));
    outs.forEach((o, i) => assert.equal(sp(w, dirs[i], ['next', '--run', o.run_id]).code, 0));
    // close every row of X's run: the others must still refuse from the parent folder
    const f = path.join(dirs[0], '.do-it', 'finish-line.json');
    const fl = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.writeFileSync(path.join(dirs[0], 'ev.txt'), 'x\n');
    for (const r of fl.rows) if (r.run_id === outs[0].run_id) { r.state = 'DONE'; r.evidence = 'ev.txt'; }
    fs.writeFileSync(f, JSON.stringify(fl, null, 2) + '\n');
    assert.equal(hook(w, H, 'race-e2e', w.parent).code, 2);
    const g = sp(w, w.parent, ['gate', 'stop', '--session', 'race-e2e', '--cwd', w.parent]);
    assert.equal(g.out.refused_homes.length, 3, g.stdout);
  });

  test(`CP03 R4-L4 a .secrets value equal to STOP_REFUSED never turns the refusal into an allow (${which})`, () => {
    const w = world();
    const dir = repo(w, 'X');
    startRun(w, dir, 'sec');
    fs.mkdirSync(path.join(dir, '.secrets'));
    fs.writeFileSync(path.join(dir, '.secrets', 'token'), 'STOP_REFUSED');
    assert.equal(hook(w, H, 'sec', dir).code, 2);
  });
}
