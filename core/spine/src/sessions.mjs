import fs from 'node:fs';
import path from 'node:path';
import { realpathSafe } from './ctx.mjs';
import { REGISTRY_READ_CAP, STATE_READ_CAP, atomicWriteJson, readJsonRegular } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';

// Session registry (CP-03 R3-S1-H7). A session can start a run in one repo and stop while its cwd is in
// another repo, or in a folder that is no repo at all. The stop gate keys on the session owning the run
// (CONTRACT 3.1 row 1), not on the cwd, so `start`, `resume` and a take-over record where each run lives:
//   <user do-it home>/sessions/h-<sha256(session id), 32 hex>/<run id>.json  ->  { session_id, run_id, home, root }
// One file per run (CP-03 R4-S1-M8): a write never rewrites another run's entry, so starts that run at the
// same time cannot lose each other, and pruning deletes only the stale run's own file. Each file is written
// atomically (temp file, then rename). The 1.1 pre-release layout, one `<session id>.json` holding
// { session_id, runs: [...] }, is still read, and is migrated to per-run files on the next write or read.
// The user do-it home is DO_IT_USER_HOME when set (tests), else <HOME>/.do-it. `gate stop --session` looks in
// every home on that list as well as the cwd's. An entry whose home or run is gone, whose run is over
// (DONE, ESCALATED) or now belongs to another session is pruned when the list is read; an entry whose own
// session_id is not the reader's exact id is never read or pruned (R5-S1-M12).
const OVER = ['DONE', 'ESCALATED'];

export function userDoItHome(ctx) {
  const env = ctx.env || {};
  return env.DO_IT_USER_HOME ? path.resolve(ctx.cwd, env.DO_IT_USER_HOME) : path.join(ctx.userHome, '.do-it');
}

// An id becomes a file name as is when it is a plain name, else by digest (never a path). Used for run ids,
// and for the session folders of the round-4 layout (read and migrated only).
function safeName(id) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && !/^\.+$/.test(id) ? id : 'h-' + sha256Bytes(id).slice(0, 32);
}

// CP-03 R5-S1-M12: a session folder is always named by the digest of the exact session id (lowercase hex), so
// two ids that differ only in letter case never share a folder on a case-insensitive disk. Each entry keeps a
// readable copy of the id (session_id), and only entries whose copy equals the reader's id exactly are used.
export function sessionFolderName(sessionId) {
  return 'h-' + sha256Bytes(sessionId).slice(0, 32);
}

// The folder holding one file per run of `sessionId`.
export function sessionDir(ctx, sessionId) {
  return path.join(userDoItHome(ctx), 'sessions', sessionFolderName(sessionId));
}

// The round-4 folder (plain ids kept their own name): read and migrated, never written.
function oldSessionDir(ctx, sessionId) {
  return path.join(userDoItHome(ctx), 'sessions', safeName(sessionId));
}

// The pre-release single-file layout (read and migrated, never written).
export function legacySessionFile(ctx, sessionId) {
  return oldSessionDir(ctx, sessionId) + '.json';
}

function runFile(ctx, sessionId, runId) {
  return path.join(sessionDir(ctx, sessionId), safeName(runId) + '.json');
}

const isEntry = (e) => e && typeof e.run_id === 'string' && typeof e.home === 'string';

// CP-03 R5-S1-M10: registry files are read with lstat first: only a regular file (never a symlink, FIFO or
// device), at most 64 KiB. Anything else is reported, never followed or read.
const readRegistryJson = (file) => readJsonRegular(file, REGISTRY_READ_CAP, { noFollow: true });

function readLegacy(file, sessionId) {
  const doc = readRegistryJson(file);
  // the file of a case twin (same folder name on a case-insensitive disk) is not this session's
  if (!doc || doc.session_id !== sessionId) return [];
  return Array.isArray(doc.runs) ? doc.runs.filter(isEntry) : [];
}

// Moves a legacy single file into per-run files: every entry is written first (an existing per-run file
// wins), then the old file is removed, so a crash in between loses nothing.
function migrateLegacy(ctx, sessionId, skip) {
  const file = legacySessionFile(ctx, sessionId);
  if (!fs.existsSync(file)) return;
  for (const e of readLegacy(file, sessionId)) {
    if (skip && skip.has(e.run_id + '\0' + e.home)) continue;
    const f = runFile(ctx, sessionId, e.run_id);
    if (!fs.existsSync(f)) atomicWriteJson(f, { session_id: sessionId, run_id: e.run_id, home: e.home, root: typeof e.root === 'string' ? e.root : path.dirname(e.home) }, { cap: REGISTRY_READ_CAP });
  }
  const doc = readRegistryJson(file);
  if (doc && doc.session_id === sessionId) fs.rmSync(file, { force: true });
}

// Moves this session's entries out of the round-4 folder (named by the plain id) into the digest folder. Only
// entries whose session_id equals this id exactly move; a case twin's entries stay where they are.
function migrateOldDir(ctx, sessionId, skip) {
  const old = oldSessionDir(ctx, sessionId);
  if (old === sessionDir(ctx, sessionId)) return;
  let names;
  try {
    if (!fs.lstatSync(old).isDirectory()) return;
    names = fs.readdirSync(old);
  } catch { return; }
  for (const n of names) {
    if (n.startsWith('.') || !n.endsWith('.json')) continue;
    const from = path.join(old, n);
    let doc;
    try { doc = readRegistryJson(from); } catch { continue; }
    if (!isEntry(doc) || doc.session_id !== sessionId) continue;
    if (!(skip && skip.has(doc.run_id + '\0' + doc.home))) {
      const to = runFile(ctx, sessionId, doc.run_id);
      if (!fs.existsSync(to)) atomicWriteJson(to, { session_id: sessionId, run_id: doc.run_id, home: doc.home, root: typeof doc.root === 'string' ? doc.root : path.dirname(doc.home) }, { cap: REGISTRY_READ_CAP });
    }
    fs.rmSync(from, { force: true });
  }
  try { fs.rmdirSync(old); } catch { /* not empty: a case twin's entries are still there */ }
}

