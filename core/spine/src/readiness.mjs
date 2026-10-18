import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { finishLineUpsert, readFinishLine, writeFinishLine } from './finish-line.mjs';
import { sha256Bytes } from './hash.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { resolveCredentials } from './secrets.mjs';
import { loadSettings } from './settings.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';

export const CLASS_TIER = { deterministic: 'T3', gather: 'T3', implementation: 'T2', hard: 'T1' };
export const GATE_BUILD_FROM = ['INTAKE', 'PLANNING', 'AWAIT_RATIFY', 'BLOCKED', 'NEEDS_HUMAN'];
export const CRED_ROW_ID = 'readiness:credentials';

export function readinessPath(ctx) {
  return path.join(ctx.home, 'plan', 'READINESS.json');
}

export function decisionList(decisions) {
  if (Array.isArray(decisions)) {
    return decisions.map((d) => ({ id: d && d.id !== undefined ? String(d.id) : '?', state: d ? (d.state !== undefined ? d.state : d.status) : undefined }));
  }
  return Object.keys(decisions || {}).map((id) => {
    const v = decisions[id];
    return { id, state: v && typeof v === 'object' ? (v.state !== undefined ? v.state : v.status) : v };
  });
}

// G-8: the verdict is judged from disk each time it is asked. Returns
// { ok, outcome, extra, data, sha256 }; never throws for a bad verdict.
export function checkReadiness(ctx) {
  const file = readinessPath(ctx);
  let bytes;
  try { bytes = fs.readFileSync(file); } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, outcome: 'READINESS_MISSING', extra: { file } };
    throw e;
  }
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch (e) {
    return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: [{ pointer: '', message: 'not JSON: ' + e.message }] } };
  }
  const errors = validateSchema(loadSchemaFile('readiness.schema.json'), data);
  if (errors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors } };
  const graphErrors = sliceCycleErrors(data.slices);
  if (graphErrors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: graphErrors } };
  const cpErrors = checkpointErrors(data.review_checkpoints);
  if (cpErrors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: cpErrors } };
  const unresolved = decisionList(data.decisions).filter((d) => d.state !== 'RESOLVED' && d.state !== 'DEFAULTED').map((d) => d.id);
  if (unresolved.length) return { ok: false, outcome: 'READINESS_UNRESOLVED', extra: { decisions: unresolved } };
  if (data.preflight.passed !== true) return { ok: false, outcome: 'READINESS_PREFLIGHT_FAILED', extra: {} };
  const dependent = (data.slices || []).filter((s) => s.depends_on_owner_answer === true).map((s) => s.id);
  if (dependent.length || (data.owner_dependent_slices || 0) > 0) {
    return { ok: false, outcome: 'READINESS_OWNER_DEPENDENT', extra: { slices: dependent, owner_dependent_slices: data.owner_dependent_slices || dependent.length } };
  }
  return { ok: true, outcome: 'READINESS_OK', extra: {}, data, sha256: sha256Bytes(bytes) };
}

// A cycle in depends_on would leave its slices never runnable, so the run would
// idle without saying why. It is a plan error, printed as the cycle.
export function sliceCycleErrors(slices) {
  if (!Array.isArray(slices)) return [];
  const byId = new Map(slices.map((s) => [s.id, s]));
  const done = new Set();
  const errors = [];
  const visit = (id, trail) => {
    const at = trail.indexOf(id);
    if (at >= 0) return [...trail.slice(at), id];
    if (done.has(id) || !byId.has(id)) return null;
    trail.push(id);
    for (const d of byId.get(id).depends_on || []) {
      const c = visit(d, trail);
      if (c) return c;
    }
    trail.pop();
    done.add(id);
    return null;
  };
  for (const s of slices) {
    const c = visit(s.id, []);
    if (c) { errors.push({ pointer: '/slices', message: 'depends_on has a cycle: ' + c.join(' -> ') }); break; }
  }
  return errors;
}

// `next` calls this for a run whose build gate was approved: an edit after the
// gate cannot slip through. The run status is never advanced here.
export function rereadReadiness(ctx, state) {
  const gate = state.gates && state.gates.build;
  if (!gate || gate.approved !== true) return null;
  const v = checkReadiness(ctx);
  if (v.ok) return null;
  appendEvent(ctx, state.run_id, { event: 'readiness_revoked', stage: state.stage, host: state.host, verdict: v.outcome, detail: { outcome: v.outcome, ...v.extra } });
  return fail(v.outcome, 1, { run_id: state.run_id, revoked: true, ...v.extra });
}

// review_checkpoints (CHECKPOINT-POLICY v1) is decided by plan-it; the spine
// only checks it is self-consistent and turns each checkpoint into a
// finish-line row, so a run cannot close without its review-it verdicts.
export const CHECKPOINT_ROW_PREFIX = 'checkpoint:';

