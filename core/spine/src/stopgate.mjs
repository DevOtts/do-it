import { appendEvent } from './events.mjs';
import { fail } from './errors.mjs';
import { openRows, readFinishLine, renderBoard, rowsSignature } from './finish-line.mjs';
import { packAppend } from './pack.mjs';
import { loadSettings } from './settings.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';

// G-9: refuse to stop with open rows, with the board, `patience` times without
// progress; the next call parks the run and asks the owner.
export function gateStop(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
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
