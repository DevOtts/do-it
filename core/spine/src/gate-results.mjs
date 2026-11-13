import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { gateProcStart } from './gate-signals.mjs';
import { BULK_READ_CAP, appendRecord, atomicWrite, atomicWriteJson, readRegularFile, writeFileOnce } from './fs-atomic.mjs';
import { canonicalJson, sha256Bytes } from './hash.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';

// Gate results store (resumable test gates, epic L1; PRD-1 D1-D15, CONTRACT §2.1, §8 M1/M5, §11 A3-A6).
// One append-only store per repository under {git-common-dir}/do-it/gate-results/. Every error path fails toward
// running more (G-1): no store, an unreadable store, a corrupt line or an unknown key never yields a reuse.

export const GATE_ROW_SCHEMA = 'do-it-gate-result/1';
export const GATE_ROW_MAX_JSON = 4094;
export const GATE_STORE_ROWS = 'results.jsonl';
export const GATE_STORE_BASE = 'results.base.jsonl';
export const GATE_STORE_BASE_SCHEMA = 'do-it-gate-base/1';
export const GATE_STORE_SEG_RE = /^results\.seg-([0-9]+)\.jsonl$/;
export const GATE_STORE_LOCK_STALE_MS = 60000;
export const GATE_FAILURE_CAP = 1024 * 1024;
export const GATE_FOLD_DEFAULTS = Object.freeze({
  resume: false,
  ttlMs: 86400000,
  unstableMs: 604800000,
  flakyCarryMs: 604800000,
  skewMs: 60000,
});

// == process start time (CONTRACT §11 A8, build decision Y4) ==
// The default start-time probe is the queue lane's gateProcStart(pid) (gate-signals.mjs); callers may still inject
// opts.procStart. A null start time counts as "dead or differs" (G-1 direction):
// a run whose owner cannot be proven alive is never treated as live, and a lock whose owner cannot be proven alive
// is reclaimable (the compaction nonce check then aborts the loser before it can replace the base).
export function gateStoreProcStartDefault(pid) {
  return gateProcStart(pid);
}

export function gateStorePidAlive(pid, pidStart, procStart) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (!e || e.code !== 'EPERM') return false;
  }
  let nowStart = null;
  try { nowStart = (procStart || gateStoreProcStartDefault)(pid); } catch { nowStart = null; }
  if (nowStart === null || nowStart === undefined || pidStart === null || pidStart === undefined) return false;
  return String(nowStart) === String(pidStart);
}

// == store handle (D1, D14) ==
// {backend: 'local', dir} or null when the cwd is not inside a git repository (store unavailable: every file runs).
export function gateStoreOpen(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const env = o.env || process.env;
  const run = (args) => cp.execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let common = null;
  try {
    common = run(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  } catch {
    try { common = path.resolve(cwd, run(['rev-parse', '--git-common-dir'])); } catch { common = null; }
  }
  if (!common) return null;
  let real = common;
  try { real = fs.realpathSync(common); } catch { /* keep as resolved */ }
  return { backend: 'local', dir: path.join(real, 'do-it', 'gate-results') };
}

// == rows: CRC and validation (D3, D5) ==
export function gateRowCrc(rowWithoutCrc) {
  return sha256Bytes(canonicalJson(rowWithoutCrc)).slice(0, 16);
}

export function gatePassInvariant(row) {
  const c = row && row.counts;
  return row.exec_error === false && !!c && c.failed === 0 && c.passed >= 1 && (row.failure_ref === null || row.failure_ref === undefined);
}

function gateRowStringsOk(v) {
  if (typeof v === 'string') return v.isWellFormed();
  if (Array.isArray(v)) return v.every(gateRowStringsOk);
  if (v && typeof v === 'object') return Object.entries(v).every(([k, x]) => k.isWellFormed() && gateRowStringsOk(x));
  if (typeof v === 'number') return Number.isSafeInteger(v);
  return true;
}

// Schema plus the invariants the schema subset cannot express. opts.passInvariant (default true) adds the PASS
// invariant (G-2 defence in depth). The scanner does not apply it: the fold re-applies it as FAIL (D13 step 5).
export function gateRowErrors(row, opts) {
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['row is not an object'];
  for (const e of validateSchema(loadSchemaFile('gate-result.1.schema.json'), { ...row, crc: row.crc === undefined ? '0000000000000000' : row.crc })) {
    errors.push(e.pointer + ' ' + e.message);
  }
  if (!gateRowStringsOk(row)) errors.push('a string is not well-formed UTF-16 or a number is not a safe integer');
  const fileRow = row.type === 'start' || row.type === 'finish';
  if (fileRow) {
    if (typeof row.file !== 'string') errors.push('/file is required on ' + row.type);
    if (typeof row.key !== 'string') errors.push('/key is required on ' + row.type);
  } else {
    if ('file' in row) errors.push('/file is not allowed on ' + row.type);
    if ('key' in row) errors.push('/key is not allowed on ' + row.type);
    if ('result' in row) errors.push('/result is not allowed on ' + row.type);
  }
  if (row.type === 'finish' && !('result' in row)) errors.push('/result is required on finish');
  if (row.type !== 'finish' && 'result' in row) errors.push('/result is allowed on finish only');
  for (const k of ['tainted', 'reason', 'verdict']) if (k in row && row.type !== 'run_end') errors.push('/' + k + ' is allowed on run_end only');
  for (const k of ['pid', 'pid_start']) if (k in row && row.type !== 'run_start') errors.push('/' + k + ' is allowed on run_start only');
  if (typeof row.file === 'string') {
    const f = row.file;
    if (/[\t\n\r]/.test(f)) errors.push('/file contains TAB, LF or CR');
    if (f.startsWith('/')) errors.push('/file is absolute');
    if (f.split('/').some((seg) => seg === '..')) errors.push('/file has a .. segment');
  }
  if (!opts || opts.passInvariant !== false) {
    if (row.type === 'finish' && row.result === 'PASS' && !gatePassInvariant(row)) {
      errors.push('PASS invariant: requires exec_error false, counts.failed 0, counts.passed >= 1, failure_ref null');
    }
  }
  return errors;
}

// The line on disk is exactly canonicalJson(row with crc). Returns the line (without LF) or throws GATE_ROW_INVALID.
export function gateRowLine(row) {
  const r = {};
  for (const [k, v] of Object.entries(row || {})) if (v !== undefined && k !== 'crc') r[k] = v;
  if (r.schema === undefined) r.schema = GATE_ROW_SCHEMA;
  const errors = gateRowErrors(r);
  if (errors.length) throw fail('GATE_ROW_INVALID', 1, { errors });
  const crc = gateRowCrc(r);
  return canonicalJson({ ...r, crc });
}

// D4: one bounded O_APPEND write per row. Rows larger than 4094 bytes of canonical JSON throw GATE_ROW_TOO_LARGE.
export function gateStoreAppend(store, row) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  const line = gateRowLine(row);
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length > GATE_ROW_MAX_JSON) throw fail('GATE_ROW_TOO_LARGE', 1, { bytes: bytes.length, max: GATE_ROW_MAX_JSON });
  const res = appendRecord(path.join(store.dir, GATE_STORE_ROWS), Buffer.concat([bytes, Buffer.from('\n')]));
  if (res.written !== res.expected) throw fail('GATE_ROW_SHORT_WRITE', 1, { written: res.written, expected: res.expected });
  return { line, crc: JSON.parse(line).crc };
}

