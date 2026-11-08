import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { readJsonIfExists } from './fs-atomic.mjs';
import { handoffWritten } from './ceiling.mjs';
import { parkPath } from './park.mjs';
import { resolveSessionId } from './session.mjs';
import { loadState, selectRunId, selectScopedRunId, writeState } from './state.mjs';
import { verifyEvidence } from './verify.mjs';
import { consumeWake } from './wake.mjs';

// Statuses a run never leaves (FAILED can go back to BUILDING): re-binding one hands over nothing that gates.
const TERMINAL = ['DONE', 'ESCALATED'];

// Which run does `resume` with no --run mean? Never "the newest run in the repo" (CP-03 S1-H2): the
// caller's own runs first (a parked one before the rest), then a run with no session inside the caller's
// cwd. Only when the caller owns nothing does it look at the newest run, and the ownership check below
// refuses that one when another session owns it. A caller with no session id never re-binds anything.
function pickRun(ctx, flags, session) {
  if (flags.run || !session) return selectRunId(ctx, flags);
  const mine = selectScopedRunId(ctx, { session, cwd: ctx.cwd }).ranked;
  if (mine.length) return (mine.find((r) => r.status === 'PARKED') || mine[0]).id;
  const unowned = selectScopedRunId(ctx, { session: null, cwd: ctx.cwd }).ranked;
  if (unowned.length) return (unowned.find((r) => r.status === 'PARKED') || unowned[0]).id;
  return selectRunId(ctx, flags);
}

// resume works from a fresh process using state alone. It clears a ceiling block
// (after a handoff exists) or un-parks a parked run, re-queues RUNNING slices
// without counting an attempt, and re-reads every VERIFIED row by hash.
//
// Ownership (CP-03 S1-H2, CONTRACT 3.1 / S1-00): the session that resumes owns the run from then on.
// A run whose recorded session is another, non-null id is re-bound only with an explicit
// `--run <id> --take-over` (the takeover is kept in owner.history and logged as `owner_taken_over`);
// without it resume refuses with OWNED_BY_OTHER_SESSION and names the owner. Nothing on disk tells a
// session that ended (/clear) from one that is still running, so the caller must say so. A run with no
// session, a legacy run, or a terminal one re-binds without --take-over: no live session loses a gate.
export function cmdResume(ctx, args) {
  const f = args.flags;
  const session = resolveSessionId(ctx, f);
  const takeOver = !!f['take-over'];
  if (takeOver && typeof f.run !== 'string') throw fail('USAGE', 1, { message: 'resume --take-over needs --run <id>: a takeover names the run it takes' });
  const runId = pickRun(ctx, f, session);
  const state = loadState(ctx, runId);
  const force = !!f.force;
  const ceilingHeld = state.ceiling === 'BLOCKED';
  const was = state.owner && typeof state.owner === 'object' ? state.owner : null;
  const foreign = !!(session && was && was.session_id && was.session_id !== session);
  if (foreign && !takeOver && !TERMINAL.includes(state.status)) {
    throw fail('OWNED_BY_OTHER_SESSION', 1, {
      run_id: runId, status: state.status, owner_session: was.session_id, session,
      message: 'run ' + runId + ' is owned by session ' + was.session_id + '. If that session has ended (after /clear), take the run over with: resume --run ' + runId + ' --take-over',
    });
  }
  const rebind = () => {
    const prev = was || { session_id: null, cwd: ctx.cwd };
    if (!session || prev.session_id === session) return null;
    const reason = foreign ? 'take_over' : 'resume';
    state.owner = { ...prev, session_id: session, history: [...(Array.isArray(prev.history) ? prev.history : []), { session_id: prev.session_id || null, until: ctx.now(), reason }] };
    return { from: prev.session_id || null, to: session, taken_over: foreign };
  };
  const logRebind = (moved) => appendEvent(ctx, runId, {
    event: moved.taken_over ? 'owner_taken_over' : 'owner_rebound', stage: state.stage, host: state.host,
    verdict: moved.taken_over ? 'TAKEN_OVER' : 'REBOUND', detail: moved,
  });
  if (state.status !== 'PARKED' && !ceilingHeld) {
    const moved = rebind();
    if (!moved) throw fail('NOT_PARKED', 1, { run_id: runId, status: state.status });
    writeState(ctx, state);
    logRebind(moved);
    return { outcome: moved.taken_over ? 'TAKEN_OVER' : 'REBOUND', exit: 0, run_id: runId, status: state.status, owner: state.owner, previous_owner: moved.from };
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
  const changed = verifyEvidence(ctx, runId, state);
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
  if (rebound) logRebind(rebound);
  const wake = consumeWake(ctx, runId);
  appendEvent(ctx, runId, { event: 'run_resumed', stage: state.stage, host: state.host, verdict: 'RESUMED', detail: { from, requeued, reopened, warnings: changed.length, forced: force, ceiling_cleared: ceilingHeld } });
  return {
    outcome: 'RESUMED', exit: 0, run_id: runId, status: state.status, requeued, reopened, warnings: changed.length,
    changed: changed.map((c) => c.row), wake: wake ? wake.status : null, ceiling: state.ceiling || null, owner: state.owner || null,
    previous_owner: rebound ? rebound.from : undefined, taken_over: rebound ? rebound.taken_over : undefined,
  };
}
