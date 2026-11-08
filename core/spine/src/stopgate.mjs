import fs from 'node:fs';
import { appendEvent, eventsPath } from './events.mjs';
import { CliError, fail } from './errors.mjs';
import { adoptsUnattributed, openRows, readFinishLine, renderBoard, rowsForRun, rowsSignature } from './finish-line.mjs';
import { packAppend } from './pack.mjs';
import { cleanSessionId } from './session.mjs';
import { sessionHomes } from './sessions.mjs';
import { realpathSafe } from './ctx.mjs';
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

// One run's refusal bookkeeping: the patience counter resets when its rows changed since the last stop;
// at patience the run is parked with one owner-pack question. Returns { parked, ids, refusals }.
function refuseOrPark(ctx, runId, state, fl, open, patience) {
  const ids = open.map((r) => r.id);
  const sig = rowsSignature(fl);
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  if (state.stop_refusals >= patience) {
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
    return { parked: true, ids, refusals: 0 };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: ids } });
  return { parked: false, ids, refusals: state.stop_refusals };
}

// An explicit `gate stop --run <id>` (or no session and no cwd): gates the run it names, as before.
function explicitStop(ctx, f) {
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (NON_GATING_STATUSES.includes(state.status)) {
    return allowed({ owned: true, run_id: runId, status: state.status, reason: 'run is ' + state.status + ', it does not gate', stop_refusals: state.stop_refusals });
  }
  const fl = rowsForRun(readFinishLine(ctx), runId, adoptsUnattributed(state));
  const open = openRows(fl);
  const board = renderBoard(fl);
  if (!open.length) return allowed({ owned: true, run_id: runId, reason: 'no open rows for this run', stop_refusals: state.stop_refusals, board });
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const r = refuseOrPark(ctx, runId, state, fl, open, patience);
  if (r.parked) return { outcome: 'PARKED', exit: 2, owned: true, run_id: runId, status: 'PARKED', open: r.ids, board };
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: runId, reason: 'finish-line rows are still open', stop_refusals: r.refusals, patience, open: r.ids, board });
}

// G-1 (1.1): a hook stop is gated by EVERY active run owned by the hook's session (CONTRACT 3.1 row 1
// applies to each owned active run; CP-03 R2-S1-H4: a second, newer run with no open rows must not hide
// an older one that has some). Everyone else is allowed, and the answer says whether a run was theirs
// (`owned`) and why they may stop (`reason`). An unreadable run is logged and skipped; the hook fails open
// only when no owned run is readable (S1-M1). Each gated run counts its own patience and is parked alone.
export function gateStop(ctx, args) {
  const f = args.flags;
  const scope = { session: cleanSessionId(f.session), cwd: typeof f.cwd === 'string' ? f.cwd : null };
  const hook = !f.run && !!(scope.session || scope.cwd);
  if (!hook) return explicitStop(ctx, f);

  // CP-03 R3-S1-H7: the session's runs may live in other repos than the cwd's. Every home the session
  // registered a run in is gated as well as the cwd's, with the same rule; any refusal refuses the stop.
  const here = realpathSafe(ctx.home);
  const homes = [{ ctx, home: here }];
  for (const h of sessionHomes(ctx, scope.session)) {
    if (h.home !== here) homes.push({ ctx: { ...ctx, home: h.home, root: h.root }, home: h.home });
  }
  if (homes.length === 1) return hookStopIn(ctx, scope);
  const answers = [];
  for (const h of homes) {
    try {
      answers.push({ home: h.home, out: hookStopIn(h.ctx, scope) });
    } catch (e) {
      if (!(e instanceof CliError && e.outcome === 'STOP_REFUSED')) throw e;
      answers.push({ home: h.home, refused: e });
    }
  }
  const searched = answers.map((a) => a.home);
  const refused = answers.filter((a) => a.refused);
  if (refused.length) {
    const first = refused[0];
    const boards = refused.map((a) => (refused.length > 1 ? 'home ' + a.home + '\n' : '') + (a.refused.extra.board || ''));
    throw fail('STOP_REFUSED', 1, { ...first.refused.extra, run_home: first.home, board: boards.join('\n\n'), refused_homes: refused.map((a) => a.home), homes: searched });
  }
  const parked = answers.find((a) => a.out.outcome === 'PARKED');
  if (parked) return { ...parked.out, run_home: parked.home, homes: searched };
  const pick = answers.find((a) => a.out.owned) || answers[0];
  return { ...pick.out, run_home: pick.home, homes: searched };
}