// == scan (D2, D6) ==
// Parses one stored line. Returns the row or null when the line is corrupt (parse, CRC, schema or structural invariant).
export function gateRowParse(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || typeof obj.crc !== 'string') return null;
  const rest = { ...obj };
  delete rest.crc;
  if (gateRowCrc(rest) !== obj.crc) return null; // CRC-GUARD: a row whose bytes changed after writing is CORRUPT
  if (gateRowErrors(obj, { passInvariant: false }).length) return null;
  return obj;
}

export function gateRowAttribute(raw) {
  const out = {};
  const str = (name) => {
    const m = new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(raw);
    if (!m) return undefined;
    try { return JSON.parse('"' + m[1] + '"'); } catch { return undefined; }
  };
  const file = str('file');
  if (typeof file === 'string' && file) out.file = file;
  const leg = str('leg');
  if (typeof leg === 'string' && leg) out.leg = leg;
  const key = /"key"\s*:\s*"([0-9a-f]{64})"/.exec(raw);
  if (key) out.key = key[1];
  const run = /g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}/.exec(raw);
  if (run) out.run_id = run[0];
  return out;
}

function gateStoreReadFile(file) {
  try {
    return { bytes: readRegularFile(file, BULK_READ_CAP) };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { bytes: null };
    return { error: e };
  }
}

function gateStoreSegments(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .map((n) => ({ name: n, m: GATE_STORE_SEG_RE.exec(n) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.name, n: Number(x.m[1]) }))
    .sort((a, b) => a.n - b.n);
}

// The base file's first line is a metadata line recording how many bytes of each segment it absorbed, written in the
// same atomic rename as the base content. A scan skips the absorbed bytes, so a crash between the base rename and the
// segment clean-up can never present a row twice (PRD-1 D11; see the results file for this refinement of D2).
export function gateStoreBaseMeta(firstLine) {
  let obj;
  try { obj = JSON.parse(firstLine); } catch { return null; }
  if (!obj || typeof obj !== 'object' || obj.schema !== GATE_STORE_BASE_SCHEMA || typeof obj.crc !== 'string') return null;
  const rest = { ...obj };
  delete rest.crc;
  if (gateRowCrc(rest) !== obj.crc) return null;
  if (!obj.absorbed || typeof obj.absorbed !== 'object') return null;
  return obj;
}

function gateStoreSplit(bytes) {
  const parts = bytes.toString('utf8').split('\n');
  return parts.filter((l) => l.trim() !== '');
}

