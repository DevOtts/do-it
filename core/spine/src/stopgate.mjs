import fs from 'node:fs';
import { appendEvent, eventsPath } from './events.mjs';
import { CliError, fail } from './errors.mjs';
import { openRows, readFinishLine, renderBoard, rowsForRun, rowsSignature } from './finish-line.mjs';
import { packAppend } from './pack.mjs';
import { loadSettings } from './settings.mjs';
import { NON_GATING_STATUSES, loadState, selectRunId, selectScopedRunId, writeState } from './state.mjs';

function allowed(extra) {
  return { outcome: 'STOP_ALLOWED', exit: 0, ...extra };
}

function logQuiet(ctx, runId, row) {
  try { appendEvent(ctx, runId, row); } catch { /* the hook still fails open */ }
}

// An unreadable run is logged once, not on every stop of every session: skip when the run's last event is
// already this one (a run we do not own must not grow an events file just because we looked at it).
function lastEventIs(ctx, runId, name) {
  try {
    const lines = fs.readFileSync(eventsPath(ctx, runId), 'utf8').split('\n').filter(Boolean);
    return JSON.parse(lines[lines.length - 1]).event === name;
  } catch { return false; }
}

function logUnreadableOnce(ctx, runId, detail) {
  if (lastEventIs(ctx, runId, 'stop_gate_state_unreadable')) return;
  logQuiet(ctx, runId, { event: 'stop_gate_state_unreadable', stage: null, verdict: 'STATE_ERROR', detail });
}

// G-1 (1.1): a hook stop is gated only by an active run owned by the hook's session. Everyone else is
// allowed, and the answer says whether the run was theirs (`owned`) and why they may stop (`reason`).
// An explicit `gate stop` (no session and cwd, or --run) gates the run it names, as before.
// A gated run refuses up to `patience` times without progress; the next call parks that run only.
export function gateStop(ctx, args) {
  const f = args.flags;
  const scope = { session: typeof f.session === 'string' && f.session ? f.session : null, cwd: typeof f.cwd === 'string' ? f.cwd : null };
  const hook = !f.run && !!(scope.session || scope.cwd);
  let runId;
  const owned = true; // an explicit stop names its run; a hook reaches here only for a run it owns
  if (!hook) {
    runId = selectRunId(ctx, f);
  } else {
    const scoped = selectScopedRunId(ctx, scope);
    if (!scoped.run) {
      if (scoped.unreadable.length) {
        for (const id of scoped.unreadable) logUnreadableOnce(ctx, id, { fail_open: true });
        return allowed({ owned: false, reason: 'state unreadable', unreadable: scoped.unreadable });
      }
      return allowed({ owned: false, reason: scoped.legacy ? 'legacy run has no owner' : 'no run is owned by this session or cwd' });
    }
    runId = scoped.run;
  }
  let state;
  try {
    state = loadState(ctx, runId);
  } catch (e) {
    if (hook && e instanceof CliError && ['STATE_TAMPERED', 'STATE_INVALID'].includes(e.outcome)) {
      logUnreadableOnce(ctx, runId, { fail_open: true, cause: e.outcome });
      return allowed({ owned: true, run_id: runId, reason: 'state unreadable', state_error: e.outcome });
    }
    throw e;
  }
  if (NON_GATING_STATUSES.includes(state.status)) {
    return allowed({ owned, run_id: runId, status: state.status, reason: 'run is ' + state.status + ', it does not gate', stop_refusals: state.stop_refusals });
  }
  const fl = rowsForRun(readFinishLine(ctx), runId, !hook);
  const open = openRows(fl);
  const board = renderBoard(fl);
  if (!open.length) {
    return allowed({ owned, run_id: runId, reason: 'no open rows for this run', stop_refusals: state.stop_refusals, board });
  }
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const sig = rowsSignature(fl);
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  if (state.stop_refusals >= patience) {
    const ids = open.map((r) => r.id);
    packAppend(ctx, runId, [{
      kind: 'default',
      source: 'stop-gate',
      text: 'The run stopped with ' + ids.length + ' open row(s) after ' + patience + ' refusals: ' + ids.join(', ') + '. Resume the run or close it with the open rows as residuals?',
      options: ['resume run', 'close with residuals'],
      recommendation: 'resume run',
      default: 'resume run',
      reversible: true,
    }]);
    state.stop_refusals = 0;
    state.gates.stop_gate = { sig };
    const from = state.status;
    state.status = 'PARKED';
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'stop_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, open: ids } });
    return { outcome: 'PARKED', exit: 2, owned, run_id: runId, status: 'PARKED', open: ids, board };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: open.map((r) => r.id) } });
  throw fail('STOP_REFUSED', 1, { owned, run_id: runId, reason: 'finish-line rows are still open', stop_refusals: state.stop_refusals, patience, open: open.map((r) => r.id), board });
}
