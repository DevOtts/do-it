// Headless continuation: `claude -p --output-format json --session-id ID` (or `-r ID`), prompt on stdin.
// Profile selection is by the owner alias environment (the config-dir variable). Never `--bare`: it
// skips keychain auth, which subscription aliases rely on. Failure maps to HANDOFF_FAILED; the fifth
// failed attempt maps to ESCALATED and no sixth process is started (CONTRACT M3).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAttemptCounter, handoffAttempt } from '../../_interface/lib/fallbacks.mjs';

export const PROFILE_ENV = 'CLAUDE_CONFIG_DIR';
// Variables that identify the *calling* session; a child must not inherit them.
const CALLER_SESSION = /^(CLAUDECODE|CLAUDE_CODE_(SESSION|BRIDGE|MESSAGING|SSE|CHILD)\w*|CLAUDE_PID)$/;

export function profileDir(alias, home = homedir()) {
  if (!alias) return undefined;
  return alias === 'default' ? join(home, '.claude') : join(home, `.claude-${alias}`);
}

export function buildContinue(o = {}) {
  if (o.bare) throw new Error('--bare is refused: subscription aliases authenticate through the keychain');
  const sessionId = o.sessionId || randomUUID();
  const argv = ['claude', '-p', '--output-format', 'json', o.resume ? '-r' : '--session-id', sessionId];
  if (o.maxBudgetUsd != null) argv.push('--max-budget-usd', String(o.maxBudgetUsd));
  const dir = o.profileDir || profileDir(o.alias, o.home);
  const env = dir ? { [PROFILE_ENV]: dir } : {};
  const prompt = o.prompt ?? `Continue do-it run ${o.runId ?? ''} from the handoff at ${o.path ?? 'runs/<run_id>/handoff.md'}. Read it first, then follow its next steps.`;
  return { command: argv.join(' '), argv, env, cwd: o.cwd || process.cwd(), stdin: prompt, session_id: sessionId };
}

function atomicWrite(dir, text) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json.tmp'), text);
  renameSync(join(dir, 'result.json.tmp'), join(dir, 'result.json'));
}

// One attempt. Writes <outDir>/<session_id>/result.json only for a valid, non-error result; a
// truncated stdout (child killed mid-write) is left as result.json.tmp so collect reports `partial`.
export function runContinueOnce(o = {}) {
  const b = buildContinue(o);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !CALLER_SESSION.test(k)));
  Object.assign(env, b.env);
  const r = spawnSync(b.argv[0], b.argv.slice(1), { cwd: b.cwd, env, input: b.stdin, encoding: 'utf8', timeout: o.timeoutMs ?? 3600000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  const fail = (reason) => ({ outcome: 'HANDOFF_FAILED', session_id: b.session_id, status: r.status, signal: r.signal, reason });
  if (r.error) return fail(r.error.code === 'ETIMEDOUT' ? 'timeout' : r.error.message);
  if (r.status !== 0) {
    if (o.outDir && r.stdout && r.stdout.trim()) { try { JSON.parse(r.stdout); } catch { mkdirSync(join(o.outDir, b.session_id), { recursive: true }); writeFileSync(join(o.outDir, b.session_id, 'result.json.tmp'), r.stdout); } }
    let why = r.signal ? `killed by ${r.signal}` : `exit ${r.status}`;
    try { const j = JSON.parse(r.stdout); if (j.is_error && j.result) why += `: ${String(j.result).slice(0, 160)}`; } catch { /* no JSON body */ }
    return fail(why);
  }
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return fail('stdout is not JSON'); }
  if (parsed.is_error) return fail(String(parsed.result ?? 'is_error').slice(0, 200));
  const sid = parsed.session_id || b.session_id;
  let result_path = null;
  if (o.outDir) {
    const dir = join(o.outDir, sid);
    atomicWrite(dir, r.stdout);
    result_path = join(dir, 'result.json');
  }
  return { outcome: 'ok', session_id: sid, result_path, result: parsed };
}

// Attempt counter wrapper: failed starts for one run count towards the cap of 5.
export function createContinuer() {
  const counters = new Map();
  return function run(o = {}) {
    const key = o.runId ?? 'run';
    if (!counters.has(key)) counters.set(key, createAttemptCounter());
    const c = counters.get(key);
    let last;
    const out = handoffAttempt(c, () => { last = runContinueOnce(o); return { ok: last.outcome === 'ok' }; });
    if (out.outcome === 'ok') return { ...last, attempts: out.attempts };
    return { ...(last || {}), outcome: out.outcome, attempts: out.attempts, ...(out.refused ? { refused: true } : {}) };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const opts = { alias: get('--alias'), profileDir: get('--profile-dir'), sessionId: get('--session-id'), cwd: get('--cwd'), resume: a.includes('--resume'), maxBudgetUsd: get('--max-budget-usd'), runId: get('--run-id'), path: get('--path') };
  if (a.includes('--dry-run')) {
    const { command, argv, env, cwd } = buildContinue(opts);
    console.log(JSON.stringify({ command, argv, env, cwd }));
  } else {
    const r = runContinueOnce({ ...opts, timeoutMs: Number(get('--timeout-ms')) || undefined, outDir: get('--out-dir') });
    const { result, ...rest } = r;
    console.log(JSON.stringify(rest));
    process.exit(r.outcome === 'ok' ? 0 : 1);
  }
}