// Reads every row file in scan order. opts.withActive (default true) includes results.jsonl.
// Returns {source, lines: [{raw, from}], absorbedOld, segSizes, error}. source: 'local' | 'none' | 'unavailable'.
export function gateStoreReadAll(store, opts) {
  if (!store || !store.dir) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  const dir = store.dir;
  let st = null;
  try { st = fs.statSync(dir); } catch (e) {
    if (e && e.code === 'ENOENT') return { source: 'none', lines: [], absorbedOld: {}, segSizes: {} };
    return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  }
  if (!st.isDirectory()) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  const lines = [];
  let absorbedOld = {};
  const base = gateStoreReadFile(path.join(dir, GATE_STORE_BASE));
  if (base.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  if (base.bytes) {
    const all = gateStoreSplit(base.bytes);
    const meta = all.length ? gateStoreBaseMeta(all[0]) : null;
    if (meta) { absorbedOld = meta.absorbed; all.shift(); }
    for (const raw of all) lines.push({ raw, from: GATE_STORE_BASE });
  }
  const segSizes = {};
  for (const seg of gateStoreSegments(dir)) {
    const r = gateStoreReadFile(path.join(dir, seg.name));
    if (r.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
    if (!r.bytes) continue;
    segSizes[seg.name] = r.bytes.length;
    const skip = Number.isInteger(absorbedOld[seg.name]) && absorbedOld[seg.name] <= r.bytes.length ? absorbedOld[seg.name] : 0;
    for (const raw of gateStoreSplit(r.bytes.subarray(skip))) lines.push({ raw, from: seg.name, tail: skip > 0 });
  }
  if (!opts || opts.withActive !== false) {
    const act = gateStoreReadFile(path.join(dir, GATE_STORE_ROWS));
    if (act.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
    if (act.bytes) for (const raw of gateStoreSplit(act.bytes)) lines.push({ raw, from: GATE_STORE_ROWS });
  }
  return { source: 'local', lines, absorbedOld, segSizes };
}

function gateStoreItem(raw, pos) {
  const row = gateRowParse(raw);
  if (row) return { pos, ok: true, row };
  return { pos, ok: false, ...gateRowAttribute(raw) };
}

function gateStoreKeep(item, filter) {
  if (!filter || (filter.file === undefined && filter.leg === undefined)) return true;
  const leg = filter.leg;
  if (item.ok) {
    const r = item.row;
    if (r.type !== 'start' && r.type !== 'finish') return true;
    if (filter.file !== undefined && r.file !== filter.file) return false;
    if (leg !== undefined && (r.leg || 'unit') !== leg) return false;
    return true;
  }
  if (filter.file !== undefined && item.file !== undefined && item.file !== filter.file) return false;
  if (leg !== undefined && item.file !== undefined && item.leg !== undefined && item.leg !== leg) return false;
  return true;
}

// Never throws on content. With {file, leg}: that file's start/finish items, every run-level row, every corrupt item
// attributed to that file and every unattributed corrupt item.
export function gateStoreScan(store, filter) {
  const all = gateStoreReadAll(store);
  const items = [];
  let corrupt = 0;
  let unattributed = 0;
  all.lines.forEach((l, pos) => {
    const it = gateStoreItem(l.raw, pos);
    if (!gateStoreKeep(it, filter)) return;
    if (!it.ok) { corrupt++; if (it.file === undefined) unattributed++; }
    items.push(it);
  });
  return { items, corrupt, unattributed, source: all.source };
}

// == liveness of runs (D13 inputs; CONTRACT §11 A4) ==
// Impure: the set of run ids whose run_start owner is alive (pid answers AND start time equals pid_start) and that
// have no run_end. The fold itself never touches the OS.
export function gateStoreLiveRuns(items, opts) {
  const procStart = (opts && opts.procStart) || gateStoreProcStartDefault;
  const list = Array.isArray(items) ? items : (items && items.items) || [];
  const ended = new Set();
  const starts = new Map();
  for (const it of list) {
    if (!it || !it.ok) continue;
    if (it.row.type === 'run_end') ended.add(it.row.run_id);
    if (it.row.type === 'run_start' && !starts.has(it.row.run_id)) starts.set(it.row.run_id, it.row);
  }
  const live = new Set();
  for (const [id, row] of starts) {
    if (ended.has(id)) continue;
    if (gateStorePidAlive(row.pid, row.pid_start, procStart)) live.add(id);
  }
  return live;
}

// == fold: pure (D13; CONTRACT §8 M1, §11 A3, A5). No fs, no child_process, no clock below this line. ==
export const GATE_COMPONENT_ORDER = ['gate', 'runner', 'core', 'installed', 'env', 'platform', 'class', 'tree', 'deps'];

function gateFoldMs(at) {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : NaN;
}

function gateFoldSelect(all, opts) {
  const leg = opts.leg || 'unit';
  const out = [];
  for (const it of all) {
    if (!it) continue;
    if (it.ok) {
      const r = it.row;
      if (r.type === 'start' || r.type === 'finish') {
        if (opts.file !== undefined && r.file !== opts.file) continue;
        if ((r.leg || 'unit') !== leg) continue;
      }
      out.push(it);
    } else {
      if (opts.file !== undefined && it.file !== undefined && it.file !== opts.file) continue;
      if (it.file !== undefined && it.leg !== undefined && it.leg !== leg) continue;
      out.push(it);
    }
  }
  return out.map((it, i) => ({ it, i })).sort((a, b) => (a.it.pos - b.it.pos) || (a.i - b.i)).map((x) => x.it);
}

// gateFold(rows, keyNow, now, opts): rows = gateStoreScan items (or the scan result itself) for one (file, leg);
// keyNow = {key, components} or null; now = epoch ms; opts = {file, leg, resume, liveRuns, ttlMs, unstableMs,
// flakyCarryMs, skewMs, source}. Returns {state, reuse, passRow, key, kills, flakyPasses, unstableUntil,
// invalidated, reason, corrupt}.
export function gateFold(rows, keyNow, now, opts) {
  const o = { ...GATE_FOLD_DEFAULTS, ...(opts || {}) };
  const scanObj = rows && !Array.isArray(rows) ? rows : null;
  const all = scanObj ? scanObj.items || [] : rows || [];
  const source = o.source || (scanObj ? scanObj.source : undefined);
  const live = o.liveRuns instanceof Set ? o.liveRuns : new Set(o.liveRuns || []);
  const out = {
    state: 'NEVER_RUN', reuse: null, passRow: null, key: keyNow && keyNow.key ? keyNow.key : null,
    kills: 0, flakyPasses: 0, unstableUntil: null, invalidated: [], reason: 'no-row', corrupt: 0,
  };
  // step 1: unknown component => the file runs (G-1)
  if (!keyNow || typeof keyNow.key !== 'string' || !keyNow.key) { out.reason = 'key-unknown'; return out; }
  const items = gateFoldSelect(all, o);
  out.corrupt = items.filter((it) => !it.ok).length;
  if (items.length === 0 && (source === 'none' || source === 'unavailable')) { out.reason = 'no-store'; return out; }
  const K = keyNow.key;

  // step 2: de-dup start/finish on (type, run_id, file, leg); step 3: run table
  const seen = new Set();
  const runs = new Map();
  const cleans = [];
  const finishes = [];
  const starts = [];
  const corrupts = [];
  for (const it of items) {
    if (!it.ok) { corrupts.push({ pos: it.pos, attributed: it.file !== undefined }); continue; }
    const r = it.row;
    if (r.type === 'start' || r.type === 'finish') {
      const k = r.type + '\0' + r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit');
      if (seen.has(k)) continue;
      seen.add(k);
      (r.type === 'start' ? starts : finishes).push({ pos: it.pos, row: r });
      continue;
    }
    const run = runs.get(r.run_id) || { start: null, end: null };
    if (r.type === 'run_start' && !run.start) run.start = r;
    if (r.type === 'run_end' && !run.end) run.end = r;
    runs.set(r.run_id, run);
    if (r.type === 'clean') cleans.push({ pos: it.pos, row: r });
  }
  let horizon = null;
  for (let i = cleans.length - 1; i >= 0; i--) {
    // the TTL horizon is per leg (R9, A4): a clean run of another leg never expires this leg's rows
    if ((cleans[i].row.leg || 'unit') !== (o.leg || 'unit')) continue;
    const run = runs.get(cleans[i].row.run_id);
    if (run && run.end && run.end.tainted === true) continue;
    const h = gateFoldMs(run && run.start ? run.start.at : cleans[i].row.at);
    if (Number.isFinite(h)) { horizon = h; break; }
  }
  const lastCorruptPos = corrupts.length ? Math.max(...corrupts.map((c) => c.pos)) : -1;

  // steps 4-5: corrupt voiding and normalisation of every finish
  const norm = finishes.map((f) => {
    const r = f.row;
    let res = r.result === 'DESELECTED' ? 'SKIPPED' : r.result;
    let inv = false;
    if (res === 'PASS' && !gatePassInvariant(r)) { res = 'FAIL'; inv = true; }
    let ignore = null;
    if (res === 'PASS' || res === 'SKIPPED') {
      const run = runs.get(r.run_id);
      if (lastCorruptPos > f.pos) ignore = 'voided-by-corrupt';
      else if (run && run.end && run.end.tainted === true) ignore = 'tainted-run';
      else if (!(run && run.end) && live.has(r.run_id)) ignore = 'live-run';
      else if (!o.resume && (!(run && run.end) || run.end.verdict === 'GATE_INTERRUPTED')) ignore = 'interrupted-run';
    }
    return { pos: f.pos, row: r, res, inv, ignore, at: gateFoldMs(r.at) };
  });

  // step 9: FLAKY carry-over from another key of the same file (A5)
  let flakyAt = null;
  const byKey = new Map();
  for (const f of norm) {
    if (f.ignore === 'voided-by-corrupt') continue;
    if (!byKey.has(f.row.key)) byKey.set(f.row.key, []);
    byKey.get(f.row.key).push(f);
  }
  for (const [k, list] of byKey) {
    if (k === K) continue;
    let prev = null;
    for (const f of list) {
      let ev = false;
      if (f.res === 'PASS' && f.row.retried === true) ev = true;
      if (prev && ((prev.res === 'PASS' && f.res === 'FAIL') || (prev.res === 'FAIL' && f.res === 'PASS'))) ev = true;
      if (ev && Number.isFinite(f.at) && (flakyAt === null || f.at > flakyAt)) flakyAt = f.at;
      if (f.res === 'PASS' || f.res === 'FAIL') prev = f;
    }
  }
  const carry = flakyAt !== null && now < flakyAt + o.flakyCarryMs;

  // step 6: key-scoped machine
  const onKey = norm.filter((f) => f.row.key === K);
  const usable = onKey.filter((f) => f.ignore === null);
  let st = carry ? 'FLAKY' : 'NEVER_RUN';
  let n = 0;
  let carried = carry;
  let decisive = null;
  for (const f of usable) {
    if (f.res === 'PASS') {
      if (f.row.retried === true) { st = 'FLAKY'; n = 0; carried = false; }
      else if (st === 'FAIL') { st = 'FLAKY'; n = 1; carried = false; }
      else if (st === 'FLAKY') { n++; if (n >= 2) { st = 'PASS'; n = 0; } }
      else st = 'PASS';
      decisive = f;
    } else if (f.res === 'FAIL') {
      if (st === 'PASS' || st === 'FLAKY') { st = 'FLAKY'; n = 0; carried = false; } else st = 'FAIL';
      decisive = f;
    } else if (f.res === 'SKIPPED') {
      if (st !== 'FAIL' && st !== 'FLAKY') { st = 'SKIPPED'; decisive = f; }
    }
  }

  // step 7: kills and live starts on the key
  const finished = new Set(finishes.map((f) => f.row.run_id + '\0' + f.row.file + '\0' + (f.row.leg || 'unit')));
  const lastFinishOnKey = onKey.length ? Math.max(...onKey.map((f) => f.pos)) : -1;
  let kills = 0;
  let lastOpen = null;
  let lastOpenFilePos = -1;
  for (const s of starts) {
    if (finished.has(s.row.run_id + '\0' + s.row.file + '\0' + (s.row.leg || 'unit'))) continue;
    lastOpenFilePos = Math.max(lastOpenFilePos, s.pos);
    if (s.row.key !== K || s.pos <= lastFinishOnKey) continue;
    const run = runs.get(s.row.run_id);
    const running = !(run && run.end) && live.has(s.row.run_id);
    if (!running) kills++;
    if (!lastOpen || s.pos > lastOpen.pos) lastOpen = { pos: s.pos, running };
  }
  out.kills = kills;

  // step 4 (state): the latest item for the file is a corrupt line attributed to it => CORRUPT
  const lastAttributedCorrupt = corrupts.filter((c) => c.attributed).reduce((m, c) => Math.max(m, c.pos), -1);
  const lastFileEvent = Math.max(finishes.length ? Math.max(...finishes.map((f) => f.pos)) : -1, lastOpenFilePos);
  if (lastAttributedCorrupt > lastFileEvent) {
    out.state = 'CORRUPT';
    out.reason = 'voided-by-corrupt';
    return out;
  }
  if (lastOpen) {
    if (lastOpen.running) { out.state = 'RUNNING'; out.reason = 'live-run'; return out; }
    out.state = kills >= 2 ? 'SUSPECT_KILLER' : 'KILLED';
    out.reason = kills >= 2 ? 'suspect-killer' : 'killed';
    return out;
  }

  // step 8: UNSTABLE_UNDER_REUSE (file level, any key)
  let u = null;
  let uPos = -1;
  const nonCleanPass = new Set();
  for (const f of norm) {
    if (f.ignore === 'voided-by-corrupt') continue;
    if (f.res === 'PASS' && f.row.clean !== true) nonCleanPass.add(f.row.key);
    if (f.row.clean === true && f.res === 'FAIL' && nonCleanPass.has(f.row.key) && Number.isFinite(f.at)) { u = f.at; uPos = f.pos; }
  }
  if (u !== null) {
    const until = u + o.unstableMs;
    const cleanAfter = norm.filter((f) => f.pos > uPos && f.row.clean === true && (f.res === 'FAIL' || (f.ignore === null && f.res === 'PASS')));
    const last2 = cleanAfter.slice(-2);
    const cleared = now >= until && last2.length === 2 && last2.every((f) => f.res === 'PASS');
    if (!cleared) {
      out.state = 'UNSTABLE_UNDER_REUSE';
      out.unstableUntil = until;
      out.reason = 'unstable';
      return out;
    }
  }

  // step 10: no usable finish on the key
  if (usable.length === 0) {
    // A5: FLAKY is file-sticky for 7 days across a key change, even before the new key has a row (streak 0)
    if (carry) {
      const others = norm.filter((f) => f.row.key !== K);
      if (others.length) {
        const prev = others[others.length - 1].row.components || {};
        const nowC = keyNow.components || {};
        out.invalidated = GATE_COMPONENT_ORDER.filter((c) => (prev[c] === undefined ? null : prev[c]) !== (nowC[c] === undefined ? null : nowC[c]));
      }
      out.state = 'FLAKY';
      out.flakyPasses = 0;
      out.reason = 'flaky-carry';
      return out;
    }
    const ignored = onKey.filter((f) => f.ignore !== null);
    if (ignored.length) {
      out.reason = ignored[ignored.length - 1].ignore;
      return out;
    }
    const others = norm.filter((f) => f.row.key !== K);
    if (others.length) {
      const prev = others[others.length - 1].row.components || {};
      const nowC = keyNow.components || {};
      out.invalidated = GATE_COMPONENT_ORDER.filter((c) => (prev[c] === undefined ? null : prev[c]) !== (nowC[c] === undefined ? null : nowC[c]));
      out.reason = 'invalidated';
      return out;
    }
    out.reason = 'no-row';
    return out;
  }

  out.state = st;
  out.flakyPasses = st === 'FLAKY' ? n : 0;
  if (st === 'FLAKY') { out.reason = carried ? 'flaky-carry' : 'flaky'; return out; }
  if (st === 'FAIL') { out.reason = decisive && decisive.inv ? 'pass-invariant' : 'failed'; return out; }
  if (st === 'NEVER_RUN') { out.reason = 'no-row'; return out; }
  // step 11: age of a PASS or SKIPPED
  out.passRow = { run_id: decisive.row.run_id, at: decisive.row.at };
  const at = decisive.at;
  if (!Number.isFinite(at) || at > now + o.skewMs) { out.reason = 'future-timestamp'; return out; }
  if (at < now - o.ttlMs || (horizon !== null && at < horizon)) { out.state = 'EXPIRED'; out.reason = 'expired'; return out; }
  out.reuse = st;
  out.reason = st === 'PASS' ? 'ok' : 'skipped';
  return out;
}
// == end fold: pure ==

// == salt (D7) ==
export function gateStoreSalt(store, opts) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  const log = (opts && opts.log) || ((m) => process.stderr.write(m + '\n'));
  const file = path.join(store.dir, '.salt');
  fs.mkdirSync(store.dir, { recursive: true });
  const read = () => readRegularFile(file, 4096, { noFollow: true });
  let bytes = null;
  try { bytes = read(); } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
    writeFileOnce(file, crypto.randomBytes(32), 0o600);
    bytes = read();
  }
  if (bytes.length !== 32) {
    atomicWrite(file, crypto.randomBytes(32), { mode: 0o600 });
    log('[gate-results] salt rotated');
    bytes = read();
  }
  try {
    const st = fs.statSync(file);
    if ((st.mode & 0o777) !== 0o600) fs.chmodSync(file, 0o600);
  } catch { /* best effort */ }
  return Buffer.from(bytes);
}

// == failure side files (D8) ==
export function gateStoreRedact(text, redactValues) {
  let out = String(text);
  const forms = [];
  for (const [name, value] of Object.entries(redactValues || {})) {
    if (typeof value !== 'string' || value.length < 6) continue;
    forms.push([value, name]);
    const esc = JSON.stringify(value).slice(1, -1);
    if (esc !== value) forms.push([esc, name]);
  }
  forms.sort((a, b) => b[0].length - a[0].length);
  for (const [form, name] of forms) if (out.includes(form)) out = out.split(form).join('[REDACTED:' + name + ']');
  return out;
}

export function gateStoreFailureWrite(store, text, redactValues) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  let bytes = Buffer.from(gateStoreRedact(text, redactValues), 'utf8');
  if (bytes.length > GATE_FAILURE_CAP) {
    const marker = Buffer.from('\n[truncated]\n', 'utf8');
    bytes = Buffer.concat([Buffer.from(bytes.subarray(0, GATE_FAILURE_CAP - marker.length).toString('utf8'), 'utf8'), marker]);
  }
  const sha = sha256Bytes(bytes);
  writeFileOnce(path.join(store.dir, 'failures', sha + '.txt'), bytes, 0o644);
  return 'failures/' + sha + '.txt';
}

