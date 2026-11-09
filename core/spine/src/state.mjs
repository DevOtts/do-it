import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSafe } from './ctx.mjs';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { REGISTRY_READ_CAP, STATE_READ_CAP, atomicWrite, jsonBytes, readRegularFile } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';
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
  const bytes = jsonBytes(state);
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
    bytes = readRegularFile(path.join(dir, 'state.json'), STATE_READ_CAP);
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('RUN_NOT_FOUND', 1, { run_id: runId });
    throw e;
  }
  let sidecar = null;
  try { sidecar = readRegularFile(path.join(dir, '.state.sha256'), REGISTRY_READ_CAP).toString('utf8').trim(); } catch { /* missing, or not a regular file */ }
  if (sidecar === null) throw tamperFail(ctx, runId, 'sidecar_missing');
  if (sidecar !== sha256Bytes(bytes)) throw tamperFail(ctx, runId, 'digest_mismatch');
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { throw tamperFail(ctx, runId, 'unparseable'); }
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw tamperFail(ctx, runId, 'schema_invalid');
  // a run folder holds only its own run: a copied runs/<id>z with the same run_id is not that run (CP-03 R2-L10)
  if (state.run_id !== runId) throw tamperFail(ctx, runId, 'run_id_mismatch');
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
// Returns { run, owned, status, legacy, unreadable, ranked }: the newest owned run that still gates (else the
// newest owned run), the count of legacy runs, the ids whose state.json cannot be parsed, and every owned
// run ranked the same way ({ id, created, status }).
export function selectScopedRunId(ctx, scope) {
  const owned = [];
  const unreadable = [];
  let legacy = 0;
  for (const id of listRunIds(ctx)) {
    let st;
    try { st = JSON.parse(readRegularFile(path.join(runDir(ctx, id), 'state.json'), STATE_READ_CAP).toString('utf8')); } catch { unreadable.push(id); continue; }
    const o = st && st.owner;
    if (!o || typeof o !== 'object') { legacy += 1; continue; }
    let mine = false;
    if (scope.session) mine = !!o.session_id && o.session_id === scope.session;
    else if (!o.session_id && o.cwd && scope.cwd) mine = cwdInside(o.cwd, scope.cwd);
    if (mine) owned.push({ id, created: st.created_at || '', status: st.status });
  }
  owned.sort((a, b) => (a.created === b.created ? (a.id < b.id ? 1 : -1) : (a.created < b.created ? 1 : -1)));
  const gating = owned.filter((r) => !NON_GATING_STATUSES.includes(r.status));
  // ranked: every owned run, the gating ones first, each group newest first
  const ranked = [...gating, ...owned.filter((r) => NON_GATING_STATUSES.includes(r.status))];
  const pick = ranked[0] || null;
  return { run: pick ? pick.id : null, owned: !!pick, status: pick ? pick.status : null, legacy, unreadable, ranked };
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
      if (st.run_id !== id) throw new Error('run_id');
    } catch { bad.push(id); }
  }
  return bad;
}

