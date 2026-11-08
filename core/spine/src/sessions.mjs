import fs from 'node:fs';
import path from 'node:path';
import { realpathSafe } from './ctx.mjs';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';

// Session registry (CP-03 R3-S1-H7). A session can start a run in one repo and stop while its cwd is in
// another repo, or in a folder that is no repo at all. The stop gate keys on the session owning the run
// (CONTRACT 3.1 row 1), not on the cwd, so `start`, `resume` and a take-over record where each run lives:
//   <user do-it home>/sessions/<session id>/<run id>.json  ->  { session_id, run_id, home, root }
// One file per run (CP-03 R4-S1-M8): a write never rewrites another run's entry, so starts that run at the
// same time cannot lose each other, and pruning deletes only the stale run's own file. Each file is written
// atomically (temp file, then rename). The 1.1 pre-release layout, one `<session id>.json` holding
// { session_id, runs: [...] }, is still read, and is migrated to per-run files on the next write or read.
// The user do-it home is DO_IT_USER_HOME when set (tests), else <HOME>/.do-it. `gate stop --session` looks in
// every home on that list as well as the cwd's. An entry whose home or run is gone, whose run is over
// (DONE, ESCALATED) or now belongs to another session is pruned when the list is read.
const OVER = ['DONE', 'ESCALATED'];

export function userDoItHome(ctx) {
  const env = ctx.env || {};
  return env.DO_IT_USER_HOME ? path.resolve(ctx.cwd, env.DO_IT_USER_HOME) : path.join(ctx.userHome, '.do-it');
}

// An id becomes a file name as is when it is a plain name, else by digest (never a path).
function safeName(id) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && !/^\.+$/.test(id) ? id : 'h-' + sha256Bytes(id).slice(0, 32);
}

// The folder holding one file per run of `sessionId`.
export function sessionDir(ctx, sessionId) {
  return path.join(userDoItHome(ctx), 'sessions', safeName(sessionId));
}

// The pre-release single-file layout (read and migrated, never written).
export function legacySessionFile(ctx, sessionId) {
  return sessionDir(ctx, sessionId) + '.json';
}

function runFile(ctx, sessionId, runId) {
  return path.join(sessionDir(ctx, sessionId), safeName(runId) + '.json');
}

const isEntry = (e) => e && typeof e.run_id === 'string' && typeof e.home === 'string';

function readLegacy(file) {
  const doc = readJsonIfExists(file);
  return doc && Array.isArray(doc.runs) ? doc.runs.filter(isEntry) : [];
}

// Moves a legacy single file into per-run files: every entry is written first (an existing per-run file
// wins), then the old file is removed, so a crash in between loses nothing.
function migrateLegacy(ctx, sessionId, skip) {
  const file = legacySessionFile(ctx, sessionId);
  if (!fs.existsSync(file)) return;
  for (const e of readLegacy(file)) {
    if (skip && skip.has(e.run_id + '\0' + e.home)) continue;
    const f = runFile(ctx, sessionId, e.run_id);
    if (!fs.existsSync(f)) atomicWriteJson(f, { session_id: sessionId, run_id: e.run_id, home: e.home, root: typeof e.root === 'string' ? e.root : path.dirname(e.home) });
  }
  fs.rmSync(file, { force: true });
}

// Every entry of the session: [{ run_id, home, root, file }].
function readEntries(ctx, sessionId) {
  const out = [];
  for (const e of readLegacy(legacySessionFile(ctx, sessionId))) out.push({ ...e, file: null });
  const dir = sessionDir(ctx, sessionId);
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const n of names.sort()) {
    if (n.startsWith('.') || !n.endsWith('.json')) continue; // temp files of a write in flight
    const file = path.join(dir, n);
    const doc = readJsonIfExists(file);
    if (isEntry(doc)) out.push({ run_id: doc.run_id, home: doc.home, root: doc.root, file });
  }
  return out;
}

// Records that `runId`, in ctx's home, is owned by `sessionId`. Returns null, or the error text when the
// registry could not be written (the caller reports it: the run then gates only from its own repo).
export function registerSessionRun(ctx, sessionId, runId) {
  if (!sessionId) return null;
  try {
    atomicWriteJson(runFile(ctx, sessionId, runId), { session_id: sessionId, run_id: runId, home: realpathSafe(ctx.home), root: realpathSafe(ctx.root) });
    try { migrateLegacy(ctx, sessionId); } catch { /* the legacy file is still read */ }
    return null;
  } catch (e) {
    return String(e && e.message ? e.message : e);
  }
}

function liveEntry(e, sessionId) {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(e.home, 'runs', e.run_id, 'state.json'), 'utf8'));
    if (!st || OVER.includes(st.status)) return false;
    const o = st.owner;
    return !!(o && typeof o === 'object' && o.session_id === sessionId);
  } catch (err) {
    // a run that is there but unreadable stays listed: the gate reports it, it does not forget it
    return fs.existsSync(path.join(e.home, 'runs', e.run_id, 'state.json'));
  }
}

// Every home that holds a live run of `sessionId`, pruning stale entries. Returns [{ home, root }].
export function sessionHomes(ctx, sessionId) {
  if (!sessionId) return [];
  const all = readEntries(ctx, sessionId);
  if (!all.length) return [];
  const keep = all.filter((e) => liveEntry(e, sessionId));
  const stale = all.filter((e) => !keep.includes(e));
  // pruning is best effort and touches only the stale run's own file; the live entries are still used
  for (const e of stale) if (e.file) { try { fs.rmSync(e.file, { force: true }); } catch { /* best effort */ } }
  if (all.some((e) => !e.file)) {
    // a stale legacy entry is simply not carried over
    const skip = new Set(stale.filter((e) => !e.file).map((e) => e.run_id + '\0' + e.home));
    try { migrateLegacy(ctx, sessionId, skip); } catch { /* still read next time */ }
  }
  const seen = new Set();
  const out = [];
  for (const e of keep) {
    const home = realpathSafe(e.home);
    if (seen.has(home)) continue;
    seen.add(home);
    out.push({ home, root: typeof e.root === 'string' ? e.root : path.dirname(home) });
  }
  return out;
}
