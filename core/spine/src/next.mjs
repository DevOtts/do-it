import { loadState, selectRunId } from './state.mjs';
// Minimal `next` for S3: the deploy cascade actions and the terminal answers.
// S2 owns routing, waves and tiers and extends this function.
export function cmdNext(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  if (state.status === 'ESCALATED') {
    return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'escalated' };
  }
  if (state.status === 'PARTIAL_FAILURE') {
    const deploy = state.deploy || { legs: [], rollback_plan: [] };
    const actions = (deploy.rollback_plan || []).map((name) => {
      const leg = deploy.legs.find((l) => l.leg === name) || {};
      return { action: 'ROLLBACK', leg: name, compensate: leg.compensate === undefined ? null : leg.compensate };
    });
    return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROLLBACK', legs: actions.map((a) => a.leg), actions };
  }
  if (state.status === 'DONE') return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'NONE', reason: 'done' };
  return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'NONE', reason: 'scheduler_not_installed' };
}
