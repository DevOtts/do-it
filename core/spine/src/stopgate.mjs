import fs from 'node:fs';
import { appendEvent, eventsPath } from './events.mjs';
import { CliError, fail } from './errors.mjs';
import { adoptsUnattributed, openRows, readFinishLine, renderBoard, rowsForRun, rowsSignature } from './finish-line.mjs';
import { openPackQuestions, packAppend } from './pack.mjs';
import { cleanSessionId } from './session.mjs';
import { sessionHomes } from './sessions.mjs';
import { realpathSafe } from './ctx.mjs';
import { STATE_READ_CAP, readRegularFile } from './fs-atomic.mjs';
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
    const lines = readRegularFile(eventsPath(ctx, runId), STATE_READ_CAP).toString('utf8').split('\n').filter(Boolean);
    return JSON.parse(lines[lines.length - 1]).event === name;
  } catch { return false; }
}

function logUnreadableOnce(ctx, runId, detail) {
  if (lastEventIs(ctx, runId, 'stop_gate_state_unreadable')) return;
  logQuiet(ctx, runId, { event: 'stop_gate_state_unreadable', stage: null, verdict: 'STATE_ERROR', detail });
}

const DEFAULT_PATIENCE = 3;

const errText = (e) => String(e && e.code ? e.code + ': ' + e.message : (e && e.message) || e);

// CP-03 R5-S1-M9: one run whose refusal cannot be written (or whose state cannot be read for a reason other
// than tampering) is reported and fails open for itself alone; every other run is still gated.
function eachRefusal(ctx, runs, fn, unwritable) {
  const refused = [];
  const parked = [];
  for (const w of runs) {
    let r;
    try { r = fn(w); } catch (e) {
      unwritable.push({ run_id: w.id, error: errText(e) });
      continue;
    }
    (r.parked ? parked : refused).push({ id: w.id, refusals: r.refusals, ids: r.ids });
  }
  return { refused, parked };
}

function refuseUnreadableBoard(ctx, gating, patience, error, extra, unwritable) {
  const id = 'finish-line.json unreadable';
  const { refused, parked } = eachRefusal(ctx, gating, (g) => refuseOrPark(ctx, g.id, g.state, { rows: [] }, [{ id }], patience), unwritable);
  const more = unwritable.length ? { unwritable } : {};
  if (!refused.length && !parked.length) return allowed({ owned: true, run_id: gating[0].id, reason: 'the refusal could not be written for any gating run', ...extra, ...more });
  extra = { ...extra, ...more };
  const board = 'FINISH LINE: unreadable (' + error + ')';
  if (!refused.length) return { outcome: 'PARKED', exit: 2, owned: true, run_id: parked[0].id, status: 'PARKED', open: [id], board, board_error: error, ...extra };
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: refused[0].id, reason: 'finish-line.json cannot be read, so the open rows are unknown: ' + error, stop_refusals: refused[0].refusals, patience, open: [id], board, board_error: error, ...(gating.length > 1 ? { runs: gating.map((g) => g.id) } : {}), ...extra });
}

