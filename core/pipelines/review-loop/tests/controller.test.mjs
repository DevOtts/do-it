import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, EXITS } from '../controller.mjs';
import { lib, round, run } from './helpers.mjs';

test('T-P4-01 only four exits exist', () => {
  for (const bad of ['DONE', 'COMPLETE']) {
    const r = run(lib('controller.mjs'), ['finish', '--exit', bad]);
    assert.equal(r.code, 1);
    assert.match(r.out, /EXIT_NOT_ALLOWED/);
  }
  for (const ok of ['CONVERGED', 'CONVERGED_WITH_MINORS', 'STALLED', 'OVER_BUDGET']) assert.equal(run(lib('controller.mjs'), ['finish', '--exit', ok]).code, 0, ok);
  assert.deepEqual(EXITS, ['CONVERGED', 'CONVERGED_WITH_MINORS', 'STALLED', 'OVER_BUDGET']);
  // decide only ever produces one of the four exits or a non-exit continuation
  for (const h of [[round(1)], [round(1, { mi: 1 })], [round(1, { b: 4 }), round(2, { b: 4 })], [round(1, { b: 5 }), round(2, { b: 3 }), round(3, { b: 1 })]]) {
    const d = decide(h);
    assert.ok(d.exit === null || EXITS.includes(d.exit));
  }
});

test('T-P4-05 minors only ends the loop', () => {
  const d = decide([round(1, { b: 2 }), round(2, { mi: 2 })]);
  assert.equal(d.exit, 'CONVERGED_WITH_MINORS');
  assert.equal(d.next_round, null);
  assert.equal(d.backlog_count, 2);
});

test('T-P4-06 clean round', () => {
  const d = decide([round(1)]);
  assert.equal(d.exit, 'CONVERGED');
  assert.equal(d.backlog_count, 0);
});

test('T-P4-07 counts must fall', () => {
  const d = decide([round(1, { b: 2, m: 2 }), round(2, { b: 2, m: 2 })]);
  assert.equal(d.exit, 'STALLED');
  assert.equal(d.status, 'ESCALATED');
  assert.equal(d.owner_question.kind, 'review-cap');
});

test('T-P4-08 counts falling to zero', () => {
  const h = [round(1, { m: 4 }), round(2, { m: 2 })];
  const d2 = decide(h);
  assert.equal(d2.decision, 'FIXING');
  assert.equal(d2.next_round, 3);
  assert.equal(decide([...h, round(3)]).exit, 'CONVERGED');
});

test('T-P4-09 same fingerprint twice raises the tier once', () => {
  const d = decide([round(1, { m: 1, fps: ['f-77'] }), round(2, { m: 1, fps: ['f-77'] })], { builder_tier: 'T2' });
  assert.equal(d.decision, 'RAISE_TIER');
  assert.equal(d.builder_tier, 'T1');
  assert.match(d.reason, /finding f-77 survived a fix/);
  assert.equal(d.next_round, 3);
  assert.equal(d.exit, null);
});

test('T-P4-10 same fingerprint after the raise stalls', () => {
  const d = decide([round(1, { m: 1, fps: ['f-77'] }), round(2, { m: 1, fps: ['f-77'] }), round(3, { m: 1, fps: ['f-77'] })]);
  assert.equal(d.exit, 'STALLED');
  assert.equal(d.status, 'ESCALATED');
  assert.equal(d.owner_question.kind, 'review-cap');
  assert.equal(d.builder_tier, 'T1'); // raised once, never twice
});

test('T-P4-10 a tier already at T1 cannot be raised and stalls at the first recurrence', () => {
  const d = decide([round(1, { m: 1, fps: ['f-1'] }), round(2, { m: 1, fps: ['f-1'] })], { builder_tier: 'T1' });
  assert.equal(d.exit, 'STALLED');
});

test('T-P4-11 round budget exhausted parks with a resume note', () => {
  const d = decide([round(1, { b: 3, m: 2 }), round(2, { b: 2, m: 1 }), round(3, { m: 1 })]);
  assert.equal(d.exit, 'OVER_BUDGET');
  assert.equal(d.status, 'PARKED');
  assert.equal(d.open_findings.length, 1);
  assert.ok(d.resume_note.includes(d.open_findings[0]));
});

test('T-P4-12 cost cap', () => {
  const h = [round(1, { m: 4, cost: 60000 }), round(2, { m: 2, cost: 120000, estimated: true })];
  assert.equal(decide([h[0]], { cost_cap_tokens: 100000 }).decision, 'FIXING');
  const d = decide(h, { cost_cap_tokens: 100000 });
  assert.equal(d.exit, 'OVER_BUDGET');
  assert.equal(d.status, 'PARKED');
  assert.equal(d.estimated, true);
  const exact = decide([round(1, { m: 4, cost: 60000 }), round(2, { m: 2, cost: 120000 })], { cost_cap_tokens: 100000 });
  assert.equal(exact.estimated, false);
});

test('T-P4-13 a clean round beats the cap', () => {
  const d = decide([round(1, { m: 2, cost: 50000 }), round(2, { cost: 900000 })], { cost_cap_tokens: 100000 });
  assert.equal(d.exit, 'CONVERGED');
});

test('rule order edge: a recurrence in the last round spends no raise and falls to the budget rule', () => {
  const d = decide([round(1, { b: 2, fps: ['a', 'b'] }), round(2, { b: 1, fps: ['c'] }), { round: 3, findings: [{ id: 'x', fingerprint: 'c', severity: 'major' }], cost_tokens: 0 }]);
  // counts: 2, 1, 1 -> recurrence of c in round 3 with no round left; counts rule then stalls (1 not below 1)
  assert.equal(d.exit, 'STALLED');
  const e = decide([round(1, { b: 3, fps: ['a', 'b', 'c'] }), round(2, { b: 2, fps: ['d', 'e'] }), { round: 3, findings: [{ id: 'x', fingerprint: 'e', severity: 'major' }] }]);
  assert.equal(e.exit, 'OVER_BUDGET');
  assert.equal(e.raise_used, false);
});

test('rounds recorded after an exit are flagged', () => {
  const d = decide([round(1), round(2, { m: 1 })]);
  assert.equal(d.exit, 'CONVERGED');
  assert.equal(d.rounds_after_exit, true);
});
