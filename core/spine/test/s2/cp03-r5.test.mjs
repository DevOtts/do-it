// CP-03 round 5 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';

const made = [];
const mk = (o) => { const r = mkRepo(o); made.push(r.dir, r.home); return r; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function start(repo, session, cwd, env) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session], env, cwd);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(real(repo, ['next', '--run', r.out.run_id], env, cwd).code, 0);
  return r.out.run_id;
}
const hookStop = (repo, session, cwd, env) => real(repo, ['gate', 'stop', '--session', session, '--cwd', cwd || repo.dir], env, cwd);
const stateOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json'));
const res = (a, o) => ({ schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, verdicts: [], ...o });
const advance = (repo, a, ...to) => { for (const s of to) assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', s]).out.outcome, 'ADVANCED', s); };
// a git repo inside another test repo's folder, sharing its HOME (two homes of one session)
function subRepo(parent, name) {
  const dir = path.join(parent.dir, name);
  fs.mkdirSync(dir);
  cp.execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  return { dir, home: parent.home, env: parent.env, doIt: path.join(dir, '.do-it') };
}
const patient = (repo) => writeJson(path.join(repo.doIt, 'settings.json'), { stop_gate: { patience: 50 } });

test('CP03 R5-S1-H9 a deploy-legs result never takes a run to FAILED without a reason or out of order; the hook keeps refusing', () => {
  const repo = mk();
  patient(repo);
  const r = path.join(repo.dir, 'results', 'r.json');
  // the reviewer's result from INTAKE: status ok, one FAILED leg, no evidence
  const a = start(repo, 'dpi-s');
  writeJson(r, res(a, { status: 'ok', exit_code: 0, legs: [{ leg: 'web', state: 'FAILED' }] }));
  let out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
  assert.equal(out.code, 1, out.stdout);
  assert.equal(out.out.outcome, 'DEPLOY_OUT_OF_ORDER');
  assert.equal(stateOf(repo, a).status, 'INTAKE');
  assert.equal(hookStop(repo, 'dpi-s').out.outcome, 'STOP_REFUSED');
  // the run-level escalate the reviewer chained afterwards: nothing to escalate from
  assert.equal(real(repo, ['gate', 'escalate', '--run', a, '--reason', 'deploy broke']).out.outcome, 'TRANSITION_REFUSED');
  // same from BUILDING with "status":"failed" and no reason
  advance(repo, a, 'BUILDING');
  writeJson(r, res(a, { status: 'failed', exit_code: 1, legs: [{ leg: 'web', state: 'FAILED' }] }));
  out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
  assert.equal(out.out.outcome, 'DEPLOY_OUT_OF_ORDER', out.stdout);
  assert.equal(stateOf(repo, a).status, 'BUILDING');
  assert.equal(hookStop(repo, 'dpi-s').out.outcome, 'STOP_REFUSED');
  // in DEPLOYING, a FAILED leg with no evidence and no reason is refused too
  advance(repo, a, 'VERIFYING', 'DEPLOYING');
  for (const legs of [[{ leg: 'web', state: 'FAILED' }], [{ leg: 'web', state: 'FAILED', evidence: ' ​ ' }], [{ leg: 'web', state: 'NEEDS_HUMAN' }]]) {
    writeJson(r, res(a, { stage: 'deploy-it', status: 'failed', exit_code: 1, legs }));
    out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
    assert.equal(out.code, 1, out.stdout);
    assert.equal(out.out.outcome, 'FAIL_REASON_REQUIRED', JSON.stringify(legs));
    assert.equal(stateOf(repo, a).status, 'DEPLOYING');
  }
  const hook = hookStop(repo, 'dpi-s');
  assert.equal(hook.out.outcome, 'STOP_REFUSED', hook.stdout);
  assert.equal(hook.out.open.length, 10, 'the board still has 10 open rows');
});

test('CP03 R5-S1-H9 a deploy that really failed records FAILED with its cause; escalate then goes through an owner-pack question', () => {
  const repo = mk();
  const a = start(repo, 'dpf');
  advance(repo, a, 'BUILDING', 'VERIFYING', 'DEPLOYING');
  fs.mkdirSync(path.join(repo.dir, 'proof'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, 'proof', 'web.txt'), 'web: exit 1\n');
  writeJson(path.join(repo.dir, 'results', 'd.json'), res(a, { stage: 'deploy-it', status: 'failed', exit_code: 1, legs: [{ leg: 'web', state: 'FAILED', evidence: 'proof/web.txt' }] }));
  const out = real(repo, ['record', '--run', a, '--result', 'results/d.json']);
  assert.equal(out.out.outcome, 'DEPLOY_FAILED', out.stdout);
  const st = stateOf(repo, a);
  assert.equal(st.status, 'FAILED');
  assert.equal(st.status_reason.status, 'FAILED');
  assert.match(st.status_reason.reason, /leg web FAILED: proof\/web\.txt/);
  const e = real(repo, ['gate', 'escalate', '--run', a, '--reason', 'deploy broke on web']);
  assert.equal(e.out.outcome, 'ESCALATED', e.stdout);
  assert.equal(e.out.pack_question, 1);
  const pack = readJson(path.join(runDirOf(repo, a), 'owner-pack.json'));
  assert.match(pack.questions[0].text, /recorded cause: leg web FAILED/);
});

test('CP03 R5-S1-H9 every writer of FAILED / BLOCKED / NEEDS_HUMAN keeps a cause: gate build on a missing credential stores status_reason', () => {
  const repo = mk();
  const a = start(repo, 'cred');
  fs.mkdirSync(path.join(repo.doIt, 'plan'), { recursive: true });
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), { decisions: [], preflight: { passed: true }, credentials: ['DOIT_R5_NOPE_TOKEN'], slices: [{ id: 's1' }] });
  const b = real(repo, ['gate', 'build', '--run', a]);
  assert.equal(b.out.outcome, 'BLOCKED', b.stdout);
  const st = stateOf(repo, a);
  assert.equal(st.status, 'BLOCKED');
  assert.equal(st.status_reason.status, 'BLOCKED');
  assert.match(st.status_reason.reason, /missing credential DOIT_R5_NOPE_TOKEN/);
});