// == blob memo file (D9) ==
export function gateStoreMemoLine(entry) {
  const r = { b: entry.b, s: entry.s, w: entry.w || {} };
  return canonicalJson({ ...r, crc: gateRowCrc(r) });
}

export function gateStoreMemoRead(store, file) {
  const memo = new Map();
  if (!store || !store.dir) return memo;
  const r = gateStoreReadFile(file || path.join(store.dir, 'blobmemo.jsonl'));
  if (!r.bytes) return memo;
  for (const raw of gateStoreSplit(r.bytes)) {
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (!obj || typeof obj.b !== 'string' || typeof obj.s !== 'string' || typeof obj.crc !== 'string') continue;
    if (!/^[0-9a-f]{40,64}$/.test(obj.b) || !/^[0-9a-f]{64}$/.test(obj.s)) continue;
    const rest = { ...obj };
    delete rest.crc;
    if (gateRowCrc(rest) !== obj.crc) continue;
    const prev = memo.get(obj.b);
    memo.set(obj.b, { s: obj.s, w: { ...(prev ? prev.w : {}), ...(obj.w && typeof obj.w === 'object' ? obj.w : {}) } });
  }
  return memo;
}

export function gateStoreMemoAppend(store, entries) {
  if (!store || !store.dir) return 0;
  const file = path.join(store.dir, 'blobmemo.jsonl');
  let n = 0;
  for (const e of entries || []) {
    if (!e || !/^[0-9a-f]{40,64}$/.test(e.b || '') || !/^[0-9a-f]{64}$/.test(e.s || '')) continue;
    const buf = Buffer.from(gateStoreMemoLine(e) + '\n', 'utf8');
    if (buf.length > 4096) continue;
    appendRecord(file, buf);
    n++;
  }
  return n;
}

