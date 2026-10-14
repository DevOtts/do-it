import fs from 'node:fs';
import path from 'node:path';
import { gateConclude } from './conclude.mjs';
import { makeCtx } from './ctx.mjs';
import { cmdDoctor } from './doctor.mjs';
import { CliError, fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { cleanStaleTmp } from './fs-atomic.mjs';
import { cmdInit } from './init.mjs';
import { renderBoard, readFinishLine } from './finish-line.mjs';
import { cmdMeter } from './meter.mjs';
import { cmdNext, gateRoute } from './next.mjs';
import { gateBuild } from './readiness.mjs';
import { cmdRecord } from './record.mjs';
import { route } from './router.mjs';
import { loadSettings } from './settings.mjs';
import { gateStop } from './stopgate.mjs';
import { advanceRunStatus, loadState, newRunId, newState, runDir, selectRunId, writeState } from './state.mjs';
import { gateVerify } from './verify.mjs';
import { DO_IT_VERSION } from './version.mjs';

export const BOOL_FLAGS = new Set(['json', 'migrate', 'install', 'secrets', 'append', 'force', 'finalize', 'help', 'version', 'verbose']);
export const COMMANDS = ['init', 'start', 'next', 'record', 'gate', 'answer', 'handoff', 'resume', 'park', 'status', 'meter', 'doctor'];

export function parseArgs(argv) {
  const out = { positionals: [], flags: {}, sets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-v') { out.flags.version = true; continue; }
    if (!a.startsWith('--')) { out.positionals.push(a); continue; }
    let name = a.slice(2);
    let value;
    const eq = name.indexOf('=');
    if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
    if (name === 'set') {
      if (value === undefined) { value = argv[i + 1]; i++; }
      out.sets.push(value === undefined ? '' : value);
      continue;
    }
    if (BOOL_FLAGS.has(name) && value === undefined) { out.flags[name] = true; continue; }
    if (value === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { value = next; i++; } else value = true;
    }
    out.flags[name] = value;
  }
  return out;
}

export function notImplemented(epic, what) {
  return { outcome: 'NOT_IMPLEMENTED', exit: 1, epic, command: what };
}

export function renderHuman(result) {
  const lines = ['OUTCOME: ' + result.outcome];
  for (const key of Object.keys(result)) {
    if (key === 'outcome') continue;
    const v = result[key];
    lines.push(key + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  }
  return lines.join('\n') + '\n';
}

export function dispatch(ctx, args) {
  const cmd = args.positionals[0];
  switch (cmd) {
    case 'init': return cmdInit(ctx, args);
    case 'start': return cmdStart(ctx, args);
    case 'status': return cmdStatus(ctx, args);
    case 'meter': return cmdMeter(ctx, args);
    case 'doctor': return cmdDoctor(ctx, args);
    case 'record': return cmdRecord(ctx, args);
    case 'gate': return cmdGate(ctx, args);
    case 'next': return cmdNext(ctx, args);
    case 'answer': return notImplemented('S4', 'answer');
    case 'handoff': return notImplemented('S5', 'handoff');
    case 'resume': return notImplemented('S5', 'resume');
    case 'park': return notImplemented('S5', 'park');
    default:
      throw fail('USAGE', 1, { message: 'unknown command', commands: COMMANDS });
  }
}

// In-process entry: no process globals are read or written, so tests and the
// built file share one code path. Returns { exit, stdout }.
export function cliMain(argv, opts) {
  const args = parseArgs(argv);
  const json = !!args.flags.json;
  let result;
  let ctx = null;
  try {
    if (args.flags.version) {
      result = { outcome: 'VERSION', exit: 0, version: DO_IT_VERSION };
      return { exit: 0, stdout: json ? JSON.stringify(result) + '\n' : DO_IT_VERSION + '\n' };
    }
    if (!args.positionals.length || args.flags.help) {
      result = { outcome: 'USAGE', exit: args.flags.help ? 0 : 1, commands: COMMANDS };
    } else {
      ctx = makeCtx({ cwd: opts && opts.cwd, env: opts && opts.env });
      result = dispatch(ctx, args);
    }
  } catch (e) {
    if (e instanceof CliError) {
      result = { outcome: e.outcome, exit: e.exit, ...e.extra };
    } else {
      result = { outcome: 'INTERNAL_ERROR', exit: 1, message: String(e && e.message ? e.message : e) };
    }
  }
  const exit = typeof result.exit === 'number' ? result.exit : 0;
  result.exit = exit;
  if (ctx) {
    if (result.root === undefined) result.root = ctx.root;
    if (result.home === undefined) result.home = ctx.home;
  }
  return { exit, stdout: json ? JSON.stringify(result) + '\n' : renderHuman(result) };
}

export function cmdStart(ctx, args) {
  const f = args.flags;
  if (typeof f.request !== 'string' || !f.request.trim()) throw fail('USAGE', 1, { message: 'start requires --request "<text>"' });
  const settings = loadSettings(ctx, args.sets);
  const runId = newRunId(ctx);
  const size = f.size === undefined ? null : (/^\d+$/.test(String(f.size)) ? Number(f.size) : String(f.size));
  const state = newState(ctx, runId, {
    preset: typeof f.preset === 'string' ? f.preset : null,
    request: f.request,
    size,
    host: typeof f.host === 'string' ? f.host : settings.values.host.driver,
  });
  const routed = state.preset ? null : route(f.request);
  if (routed && routed.preset) {
    state.preset = routed.preset;
    if (state.size === null && routed.size !== null) state.size = routed.size;
  }
  fs.mkdirSync(path.join(runDir(ctx, runId), 'results'), { recursive: true });
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'run_started', stage: state.stage, host: state.host, verdict: null });
  if (routed && routed.preset) {
    appendEvent(ctx, runId, { event: 'route', stage: state.stage, host: state.host, verdict: routed.preset, detail: { rule: routed.rule, model_call: false } });
  }
  return { outcome: 'STARTED', exit: 0, run_id: runId, status: state.status, preset: state.preset, root: ctx.root, home: ctx.home };
}

