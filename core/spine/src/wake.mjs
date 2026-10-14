import cp from 'node:child_process';
import path from 'node:path';
import { atomicWrite, atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { runDir } from './state.mjs';

export const NO_WAKE_TEXT = 'no wake: parked; run do-it resume after the reset';

export function wakePath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'wake.json');
}

export function readWake(ctx, runId) {
  return readJsonIfExists(wakePath(ctx, runId));
}

// Hook contract: executable in env DO_IT_HOST_WAKE, args `at` and a prompt file
// path; exit 0 with the wake id on stdout means a wake is scheduled.
export function scheduleWake(ctx, runId, at, resumeLine) {
  const promptFile = path.join(runDir(ctx, runId), 'wake-prompt.md');
  atomicWrite(promptFile, 'Resume do-it run ' + runId + ' from state: run `' + resumeLine + '`, then `do-it next`.\n');
  const hook = ctx.env.DO_IT_HOST_WAKE;
  let wake;
  if (!hook) {
    wake = { status: 'unavailable', run_id: runId, at, prompt_file: promptFile, id: null, reason: 'no_hook' };
  } else {
    const r = cp.spawnSync(hook, [at || '', promptFile], { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
    const id = r.error ? '' : String(r.stdout || '').trim().split('\n')[0].trim();
    if (!r.error && r.status === 0 && id) {
      wake = { status: 'scheduled', run_id: runId, at, prompt_file: promptFile, id, scheduled_at: ctx.now() };
    } else {
      wake = { status: 'failed', run_id: runId, at, prompt_file: promptFile, id: null, reason: r.error ? r.error.code || 'spawn_error' : 'hook_exit_' + r.status };
    }
  }
  atomicWriteJson(wakePath(ctx, runId), wake);
  return wake;
}

export function consumeWake(ctx, runId) {
  const wake = readWake(ctx, runId);
  if (!wake || wake.status === 'consumed') return wake;
  const next = { ...wake, status: 'consumed', consumed_at: ctx.now() };
  atomicWriteJson(wakePath(ctx, runId), next);
  return next;
}
