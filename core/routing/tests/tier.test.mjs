import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTier, escalate, maybeDowngrade, checkTierChange } from '../tier-policy.mjs';
import { decide } from '../decompose.mjs';

test('T-P2-01 G-4 T1 without a reason is downgraded', () => {
  const a = resolveTier({ role: 'builder', class: 'hard', tier: 'T1' });
  assert.equal(a.tier, 'T2');
  assert.equal(a.downgraded, true);
  assert.ok(a.log.some((l) => l.code === 'T1_REASON_MISSING' && l.downgraded === true));
  const b = resolveTier({ role: 'builder', class: 'hard', tier: 'T1', reason: 'adversarial verification of the controller' });
  assert.equal(b.tier, 'T1');
  assert.equal(b.downgraded, false);
  assert.equal(resolveTier({ role: 'builder', tier: 'T1', reason: '   ' }).tier, 'T2');
});

test('T-P2-07 G-4 task classes map to tiers', () => {
  const d = resolveTier({ role: 'runner', class: 'deterministic' });
  assert.equal(d.tier, 'code');
  assert.equal(d.model_tokens_budget, 0);
  assert.equal(resolveTier({ role: 'intake', class: 'gather' }).tier, 'T3');
  assert.equal(resolveTier({ role: 'builder', class: 'implementation' }).tier, 'T2');
  assert.equal(resolveTier({ role: 'planner', class: 'hard', reason: 'ambiguity resolution' }).tier, 'T1');
  assert.equal(resolveTier({ role: 'planner', class: 'hard' }).tier, 'T2');
});

test('T-P2-08 G-4 conductor default is never the top model', () => {
  assert.equal(resolveTier({ role: 'conductor' }).tier, 'T2');
  const r = resolveTier({ role: 'conductor' }, { tiers: { conductor: 'T1' } });
  assert.equal(r.tier, 'T2');
  assert.equal(r.downgraded, true);
  assert.throws(() => resolveTier({ role: 'builder' }), (e) => e.outcome === 'TIER_MISSING' && e.exit === 1);
});

test('T-P2-09 escalate once, then owner', () => {
  const first = escalate({ tier: 'T2', failures: 1, slice_id: 'sl-1' });
  assert.equal(first.status, 'FAILED');
  assert.equal(first.retry_tier, 'T1');
  assert.equal(first.reason, 'escalation: first failure');
  const second = escalate({ tier: 'T1', failures: 2, slice_id: 'sl-1' });
  assert.equal(second.status, 'ESCALATED');
  assert.equal(second.retry_tier, null);
  assert.equal(second.owner_question.kind, 'default');
  const third = escalate({ tier: 'T1', failures: 3, slice_id: 'sl-1' });
  assert.equal(third.retry_tier, null, 'a third attempt is not scheduled');
  assert.equal(third.status, 'ESCALATED');
});

test('T-P2-10 nothing above T1', () => {
  const t1 = escalate({ tier: 'T1', failures: 1, slice_id: 'sl-2' });
  assert.equal(t1.status, 'ESCALATED');
  assert.equal(t1.retry_tier, null);
  assert.equal(t1.reason, 'escalate: none_above');
  const t3 = escalate({ tier: 'T3', failures: 1, slice_id: 'sl-3' });
  assert.equal(t3.status, 'FAILED');
  assert.equal(t3.retry_tier, 'T2');
});

const P = (first) => ({ class: 'implementation', outcome: 'pass', first_try: first });
test('T-P2-11 downgrade after three first-try passes', () => {
  const ev = (...xs) => xs;
  assert.equal(maybeDowngrade({ class: 'implementation', tier: 'T2', events: ev(P(true), P(true), P(true)) }).tier, 'T3');
  assert.equal(maybeDowngrade({ class: 'implementation', tier: 'T2', events: ev(P(true), P(true)) }).tier, 'T2');
  assert.equal(maybeDowngrade({ class: 'implementation', tier: 'T2', events: ev(P(true), P(false), P(true), P(true)) }).tier, 'T2', 'retry-pass resets the counter');
  assert.equal(maybeDowngrade({ class: 'deterministic', tier: 'code', events: ev(...Array(5).fill({ class: 'deterministic', outcome: 'pass', first_try: true })) }).tier, 'code');
  const many = Array(9).fill(P(true));
  assert.equal(maybeDowngrade({ class: 'implementation', tier: 'T2', events: many }).tier, 'T3', 'floor is T3');
  const other = [{ class: 'gather', outcome: 'pass', first_try: true }, P(true), P(true)];
  assert.equal(maybeDowngrade({ class: 'implementation', tier: 'T2', events: other }).tier, 'T2', 'other classes do not count');
});

test('T-P2-12 tier change only at a boundary', () => {
  assert.throws(() => checkTierChange({ session_id: 's-42', tier: 'T1' }), (e) => e.outcome === 'TIER_CHANGE_MIDSESSION' && e.exit === 1);
  const ok = checkTierChange({ tier: 'T1' });
  assert.equal(ok.accepted, true);
  assert.equal(ok.applies_to, 'next_spawn');
});

test('T-P2-13 decomposition rule', () => {
  const one = decide({ slices: [{ id: 'a', paths: ['x.mjs'] }], estimated_saving_tokens: 99999 });
  assert.deepEqual([one.decision, one.reason], ['inline', 'one_file']);
  const same = decide({ slices: [{ id: 'a', paths: ['x.mjs'] }, { id: 'b', paths: ['x.mjs', 'y.mjs'] }], estimated_saving_tokens: 99999 });
  assert.deepEqual([same.decision, same.reason, same.slices.length], ['merged', 'single_writer', 1]);
  const disjoint = [{ id: 'a', paths: ['a.mjs'] }, { id: 'b', paths: ['b.mjs'] }];
  const low = decide({ slices: disjoint, estimated_saving_tokens: 1999 });
  assert.deepEqual([low.decision, low.reason], ['inline', 'saving_below_spawn_cost']);
  const high = decide({ slices: disjoint, estimated_saving_tokens: 2000 });
  assert.deepEqual([high.decision, high.slices.length], ['split', 2]);
  const custom = decide({ slices: disjoint, estimated_saving_tokens: 500 }, { spawn_cost_tokens: 400 });
  assert.equal(custom.decision, 'split');
});