// The hook-path rule inside one home (CONTRACT 3.1).
function hookStopIn(ctx, scope) {
  const scoped = selectScopedRunId(ctx, scope);
  if (!scoped.run) {
    if (scoped.unreadable.length) {
      for (const id of scoped.unreadable) logUnreadableOnce(ctx, id, { fail_open: true });
      return allowed({ owned: false, reason: 'state unreadable', unreadable: scoped.unreadable });
    }
    return allowed({ owned: false, reason: scoped.legacy ? 'legacy run has no owner' : 'no run is owned by this session or cwd' });
  }
  const readable = [];
  const skipped = [];
  for (const c of scoped.ranked) {
    try {
      readable.push({ id: c.id, state: loadState(ctx, c.id) });
    } catch (e) {
      if (!(e instanceof CliError && ['STATE_TAMPERED', 'STATE_INVALID'].includes(e.outcome))) throw e;
      logUnreadableOnce(ctx, c.id, { fail_open: true, cause: e.outcome });
      skipped.push({ run_id: c.id, state_error: e.outcome });
    }
  }
  if (!readable.length) {
    return allowed({ owned: true, run_id: skipped[0].run_id, reason: 'state unreadable', state_error: skipped[0].state_error, unreadable: skipped.map((x) => x.run_id) });
  }
  const extra = skipped.length ? { unreadable: skipped.map((x) => x.run_id) } : {};
  const gating = readable.filter((r) => !NON_GATING_STATUSES.includes(r.state.status));
  if (!gating.length) {
    const top = readable[0];
    return allowed({ owned: true, run_id: top.id, status: top.state.status, reason: 'run is ' + top.state.status + ', it does not gate', stop_refusals: top.state.stop_refusals, ...extra });
  }
  // the same row rule as every view: an owned (1.1) run answers only for rows tagged with its id
  const board = readFinishLine(ctx);
  const withOpen = [];
  for (const g of gating) {
    const fl = rowsForRun(board, g.id, adoptsUnattributed(g.state));
    const open = openRows(fl);
    if (open.length) withOpen.push({ ...g, fl, open });
  }
  if (!withOpen.length) {
    const top = gating[0];
    const ids = gating.map((g) => g.id);
    return allowed({ owned: true, run_id: top.id, runs: ids, reason: 'no open rows for ' + (ids.length > 1 ? 'any owned run' : 'this run'), stop_refusals: top.state.stop_refusals, board: renderBoard(rowsForRun(board, top.id, adoptsUnattributed(top.state))), ...extra });
  }
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const refused = [];
  const parked = [];
  const openByRun = {};
  const boards = [];
  for (const w of withOpen) {
    const r = refuseOrPark(ctx, w.id, w.state, w.fl, w.open, patience);
    openByRun[w.id] = r.ids;
    boards.push((withOpen.length > 1 ? 'run ' + w.id + '\n' : '') + renderBoard(w.fl));
    (r.parked ? parked : refused).push({ id: w.id, refusals: r.refusals });
  }
  const many = withOpen.length > 1 ? { runs: withOpen.map((w) => w.id), open_by_run: openByRun } : {};
  const text = boards.join('\n\n');
  if (!refused.length) {
    const first = parked[0].id;
    return { outcome: 'PARKED', exit: 2, owned: true, run_id: first, status: 'PARKED', open: openByRun[first], board: text, ...many, ...(withOpen.length > 1 ? { parked: parked.map((p) => p.id) } : {}), ...extra };
  }
  const first = refused[0];
  throw fail('STOP_REFUSED', 1, {
    owned: true, run_id: first.id, reason: 'finish-line rows are still open', stop_refusals: first.refusals, patience,
    open: openByRun[first.id], board: text, ...many, ...(parked.length ? { parked: parked.map((p) => p.id) } : {}), ...extra,
  });
}