// One run's refusal bookkeeping: the patience counter resets when its rows changed since the last stop;
// at patience the run is parked with one owner-pack question. Returns { parked, ids, refusals }.
function refuseOrPark(ctx, runId, state, fl, open, patience) {
  const ids = open.map((r) => r.id);
  const sig = rowsSignature(fl);
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  if (state.stop_refusals >= patience) {
    const text = 'The run stopped with ' + ids.length + ' open row(s) after ' + patience + ' refusals: ' + ids.join(', ') + '. Resume the run or close it with the open rows as residuals?';
    packAppend(ctx, runId, [{
      kind: 'default',
      source: 'stop-gate',
      text,
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
    // CP-03 R5-S1-H10: the event is the gate's own mark on the question (pack withdraw trusts nothing else)
    const q = openPackQuestions(ctx, runId).find((x) => x.text === text);
    appendEvent(ctx, runId, { event: 'stop_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, open: ids, ...(q ? { question: q.n } : {}) } });
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
  const fl = rowsForRun(readFinishLine(ctx, { strict: true }), runId, adoptsUnattributed(state));
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
  // CP-03 R4-S1-M7: a registry that cannot be read is reported (registry_unreadable) and leaves the cwd-only
  // rule; another home that cannot be evaluated is reported (unreadable_homes) and fails open for that home
  // alone. The cwd's own home is always evaluated, and its answer (a refusal above all) stands.
  const here = realpathSafe(ctx.home);
  const reg = sessionHomes(ctx, scope.session);
  const notes = reg.errors.length ? { registry_unreadable: reg.errors } : {};
  const homes = [{ ctx, home: here, own: true }];
  for (const h of reg.homes) {
    if (h.home !== here) homes.push({ ctx: { ...ctx, home: h.home, root: h.root }, home: h.home, own: false });
  }
  if (homes.length === 1) return withNotes(() => hookStopIn(ctx, scope), notes);
  const answers = [];
  const unreadableHomes = [];
  let firstError = null;
  for (const h of homes) {
    try {
      answers.push({ home: h.home, out: hookStopIn(h.ctx, scope) });
    } catch (e) {
      if (e instanceof CliError && e.outcome === 'STOP_REFUSED') { answers.push({ home: h.home, refused: e }); continue; }
      // CP-03 R5-S1-M9: the cwd's home is reported like any other; it never hides the other homes' answers
      if (!firstError) firstError = e;
      unreadableHomes.push({ home: h.home, error: String(e && e.message ? e.message : e), ...(h.own ? { cwd_home: true } : {}) });
    }
  }
  if (unreadableHomes.length) notes.unreadable_homes = unreadableHomes;
  if (!answers.length) throw addNotes(firstError, notes);
  // every home's write errors are reported, whichever home's answer is shown
  const unwritable = answers.flatMap((a) => ((a.out || (a.refused && a.refused.extra) || {}).unwritable || []).map((u) => ({ ...u, home: a.home })));
  if (unwritable.length) notes.unwritable = unwritable;
  const searched = homes.map((h) => h.home);
  const refused = answers.filter((a) => a.refused);
  if (refused.length) {
    const first = refused[0];
    const boards = refused.map((a) => (refused.length > 1 ? 'home ' + a.home + '\n' : '') + (a.refused.extra.board || ''));
    throw fail('STOP_REFUSED', 1, { ...first.refused.extra, run_home: first.home, board: boards.join('\n\n'), refused_homes: refused.map((a) => a.home), homes: searched, ...notes });
  }
  const parked = answers.find((a) => a.out.outcome === 'PARKED');
  if (parked) return { ...parked.out, run_home: parked.home, homes: searched, ...notes };
  const pick = answers.find((a) => a.out.owned) || answers[0];
  return { ...pick.out, run_home: pick.home, homes: searched, ...notes };
}

function addNotes(e, notes) {
  if (e instanceof CliError && Object.keys(notes).length) e.extra = { ...e.extra, ...notes };
  return e;
}

function withNotes(fn, notes) {
  try { return { ...fn(), ...notes }; } catch (e) { throw addNotes(e, notes); }
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
  const unwritable = [];
  for (const c of scoped.ranked) {
    try {
      readable.push({ id: c.id, state: loadState(ctx, c.id) });
    } catch (e) {
      // CP-03 R5-S1-M9: any read error (EACCES, EISDIR, ...) skips this run alone, like a tampered state
      const cause = e instanceof CliError ? e.outcome : (e && e.code) || 'STATE_ERROR';
      logUnreadableOnce(ctx, c.id, { fail_open: true, cause });
      skipped.push({ run_id: c.id, state_error: cause });
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
  // CP-03 R4-S1-M7 (and R4-L9): a board that cannot be read is no proof the rows are closed, so every
  // gating run here is refused with that reason (fail closed), counting patience like any refusal.
  let patience;
  try { patience = loadSettings(ctx, []).values.stop_gate.patience; } catch { patience = DEFAULT_PATIENCE; }
  let board;
  try { board = readFinishLine(ctx, { strict: true }); } catch (e) {
    const why = e instanceof CliError && e.extra && e.extra.error ? e.extra.error : String(e && e.message ? e.message : e);
    return refuseUnreadableBoard(ctx, gating, patience, why, extra, unwritable);
  }
  // the same row rule as every view: an owned (1.1) run answers only for rows tagged with its id
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
  const openByRun = {};
  const boards = [];
  const { refused, parked } = eachRefusal(ctx, withOpen, (w) => refuseOrPark(ctx, w.id, w.state, w.fl, w.open, patience), unwritable);
  for (const w of withOpen) {
    const r = refused.find((x) => x.id === w.id) || parked.find((x) => x.id === w.id);
    if (!r) continue;
    openByRun[w.id] = r.ids;
    boards.push((withOpen.length > 1 ? 'run ' + w.id + '\n' : '') + renderBoard(w.fl));
  }
  if (unwritable.length) extra.unwritable = unwritable;
  if (!refused.length && !parked.length) {
    return allowed({ owned: true, run_id: withOpen[0].id, reason: 'the refusal could not be written for any run with open rows', ...extra });
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