// Every explicit take-over of the run (resume --run <id> --take-over), oldest first: { from, to, at }.
// owner.history records the session that was replaced and when; the next entry (or the current owner)
// is the session that took over. `status` shows the last one and `conclude` lists them (CP-03 R2-L1).
export function takeOvers(state) {
  const o = state && state.owner && typeof state.owner === 'object' ? state.owner : null;
  const h = o && Array.isArray(o.history) ? o.history : [];
  const out = [];
  h.forEach((e, i) => {
    if (!e || e.reason !== 'take_over') return;
    const next = h[i + 1];
    out.push({ from: e.session_id || null, to: next ? (next.session_id || null) : (o.session_id || null), at: e.until || null });
  });
  return out;
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

// The command that owns each non-gating status (CP-03 R3-S1-H6). A run enters a status that does not gate a
// stop only through the command that checks what that status claims: DONE through `gate conclude` (G-13:
// every row accounted, no live worker, no pending wake, deploy legs re-verified), PARKED through `park` or
// the stop gate at patience, NEEDS_HUMAN / AWAIT_RATIFY through an owner-pack question, BLOCKED / FAILED /
// ESCALATED through `record` with a reason. `gate advance` never reaches one, or the agent the gate holds
// could switch the gate off with two commands.
export const NON_GATING_OWNERS = {
  DONE: 'gate conclude',
  PARKED: 'park (or the stop gate at patience)',
  NEEDS_HUMAN: 'record (a needs_human result with at least one owner-pack question)',
  AWAIT_RATIFY: 'the owner pack / readiness (gate build)',
  BLOCKED: 'record (a blocked result with a reason) or gate build on a blocked readiness',
  FAILED: 'record (a failed result with a reason, or a deploy-legs result while deploying whose failed legs carry evidence)',
  ESCALATED: 'record (ladder or rollback), handoff at its cap, or gate escalate --reason from NEEDS_HUMAN or FAILED',
};

// CP-03 R5-S1-H9: the one guard on every path into FAILED, BLOCKED or NEEDS_HUMAN. All three switch the stop
// gate off (CONTRACT 3.1), so the run must say why: FAILED and BLOCKED need a reason (kept as
// state.status_reason), NEEDS_HUMAN needs a question that lands open in the owner pack. `record` (run-level,
// slice settle and deploy legs alike) and `gate build` (missing credential) call it before they write.
export const CAUSE_REQUIRED = { FAILED: 'FAIL_REASON_REQUIRED', BLOCKED: 'BLOCK_REASON_REQUIRED', NEEDS_HUMAN: 'NEEDS_HUMAN_WITHOUT_QUESTION' };

// A reason is text with something in it: invisible and space characters are stripped first, and a
// placeholder (".", "x", "n/a", "TODO", "-", ...) or text with fewer than 3 letters or digits is no reason
// (CP-03 R5-S1-L1). A code such as STALE_HEAD or NO_CHANNEL_REACHED is a reason.
const PLACEHOLDER_REASONS = new Set(['n/a', 'na', 'none', 'null', 'nil', 'todo', 'tbd', 'tba', 'fixme', 'wip', 'unknown', 'reason', 'no reason', 'xxx', 'xx', 'x', '?', '...', '-', '--', '.']);
export function cleanReason(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/[\p{White_Space}\u200B-\u200D\u2060\uFEFF\u00AD]+/gu, ' ').trim();
  if (!t) return null;
  if (PLACEHOLDER_REASONS.has(t.toLowerCase())) return null;
  if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 3) return null;
  return t;
}

// Returns the reason to store (FAILED, BLOCKED) or null; throws the status's refusal code when the cause is missing.
// cause: { reason?: string, openQuestion?: boolean }; extra goes into the refusal.
export function guardStatusEntry(from, to, cause, extra) {
  if (!Object.prototype.hasOwnProperty.call(CAUSE_REQUIRED, to) || from === to) return null;
  const c = cause || {};
  if (to === 'NEEDS_HUMAN') {
    if (c.openQuestion) return null;
    throw fail(CAUSE_REQUIRED.NEEDS_HUMAN, 1, {
      from, to, ...(extra || {}),
      message: 'a needs_human result must bring at least one owner-pack question (pending_human.questions_path); with none, nothing waits on the owner and the run would leave the stop gate',
    });
  }
  const reason = cleanReason(c.reason);
  if (reason) return reason;
  throw fail(CAUSE_REQUIRED[to], 1, {
    from, to, ...(extra || {}),
    message: 'entering ' + to + ' needs a non-empty reason: it ends the stop gate for this run',
  });
}

// gate advance --to STATUS: a move along the M1 lifecycle between statuses that gate, nothing else.
export function advanceRunStatus(ctx, state, to) {
  if (NON_GATING_STATUSES.includes(to)) {
    throw fail('TRANSITION_REFUSED', 1, {
      from: state.status, to, owner: NON_GATING_OWNERS[to],
      message: to + ' does not gate a stop, so gate advance never enters it; only ' + NON_GATING_OWNERS[to] + ' does',
    });
  }
  const allowed = (RUN_TRANSITIONS[state.status] || []).filter((s) => !NON_GATING_STATUSES.includes(s));
  if (!allowed.includes(to)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to, allowed });
  const from = state.status;
  state.status = to;
  writeState(ctx, state);
  appendEvent(ctx, state.run_id, { event: 'status_changed', stage: state.stage, host: state.host, verdict: to, detail: { from, to } });
  return { from, to };
}
