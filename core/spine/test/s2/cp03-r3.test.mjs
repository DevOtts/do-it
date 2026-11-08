// CP-03 round 3 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';

function start(repo, session, cwd) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session], null, cwd);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}
const hookStop = (repo, session, cwd) => real(repo, ['gate', 'stop', '--session', session, '--cwd', cwd || repo.dir], null, cwd);
const statusOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json')).status;

test('CP03 R3-S1-H6 gate advance never reaches DONE: the run stays gated with its rows open', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  for (const s of ['BUILDING', 'VERIFYING', 'CONCLUDING']) {
    const r = real(repo, ['gate', 'advance', '--run', a, '--to', s]);
    assert.equal(r.out.outcome, 'ADVANCED', r.stdout);
  }
  const done = real(repo, ['gate', 'advance', '--run', a, '--to', 'DONE']);
  assert.equal(done.code, 1, done.stdout);
  assert.equal(done.out.outcome, 'TRANSITION_REFUSED');
  assert.equal(done.out.owner, 'gate conclude', 'the refusal names the command that owns DONE');
  assert.equal(statusOf(repo, a), 'CONCLUDING');
  const hook = hookStop(repo, 'sess-A');
  assert.equal(hook.out.outcome, 'STOP_REFUSED', hook.stdout);
  assert.equal(real(repo, ['gate', 'stop', '--run', a]).out.outcome, 'STOP_REFUSED');
  assert.equal(real(repo, ['gate', 'conclude', '--run', a]).out.outcome, 'CONCLUDE_REFUSED', 'the owning command still checks the rows');
  assert.equal(real(repo, ['status', '--run', a]).out.status, 'CONCLUDING');
});

test('CP03 R3-S1-H6 gate advance refuses every non-gating status, naming its owning command', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  real(repo, ['next', '--run', a]);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
  const owners = { DONE: /gate conclude/, PARKED: /park/, NEEDS_HUMAN: /record|pack/, AWAIT_RATIFY: /pack|readiness/, BLOCKED: /record/, FAILED: /record/, ESCALATED: /record|escalate/ };
  for (const [to, re] of Object.entries(owners)) {
    const r = real(repo, ['gate', 'advance', '--run', a, '--to', to]);
    assert.equal(r.code, 1, to + ': ' + r.stdout);
    assert.equal(r.out.outcome, 'TRANSITION_REFUSED', to);
    assert.match(r.out.owner, re, to);
    assert.equal(statusOf(repo, a), 'BUILDING', to + ' was not entered');
  }
  assert.equal(hookStop(repo, 'sess-A').out.outcome, 'STOP_REFUSED', 'still gated after every refused advance');
  // PROVING -> DONE is refused too
  for (const s of ['VERIFYING', 'DEPLOYING', 'PROVING']) assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', s]).out.outcome, 'ADVANCED', s);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'DONE']).out.outcome, 'TRANSITION_REFUSED');
});

test('CP03 R3-S1-H6 gate escalate starts only from a run that already waits on the owner, and needs an open question', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  real(repo, ['next', '--run', a]);
  real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']);
  const fromBuilding = real(repo, ['gate', 'escalate', '--run', a, '--reason', 'give up']);
  assert.equal(fromBuilding.out.outcome, 'TRANSITION_REFUSED', 'a gating run cannot escalate itself out of the gate');
  assert.equal(real(repo, ['gate', 'escalate', '--run', a]).out.outcome, 'USAGE', 'a reason is required');
  for (const s of ['VERIFYING', 'REVIEWING']) real(repo, ['gate', 'advance', '--run', a, '--to', s]);
  // NEEDS_HUMAN through its owning command: a needs_human result with its questions
  const q = path.join(repo.dir, 'results', 'q.json');
  writeJson(q, { questions: [{ kind: 'review-cap', text: 'Raise the cap?', options: ['yes', 'no'], recommendation: 'no', default: 'no', reversible: true }] });
  const res = path.join(repo.dir, 'results', 'r.json');
  writeJson(res, { schema: 'it-result/1', stage: 'review-it', run_id: a, slice_id: null, status: 'needs_human', exit_code: 2, verdicts: [], pending_human: { questions_path: 'results/q.json' } });
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r.json']).code, 2);
  assert.equal(statusOf(repo, a), 'NEEDS_HUMAN');
  const esc = real(repo, ['gate', 'escalate', '--run', a, '--reason', 'review loop stalled at the cap and the owner gave no reply']);
  assert.equal(esc.out.outcome, 'ESCALATED', esc.stdout);
  assert.equal(statusOf(repo, a), 'ESCALATED');
  const ev = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8');
  assert.match(ev, /"event":"escalated".*review loop stalled/);
  // NEEDS_HUMAN with every question answered: nothing hands the run to the owner
  const b = start(repo, 'sess-B');
  for (const s of ['BUILDING', 'VERIFYING', 'REVIEWING']) real(repo, ['gate', 'advance', '--run', b, '--to', s]);
  writeJson(path.join(repo.dir, 'results', 'rb.json'), { schema: 'it-result/1', stage: 'review-it', run_id: b, slice_id: null, status: 'needs_human', exit_code: 2, verdicts: [], pending_human: { questions_path: 'results/q.json' } });
  assert.equal(real(repo, ['record', '--run', b, '--result', 'results/rb.json']).code, 2);
  writeJson(path.join(runDirOf(repo, b), 'answers.json'), { answers: [{ n: 1, answer: 'no' }] });
  assert.equal(real(repo, ['gate', 'escalate', '--run', b, '--reason', 'no reply at all']).out.outcome, 'TRANSITION_REFUSED');
});
