import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { atomicWriteJson } from './fs-atomic.mjs';
import { collectStateFiles, nextActionOf, resumeCommand } from './handoff.mjs';
import { loadState, runDir, selectRunId, writeState } from './state.mjs';
import { NO_WAKE_TEXT, scheduleWake } from './wake.mjs';

export const PARK_NO_FROM = ['DONE', 'ESCALATED'];

export function parkPath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'park.json');
}

// park --reason usage_limit --reset-at ISO: PARKED, park.json, then the wake hook.
export function cmdPark(ctx, args) {
  const f = args.flags;
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (PARK_NO_FROM.includes(state.status)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'PARKED' });
  const reason = typeof f.reason === 'string' && f.reason ? f.reason : 'usage_limit';
  let resetAt = null;
  if (f['reset-at'] !== undefined) {
    if (typeof f['reset-at'] !== 'string' || Number.isNaN(Date.parse(f['reset-at']))) throw fail('USAGE', 1, { message: '--reset-at must be an ISO timestamp' });
    resetAt = f['reset-at'];
  }
  const { files } = collectStateFiles(ctx, runId, state);
  const from = state.status;
  const park = {
    run_id: runId,
    reason,
    reset_at: resetAt,
    parked_at: ctx.now(),
    from_status: from,
    resume: { state_files: files, next_action: nextActionOf(state) },
  };
  atomicWriteJson(parkPath(ctx, runId), park);
  state.status = 'PARKED';
  state.park = { reason, reset_at: resetAt };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'run_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, reason, reset_at: resetAt } });
  const wake = scheduleWake(ctx, runId, resetAt, resumeCommand(runId));
  appendEvent(ctx, runId, { event: 'wake_' + wake.status, stage: state.stage, host: state.host, verdict: wake.status, detail: { id: wake.id, at: resetAt } });
  const out = { outcome: 'PARKED', exit: 3, run_id: runId, status: 'PARKED', reason, reset_at: resetAt, wake: wake.status, wake_id: wake.id };
  if (wake.status !== 'scheduled') out.say = [NO_WAKE_TEXT];
  return out;
}
