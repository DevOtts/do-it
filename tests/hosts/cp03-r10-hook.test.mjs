// CP-03 round 10 regressions (R10-S1-M17, L-d, L-g): the stop gate's park question is deduped only against
// OPEN questions, so a park after the owner answered the last one asks again; a reused open gate question
// names the current rows; a garbled answers.json never blocks a park.
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
  const home = tmp('dit-r10-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, DO_IT_USER_HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(tmp('dit-r10-parent-'), name);
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


const packOf = (X, id) => JSON.parse(fs.readFileSync(path.join(X, '.do-it', 'runs', id, 'owner-pack.json'), 'utf8'));
const stopGateQs = (X, id) => packOf(X, id).questions.filter((q) => q.source === 'stop-gate' || /^The run stopped with/.test(q.text));
const answeredNs = (X, id) => {
  const f = path.join(X, '.do-it', 'runs', id, 'answers.json');
  try { return new Set(JSON.parse(fs.readFileSync(f, 'utf8')).answers.map((a) => a.n)); } catch { return new Set(); }
};
const openGateQs = (X, id) => stopGateQs(X, id).filter((q) => q.status !== 'withdrawn' && !answeredNs(X, id).has(q.n));
const parkedEvents = (X, id) => fs.readFileSync(path.join(X, '.do-it', 'runs', id, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.event === 'stop_parked');

// patience 1 on a BUILDING run with one open row: one counted refusal, then the park
function park(w, X, id, session) {
  assert.equal(hook(w, HOOKS[0], session, X).code, 2, 'first stop refuses');
  const h = hook(w, HOOKS[1], session, X);
  assert.equal(h.code, 0, h.stderr);
  assert.equal(statusOf(X, id).status, 'PARKED');
}

function building(w, session, slices) {
  const X = repo(w, 'X');
  const id = startRun(w, X, session);
  writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), readiness(slices));
  const g = sp(w, X, ['gate', 'build', '--run', id]);
  assert.equal(g.out && g.out.outcome, 'READINESS_OK', g.stdout);
  writeJson(path.join(X, '.do-it', 'settings.json'), { stop_gate: { patience: 1 } });
  return { X, id };
}

function resume(w, X, id, session) {
  const r = cp.spawnSync(process.execPath, [BIN, 'resume', '--run', id, '--json'], { cwd: X, env: { ...w.env, DO_IT_SESSION_ID: session }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.notEqual(statusOf(X, id).status, 'PARKED');
}

test('CP03 R10-S1-M17 park, answer "resume run", resume, park again with the same rows: one new open stop-gate question, named by the event', { timeout: 300000 }, () => {
  const w = world();
  const { X, id } = building(w, 'm17', [{ id: 'aaaaaa' }]);
  park(w, X, id, 'm17');
  const first = openGateQs(X, id);
  assert.equal(first.length, 1, 'the first park asks once');
  const a = sp(w, X, ['answer', '--run', id, '--reply', first[0].n + ': resume run']);
  assert.equal(a.code, 0, a.stdout);
  assert.equal(openGateQs(X, id).length, 0);
  resume(w, X, id, 'm17');
  park(w, X, id, 'm17');
  const open = openGateQs(X, id);
  assert.equal(open.length, 1, 'exactly one new open stop-gate question');
  assert.notEqual(open[0].n, first[0].n);
  assert.equal(open[0].text, first[0].text, 'the same rows, the same text');
  const evs = parkedEvents(X, id);
  assert.equal(evs.length, 2);
  assert.equal(evs[1].detail.question, open[0].n, 'the second stop_parked event names the new question');
  assert.equal(statusOf(X, id).status, 'PARKED');
});
