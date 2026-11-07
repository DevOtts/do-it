import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSafe } from './ctx.mjs';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { atomicWrite } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';
import { redactText } from './redact.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';

// The only module that writes run state (G-1): state.json and its sidecar digest.
export function runDir(ctx, runId) {
  return path.join(ctx.home, 'runs', runId);
}

export function newRunId(ctx) {
  const stamp = ctx.now().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return 'r-' + stamp + '-' + crypto.randomBytes(2).toString('hex');
}

export function newState(ctx, runId, fields) {
  const now = ctx.now();
  return {
    schema: 'do-it-state/1',
    run_id: runId,
    preset: fields.preset === undefined ? null : fields.preset,
    request: fields.request,
    status: 'INTAKE',
    size: fields.size === undefined ? null : fields.size,
    host: fields.host === undefined ? null : fields.host,
    owner: fields.owner === undefined ? null : fields.owner,
    stage: 'intake',
    slices: [],
    gates: {},
    handoffs: 0,
    stop_refusals: 0,
    review: { round: 0, exit: null },
    created_at: now,
    updated_at: now,
  };
}

// Validate, then temp-fsync-rename state.json and its .state.sha256 sidecar.
export function writeState(ctx, state) {
  state.updated_at = ctx.now();
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw fail('STATE_INVALID', 1, { errors });
  const dir = runDir(ctx, state.run_id);
  const bytes = redactText(JSON.stringify(state, null, 2) + '\n');
  const fault = ctx.env.DO_IT_FAULT === 'after_tmp';
  atomicWrite(path.join(dir, 'state.json'), bytes, { faultAfterTmp: fault });
  atomicWrite(path.join(dir, '.state.sha256'), sha256Bytes(bytes) + '\n');
  return state;
}

export function tamperFail(ctx, runId, reason) {
  try {
    appendEvent(ctx, runId, { event: 'state_tamper_detected', stage: null, detail: { reason } });
  } catch {
    // the refusal must still be reported when the event log is unwritable
  }
  return fail('STATE_TAMPERED', 1, { run_id: runId, reason });
}

// Every command re-reads state and compares it with the sidecar. A mismatch is
// reported and never repaired.
export function loadState(ctx, runId) {
  const dir = runDir(ctx, runId);
  let bytes;
  try {
    bytes = fs.readFileSync(path.join(dir, 'state.json'));
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('RUN_NOT_FOUND', 1, { run_id: runId });
    throw e;
  }
  let sidecar = null;
  try { sidecar = fs.readFileSync(path.join(dir, '.state.sha256'), 'utf8').trim(); } catch { /* missing */ }
  if (sidecar === null) throw tamperFail(ctx, runId, 'sidecar_missing');
  if (sidecar !== sha256Bytes(bytes)) throw tamperFail(ctx, runId, 'digest_mismatch');
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { throw tamperFail(ctx, runId, 'unparseable'); }
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw tamperFail(ctx, runId, 'schema_invalid');
  return state;
}

export function listRunIds(ctx) {
  const base = path.join(ctx.home, 'runs');
  let names = [];
  try { names = fs.readdirSync(base); } catch { return []; }
  return names.filter((n) => fs.existsSync(path.join(base, n, 'state.json'))).sort();
}

// Newest run by created_at (ties by id); --run picks one explicitly.
export function selectRunId(ctx, flags) {
  if (flags && flags.run) {
    if (!fs.existsSync(path.join(runDir(ctx, flags.run), 'state.json'))) throw fail('RUN_NOT_FOUND', 1, { run_id: flags.run });
    return flags.run;
  }
  const ids = listRunIds(ctx);
  if (!ids.length) throw fail('NO_RUN', 1, { home: ctx.home });
  let best = null;
  for (const id of ids) {
    let created = '';
    try { created = JSON.parse(fs.readFileSync(path.join(runDir(ctx, id), 'state.json'), 'utf8')).created_at || ''; } catch { /* tampered: still selectable */ }
    if (!best || created > best.created || (created === best.created && id > best.id)) best = { id, created };
  }
  return best.id;
}

// Statuses that never gate a stop (CONTRACT 3.1): the run is waiting on a human, parked, or over.
// Every other status gates.
export const NON_GATING_STATUSES = ['PARKED', 'NEEDS_HUMAN', 'BLOCKED', 'AWAIT_RATIFY', 'DONE', 'ESCALATED', 'FAILED'];