export function cmdStatus(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const removed = cleanStaleTmp(runDir(ctx, runId)) + cleanStaleTmp(path.join(runDir(ctx, runId), 'results'));
  const state = loadState(ctx, runId);
  return {
    outcome: 'STATUS',
    exit: 0,
    run_id: runId,
    status: state.status,
    preset: state.preset,
    stage: state.stage,
    host: state.host,
    root: ctx.root,
    home: ctx.home,
    slices: state.slices,
    handoffs: state.handoffs,
    stop_refusals: state.stop_refusals,
    run_verdict: state.run_verdict === undefined ? null : state.run_verdict,
    board: renderBoard(readFinishLine(ctx)),
    stale_tmp_removed: removed,
  };
}

export function cmdGate(ctx, args) {
  const sub = args.positionals[1];
  switch (sub) {
    case 'verify': return gateVerify(ctx, args);
    case 'conclude': return gateConclude(ctx, args);
    case 'advance': return gateAdvance(ctx, args);
    case 'build': return gateBuild(ctx, args);
    case 'stop': return gateStop(ctx, args);
    case 'route': return gateRoute(ctx, args);
    case 'ceiling':
      return notImplemented('S5', 'gate ' + sub);
    default:
      throw fail('USAGE', 1, { message: 'gate needs a subcommand', subcommands: ['verify', 'conclude', 'advance', 'build', 'stop', 'route', 'ceiling'] });
  }
}

export function gateAdvance(ctx, args) {
  const to = args.flags.to;
  if (typeof to !== 'string') throw fail('USAGE', 1, { message: 'gate advance requires --to STATUS' });
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const moved = advanceRunStatus(ctx, state, to);
  return { outcome: 'ADVANCED', exit: 0, run_id: runId, from: moved.from, status: moved.to };
}
