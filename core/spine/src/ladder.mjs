// Failure ladder (D14, CONTRACT M1): FAILED, retry one tier up once with a
// written reason, second failure ESCALATED.
export const TIER_UP = { T3: 'T2', T2: 'T1', T1: 'T1' };
export const RETRY_REASON = 'retry after FAILED';
export const LADDER_MAX_ATTEMPTS = 2;

export function ladderEscalated(slice) {
  return (slice.attempts || 0) >= LADDER_MAX_ATTEMPTS;
}

// Called by `next`: every FAILED slice with one attempt is requeued one tier up.
// Returns the changes so the caller can log them.
export function ladderRetry(state) {
  const changes = [];
  for (const s of state.slices) {
    if (s.status !== 'FAILED' || ladderEscalated(s)) continue;
    const from = s.tier || 'T2';
    s.tier = TIER_UP[from] || 'T1';
    s.escalations = (s.escalations || 0) + 1;
    s.status = 'READY';
    changes.push({ slice_id: s.id, from, to: s.tier, reason: RETRY_REASON });
  }
  return changes;
}

export function escalationQuestion(slice) {
  return {
    kind: 'owner-gate',
    text: 'Slice ' + slice.id + ' failed twice (attempts ' + slice.attempts + ', last tier ' + (slice.tier || 'unknown') + ') and was escalated. How should it proceed?',
    options: ['re-plan slice', 'take over manually', 'drop slice'],
    recommendation: 're-plan slice',
    default: 're-plan slice',
    reversible: true,
  };
}