// == live-owner lock (D10) ==
function gateStoreLockOwner(lockDir) {
  try {
    const obj = JSON.parse(readRegularFile(path.join(lockDir, 'owner.json'), 65536).toString('utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

export function gateStoreLock(store, opts) {
  if (!store || !store.dir) return { ok: false, outcome: 'GATE_STORE_UNAVAILABLE' };
  const procStart = (opts && opts.procStart) || gateStoreProcStartDefault;
  const lockDir = path.join(store.dir, '.lock');
  fs.mkdirSync(store.dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      const nonce = crypto.randomBytes(8).toString('hex');
      let pidStart = null;
      try { pidStart = procStart(process.pid); } catch { pidStart = null; }
      const owner = { pid: process.pid, pid_start: pidStart === undefined ? null : pidStart, cwd: process.cwd(), at: new Date().toISOString(), nonce };
      atomicWrite(path.join(lockDir, 'owner.json'), Buffer.from(JSON.stringify(owner) + '\n', 'utf8'));
      return { ok: true, nonce, dir: lockDir };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
    const owner = gateStoreLockOwner(lockDir);
    let dead;
    if (owner) dead = !gateStorePidAlive(owner.pid, owner.pid_start, procStart);
    else {
      let age = 0;
      try { age = Date.now() - fs.statSync(lockDir).mtimeMs; } catch { age = Infinity; }
      dead = age > GATE_STORE_LOCK_STALE_MS;
    }
    if (!dead) return { ok: false, outcome: 'COMPACTION_BUSY', owner };
    const stale = path.join(store.dir, '.lock.stale-' + (owner && owner.pid ? owner.pid : 0) + '-' + crypto.randomBytes(4).toString('hex'));
    try { fs.renameSync(lockDir, stale); } catch { /* another reclaimer won; retry mkdir */ }
    try { fs.rmSync(stale, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  return { ok: false, outcome: 'COMPACTION_BUSY', owner: gateStoreLockOwner(lockDir) };
}

export function gateStoreUnlock(store, lock) {
  if (!store || !store.dir || !lock || !lock.nonce) return false;
  const lockDir = path.join(store.dir, '.lock');
  const owner = gateStoreLockOwner(lockDir);
  if (!owner || owner.nonce !== lock.nonce) return false;
  const gone = path.join(store.dir, '.lock.released-' + crypto.randomBytes(4).toString('hex'));
  try { fs.renameSync(lockDir, gone); } catch { return false; }
  try { fs.rmSync(gone, { recursive: true, force: true }); } catch { /* best effort */ }
  return true;
}

// == compaction (D11, D12; CONTRACT §8 M5) ==
// Fold-preserving reduction over scan-ordered lines: drops only (1) start/finish duplicates on
// (type, run_id, file, leg) after the first, (2) start rows whose (run_id, file, leg) has a finish, and (3) run rows
// (run_start, run_end) of runs that own no kept row and wrote no clean row. Corrupt lines are kept verbatim. Every
// other row is kept, so fold(compact(rows)) equals fold(rows) for every key and every now (T-L1-14).
export function gateStoreReduce(lines) {
  const parsed = lines.map((l) => ({ raw: l.raw, row: gateRowParse(l.raw) }));
  const finished = new Set();
  for (const p of parsed) {
    if (p.row && p.row.type === 'finish') finished.add(p.row.run_id + '\0' + p.row.file + '\0' + (p.row.leg || 'unit'));
  }
  const seen = new Set();
  const keep = parsed.map(() => true);
  const owning = new Set();
  parsed.forEach((p, i) => {
    const r = p.row;
    if (!r) return;
    if (r.type === 'start' || r.type === 'finish') {
      const k = r.type + '\0' + r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit');
      if (seen.has(k)) { keep[i] = false; return; }
      seen.add(k);
      if (r.type === 'start' && finished.has(r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit'))) { keep[i] = false; return; }
      owning.add(r.run_id);
    }
    if (r.type === 'clean') owning.add(r.run_id);
  });
  parsed.forEach((p, i) => {
    const r = p.row;
    if (r && (r.type === 'run_start' || r.type === 'run_end') && !owning.has(r.run_id)) keep[i] = false;
  });
  return parsed.filter((_, i) => keep[i]).map((p) => p.raw);
}

function gateStoreSleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function gateStoreSizes(dir) {
  const out = {};
  for (const s of gateStoreSegments(dir)) {
    try { out[s.name] = fs.statSync(path.join(dir, s.name)).size; } catch { /* vanished */ }
  }
  return out;
}

export function gateStoreFlakyView(store, lines, now) {
  const items = lines.map((raw, pos) => gateStoreItem(raw, pos));
  const byFile = new Map();
  for (const it of items) {
    if (!it.ok || it.row.type !== 'finish') continue;
    byFile.set(it.row.file + '\0' + (it.row.leg || 'unit'), it.row);
  }
  const files = [];
  for (const [fk, last] of byFile) {
    const [file, leg] = fk.split('\0');
    const f = gateFold(items, { key: last.key, components: last.components || {} }, now, { file, leg, resume: true });
    if (f.state === 'FLAKY' || f.state === 'UNSTABLE_UNDER_REUSE') files.push({ file, leg, key: last.key, state: f.state });
  }
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.leg < b.leg ? -1 : 1));
  atomicWriteJson(path.join(store.dir, 'views', 'flaky.json'), { schema: 'rtg-flaky-view/1', at: new Date(now).toISOString(), files });
  return files.length;
}

// gateStoreCompact(store, {now, env, procStart, settleMs, log}) => {outcome, states, ...}
// outcome: COMPACTED | COMPACTION_BUSY | ROLLED_BACK (states lists COMPACTING, COMPACTION_ABORTED, ROLLED_BACK).
export function gateStoreCompact(store, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const fault = env.DO_IT_FAULT || '';
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const log = o.log || ((m) => process.stderr.write(m + '\n'));
  const settleMs = Number.isFinite(o.settleMs) ? o.settleMs : 250;
  if (!store || !store.dir) return { outcome: 'GATE_STORE_UNAVAILABLE', states: [] };
  const states = ['COMPACTING'];
  const lock = gateStoreLock(store, o);
  if (!lock.ok) return { outcome: 'COMPACTION_BUSY', states: ['COMPACTION_BUSY'], owner: lock.owner || null };
  const dir = store.dir;
  const tmpDir = path.join(dir, 'tmp');
  const tmpBase = path.join(tmpDir, 'base-' + lock.nonce + '.jsonl');
  try {
    // 2: freeze the active file as the next segment
    const before = gateStoreReadAll(store, { withActive: false });
    let maxN = 0;
    for (const s of gateStoreSegments(dir)) maxN = Math.max(maxN, s.n);
    for (const name of Object.keys(before.absorbedOld)) {
      const m = GATE_STORE_SEG_RE.exec(name);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    const active = path.join(dir, GATE_STORE_ROWS);
    let st = null;
    try { st = fs.statSync(active); } catch { st = null; }
    if (st && st.size > 0) fs.renameSync(active, path.join(dir, 'results.seg-' + (maxN + 1) + '.jsonl'));
    // 3: wait until every frozen segment's size is stable across two reads settleMs apart
    let prev = gateStoreSizes(dir);
    for (let i = 0; i < 40; i++) {
      gateStoreSleep(settleMs);
      const cur = gateStoreSizes(dir);
      if (canonicalJson(cur) === canonicalJson(prev)) break;
      prev = cur;
    }
    // 4: read base + segment tails, reduce, write the temp base
    const read = gateStoreReadAll(store, { withActive: false });
    if (read.source !== 'local') throw fail('GATE_STORE_UNAVAILABLE', 1, {});
    const late = read.lines.filter((l) => l.tail && Object.prototype.hasOwnProperty.call(read.absorbedOld, l.from)).length;
    const kept = gateStoreReduce(read.lines);
    const absorbed = {};
    for (const [name, size] of Object.entries(read.segSizes)) absorbed[name] = size;
    const metaBody = { schema: GATE_STORE_BASE_SCHEMA, absorbed, at: new Date(now).toISOString() };
    const metaLine = canonicalJson({ ...metaBody, crc: gateRowCrc(metaBody) });
    const buf = Buffer.from([metaLine, ...kept].join('\n') + '\n', 'utf8');
    atomicWrite(tmpBase, buf);
    if (fault === 'compact_after_tmp') throw fail('FAULT_INJECTED', 1, { fault });
    if (fault === 'compact_steal_lock') {
      atomicWrite(path.join(dir, '.lock', 'owner.json'), Buffer.from(JSON.stringify({ pid: process.pid, pid_start: null, cwd: process.cwd(), at: new Date().toISOString(), nonce: 'stolen-' + crypto.randomBytes(4).toString('hex') }) + '\n', 'utf8'));
    }
    const owner = gateStoreLockOwner(path.join(dir, '.lock'));
    if (!owner || owner.nonce !== lock.nonce) throw fail('COMPACTION_LOCK_LOST', 1, {});
    fs.renameSync(tmpBase, path.join(dir, GATE_STORE_BASE));
    if (fault === 'compact_after_base_rename') throw fail('FAULT_INJECTED', 1, { fault });
    // 5: segments absorbed by the previous compaction are now absorbed twice over; remove them
    for (const name of Object.keys(read.absorbedOld)) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* already gone */ }
    }
    if (late > 0) log('[gate-results] ' + late + ' late rows recovered');
    // 6: derived view, release
    try { gateStoreFlakyView(store, kept, now); } catch { /* derived, never authoritative */ }
    gateStoreUnlock(store, lock);
    states.push('COMPACTED');
    return { outcome: 'COMPACTED', states, kept: kept.length, read: read.lines.length, late };
  } catch (e) {
    states.push('COMPACTION_ABORTED');
    try { fs.rmSync(tmpBase, { force: true }); } catch { /* best effort */ }
    for (const d of [dir, tmpDir]) {
      let names = [];
      try { names = fs.readdirSync(d); } catch { names = []; }
      for (const n of names) if (/\.tmp-\d+-[0-9a-f]{8}$/.test(n)) { try { fs.unlinkSync(path.join(d, n)); } catch { /* best effort */ } }
    }
    gateStoreUnlock(store, lock);
    states.push('ROLLED_BACK');
    return { outcome: 'ROLLED_BACK', states, error: e && (e.outcome || e.code || e.message) };
  }
}
