// CP-03 round 5 regressions that go through the shipped Stop hook (and its plugin mirror) with the real
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
  const home = tmp('r5-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(w.parent || (w.parent = tmp('r5-parent-')), name);
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
const res = (a, o) => ({ schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, verdicts: [], ...o });
const patient = (dir) => writeJson(path.join(dir, '.do-it', 'settings.json'), { stop_gate: { patience: 50 } });

for (const H of HOOKS) {
  const which = path.relative(ROOT, H);

  test(`CP03 R5-S1-H9 a deploy-legs result with a silent FAILED leg leaves the hook refusing (${which})`, () => {
    const w = world();
    const dir = repo(w, 'X');
    patient(dir);
    const a = startRun(w, dir, 'dpi-s');
    const r = path.join(dir, 'results', 'r.json');
    writeJson(r, res(a, { status: 'ok', exit_code: 0, legs: [{ leg: 'web', state: 'FAILED' }] }));
    assert.equal(sp(w, dir, ['record', '--run', a, '--result', 'results/r.json']).out.outcome, 'DEPLOY_OUT_OF_ORDER');
    assert.equal(hook(w, H, 'dpi-s', dir).code, 2, 'from INTAKE');
    assert.equal(sp(w, dir, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
    writeJson(r, res(a, { status: 'failed', exit_code: 1, legs: [{ leg: 'web', state: 'FAILED' }] }));
    assert.equal(sp(w, dir, ['record', '--run', a, '--result', 'results/r.json']).code, 1);
    assert.equal(hook(w, H, 'dpi-s', dir).code, 2, 'from BUILDING');
  });
}