// Every entry of the session: { entries: [{ run_id, home, root, file }], errors: [{ file, error }] }.
// CP-03 R4-S1-M7: a registry file that cannot be read or parsed is reported, never thrown, so one bad file
// cannot take the gate down for the session's other runs (or for the cwd's own run).
function readEntries(ctx, sessionId) {
  const out = [];
  const errors = [];
  // the error names the file and the cause, never the file's content (R5-L5)
  const note = (file, e) => errors.push({ file, error: String(e && e.code ? e.code + ': ' + e.message : (e && e.message) || e) });
  const legacy = legacySessionFile(ctx, sessionId);
  try { for (const e of readLegacy(legacy, sessionId)) out.push({ ...e, file: null, legacy: 'file' }); } catch (e) { note(legacy, e); }
  const readDir = (dir, kind) => {
    let names = [];
    try {
      const st = fs.lstatSync(dir);
      if (!st.isDirectory()) note(dir, Object.assign(new Error('not a directory' + (st.isSymbolicLink() ? ' (symlink, not followed)' : '')), { code: 'ENOTDIR' }));
      else names = fs.readdirSync(dir);
    } catch (e) { if (e.code !== 'ENOENT') note(dir, e); }
    for (const n of names.sort()) {
      if (n.startsWith('.') || !n.endsWith('.json')) continue; // temp files of a write in flight
      const file = path.join(dir, n);
      try {
        const doc = readRegistryJson(file);
        if (!isEntry(doc)) { if (doc !== null) note(file, new Error('not a registry entry')); continue; }
        // R5-S1-M12: an entry is this session's only when its own copy of the id is this exact id
        if (doc.session_id !== sessionId) continue;
        out.push({ run_id: doc.run_id, home: doc.home, root: doc.root, file, ...(kind ? { legacy: kind } : {}) });
      } catch (e) { note(file, e); }
    }
  };
  readDir(sessionDir(ctx, sessionId), null);
  if (oldSessionDir(ctx, sessionId) !== sessionDir(ctx, sessionId)) readDir(oldSessionDir(ctx, sessionId), 'dir');
  return { entries: out, errors };
}

// Records that `runId`, in ctx's home, is owned by `sessionId`. Returns null, or the error text when the
// registry could not be written (the caller reports it: the run then gates only from its own repo).
export function registerSessionRun(ctx, sessionId, runId) {
  if (!sessionId) return null;
  try {
    atomicWriteJson(runFile(ctx, sessionId, runId), { session_id: sessionId, run_id: runId, home: realpathSafe(ctx.home), root: realpathSafe(ctx.root) }, { cap: REGISTRY_READ_CAP });
    try { migrateLegacy(ctx, sessionId); } catch { /* the legacy file is still read */ }
    try { migrateOldDir(ctx, sessionId); } catch { /* the old folder is still read */ }
    return null;
  } catch (e) {
    return String(e && e.message ? e.message : e);
  }
}

function liveEntry(e, sessionId) {
  // a forged run id never walks out of the home's runs folder
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(e.run_id) || /^\.+$/.test(e.run_id)) return false;
  const file = path.join(e.home, 'runs', e.run_id, 'state.json');
  try {
    const st = readJsonRegular(file, STATE_READ_CAP);
    if (!st || OVER.includes(st.status)) return false;
    const o = st.owner;
    return !!(o && typeof o === 'object' && o.session_id === sessionId);
  } catch (err) {
    // a FIFO, device or oversized file is no run state (R5-S1-M10): never read it, drop the entry
    if (err && (err.code === 'ENOTREG' || err.code === 'EFBIG')) return false;
    // a run that is there but unreadable stays listed: the gate reports it, it does not forget it
    return fs.existsSync(file);
  }
}

// Every home that holds a live run of `sessionId`, pruning stale entries.
// Returns { homes: [{ home, root }], errors: [{ file, error }] }; it never throws (R4-S1-M7).
export function sessionHomes(ctx, sessionId) {
  if (!sessionId) return { homes: [], errors: [] };
  let all;
  let errors;
  try {
    ({ entries: all, errors } = readEntries(ctx, sessionId));
  } catch (e) {
    return { homes: [], errors: [{ file: sessionDir(ctx, sessionId), error: String(e && e.message ? e.message : e) }] };
  }
  if (!all.length) return { homes: [], errors };
  const keep = all.filter((e) => liveEntry(e, sessionId));
  const stale = all.filter((e) => !keep.includes(e));
  // pruning is best effort and touches only the stale run's own file; the live entries are still used
  for (const e of stale) if (e.file && !e.legacy) { try { fs.rmSync(e.file, { force: true }); } catch { /* best effort */ } }
  // older layouts move to the digest folder; a stale entry is simply not carried over
  const skip = new Set(stale.filter((e) => e.legacy).map((e) => e.run_id + '\0' + e.home));
  if (all.some((e) => e.legacy === 'file')) { try { migrateLegacy(ctx, sessionId, skip); } catch { /* still read next time */ } }
  if (all.some((e) => e.legacy === 'dir')) { try { migrateOldDir(ctx, sessionId, skip); } catch { /* still read next time */ } }
  const seen = new Set();
  const homes = [];
  for (const e of keep) {
    const home = realpathSafe(e.home);
    if (seen.has(home)) continue;
    seen.add(home);
    homes.push({ home, root: typeof e.root === 'string' ? e.root : path.dirname(home) });
  }
  return { homes, errors };
}
