import path from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';

// Minimal finish-line access for S3; S2 owns the board renderer and stop-gate.
export function finishLinePath(ctx) {
  return path.join(ctx.home, 'finish-line.json');
}

export function readFinishLine(ctx) {
  const fl = readJsonIfExists(finishLinePath(ctx));
  if (!fl || !Array.isArray(fl.rows)) return { rows: [] };
  return fl;
}

export function writeFinishLine(ctx, fl) {
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
