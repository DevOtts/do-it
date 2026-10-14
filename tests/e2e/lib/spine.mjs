// Thin driver for the built spine file (core/spine/do-it.mjs). Always the real binary, never in-process.
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const SPINE_BIN = path.join(REPO_ROOT, 'core', 'spine', 'do-it.mjs');
export const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures');

export function cleanEnv(home, extra) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  env.HOME = home;
  env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  return { ...env, ...(extra || {}) };
}

function parseLast(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

export function spine(ctx, argv, extraEnv) {
  const r = cp.spawnSync(process.execPath, [SPINE_BIN, ...argv, '--json'], { cwd: ctx.workdir, env: cleanEnv(ctx.userHome, extraEnv), encoding: 'utf8' });
  return { code: r.status, out: parseLast(r.stdout), stdout: r.stdout, stderr: r.stderr };
}

export function sh(ctx, command, extraEnv) {
  const r = cp.spawnSync('sh', ['-c', command], { cwd: ctx.workdir, env: cleanEnv(ctx.userHome, extraEnv), encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function git(ctx, args) {
  return cp.execFileSync('git', args, { cwd: ctx.workdir, env: cleanEnv(ctx.userHome), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function newScratch(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const EXIT = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };

export function itResult(ctx, o) {
  const status = (o && o.status) || 'ok';
  return {
    schema: 'it-result/1',
    stage: 'build-it',
    run_id: ctx.runId,
    slice_id: null,
    version: '0.1.0',
    head_sha: null,
    status,
    exit_code: EXIT[status],
    verdicts: [],
    run_verdict: null,
    next: null,
    pending_human: null,
    artifacts: [],
    resume: { state_files: [], next_action: '' },
    tokens: { meter: '', peak_ctx: 0, tier_mix: { T1: 0, T2: 0, T3: 0 }, estimated: true },
    ...(o || {}),
  };
}

let seq = 0;
export function record(ctx, o) {
  const name = 'results/step-' + String(++seq).padStart(3, '0') + '.json';
  writeJson(path.join(ctx.workdir, name), itResult(ctx, o));
  return spine(ctx, ['record', '--result', name]);
}

export function stateOf(ctx) { return readJson(path.join(doItDir(ctx), 'runs', ctx.runId, 'state.json')); }
export function ledgerOf(ctx) {
  const f = path.join(doItDir(ctx), 'runs', ctx.runId, 'ledger.json');
  return fs.existsSync(f) ? readJson(f) : { rows: [] };
}
export function doItDir(ctx) { return path.join(ctx.workdir, '.do-it'); }
export function runDirOf(ctx) { return path.join(doItDir(ctx), 'runs', ctx.runId); }
