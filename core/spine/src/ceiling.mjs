import fs from 'node:fs';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { loadSettings } from './settings.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';

// G-5, ruling D4: absolute tokens or window percent, whichever fires first.
export function ceilingLevel(ceilings, ctxTokens, windowTokens) {
  const pct = (ctxTokens / windowTokens) * 100;
  if (ctxTokens >= ceilings.block_tokens || pct >= ceilings.block_pct) {
    return { level: 'BLOCKED', by: ctxTokens >= ceilings.block_tokens ? 'absolute' : 'percent', pct };
  }
  if (ctxTokens >= ceilings.warn_tokens || pct >= ceilings.warn_pct) {
    return { level: 'WARN', by: ctxTokens >= ceilings.warn_tokens ? 'absolute' : 'percent', pct };
  }
  return { level: 'OK', by: null, pct };
}

export function ceilingNumber(flags, name) {
  const raw = flags[name];
  if (raw === undefined || !/^\d+$/.test(String(raw)) || Number(raw) <= 0) throw fail('USAGE', 1, { message: 'gate ceiling requires --ctx-tokens N and --window W as positive integers' });
  return Number(raw);
}

export function handoffWritten(state) {
  const h = state.handoff_state;
  return !!(h && typeof h === 'object' && h.path && fs.existsSync(h.path));
}

// `next` refuses while the ceiling block stands; it clears only when the fresh
// conductor calls `resume`. Nothing is written here.
export function ceilingBlock(_ctx, state) {
  if (state.ceiling !== 'BLOCKED') return null;
  return {
    outcome: 'CEILING_BLOCKED',
    exit: 3,
    run_id: state.run_id,
    action: 'NONE',
    handoff_written: handoffWritten(state),
    message: handoffWritten(state) ? 'handoff written; start a fresh conductor and call resume' : 'write a handoff (do-it handoff) before continuing',
  };
}

export function gateCeiling(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const ctxTokens = ceilingNumber(args.flags, 'ctx-tokens');
  const windowTokens = ceilingNumber(args.flags, 'window');
  const ceilings = loadSettings(ctx, args.sets).values.ceilings;
  const r = ceilingLevel(ceilings, ctxTokens, windowTokens);
  const pct = Math.round(r.pct * 10) / 10;
  const keep = state.ceiling === 'BLOCKED' ? 'BLOCKED' : r.level;
  if (state.ceiling !== keep) {
    state.ceiling = keep;
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'ceiling_' + r.level.toLowerCase(), stage: state.stage, host: state.host, verdict: r.level, detail: { ctx_tokens: ctxTokens, window: windowTokens, pct, by: r.by } });
  }
  const base = { run_id: runId, ctx_tokens: ctxTokens, window: windowTokens, pct, by: r.by, ceiling: state.ceiling };
  if (r.level === 'BLOCKED') return { outcome: 'CEILING_BLOCKED', exit: 3, ...base, handoff_written: handoffWritten(state) };
  return { outcome: r.level === 'WARN' ? 'CEILING_WARN' : 'CEILING_OK', exit: 0, ...base };
}
