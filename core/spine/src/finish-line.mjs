import path from 'node:path';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { fail } from './errors.mjs';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';

// finish-line.json: the board of rows that must all become terminal (CONTRACT section 2).
// States: OPEN, DONE (the closed state, needs evidence), PARKED (needs owner_question),
// BLOCKED (needs reason).
export const BOARD_CAP = 1200;

export function finishLinePath(ctx) {
  return path.join(ctx.home, 'finish-line.json');
}

export function readFinishLine(ctx) {
  const fl = readJsonIfExists(finishLinePath(ctx));
  if (!fl || !Array.isArray(fl.rows)) return { rows: [] };
  return fl;
}

export function writeFinishLine(ctx, fl) {
  const errors = validateSchema(loadSchemaFile('finish-line.schema.json'), fl);
  if (errors.length) throw fail('FINISH_LINE_INVALID', 1, { errors });
  atomicWriteJson(finishLinePath(ctx), fl);
}

export function finishLineUpsert(fl, id, patch) {
  let row = fl.rows.find((r) => r.id === id);
  if (!row) {
    row = { id, kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null };
    fl.rows.push(row);
  }
  Object.assign(row, patch);
  return row;
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
export function autoClosePackages(fl) {
  const closed = [];
  for (const pkg of fl.rows) {
    if (pkg.kind !== 'package' || pkg.state !== 'OPEN' || pkg.id.includes(':')) continue;
    const re = new RegExp('^T-' + pkg.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d');
    const cases = fl.rows.filter((r) => r.kind === 'dod' && re.test(r.id));
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