export function checkpointErrors(block) {
  if (block === undefined) return [];
  const errors = [];
  const list = Array.isArray(block.checkpoints) ? block.checkpoints : [];
  if (block.count !== list.length) errors.push({ pointer: '/review_checkpoints/count', message: 'count ' + block.count + ' does not match ' + list.length + ' checkpoint(s)' });
  list.forEach((c, i) => {
    const want = 'CP-' + String(i + 1).padStart(2, '0');
    if (c.id !== want) errors.push({ pointer: '/review_checkpoints/checkpoints/' + i + '/id', message: 'must be ' + want });
  });
  return errors;
}

// What a checkpoint holds until PASS. It holds the start of slices that depend on
// covered work, the promotion of covered work, the merge or the release, never
// independent work (finding H-10). Plans written before `gates` existed get the
// same corrected meaning, read from the kind.
export function checkpointGates(c) {
  if (Array.isArray(c.gates)) return c.gates;
  if (c.kind === 'wave' || c.kind === 'phase') return ['dependents', 'promotion'];
  if (c.kind === 'adversarial') return /^\s*start of\b/i.test(String(c.blocks || '')) ? ['dependents'] : ['merge'];
  if (c.kind === 'pre-merge') return ['merge'];
  return ['release'];
}

export function seedCheckpoints(state, fl, data) {
  const block = data.review_checkpoints;
  if (!block) return 0;
  state.review_checkpoints = {
    count: block.count,
    level: block.level || null,
    checkpoints: block.checkpoints.map((c) => ({
      id: c.id,
      kind: c.kind,
      at: c.at || null,
      gates: checkpointGates(c),
      covers: Array.isArray(c.covers) ? c.covers : null,
      blocks: c.blocks || null,
      evidence: c.evidence,
    })),
  };
  for (const c of block.checkpoints) {
    const id = CHECKPOINT_ROW_PREFIX + c.id;
    if (!fl.rows.some((r) => r.id === id)) finishLineUpsert(fl, id, { kind: 'package' });
  }
  return block.count;
}

export function seedSlices(state, data) {
  if (state.slices.length || !Array.isArray(data.slices)) return;
  for (const s of data.slices) {
    const klass = s.class || 'implementation';
    state.slices.push({
      id: s.id,
      lane: s.lane === undefined ? null : s.lane,
      tier: s.tier || CLASS_TIER[klass] || 'T2',
      class: klass,
      depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
      wave: typeof s.wave === 'string' ? s.wave : null,
      status: 'READY',
      attempts: 0,
      escalations: 0,
    });
  }
}

export function gateBuild(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const v = checkReadiness(ctx);
  if (!v.ok) {
    appendEvent(ctx, runId, { event: 'build_refused', stage: state.stage, host: state.host, verdict: v.outcome, detail: v.extra });
    throw fail(v.outcome, 1, { run_id: runId, status: state.status, ...v.extra });
  }
  if (state.status !== 'BUILDING' && !GATE_BUILD_FROM.includes(state.status)) {
    throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'BUILDING', allowed: GATE_BUILD_FROM });
  }
  const names = v.data.credentials || [];
  const settings = loadSettings(ctx, []);
  const missing = names.length ? resolveCredentials(ctx, runId, names, settings.values.secrets).filter((r) => !r.ok) : [];
  const fl = readFinishLine(ctx);
  const now = ctx.now();
  if (missing.length) {
    const provider = settings.values.secrets.provider;
    const reason = 'missing credential ' + missing.map((m) => m.name).join(', ') + ' via provider ' + provider;
    const from = state.status;
    state.status = 'BLOCKED';
    writeState(ctx, state);
    finishLineUpsert(fl, CRED_ROW_ID, { kind: 'package', state: 'BLOCKED', reason, evidence: null });
    writeFinishLine(ctx, fl);
    appendEvent(ctx, runId, { event: 'build_blocked', stage: state.stage, host: state.host, verdict: 'CREDENTIAL_MISSING', detail: { from, credentials: missing.map((m) => m.name), provider } });
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, status: 'BLOCKED', reason, missing: missing.map((m) => m.name), provider };
  }
  const from = state.status;
  seedSlices(state, v.data);
  const checkpoints = seedCheckpoints(state, fl, v.data);
  state.gates.build = { approved: true, owner: 'readiness', date: now, readiness_sha256: v.sha256 };
  state.status = 'BUILDING';
  writeState(ctx, state);
  for (const s of state.slices) {
    if (!fl.rows.some((r) => r.id === s.id)) finishLineUpsert(fl, s.id, { kind: 'package' });
  }
  const credRow = fl.rows.find((r) => r.id === CRED_ROW_ID);
  if (credRow && credRow.state === 'BLOCKED') {
    finishLineUpsert(fl, CRED_ROW_ID, { state: 'DONE', reason: null, evidence: path.relative(ctx.repo, readinessPath(ctx)) });
  }
  writeFinishLine(ctx, fl);
  appendEvent(ctx, runId, { event: 'build_approved', stage: state.stage, host: state.host, verdict: 'READINESS_OK', detail: { from, readiness_sha256: v.sha256, slices: state.slices.length, review_checkpoints: checkpoints } });
  return { outcome: 'READINESS_OK', exit: 0, run_id: runId, status: 'BUILDING', slices: state.slices.map((s) => s.id), review_checkpoints: checkpoints };
}