const packOf = (repo, id) => { try { return readJson(path.join(runDirOf(repo, id), 'owner-pack.json')); } catch { return null; } };
const openQs = (repo, id) => {
  const p = packOf(repo, id);
  let answered = [];
  try { answered = readJson(path.join(runDirOf(repo, id), 'answers.json')).answers.map((a) => a.n); } catch { /* none */ }
  return p ? p.questions.filter((q) => q.status !== 'withdrawn' && !answered.includes(q.n)) : [];
};

test('CP03 R5-S1-H10 a result question tagged source "stop-gate" is not the gate\'s: withdraw leaves it open and the run waits on it', () => {
  const repo = mk();
  const a = start(repo, 'wd2-s');
  advance(repo, a, 'BUILDING');
  writeJson(path.join(repo.dir, 'q.json'), [{ text: 'Which region should prod use?', kind: 'owner-gate', source: 'stop-gate', options: ['eu', 'us'], recommendation: 'eu', default: 'eu' }]);
  writeJson(path.join(repo.dir, 'results', 'n.json'), res(a, { status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'q.json' } }));
  const rec = real(repo, ['record', '--run', a, '--result', 'results/n.json']);
  assert.equal(rec.out.outcome, 'RECORDED', rec.stdout);
  assert.equal(stateOf(repo, a).status, 'NEEDS_HUMAN');
  assert.equal(packOf(repo, a).questions[0].source, undefined, 'the result\'s own source is dropped');
  const w = real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', a]);
  assert.equal(w.out.outcome, 'PACK_NOOP', w.stdout);
  assert.equal(openQs(repo, a).length, 1, 'the owner question is still open');
  assert.equal(stateOf(repo, a).status, 'NEEDS_HUMAN');
  // the run is handed to the owner through that question, so escalate works (it refused with 0 open)
  assert.equal(real(repo, ['gate', 'escalate', '--run', a, '--reason', 'a b c']).out.outcome, 'ESCALATED');
});

test('CP03 R5-S1-H10 a result question in the stop gate\'s own words is refused; the run keeps gating', () => {
  const repo = mk();
  patient(repo);
  const a = start(repo, 'wd3-s');
  writeJson(path.join(repo.dir, 'q.json'), [{ text: 'The run stopped with 1 open row(s) after 3 refusals: intake. Resume the run or close it with the open rows as residuals?', options: ['resume run', 'close with residuals'] }]);
  writeJson(path.join(repo.dir, 'results', 'n.json'), res(a, { status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'q.json' } }));
  const rec = real(repo, ['record', '--run', a, '--result', 'results/n.json']);
  assert.equal(rec.code, 1, rec.stdout);
  assert.equal(rec.out.outcome, 'STOP_GATE_TEXT_RESERVED');
  assert.equal(stateOf(repo, a).status, 'INTAKE');
  assert.equal(packOf(repo, a), null);
  assert.equal(hookStop(repo, 'wd3-s').out.outcome, 'STOP_REFUSED');
});

