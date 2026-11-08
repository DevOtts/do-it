import fs from 'node:fs';
import path from 'node:path';
import { realpathSafe } from './ctx.mjs';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';

// Session registry (CP-03 R3-S1-H7). A session can start a run in one repo and stop while its cwd is in
// another repo, or in a folder that is no repo at all. The stop gate keys on the session owning the run
// (CONTRACT 3.1 row 1), not on the cwd, so `start`, `resume` and a take-over record where each run lives:
//   <user do-it home>/sessions/<session id>.json  ->  { session_id, runs: [{ run_id, home, root }] }
// The user do-it home is DO_IT_USER_HOME when set (tests), else <HOME>/.do-it. `gate stop --session` looks in
// every home on that list as well as the cwd's. An entry whose home or run is gone, whose run is over
// (DONE, ESCALATED) or now belongs to another session is pruned when the list is read.
const OVER = ['DONE', 'ESCALATED'];

export function userDoItHome(ctx) {
  const env = ctx.env || {};
  return env.DO_IT_USER_HOME ? path.resolve(ctx.cwd, env.DO_IT_USER_HOME) : path.join(ctx.userHome, '.do-it');
}

// A session id becomes a file name as is when it is a plain name, else by digest (never a path).
export function sessionFile(ctx, sessionId) {
  const name = /^[A-Za-z0-9._-]{1,128}$/.test(sessionId) && !/^\.+$/.test(sessionId) ? sessionId : 'h-' + sha256Bytes(sessionId).slice(0, 32);
  return path.join(userDoItHome(ctx), 'sessions', name + '.json');
}

function readList(file) {
  const doc = readJsonIfExists(file);
  return doc && Array.isArray(doc.runs) ? doc.runs.filter((e) => e && typeof e.run_id === 'string' && typeof e.home === 'string') : [];
}

// Records that `runId`, in ctx's home, is owned by `sessionId`. Returns null, or the error text when the
// registry could not be written (the caller reports it: the run then gates only from its own repo).
export function registerSessionRun(ctx, sessionId, runId) {
  if (!sessionId) return null;
  try {
    const file = sessionFile(ctx, sessionId);
    const home = realpathSafe(ctx.home);
    const runs = readList(file).filter((e) => !(e.run_id === runId && realpathSafe(e.home) === home));
    runs.push({ run_id: runId, home, root: realpathSafe(ctx.root) });
    atomicWriteJson(file, { session_id: sessionId, runs });
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
  const file = sessionFile(ctx, sessionId);
  const all = readList(file);
  if (!all.length) return [];
  const keep = all.filter((e) => liveEntry(e, sessionId));
  if (keep.length !== all.length) {
    try {
      if (keep.length) atomicWriteJson(file, { session_id: sessionId, runs: keep });
      else fs.rmSync(file, { force: true });
    } catch { /* pruning is best effort; the live entries are still used */ }
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
