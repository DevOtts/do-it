import path from 'node:path';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { fail } from './errors.mjs';
import { STATE_READ_CAP, atomicWriteJson, readJsonRegular } from './fs-atomic.mjs';

// finish-line.json: the board of rows that must all become terminal (CONTRACT section 2).
// States: OPEN, DONE (the closed state, needs evidence), PARKED (needs owner_question),
// BLOCKED (needs reason).
export const BOARD_CAP = 1200;

export function finishLinePath(ctx) {
  return path.join(ctx.home, 'finish-line.json');
}

// CP-03 R5-S1-L4: a board that cannot be read is a named refusal (FINISH_LINE_UNREADABLE, with the file and
// the cause, never its content), not an INTERNAL_ERROR, so `next` after a park tells the agent what to fix.
export function readFinishLine(ctx) {
  const file = finishLinePath(ctx);
  let fl;
  try { fl = readJsonRegular(file, STATE_READ_CAP); } catch (e) {
    const error = String(e && e.code ? e.code + ': ' + e.message : (e && e.message) || e);
    throw fail('FINISH_LINE_UNREADABLE', 1, { file, error, message: 'finish-line.json cannot be read (' + error + '); restore it from git or fix it by hand, then run the command again' });
  }
  if (!fl || !Array.isArray(fl.rows)) return { rows: [] };
  return fl;
}

export function writeFinishLine(ctx, fl) {
  const errors = validateSchema(loadSchemaFile('finish-line.schema.json'), fl);
  if (errors.length) throw fail('FINISH_LINE_INVALID', 1, { errors });
  atomicWriteJson(finishLinePath(ctx), fl);
}

// A row's identity is (run_id, id): row ids are namespaced per run, so two runs of one preset (or two
// plans with the same slice ids) each get their own rows (CP-03 S1-H1). A row written before run_id
// existed has none. Only a legacy run (state with no owner object, written by 1.0.x) may adopt such a
// row; a 1.1 run never does, or a 1.0.x board's rows would stand in for the run's own and it would
// seed nothing (CP-03 R2-S1-H3). `adopt` is false unless the caller passes adoptsUnattributed(state).
// A legacy run that `resume` later bound to a session keeps adopting (owner.adopted_legacy, CP-03 R3-L7).
export function adoptsUnattributed(state) {
  if (!state) return false;
  const o = state.owner;
  return !(o && typeof o === 'object') || o.adopted_legacy === true;
}

export function findRow(fl, id, runId, adopt) {
  const rid = runId || null;
  if (rid) {
    const own = fl.rows.find((r) => r.id === id && r.run_id === rid);
    if (own) return own;
    if (!adopt) return null;
  }
  return fl.rows.find((r) => r.id === id && !r.run_id) || null;
}

export function hasRow(fl, id, runId, adopt) {
  return !!findRow(fl, id, runId, adopt);
}

export function finishLineUpsert(fl, id, patch, runId, adopt) {
  let row = findRow(fl, id, runId, adopt);
  if (!row) {
    row = { id, kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null };
    if (runId) row.run_id = runId;
    fl.rows.push(row);
  } else if (runId && !row.run_id) {
    row.run_id = runId;
  }
  Object.assign(row, patch);
  return row;
}