test('CP03 R5-S1-H10 pack withdraw never removes the last open question of a NEEDS_HUMAN run, and names the run', () => {
  const repo = mk();
  writeJson(path.join(repo.doIt, 'settings.json'), { stop_gate: { patience: 1 } });
  const a = start(repo, 'wd4-s');
  advance(repo, a, 'BUILDING');
  assert.equal(hookStop(repo, 'wd4-s').out.outcome, 'STOP_REFUSED');
  assert.equal(hookStop(repo, 'wd4-s').out.outcome, 'PARKED', 'the gate parks at patience 1 and writes its question');
  const gateQ = openQs(repo, a)[0];
  assert.match(gateQ.text, /^The run stopped with /);
  const ev = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8');
  assert.match(ev, new RegExp('"event":"stop_parked".*"question":' + gateQ.n));
  assert.equal(real(repo, ['resume', '--run', a, '--session', 'wd4-s']).out.outcome, 'RESUMED');
  writeJson(path.join(repo.dir, 'q.json'), [{ text: 'Which region should prod use?', kind: 'owner-gate', options: ['eu', 'us'], recommendation: 'eu', default: 'eu' }]);
  writeJson(path.join(repo.dir, 'results', 'n.json'), res(a, { status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'q.json' } }));
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/n.json']).out.outcome, 'RECORDED');
  const ownerQ = openQs(repo, a).find((q) => q.kind === 'owner-gate');
  assert.equal(real(repo, ['answer', '--run', a, '--reply', ownerQ.n + ': eu']).code, 2, 'the gate question is still pending');
  assert.equal(stateOf(repo, a).status, 'NEEDS_HUMAN');
  const w = real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', a]);
  assert.equal(w.code, 1, w.stdout);
  assert.equal(w.out.outcome, 'PACK_WITHDRAW_REFUSED');
  assert.match(w.out.message, new RegExp('run ' + a + ' is NEEDS_HUMAN'));
  assert.equal(openQs(repo, a).length, 1, 'the last open question stays');
  // without --run, nothing else to withdraw: refused the same way
  assert.equal(real(repo, ['pack', 'withdraw', '--by', 'stop-gate']).out.outcome, 'PACK_WITHDRAW_REFUSED');
});

test('CP03 R5-S1-M9 a run whose refusal cannot be written never opens the stop for the other runs of its home or for other homes', () => {
  // two homes, one session: A open in X, B open in Y; X's run folder read-only
  const parent = mk();
  const env = { DO_IT_USER_HOME: path.join(parent.home, 'uh') };
  const x = subRepo(parent, 'X');
  const y = subRepo(parent, 'Y');
  for (const r of [x, y]) patient(r);
  const a = start(x, 'xo-s', x.dir, env);
  start(y, 'xo-s', y.dir, env);
  const ra = runDirOf(x, a);
  fs.chmodSync(ra, 0o555);
  try {
    const g = hookStop(x, 'xo-s', x.dir, env);
    assert.equal(g.out.outcome, 'STOP_REFUSED', g.stdout);
    assert.deepEqual(g.out.refused_homes, [fs.realpathSync(y.doIt)], g.stdout);
    assert.equal(g.out.unwritable[0].run_id, a, 'the write error is reported');
    assert.match(g.out.unwritable[0].error, /EACCES/);
  } finally { fs.chmodSync(ra, 0o755); }

  // same home: A1 older and open, A2 newer and open, A2 read-only
  const repo = mk();
  patient(repo);
  const a1 = start(repo, 'sh-s');
  const a2 = start(repo, 'sh-s');
  const r2 = runDirOf(repo, a2);
  fs.chmodSync(r2, 0o555);
  try {
    const g = hookStop(repo, 'sh-s');
    assert.equal(g.out.outcome, 'STOP_REFUSED', g.stdout);
    assert.equal(g.out.run_id, a1, 'the valid older run is refused');
    assert.deepEqual(g.out.unwritable.map((u) => u.run_id), [a2]);
  } finally { fs.chmodSync(r2, 0o755); }
});
