// CP-03 round 9 regressions (R9-S1-M16): at patience, a park whose state write would fail adds no question to
// the owner pack (it is test-serialised first), and the gate never asks its park question twice: packAppend
// dedupes on the stored (redacted) text and skips while the run has an open question the gate wrote.
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
  const home = tmp('dit-r9-home-');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, { HOME: home, DO_IT_USER_HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null', DO_IT_SPINE: BIN });
  return { home, env };
}

function repo(w, name) {
  const dir = path.join(tmp('dit-r9-parent-'), name);
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


const stopGateQs = (X, id) => {
  const f = path.join(X, '.do-it', 'runs', id, 'owner-pack.json');
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8')).questions.filter((q) => q.source === 'stop-gate' || /^The run stopped with/.test(q.text));
};

test('CP03 R9-S1-M16 at patience with a failing state write, 6 stops add at most 1 stop-gate question and the hook exits 2 every time', { timeout: 300000 }, () => {
  const w = world();
  const X = repo(w, 'X');
  const id = startRun(w, X, 'm16');
  writeJson(path.join(X, '.do-it', 'plan', 'READINESS.json'), readiness([{ id: 'aaaaaa' }, { id: 's1', depends_on: Array(600000).fill('aaaaaa') }]), true);
  const g = sp(w, X, ['gate', 'build', '--run', id]);
  assert.equal(g.out && g.out.outcome, 'READINESS_OK', g.stdout);
  writeJson(path.join(X, '.do-it', 'settings.json'), { stop_gate: { patience: 1 } });
  // one counted refusal: the run now sits at patience
  assert.equal(hook(w, HOOKS[0], 'm16', X).code, 2);
  assert.equal(statusOf(X, id).stop_refusals, 1);
  const secret = path.join(X, '.secrets', 'K'.repeat(40));
  fs.mkdirSync(path.dirname(secret));
  fs.writeFileSync(secret, 'aaaaaa');
  for (let i = 0; i < 6; i++) {
    const h = hook(w, HOOKS[i % HOOKS.length], 'm16', X);
    assert.equal(h.code, 2, `stop ${i + 1}: ${h.stderr}`);
    assert.match(h.stderr, /not counted/);
    assert.ok(stopGateQs(X, id).length <= 1, `stop ${i + 1}: ${stopGateQs(X, id).length} stop-gate questions`);
  }
  assert.equal(stopGateQs(X, id).length, 0, 'a park that cannot be written asks nothing');
  const st = statusOf(X, id);
  assert.equal(st.status, 'BUILDING');
  assert.equal(st.stop_refusals, 1);
});

test('CP03 R9-S1-M16 packAppend dedupes on the redacted text and skips while the gate has an open question', async () => {
  const pack = await import(path.join(ROOT, 'core', 'spine', 'src', 'pack.mjs'));
  const red = await import(path.join(ROOT, 'core', 'spine', 'src', 'redact.mjs'));
  const ev = await import(path.join(ROOT, 'core', 'spine', 'src', 'events.mjs'));
  const home = tmp('dit-r9-unit-');
  const ctx = { home, root: home, cwd: home, repo: home, env: {}, now: () => '2026-11-09T00:00:00.000Z' };
  const runId = 'r-1';
  fs.mkdirSync(path.join(home, 'runs', runId), { recursive: true });
  const text = 'The run stopped with 1 open row(s) after 1 refusals: bbbbbb. Resume the run or close it with the open rows as residuals?';
  red.redactReset();
  red.redactAdd('K', 'bbbbbb');
  try {
    const q = { kind: 'default', source: 'stop-gate', text, options: ['resume run', 'close with residuals'] };
    assert.equal(pack.packAppend(ctx, runId, [q]).length, 1);
    assert.equal(pack.packAppend(ctx, runId, [q]).length, 0, 'the stored text is redacted; the same text is still a duplicate');
    const stored = pack.openPackQuestions(ctx, runId);
    assert.equal(stored.length, 1);
    assert.match(stored[0].text, /\[REDACTED:K\]/);
    // the gate marks it as its own; a park question with other rows is then not added
    ev.appendEvent(ctx, runId, { event: 'stop_parked', stage: null, verdict: 'PARKED', detail: { from: 'BUILDING', open: ['x'], question: stored[0].n } });
    const other = { ...q, text: text.replace('bbbbbb', 'cccccc') };
    assert.equal(pack.packAppend(ctx, runId, [other], { stopGate: true }).length, 0, 'an open gate question exists');
    assert.equal(pack.openStopGateQuestion(ctx, runId).n, stored[0].n);
    // a stage question is not held back by the gate's question
    assert.equal(pack.packAppend(ctx, runId, [{ text: 'Which region?' }]).length, 1);
    // once the gate question is answered, the next park asks again
    fs.writeFileSync(path.join(home, 'runs', runId, 'answers.json'), JSON.stringify({ answers: [{ n: stored[0].n, answer: 'resume run' }] }));
    assert.equal(pack.packAppend(ctx, runId, [other], { stopGate: true }).length, 1);
  } finally { red.redactReset(); }
});
