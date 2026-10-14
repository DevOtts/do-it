// Frozen, fingerprinted roteiro (PRD D21). Original rows are immutable after round 1 starts; amendments are appended.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const canon = (rows) => JSON.stringify(rows.map((r) => ({ id: r.id, text: r.text, refs: r.refs || [], ...(r.origin ? { origin: r.origin } : {}) })));
const rfile = (d) => path.join(d, 'roteiro.json');
const mfile = (d) => path.join(d, 'marks.json');
const readJson = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt);
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };

// Check fingerprint = check text plus digests of the files it references (relative to repoRoot).
export function checkFingerprint(row, repoRoot) {
  const refs = (row.refs || []).map((p) => {
    const f = path.resolve(repoRoot, p);
    return p + '=' + (fs.existsSync(f) && fs.statSync(f).isFile() ? sha256(fs.readFileSync(f)) : 'missing');
  });
  return sha256(row.text + '\n' + refs.join('\n'));
}

export function freezeRoteiro(reviewDir, rows) {
  if (fs.existsSync(rfile(reviewDir))) throw fail('ROTEIRO_FROZEN', 1, { reason: 'roteiro already frozen at round 1' });
  const ro = { frozen: true, sha256: sha256(canon(rows)), rows, amendments: [], amendments_sha256: sha256(canon([])) };
  writeJson(rfile(reviewDir), ro);
  return ro;
}

export const readRoteiro = (reviewDir) => readJson(rfile(reviewDir), null);

// Any edit to an original row is refused; the file stays byte-unchanged.
export function editRow(reviewDir, id, patch) {
  const ro = readRoteiro(reviewDir);
  if (ro && ro.frozen) throw fail('ROTEIRO_FROZEN', 1, { row: id, patch: Object.keys(patch || {}) });
  throw fail('ROTEIRO_NOT_STARTED', 1);
}

export function verifyRoteiro(reviewDir) {
  const ro = readRoteiro(reviewDir);
  if (!ro) throw fail('ROTEIRO_NOT_STARTED', 1);
  if (sha256(canon(ro.rows)) !== ro.sha256) throw fail('ROTEIRO_TAMPERED', 1);
  return ro;
}

export function amend(reviewDir, rows) {
  const ro = verifyRoteiro(reviewDir);
  for (const r of rows) if (!['plan', 'build', 'review'].includes(r.origin)) throw fail('AMENDMENT_ORIGIN_INVALID', 1, { row: r.id });
  ro.amendments.push(...rows);
  ro.amendments_sha256 = sha256(canon(ro.amendments));
  writeJson(rfile(reviewDir), ro);
  return ro;
}

export function markCheck(reviewDir, repoRoot, round, rowId, mark) {
  const ro = verifyRoteiro(reviewDir);
  const row = [...ro.rows, ...ro.amendments].find((r) => r.id === rowId);
  if (!row) throw fail('ROW_UNKNOWN', 1, { row: rowId });
  const marks = readJson(mfile(reviewDir), {});
  marks[rowId] = { mark, round, fingerprint: checkFingerprint(row, repoRoot) };
  writeJson(mfile(reviewDir), marks);
}

// A mark is inherited only if the check's own fingerprint is unchanged.
export function marksForRound(reviewDir, repoRoot) {
  const ro = verifyRoteiro(reviewDir);
  const marks = readJson(mfile(reviewDir), {});
  return [...ro.rows, ...ro.amendments].map((row) => {
    const m = marks[row.id];
    if (!m) return { id: row.id, status: 'UNMARKED' };
    if (m.fingerprint !== checkFingerprint(row, repoRoot)) return { id: row.id, status: `re-run - changed since round ${m.round}`, was: m.mark };
    return { id: row.id, status: m.mark, round: m.round };
  });
}

// Finding fingerprint: stable across rounds for the same problem at the same place.
export function findingFingerprint({ check_id, location, summary }) {
  return 'f-' + sha256([check_id, location, String(summary || '').toLowerCase().replace(/\s+/g, ' ').trim()].join('|')).slice(0, 12);
}
