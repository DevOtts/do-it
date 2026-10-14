import { appendEvent } from './events.mjs';
import { fail } from './errors.mjs';
import { finishLineUpsert, openRows, readFinishLine, renderBoard, rowClosed, writeFinishLine } from './finish-line.mjs';
import { ladderRetry, RETRY_REASON } from './ladder.mjs';
import { loadPipeline } from './pipeline.mjs';
import { CLASS_TIER, rereadReadiness } from './readiness.mjs';
import { PRESET_NAMES } from './router.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';
import { ceilingBlock } from './ceiling.mjs';

export const SLICE_TERMINAL = ['DONE', 'BLOCKED', 'ESCALATED'];
export const STEP_CLASS = { code: 'deterministic', checkpoint: 'gather', decision: 'gather', persona: 'implementation' };
export const STEP_ACTION = { code: 'RUN_CODE', checkpoint: 'CHECKPOINT', decision: 'CHECKPOINT', persona: 'SPAWN' };

export function none(runId, reason, extra) {
  return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'NONE', reason, ...(extra || {}) };
}

export function sliceRunnable(state, s) {
  if (s.status !== 'READY' && s.status !== 'PENDING' && s.status !== undefined) return false;
  const deps = Array.isArray(s.depends_on) ? s.depends_on : [];
  return deps.every((d) => {
    const dep = state.slices.find((x) => x.id === d);
    return dep && dep.status === 'DONE';
  });
}

export function nextSlice(ctx, state, runId) {
  const retried = ladderRetry(state);
  if (retried.length) {
    writeState(ctx, state);
    for (const c of retried) {
      appendEvent(ctx, runId, { event: 'tier_escalated', slice_id: c.slice_id, stage: state.stage, host: state.host, tier: c.to, verdict: 'RETRY', detail: { from: c.from, to: c.to, reason: c.reason } });
    }
  }
  const s = state.slices.find((x) => sliceRunnable(state, x));
  if (!s) return null;
  const klass = s.class || 'implementation';
  const out = {
    outcome: 'NEXT', exit: 0, run_id: runId, action: 'SPAWN', slice_id: s.id, lane: s.lane === undefined ? null : s.lane,
    tier: s.tier || CLASS_TIER[klass] || 'T2', class: klass, attempts: s.attempts || 0, escalations: s.escalations || 0,
  };
  if (out.escalations > 0) out.reason = RETRY_REASON;
  return out;
}

export function nextWave(ctx, state, runId, fl) {
  const pipe = loadPipeline(ctx, state.preset);
  if (!pipe || !pipe.steps.length) return { pipe: null };
  let seeded = false;
  for (const st of pipe.steps) {
    if (!fl.rows.some((r) => r.id === st.id)) { finishLineUpsert(fl, st.id, { kind: 'wave' }); seeded = true; }
  }
  if (seeded) writeFinishLine(ctx, fl);
  const rowOf = (id) => fl.rows.find((r) => r.id === id);
  for (const st of pipe.steps) {
    const row = rowOf(st.id);
    if (row.state !== 'OPEN') continue;
    if (!st.needs.every((n) => rowClosed(rowOf(n)))) continue;
    const type = st.type || 'persona';
    const klass = st.class || STEP_CLASS[type] || 'implementation';
    return {
      pipe,
      out: {
        outcome: 'NEXT', exit: 0, run_id: runId, action: STEP_ACTION[type] || 'SPAWN', wave: st.id, step: st,
        tier: st.tier || CLASS_TIER[klass] || 'T2', class: klass,
      },
    };
  }
  return { pipe, out: null };
}

// `next` is a function of what is on disk. It advances only the deterministic
// bookkeeping the disk already implies: a FAILED slice is requeued one tier up.
export function cmdNext(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);

  const blocked = ceilingBlock(ctx, state);
  if (blocked) return blocked;

  if (state.status === 'ESCALATED') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'escalated' };
  if (state.status === 'PARTIAL_FAILURE') {
    const deploy = state.deploy || { legs: [], rollback_plan: [] };
    const actions = (deploy.rollback_plan || []).map((name) => {
      const leg = deploy.legs.find((l) => l.leg === name) || {};
      return { action: 'ROLLBACK', leg: name, compensate: leg.compensate === undefined ? null : leg.compensate };
    });
    return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROLLBACK', legs: actions.map((a) => a.leg), actions };
  }
  if (state.status === 'DONE') return none(runId, 'done');
  if (state.status === 'PARKED') return { outcome: 'NEXT', exit: 3, run_id: runId, action: 'NONE', reason: 'parked' };
  if (state.status === 'NEEDS_HUMAN') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'needs_human' };
  if (state.status === 'BLOCKED') {
    const fl = readFinishLine(ctx);
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, action: 'NONE', reason: 'blocked', board: renderBoard(fl) };
  }

  const revoked = rereadReadiness(ctx, state);
  if (revoked) throw revoked;

  if (!state.preset) {
    return {
      outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROUTE_MODEL', class: 'gather', tier: 'T3',
      request: state.request, presets: PRESET_NAMES,
      instruction: 'Pick exactly one preset for the request, then run: do-it gate route --preset <name> --reason "<why>"',
    };
  }

  const fl = readFinishLine(ctx);
  if (state.slices.length) {
    const out = nextSlice(ctx, state, runId);
    if (out) return out;
    if (state.slices.some((s) => s.status === 'READY' || s.status === 'RUNNING' || s.status === 'NEEDS_HUMAN')) {
      return none(runId, 'waiting', { slices: state.slices.filter((s) => !SLICE_TERMINAL.includes(s.status)).map((s) => s.id) });
    }
    if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'awaiting_verification', { board: renderBoard(fl) });
  }

  const wave = nextWave(ctx, state, runId, fl);
  if (wave.out) return wave.out;
  if (wave.pipe) {
    if (!openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'waiting', { board: renderBoard(fl) });
  }
  if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
  return none(runId, 'no_runnable_work');
}

export function gateRoute(ctx, args) {
  const f = args.flags;
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (typeof f.preset !== 'string' || !PRESET_NAMES.includes(f.preset)) throw fail('USAGE', 1, { message: 'gate route requires --preset <name>', presets: PRESET_NAMES });
  if (typeof f.reason !== 'string' || !f.reason.trim()) throw fail('ROUTE_REASON_REQUIRED', 1, { message: 'a model route answer needs --reason' });
  if (state.preset) throw fail('ROUTE_ALREADY_SET', 1, { run_id: runId, preset: state.preset });
  state.preset = f.preset;
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'route_model', stage: state.stage, host: state.host, tier: 'T3', verdict: f.preset, detail: { preset: f.preset, reason: f.reason.trim(), model_call: true } });
  return { outcome: 'ROUTED', exit: 0, run_id: runId, preset: f.preset };
}
