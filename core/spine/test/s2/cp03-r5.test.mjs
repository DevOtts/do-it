// CP-03 round 5 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
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
