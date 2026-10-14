import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { readFinishLine } from './finish-line.mjs';
import { readJsonIfExists } from './fs-atomic.mjs';
import { readLedger } from './ledger.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';
import { verifyEvidence } from './verify.mjs';

// G-13: close only with every row accounted, no live worker, no pending wake.
export function computeRunVerdict(ledger, fl) {
  const rows = ledger.rows;
  if (!rows.length) return 'DONE_WITH_RESIDUALS';
  if (rows.some((r) => r.verdict !== 'VERIFIED')) return 'DONE_WITH_RESIDUALS';
  if (fl.rows.some((r) => r.state !== 'DONE')) return 'DONE_WITH_RESIDUALS';
  return 'DONE_ALL_VERIFIED';
}

export function gateConclude(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const reverified = verifyEvidence(ctx, runId);
  const ledger = readLedger(ctx, runId);
  const fl = readFinishLine(ctx);
  const reasons = [];

  const inLedger = new Set(ledger.rows.map((r) => r.row));
  const unaccounted = fl.rows.filter((r) => {
    if (inLedger.has(r.id)) return false;
    if (r.state === 'DONE' && r.evidence) return false;
    if (r.state === 'PARKED' && r.owner_question) return false;
    if (r.state === 'BLOCKED' && r.reason) return false;
    return true;
  }).map((r) => r.id);
  if (unaccounted.length) reasons.push({ reason: 'unaccounted_row', ids: unaccounted });

  const live = state.slices.filter((s) => s.status === 'RUNNING').map((s) => s.id);
  if (live.length) reasons.push({ reason: 'live_worker', ids: live });

  const wake = readJsonIfExists(path.join(ctx.home, 'runs', runId, 'wake.json'));
  if (wake && wake.status === 'scheduled') reasons.push({ reason: 'pending_wake', ids: wake.id ? [String(wake.id)] : [] });

  const legs = (state.deploy && state.deploy.legs) || [];
  if (legs.some((l) => l.state !== 'DEPLOYED_VERIFIED') || state.status === 'PARTIAL_FAILURE' || state.status === 'ROLLED_BACK') {
    reasons.push({ reason: 'deploy_not_reverified', ids: legs.filter((l) => l.state !== 'DEPLOYED_VERIFIED').map((l) => l.leg) });
  }
  if (reasons.length) {
    appendEvent(ctx, runId, { event: 'conclude_refused', verdict: reasons[0].reason, detail: { reasons } });
    throw fail('CONCLUDE_REFUSED', 1, { run_id: runId, reason: reasons[0].reason, ids: reasons[0].ids, reasons });
  }

  const runVerdict = computeRunVerdict(ledger, fl);
  state.status = 'DONE';
  state.run_verdict = runVerdict;
  state.stage = 'conclude-it';
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'concluded', stage: 'conclude-it', host: state.host, verdict: runVerdict });
  const residuals = ledger.rows.filter((r) => r.verdict !== 'VERIFIED').map((r) => r.row);
  return { outcome: 'CONCLUDED', exit: 0, run_id: runId, status: 'DONE', run_verdict: runVerdict, residuals, reverified: reverified.map((c) => c.row) };
}
