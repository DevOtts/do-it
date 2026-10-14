// Continuation: `codex exec resume SESSION --json` (id from the thread.started event; `--last` only when
// no id is known and the caller allows it), or a fresh headless run that reads the handoff file.
// Failure maps to HANDOFF_FAILED; the fifth failed attempt maps to ESCALATED, no sixth process (CONTRACT M3).
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createAttemptCounter, handoffAttempt } from '../../_interface/lib/fallbacks.mjs';
import { parseJsonl, threadIdOf, hasTurnCompleted } from './jsonl.mjs';
import { runCodex, sandboxFor } from './spawn.mjs';

export function buildContinue(o = {}) {
  const prompt = o.prompt ?? `Continue do-it run ${o.runId ?? ''} from the handoff at ${o.path ?? 'runs/<run_id>/handoff.md'}. Read it first, then follow its next steps.`;
  if (o.resume || o.sessionId) {
    if (o.sessionId) return { outcome: 'ok', mode: 'resume', argv: ['codex', 'exec', 'resume', o.sessionId, '--json'], stdin: prompt, cwd: o.cwd || process.cwd() };
    if (o.allowLast) return { outcome: 'ok', mode: 'resume', argv: ['codex', 'exec', 'resume', '--last', '--json'], stdin: prompt, cwd: o.cwd || process.cwd() };
    return { outcome: 'HANDOFF_FAILED', reason: 'no session id' };
  }
  const argv = ['codex', 'exec', '--json', '-C', o.dir || o.cwd || process.cwd(), ...(o.model ? ['-m', o.model] : []), '-s', o.sandbox || sandboxFor(o.role || 'builder'), '-'];
  return { outcome: 'ok', mode: 'fresh', argv, stdin: prompt, cwd: o.cwd || process.cwd() };
}

// One attempt. Writes <outDir>/<id>/result.json (+ events.jsonl) only for a complete run; a killed child's
// partial stdout stays as result.json.tmp so collect reports `partial`.
export function runContinueOnce(o = {}) {
  const b = buildContinue(o);
  if (b.outcome !== 'ok') return { outcome: 'HANDOFF_FAILED', reason: b.reason };
  const r = runCodex(b.argv, { stdin: b.stdin, cwd: b.cwd, timeoutMs: o.timeoutMs ?? 3600000 });
  const { events } = parseJsonl(r.stdout);
  const sid = threadIdOf(events) || o.sessionId || null;
  const key = sid || `c-${Date.now()}`;
  const fail = (reason) => {
    if (o.outDir && r.stdout.trim()) {
      mkdirSync(join(o.outDir, key), { recursive: true });
      writeFileSync(join(o.outDir, key, 'result.json.tmp'), r.stdout);
    }
    return { outcome: 'HANDOFF_FAILED', session_id: sid, status: r.status, signal: r.signal, reason };
  };
  if (r.error) return fail(r.error);
  if (r.status !== 0) return fail(r.signal ? `killed by ${r.signal}` : `exit ${r.status}`);
  if (!hasTurnCompleted(events)) return fail('no turn.completed event');
  let result_path = null;
  if (o.outDir) {
    const dir = join(o.outDir, key);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'events.jsonl'), r.stdout);
    writeFileSync(join(dir, 'result.json.tmp'), JSON.stringify({ session_id: sid, mode: b.mode, argv: b.argv, events: events.length }));
    renameSync(join(dir, 'result.json.tmp'), join(dir, 'result.json'));
    result_path = join(dir, 'result.json');
  }
  return { outcome: 'ok', session_id: sid, mode: b.mode, result_path, events };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const opts = { sessionId: get('--session-id'), resume: a.includes('--resume'), allowLast: a.includes('--allow-last'), dir: get('--dir'), runId: get('--run-id'), path: get('--path') };
  const b = buildContinue(opts);
  console.log(JSON.stringify(b));
  process.exit(b.outcome === 'ok' ? 0 : 1);
}
