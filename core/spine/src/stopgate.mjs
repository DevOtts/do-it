import fs from 'node:fs';
import { appendEvent, eventsPath } from './events.mjs';
import { CliError, fail } from './errors.mjs';
import { adoptsUnattributed, openRows, readFinishLine, renderBoard, rowsForRun, rowsSignature } from './finish-line.mjs';
import { openPackQuestions, openStopGateQuestion, packAppend } from './pack.mjs';
import { redactJsonValues } from './redact.mjs';
import { cleanSessionId } from './session.mjs';
import { sessionHomes } from './sessions.mjs';
import { realpathSafe } from './ctx.mjs';
import { STATE_READ_CAP, readRegularFile } from './fs-atomic.mjs';
import { loadSettings } from './settings.mjs';
import { NON_GATING_STATUSES, loadState, selectRunId, selectScopedRunId, stateBytes, writeState } from './state.mjs';

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

// a Node error's message already starts with its code ("EACCES: permission denied, ..."): do not repeat it
const errText = (e) => String(e && e.code && !String(e.message || '').startsWith(e.code) ? e.code + ': ' + e.message : (e && e.message) || e);

// CP-03 R8-S1-M15 (supersedes the R5-S1-M9 fail-open): CONTRACT 3.1 fails open ONLY when state.json cannot
// be read. Once a run's state was read and it gates with open rows, a refusal whose bookkeeping (count,
// signature, park, events) cannot be written is STILL a refusal: it is reported in `unwritable` and marked
// `refusal_uncounted`. Patience cannot advance without a write, so such a run is never parked by the gate;
// it is refused on every stop until the write error is fixed or its rows close.
function eachRefusal(ctx, runs, fn, unwritable) {
  const refused = [];
  const parked = [];
  for (const w of runs) {
    let r;
    try { r = fn(w); } catch (e) {
      // anything refuseOrPark did not catch itself: still a refusal, uncounted
      r = { parked: false, ids: (w.open || [{ id: 'finish-line.json unreadable' }]).map((x) => x.id), refusals: w.state.stop_refusals, uncounted: errText(e) };
    }
    if (r.uncounted) unwritable.push({ run_id: w.id, error: r.uncounted, refused: true, refusal_uncounted: true });
    if (r.logError) unwritable.push({ run_id: w.id, error: r.logError, refused: true });
    (r.parked ? parked : refused).push({ id: w.id, refusals: r.refusals, ids: r.ids, uncounted: r.uncounted || null });
  }
  // a counted refusal is the one shown first; an uncounted one never hides it
  refused.sort((a, b) => (a.uncounted ? 1 : 0) - (b.uncounted ? 1 : 0));
  return { refused, parked };
}

// The fields every STOP_REFUSED answer carries when a refusal could not be counted.
function uncountedNote(refused) {
  const lost = refused.filter((r) => r.uncounted);
  if (!lost.length) return { note: '', extra: {} };
  const note = '; the refusal of ' + lost.map((r) => r.id + ' (' + r.uncounted + ')').join(', ') + ' could not be written, so it is not counted: patience cannot advance and the run will not park on its own until the write error is fixed';
  return { note, extra: { refusal_uncounted: true, uncounted_runs: lost.map((r) => r.id) } };
}

function refuseUnreadableBoard(ctx, gating, patience, error, extra, unwritable) {
  const id = 'finish-line.json unreadable';
  const { refused, parked } = eachRefusal(ctx, gating, (g) => refuseOrPark(ctx, g.id, g.state, { rows: [] }, [{ id }], patience), unwritable);
  const more = unwritable.length ? { unwritable } : {};
  const lost = uncountedNote(refused);
  extra = { ...extra, ...more, ...lost.extra };
  const board = 'FINISH LINE: unreadable (' + error + ')';
  if (!refused.length) return { outcome: 'PARKED', exit: 2, owned: true, run_id: parked[0].id, status: 'PARKED', open: [id], board, board_error: error, ...extra };
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: refused[0].id, reason: 'finish-line.json cannot be read, so the open rows are unknown: ' + error + lost.note, stop_refusals: refused[0].refusals, patience, open: [id], board, board_error: error, ...(gating.length > 1 ? { runs: gating.map((g) => g.id) } : {}), ...extra });
}

