import { appendEvent } from './events.mjs';
import { fail } from './errors.mjs';
import { openRows, readFinishLine, renderBoard, rowsSignature } from './finish-line.mjs';
import { packAppend } from './pack.mjs';
import { loadSettings } from './settings.mjs';
import { loadState, selectRunId, selectScopedRunId, writeState } from './state.mjs';

// G-9: refuse to stop with open rows, with the board, `patience` times without
// progress; the next call parks the run and asks the owner.
export function gateStop(ctx, args) {
  const f = args.flags;
  const scope = { session: typeof f.session === 'string' ? f.session : null, cwd: typeof f.cwd === 'string' ? f.cwd : null };
  let runId;
  if (f.run || (!scope.session && !scope.cwd)) {
    runId = selectRunId(ctx, f);
  } else {
    // A hook names its session and cwd: only the run they own is gated.
    const scoped = selectScopedRunId(ctx, scope);
    if (!scoped.run) return { outcome: 'STOP_ALLOWED', exit: 0, owned: false, reason: 'no run is owned by this session or cwd' };
    runId = scoped.run;
  }
  const state = loadState(ctx, runId);
  const fl = readFinishLine(ctx);
  const open = openRows(fl);
  const board = renderBoard(fl);
  if (!open.length) {
    return { outcome: 'STOP_ALLOWED', exit: 0, run_id: runId, stop_refusals: state.stop_refusals, board };
  }
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const sig = rowsSignature(fl);
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  if (state.stop_refusals >= patience) {
    const ids = open.map((r) => r.id);
    packAppend(ctx, runId, [{
      kind: 'default',
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
    return { outcome: 'PARKED', exit: 2, run_id: runId, status: 'PARKED', open: ids, board };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: open.map((r) => r.id) } });
  throw fail('STOP_REFUSED', 1, { run_id: runId, stop_refusals: state.stop_refusals, patience, open: open.map((r) => r.id), board });
}