function cwdInside(ownerCwd, cwd) {
  const rel = path.relative(realpathSafe(ownerCwd), realpathSafe(cwd));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Which run does the hook's session own? Ownership is recorded once, at `start`, in
// owner.session_id. A hook that names a session matches on that id only. The cwd is a fallback
// only for a host that gave no session and a run that has none (a run whose session is null).
// A run with no owner object (state written before ownership existed) is never owned.
// Returns { run, owned, status, legacy, unreadable }: the newest owned run that still gates (else the
// newest owned run), the count of legacy runs, and the ids whose state.json cannot be parsed.
export function selectScopedRunId(ctx, scope) {
  const owned = [];
  const unreadable = [];
  let legacy = 0;
  for (const id of listRunIds(ctx)) {
    let st;
    try { st = JSON.parse(fs.readFileSync(path.join(runDir(ctx, id), 'state.json'), 'utf8')); } catch { unreadable.push(id); continue; }
    const o = st && st.owner;
    if (!o || typeof o !== 'object') { legacy += 1; continue; }
    let mine = false;
    if (scope.session) mine = !!o.session_id && o.session_id === scope.session;
    else if (!o.session_id && o.cwd && scope.cwd) mine = cwdInside(o.cwd, scope.cwd);
    if (mine) owned.push({ id, created: st.created_at || '', status: st.status });
  }
  const newest = (rows) => rows.sort((a, b) => (a.created === b.created ? (a.id < b.id ? 1 : -1) : (a.created < b.created ? 1 : -1)))[0];
  const gating = owned.filter((r) => !NON_GATING_STATUSES.includes(r.status));
  const pick = gating.length ? newest(gating) : (owned.length ? newest(owned) : null);
  return { run: pick ? pick.id : null, owned: !!pick, status: pick ? pick.status : null, legacy, unreadable };
}

// Runs whose state.json fails the same checks loadState makes, reported without side effects.
export function unreadableRuns(ctx) {
  const bad = [];
  for (const id of listRunIds(ctx)) {
    const dir = runDir(ctx, id);
    try {
      const bytes = fs.readFileSync(path.join(dir, 'state.json'));
      const sidecar = fs.readFileSync(path.join(dir, '.state.sha256'), 'utf8').trim();
      if (sidecar !== sha256Bytes(bytes)) throw new Error('digest');
      const st = JSON.parse(bytes.toString('utf8'));
      if (validateSchema(loadSchemaFile('do-it-state.1.schema.json'), st).length) throw new Error('schema');
    } catch { bad.push(id); }
  }
  return bad;
}

// Raw read for callers that only need to know whether a run is in flight.
export function peekRunStatus(ctx, runId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir(ctx, runId), 'state.json'), 'utf8')).status;
  } catch {
    return 'UNREADABLE';
  }
}

export const RUN_TRANSITIONS = {
  INTAKE: ['PLANNING', 'BUILDING'],
  PLANNING: ['AWAIT_RATIFY', 'BUILDING'],
  AWAIT_RATIFY: ['BUILDING', 'NEEDS_HUMAN'],
  BUILDING: ['VERIFYING', 'FAILED', 'PARKED', 'BLOCKED', 'NEEDS_HUMAN', 'ESCALATED'],
  VERIFYING: ['REVIEWING', 'DEPLOYING', 'CONCLUDING', 'BUILDING'],
  REVIEWING: ['FIXING', 'DEPLOYING', 'CONCLUDING'],
  FIXING: ['VERIFYING'],
  DEPLOYING: ['PROVING', 'PARTIAL_FAILURE', 'FAILED'],
  PROVING: ['CONCLUDING', 'DONE'],
  CONCLUDING: ['DONE'],
  FAILED: ['BUILDING', 'ESCALATED'],
  PARTIAL_FAILURE: ['ROLLED_BACK', 'ESCALATED'],
  ROLLED_BACK: ['DEPLOYING', 'ESCALATED'],
  PARKED: ['BUILDING'],
  NEEDS_HUMAN: ['BUILDING', 'ESCALATED'],
  BLOCKED: ['BUILDING'],
  ESCALATED: [],
  DONE: [],
};

// gate advance --to STATUS: a move along the M1 lifecycle, nothing else.
export function advanceRunStatus(ctx, state, to) {
  const allowed = RUN_TRANSITIONS[state.status] || [];
  if (!allowed.includes(to)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to, allowed });
  const from = state.status;
  state.status = to;
  writeState(ctx, state);
  appendEvent(ctx, state.run_id, { event: 'status_changed', stage: state.stage, host: state.host, verdict: to, detail: { from, to } });
  return { from, to };
}
