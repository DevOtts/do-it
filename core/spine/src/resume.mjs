import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { readJsonIfExists } from './fs-atomic.mjs';
import { handoffWritten } from './ceiling.mjs';
import { parkPath } from './park.mjs';
import { resolveSessionId } from './session.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';
import { verifyEvidence } from './verify.mjs';
import { consumeWake } from './wake.mjs';

// resume works from a fresh process using state alone. It clears a ceiling block
// (after a handoff exists) or un-parks a parked run, re-queues RUNNING slices
// without counting an attempt, and re-reads every VERIFIED row by hash.
export function cmdResume(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const force = !!args.flags.force;
  const ceilingHeld = state.ceiling === 'BLOCKED';
  // The session that resumes owns the run from now on (after /clear the id is new). The old id is kept.
  const session = resolveSessionId(ctx, args.flags);
  const rebind = () => {
    const was = state.owner && typeof state.owner === 'object' ? state.owner : { session_id: null, cwd: ctx.cwd };
    if (!session || was.session_id === session) return null;
    state.owner = { ...was, session_id: session, history: [...(Array.isArray(was.history) ? was.history : []), { session_id: was.session_id || null, until: ctx.now(), reason: 'resume' }] };
    return { from: was.session_id || null, to: session };
  };
  if (state.status !== 'PARKED' && !ceilingHeld) {
    const moved = rebind();
    if (!moved) throw fail('NOT_PARKED', 1, { run_id: runId, status: state.status });
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'owner_rebound', stage: state.stage, host: state.host, verdict: 'REBOUND', detail: moved });
    return { outcome: 'REBOUND', exit: 0, run_id: runId, status: state.status, owner: state.owner };
  }

  if (state.status === 'PARKED') {
    const park = readJsonIfExists(parkPath(ctx, runId));
    if (park && park.reset_at && !force && Date.parse(park.reset_at) > Date.parse(ctx.now())) {
      throw fail('STILL_PARKED', 3, { run_id: runId, reset_at: park.reset_at, message: 'before reset_at ' + park.reset_at + '; use --force to resume anyway' });
    }
  } else if (!handoffWritten(state) && !force) {
    throw fail('CEILING_BLOCKED', 3, { run_id: runId, reason: 'no_handoff', message: 'the ceiling block clears only after a handoff exists' });
  }

  const requeued = [];
  for (const s of state.slices) {
    if (s.status === 'RUNNING') { s.status = 'READY'; requeued.push(s.id); }
  }
  const changed = verifyEvidence(ctx, runId);
  const reopened = [];
  for (const c of changed) {
    const s = state.slices.find((x) => x.id === c.row);
    if (s && s.status === 'DONE') { s.status = 'READY'; reopened.push(s.id); }
  }
  const from = state.status;
  if (state.status === 'PARKED') state.status = 'BUILDING';
  if (ceilingHeld) state.ceiling = 'OK';
  state.park = null;
  const rebound = rebind();
  writeState(ctx, state);
  if (rebound) appendEvent(ctx, runId, { event: 'owner_rebound', stage: state.stage, host: state.host, verdict: 'REBOUND', detail: rebound });
  const wake = consumeWake(ctx, runId);
  appendEvent(ctx, runId, { event: 'run_resumed', stage: state.stage, host: state.host, verdict: 'RESUMED', detail: { from, requeued, reopened, warnings: changed.length, forced: force, ceiling_cleared: ceilingHeld } });
  return {
    outcome: 'RESUMED', exit: 0, run_id: runId, status: state.status, requeued, reopened, warnings: changed.length,
    changed: changed.map((c) => c.row), wake: wake ? wake.status : null, ceiling: state.ceiling || null, owner: state.owner || null,
  };
}