// The rows one run answers for: its own, plus unattributed rows of an older board only when the run may
// adopt them. Every caller passes adoptsUnattributed(state), the same rule seeding uses: next, status,
// handoff, conclude and both stop paths (CP-03 R3-S1-M6). A 1.1 run therefore never answers for, and is
// never held by, a 1.0.x row that `record` would refuse to let it close; a legacy run still counts them.
export function rowsForRun(fl, runId, includeUnattributed) {
  return { rows: fl.rows.filter((r) => r.run_id === runId || (includeUnattributed && !r.run_id)) };
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// Terminal = closed with evidence, or PARKED with a question, or BLOCKED with a reason.
export function rowTerminal(row) {
  if (row.state === 'DONE') return nonEmpty(row.evidence);
  if (row.state === 'PARKED') return nonEmpty(row.owner_question);
  if (row.state === 'BLOCKED') return nonEmpty(row.reason);
  return false;
}

export function rowClosed(row) {
  return row.state === 'DONE' && nonEmpty(row.evidence);
}

// A package row (a slice) closes by itself once every one of its case rows
// (`T-<slice>-<n>`) is terminal: DONE when all are DONE, else BLOCKED naming the
// ones that are not. A package with no case rows, or with one still open, is left alone.
// Case rows count only for the package of the same run (rows are namespaced per run). An unattributed
// row (an older board) pairs only with an unattributed package, or with the legacy run named by
// `legacyRunId` (the one run allowed to adopt it): a 1.1 package never closes on a 1.0.x case row.
function sameRun(pkg, c, legacyRunId) {
  if ((pkg.run_id || null) === (c.run_id || null)) return true;
  if (!legacyRunId) return false;
  return (!c.run_id && pkg.run_id === legacyRunId) || (!pkg.run_id && c.run_id === legacyRunId);
}

export function autoClosePackages(fl, legacyRunId) {
  const closed = [];
  for (const pkg of fl.rows) {
    if (pkg.kind !== 'package' || pkg.state !== 'OPEN' || pkg.id.includes(':')) continue;
    const re = new RegExp('^T-' + pkg.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d');
    const cases = fl.rows.filter((r) => r.kind === 'dod' && sameRun(pkg, r, legacyRunId) && re.test(r.id));
    if (!cases.length || !cases.every(rowTerminal)) continue;
    const notDone = cases.filter((r) => r.state !== 'DONE');
    if (notDone.length) {
      pkg.state = 'BLOCKED';
      pkg.reason = 'auto-closed: ' + notDone.length + ' of ' + cases.length + ' case rows not DONE: ' + notDone.map((r) => r.id + ' ' + r.state).join(', ');
    } else {
      pkg.state = 'DONE';
      pkg.evidence = 'auto-closed: all ' + cases.length + ' case rows DONE (' + cases.map((r) => r.id).join(', ') + ')';
      pkg.reason = null;
    }
    closed.push(pkg.id);
  }
  return closed;
}

export function openRows(fl) {
  return fl.rows.filter((r) => !rowTerminal(r));
}

// Signature of row states: any change in it is progress for the stop-gate.
export function rowsSignature(fl) {
  return fl.rows.map((r) => r.id + '=' + r.state + (rowTerminal(r) ? '+' : '-')).join('|');
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '~' : t;
}

// Roughly 300 tokens, never more than BOARD_CAP characters, deterministic.
export function renderBoard(fl) {
  const rows = fl.rows;
  const closed = rows.filter(rowClosed);
  const parked = rows.filter((r) => r.state === 'PARKED');
  const blocked = rows.filter((r) => r.state === 'BLOCKED');
  const open = rows.filter((r) => !rowClosed(r) && r.state !== 'PARKED' && r.state !== 'BLOCKED');
  const build = (detail) => {
    const lines = ['FINISH LINE: ' + closed.length + ' of ' + rows.length + ' closed'];
    if (open.length) lines.push('OPEN (' + open.length + '): ' + open.map((r) => r.id).join(' '));
    if (parked.length) lines.push('PARKED (' + parked.length + '): ' + parked.map((r) => r.id + (detail ? ' [' + clip(r.owner_question, detail) + ']' : '')).join('; '));
    if (blocked.length) lines.push('BLOCKED (' + blocked.length + '): ' + blocked.map((r) => r.id + (detail ? ' [' + clip(r.reason, detail) + ']' : '')).join('; '));
    return lines.join('\n');
  };
  for (const detail of [40, 16, 0]) {
    const text = build(detail);
    if (text.length <= BOARD_CAP) return text;
  }
  // very large boards: keep the counts and as many ids as fit
  let text = build(0);
  while (text.length > BOARD_CAP - 24) {
    const cut = text.lastIndexOf(' ', BOARD_CAP - 30);
    text = text.slice(0, cut > 0 ? cut : BOARD_CAP - 30);
  }
  return text + ' ... (truncated)';
}