// One run's refusal bookkeeping: the patience counter resets when its rows changed since the last stop;
// at patience the run is parked with one owner-pack question. Returns { parked, ids, refusals }.
function refuseOrPark(ctx, runId, state, fl, open, patience) {
  const ids = open.map((r) => r.id);
  const sig = rowsSignature(fl);
  const stored = state.stop_refusals;
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  // CP-03 R7-S1-L5: once the state write holds the refusal, a log line or a park that cannot be written
  // never turns it into an allow. A park that fails is a plain refusal; a lost event is reported in log_error.
  let logError = null;
  const logEvent = (row) => { try { appendEvent(ctx, runId, row); } catch (e) { logError = errText(e); } };
  let parkError = null;
  // CP-03 R8-S1-M15: the state write itself failed (STATE_TOO_LARGE, EACCES, ...): refuse anyway, uncounted
  const uncounted = (e) => {
    const err = errText(e);
    logEvent({ event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: stored, open: ids, refusal_uncounted: true, write_error: err, ...(parkError ? { park_error: parkError } : {}) } });
    return { parked: false, ids, refusals: stored, uncounted: err, logError: logError || parkError };
  };
  const text = 'The run stopped with ' + ids.length + ' open row(s) after ' + patience + ' refusals: ' + ids.join(', ') + '. Resume the run or close it with the open rows as residuals?';
  if (state.stop_refusals >= patience) {
    // CP-03 R9-S1-M16: the park is test-serialised (schema, cap as written) before its question reaches the
    // pack. A park that could not be written adds nothing and stays a plain refusal, uncounted.
    const would = { ...state, stop_refusals: 0, gates: { ...state.gates, stop_gate: { sig } }, status: 'PARKED', updated_at: ctx.now() };
    try { stateBytes(ctx, would); } catch (e) { return uncounted(e); }
    try {
      packAppend(ctx, runId, [{
        kind: 'default',
        source: 'stop-gate',
        text,
        options: ['resume run', 'close with residuals'],
        recommendation: 'resume run',
        default: 'resume run',
        reversible: true,
      }], { stopGate: true });
    } catch (e) { parkError = errText(e); }
  }
  if (state.stop_refusals >= patience && !parkError) {
    state.stop_refusals = 0;
    state.gates.stop_gate = { sig };
    const from = state.status;
    state.status = 'PARKED';
    try { writeState(ctx, state); } catch (e) { return uncounted(e); }
    // CP-03 R5-S1-H10: the event is the gate's own mark on the question (pack withdraw trusts nothing else)
    let q = null;
    try {
      const stored = redactJsonValues(text);
      q = openPackQuestions(ctx, runId).find((x) => x.text === text || x.text === stored) || openStopGateQuestion(ctx, runId);
    } catch { /* the park stands */ }
    logEvent({ event: 'stop_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, open: ids, ...(q ? { question: q.n } : {}) } });
    return { parked: true, ids, refusals: 0, logError };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  try { writeState(ctx, state); } catch (e) { return uncounted(e); }
  logEvent({ event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: ids, ...(parkError ? { park_error: parkError } : {}) } });
  return { parked: false, ids, refusals: state.stop_refusals, logError: logError || parkError };
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
  const lost = uncountedNote([{ id: runId, uncounted: r.uncounted }]);
  const unwritable = [
    ...(r.uncounted ? [{ run_id: runId, error: r.uncounted, refused: true, refusal_uncounted: true }] : []),
    ...(r.logError ? [{ run_id: runId, error: r.logError, refused: true }] : []),
  ];
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: runId, reason: 'finish-line rows are still open' + lost.note, stop_refusals: r.refusals, patience, open: r.ids, board, ...(unwritable.length ? { unwritable } : {}), ...lost.extra });
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
  const known = (home) => { const h = reg.homes.find((x) => x.home === home); return h && Array.isArray(h.runs) ? h.runs : []; };
  const homes = [{ ctx, home: here, own: true, scope: { ...scope, knownIds: known(here) } }];
  for (const h of reg.homes) {
    if (h.home !== here) homes.push({ ctx: { ...ctx, home: h.home, root: h.root }, home: h.home, own: false, scope: { ...scope, knownIds: known(h.home) } });
  }
  if (homes.length === 1) return withNotes(() => hookStopIn(ctx, homes[0].scope), notes);
  const answers = [];
  const unreadableHomes = [];
  let firstError = null;
  for (const h of homes) {
    try {
      answers.push({ home: h.home, out: hookStopIn(h.ctx, h.scope) });
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
  if (unwritable.some((u) => u.refusal_uncounted)) notes.refusal_uncounted = true;
  const unlistable = answers.flatMap((a) => ((a.out || (a.refused && a.refused.extra) || {}).runs_unlistable || []).map((u) => ({ ...u, home: a.home })));
  if (unlistable.length) notes.runs_unlistable = unlistable;
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

// The hook-path rule inside one home (CONTRACT 3.1). CP-03 R9-L-b: a runs folder that exists but cannot be
// listed is reported (runs_unlistable) on every answer; the registry's runs for this home are still gated.
function hookStopIn(ctx, scope) {
  const scoped = selectScopedRunId(ctx, scope);
  if (!scoped.unlistable) return hookStopScoped(ctx, scope, scoped);
  const note = { runs_unlistable: [{ home: ctx.home, error: scoped.unlistable, registry_runs: scope.knownIds || [] }] };
  return withNotes(() => hookStopScoped(ctx, scope, scoped), note);
}

function hookStopScoped(ctx, scope, scoped) {
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
  const many = withOpen.length > 1 ? { runs: withOpen.map((w) => w.id), open_by_run: openByRun } : {};
  const text = boards.join('\n\n');
  if (!refused.length) {
    const first = parked[0].id;
    return { outcome: 'PARKED', exit: 2, owned: true, run_id: first, status: 'PARKED', open: openByRun[first], board: text, ...many, ...(withOpen.length > 1 ? { parked: parked.map((p) => p.id) } : {}), ...extra };
  }
  const first = refused[0];
  const lost = uncountedNote(refused);
  throw fail('STOP_REFUSED', 1, {
    ...lost.extra,
    owned: true, run_id: first.id, reason: 'finish-line rows are still open' + lost.note, stop_refusals: first.refusals, patience,
    open: openByRun[first.id], board: text, ...many, ...(parked.length ? { parked: parked.map((p) => p.id) } : {}), ...extra,
  });
}
