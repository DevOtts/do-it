// Build and run `codex exec --json -C DIR -m MODEL -s SANDBOX -` with the brief on stdin.
// Each spawn is a separate codex run (no in-session subagent, probe unknown 5). Never the bypass flags (G-4, G-7).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TIERS_PATH = join(HERE, '..', 'tiers.json');
export const loadTiers = (path = TIERS_PATH) => JSON.parse(readFileSync(path, 'utf8'));

export const READ_ONLY_ROLES = new Set(['verifier', 'reviewer', 'auditor', 'explorer']);
export const sandboxFor = (role) => (READ_ONLY_ROLES.has(role) ? 'read-only' : 'workspace-write');

export function buildSpawn({ role, tier, brief = '', reason = '', dir } = {}, tiers = loadTiers()) {
  const map = tiers.tiers || tiers;
  if (!tier || !map[tier]) return { outcome: 'UNTIERED_SPAWN', reason: tier ? `unknown tier ${tier}` : 'no tier named' };
  let effective = tier;
  const event = { type: 'spawn', role };
  if (tier === 'T1' && !String(reason).trim()) { effective = 'T2'; event.downgraded_from = 'T1'; }
  const model = map[effective];
  if (!model) return { outcome: 'UNTIERED_SPAWN', reason: `tier ${effective} unmapped` };
  event.tier = effective; event.model = model;
  const cwd = dir || process.cwd();
  const sandbox = sandboxFor(role);
  const argv = ['codex', 'exec', '--json', '-C', cwd, '-m', model, '-s', sandbox, '-'];
  return { outcome: 'ok', tier: effective, model, sandbox, argv, stdin: String(brief), cwd, event };
}

const CALLER = /^(CODEX_(THREAD|SESSION)\w*)$/;
export const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !CALLER.test(k)));

// Run argv (argv[0] is looked up on PATH). Returns raw capture; the adapter decides the verdict.
export function runCodex(argv, { stdin = '', cwd = process.cwd(), timeoutMs = 3600000 } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env: childEnv(), input: stdin, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, signal: r.signal, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error ? (r.error.code === 'ETIMEDOUT' ? 'timeout' : r.error.message) : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const r = buildSpawn({ role: get('--role'), tier: get('--tier'), reason: get('--reason') || '', brief: get('--brief') || '', dir: get('--dir') }, loadTiers(get('--tiers') || TIERS_PATH));
  console.log(JSON.stringify(r));
  process.exit(r.outcome === 'ok' ? 0 : 1);
}
