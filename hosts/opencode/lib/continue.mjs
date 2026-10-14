// Continuation: `opencode run -s SESSION ... MESSAGE`, or a fresh headless run that reads the handoff file.
// Failure (non-zero exit, error event, timeout) maps to HANDOFF_FAILED; the fifth failed attempt maps to
// ESCALATED and no sixth process is started (CONTRACT M3). A hang is cut by the timeout.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createAttemptCounter, handoffAttempt } from '../../_interface/lib/fallbacks.mjs';
import { parseEvents, sessionIdOf, errorOf } from './events.mjs';
import { runOpencode } from './spawn.mjs';

export function buildContinue(o = {}) {
  const prompt = o.prompt ?? `Continue do-it run ${o.runId ?? ''} from the handoff at ${o.path ?? 'runs/<run_id>/handoff.md'}. Read it first, then follow its next steps.`;
  const tail = ['--format', 'json', ...(o.model ? ['-m', o.model] : []), '--auto', '--standalone', prompt];
  if (o.resume || o.sessionId) {
    if (!o.sessionId) return { outcome: 'HANDOFF_FAILED', reason: 'no session id' };
    return { outcome: 'ok', mode: 'resume', argv: ['opencode', 'run', '-s', o.sessionId, ...tail], cwd: o.cwd || process.cwd() };
  }
  return { outcome: 'ok', mode: 'fresh', argv: ['opencode', 'run', ...tail], cwd: o.cwd || process.cwd() };
}

export function runContinueOnce(o = {}) {
  const b = buildContinue(o);
  if (b.outcome !== 'ok') return { outcome: 'HANDOFF_FAILED', reason: b.reason };
  const r = runOpencode(b.argv, { cwd: b.cwd, timeoutMs: o.timeoutMs ?? 3600000 });
  const { events } = parseEvents(r.stdout);
  const sid = sessionIdOf(events) || o.sessionId || null;
  const key = sid || `c-${Date.now()}`;
  const fail = (reason) => {
    if (o.outDir && r.stdout.trim()) {
      mkdirSync(join(o.outDir, key), { recursive: true });
      writeFileSync(join(o.outDir, key, 'result.json.tmp'), r.stdout);
    }
    return { outcome: 'HANDOFF_FAILED', session_id: sid, status: r.status, signal: r.signal, reason };
  };
  if (r.error) return fail(r.error);
  if (r.status !== 0) return fail(errorOf(events) || (r.signal ? `killed by ${r.signal}` : `exit ${r.status}`));
  const err = errorOf(events);
  if (err) return fail(err);
  if (!sid) return fail('no sessionID in output');
  let result_path = null;
  if (o.outDir) {
    const dir = join(o.outDir, key);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'events.jsonl'), r.stdout);
    writeFileSync(join(dir, 'result.json.tmp'), JSON.stringify({ session_id: sid, mode: b.mode, argv: b.argv.slice(0, -1), events: events.length, cwd: b.cwd }));
    renameSync(join(dir, 'result.json.tmp'), join(dir, 'result.json'));
    result_path = join(dir, 'result.json');
  }
  return { outcome: 'ok', session_id: sid, mode: b.mode, result_path };
}

export function createContinuer() {
  const counters = new Map();
  return function run(o = {}) {
    const key = o.runId ?? 'run';
    if (!counters.has(key)) counters.set(key, createAttemptCounter());
    let last;
    const out = handoffAttempt(counters.get(key), () => { last = runContinueOnce(o); return { ok: last.outcome === 'ok' }; });
    if (out.outcome === 'ok') return { ...last, attempts: out.attempts };
    return { ...(last || {}), outcome: out.outcome, attempts: out.attempts, ...(out.refused ? { refused: true } : {}) };
  };
}
