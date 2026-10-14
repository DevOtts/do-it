import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent, eventsPath } from './events.mjs';
import { readFinishLine, renderBoard } from './finish-line.mjs';
import { atomicWrite } from './fs-atomic.mjs';
import { packAppend } from './pack.mjs';
import { loadSettings } from './settings.mjs';
import { loadState, runDir, selectRunId, writeState } from './state.mjs';

export const HANDOFF_MAX_CHARS = 32000;
export const HANDOFF_EVENTS = 5;
export const HANDOFF_EVENT_CLIP = 700;

export function handoffPath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'handoff.md');
}

// Files a fresh process needs: the run's own files plus whatever the last result
// listed in resume.state_files. Declared files that are gone are returned as missing.
export function collectStateFiles(ctx, runId, state) {
  const dir = runDir(ctx, runId);
  const found = [];
  const missing = [];
  const add = (abs, required) => {
    if (fs.existsSync(abs)) { if (!found.includes(abs)) found.push(abs); } else if (required) missing.push(abs);
  };
  for (const n of ['state.json', 'events.jsonl', 'ledger.json', 'owner-pack.json']) add(path.join(dir, n), n === 'state.json');
  add(path.join(ctx.home, 'finish-line.json'), false);
  add(path.join(ctx.home, 'plan', 'READINESS.json'), false);
  const declared = state.handoff_state && Array.isArray(state.handoff_state.state_files) ? state.handoff_state.state_files : [];
  for (const rel of declared) add(path.resolve(ctx.repo, rel), true);
  return { files: found, missing };
}

export function nextActionOf(state) {
  const h = state.handoff_state;
  if (h && typeof h.next_action === 'string' && h.next_action.trim()) return h.next_action.trim();
  return 'run `do-it next --run ' + state.run_id + '` and follow its action';
}

export function resumeCommand(runId) {
  return 'do-it resume --run ' + runId;
}

function lastEvents(ctx, runId, n) {
  let lines = [];
  try { lines = fs.readFileSync(eventsPath(ctx, runId), 'utf8').split('\n').filter(Boolean); } catch { /* none yet */ }
  return lines.slice(-n).map((l) => (l.length > HANDOFF_EVENT_CLIP ? l.slice(0, HANDOFF_EVENT_CLIP) : l));
}

export function renderHandoff(ctx, state, files, board, events) {
  const lines = [
    '# do-it handoff ' + state.run_id,
    '',
    'resume_prompt: You are the fresh conductor for run ' + state.run_id + '. Read this file, call `' + resumeCommand(state.run_id) + '`, then `do-it next` and follow it.',
    'run_status: ' + state.status,
    'next_action: ' + nextActionOf(state),
    '',
    'state_files:',
    ...files.map((f) => '- ' + f),
    '',
    'board:',
    board,
    '',
    'events (last ' + HANDOFF_EVENTS + '):',
    ...events.map((e) => '- ' + e),
    '',
  ];
  return lines.join('\n');
}

export function runContinueHook(ctx, hook, file) {
  const r = cp.spawnSync(hook, [file], { env: ctx.env, cwd: ctx.cwd, stdio: 'ignore', timeout: 120000 });
  return { ok: !r.error && r.status === 0, status: r.error ? null : r.status, error: r.error ? r.error.code || 'spawn_error' : null };
}

export function escalateHandoffCap(ctx, runId, state, cap) {
  packAppend(ctx, runId, [{
    kind: 'owner-gate',
    text: 'The handoff cap of ' + cap + ' was reached without a fresh conductor starting. Start one by hand (' + resumeCommand(runId) + ') or stop the run?',
    options: ['start by hand', 'stop run'],
    recommendation: 'start by hand',
    default: 'start by hand',
    reversible: true,
  }]);
  if (state.status !== 'ESCALATED') {
    const from = state.status;
    state.status = 'ESCALATED';
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'handoff_escalated', stage: state.stage, host: state.host, verdict: 'ESCALATED', detail: { from, handoffs: state.handoffs, cap } });
  }
  return { outcome: 'ESCALATED', exit: 2, run_id: runId, status: 'ESCALATED', handoffs: state.handoffs, cap, message: 'handoff cap of ' + cap + ' reached; owner pack asks' };
}

// M3: write handoff.md, count the attempt, then start a fresh conductor through the
// host's continue hook (env DO_IT_HOST_CONTINUE, the handoff path as its only argument).
export function cmdHandoff(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const settings = loadSettings(ctx, args.sets).values.handoff;
  const cap = settings.max_per_run;
  if (state.handoffs >= cap) return escalateHandoffCap(ctx, runId, state, cap);

  const { files, missing } = collectStateFiles(ctx, runId, state);
  if (missing.length) throw fail('HANDOFF_PATH_INVALID', 1, { run_id: runId, missing });
  const board = renderBoard(readFinishLine(ctx));
  const events = lastEvents(ctx, runId, HANDOFF_EVENTS);
  let text = renderHandoff(ctx, state, files, board, events);
  if (text.length > HANDOFF_MAX_CHARS) text = renderHandoff(ctx, state, files, board.slice(0, 1200), events.map((e) => e.slice(0, 200))).slice(0, HANDOFF_MAX_CHARS);
  const file = handoffPath(ctx, runId);
  atomicWrite(file, text);

  state.handoffs += 1;
  state.handoff_state = { ...(typeof state.handoff_state === 'object' && state.handoff_state ? state.handoff_state : {}), path: file, written_at: ctx.now(), state_files: (state.handoff_state && state.handoff_state.state_files) || [] };
  const hook = ctx.env.DO_IT_HOST_CONTINUE;
  const mode = settings.mode === 'ask' || !hook ? 'ask' : 'auto';
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'handoff_written', stage: state.stage, host: state.host, verdict: mode, detail: { path: file, attempt: state.handoffs } });

  if (mode === 'ask') {
    const line = 'Run: ' + resumeCommand(runId) + '   (handoff: ' + file + ')';
    return { outcome: 'HANDOFF_ASK', exit: 2, run_id: runId, mode, handoffs: state.handoffs, handoff: file, command: line, say: [line] };
  }
  const hr = runContinueHook(ctx, hook, file);
  if (hr.ok) {
    appendEvent(ctx, runId, { event: 'handoff_started', stage: state.stage, host: state.host, verdict: 'HANDOFF_STARTED', detail: { attempt: state.handoffs } });
    return { outcome: 'HANDOFF_STARTED', exit: 0, run_id: runId, mode, handoffs: state.handoffs, handoff: file };
  }
  appendEvent(ctx, runId, { event: 'handoff_failed', stage: state.stage, host: state.host, verdict: 'HANDOFF_FAILED', detail: { attempt: state.handoffs, exit: hr.status, error: hr.error } });
  if (state.handoffs >= cap) return escalateHandoffCap(ctx, runId, state, cap);
  throw fail('HANDOFF_FAILED', 1, { run_id: runId, mode, handoffs: state.handoffs, handoff: file, hook_exit: hr.status, retry_allowed: true });
}
