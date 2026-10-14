// Real Claude Code host run for T-R4-02 (G-3). One tiny `claude -p` call (cheapest tier T3, a subscription alias),
// gated behind DOIT_REAL_CALLS=1. The model only writes the feature; the harness runs the DoD checks itself and
// records the verdicts, so a VERIFIED row never rests on the model's own claim. Never the stub.
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advance, materialize, seedFinishLine, startRun } from './fixture.mjs';
import { git, readJson, record, sh, spine } from './spine.mjs';
import { parseResult } from '../../../hosts/claude-code/lib/meter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MEASUREMENTS = path.resolve(HERE, '..', '..', 'measurements');
const EXPIRED_ALIASES = new Set(['8fai', '8ftools']);
const CALLER_SESSION = /^(CLAUDECODE|CLAUDE_CODE_(SESSION|BRIDGE|MESSAGING|SSE|CHILD)\w*|CLAUDE_PID)$/;

export function realCallsEnabled(env) {
  return (env || process.env).DOIT_REAL_CALLS === '1';
}

export function runFeatureOnClaude(o) {
  const opts = o || {};
  const alias = opts.alias || process.env.DOIT_REAL_ALIAS || 'anm';
  if (EXPIRED_ALIASES.has(alias)) return { available: false, reason: 'alias ' + alias + ' has an expired OAuth session' };
  const profile = path.join(os.homedir(), '.claude-' + alias);
  if (!fs.existsSync(profile)) return { available: false, reason: 'no subscription alias profile at ~/.claude-' + alias };
  if (cp.spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).status !== 0) return { available: false, reason: '`claude` is not installed' };

  const ctx = materialize('feature-overnight', { host: 'claude-code' });
  const dod = readJson(path.join(ctx.workdir, 'dod.json'));
  startRun(ctx, 'feature', fs.readFileSync(path.join(ctx.workdir, 'request.md'), 'utf8').trim());
  seedFinishLine(ctx, dod.rows);
  advance(ctx, 'BUILDING');

  const prompt = [
    fs.readFileSync(path.join(ctx.workdir, 'request.md'), 'utf8').trim(),
    '',
    'The definition of done, each row checked later by the script named in brackets:',
    ...dod.rows.map((r) => '- ' + r.id + ': ' + r.text + ' [' + r.check + ']'),
    '',
    'Read the check scripts under checks/ and the files under src/, then write src/slugify.mjs and export slugify from src/index.mjs.',
    'Only edit files under src/. Do not run commands. Reply with the single word done.',
  ].join('\n');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !CALLER_SESSION.test(k)));
  env.CLAUDE_CONFIG_DIR = profile;
  const argv = ['-p', '--output-format', 'json', '--model', 'haiku', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Write,Edit', '--max-budget-usd', String(opts.maxBudgetUsd || 0.5)];
  const r = cp.spawnSync('claude', argv, { cwd: ctx.workdir, env, input: prompt, encoding: 'utf8', timeout: opts.timeoutMs || 240000, maxBuffer: 64 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* not JSON */ }
  if (r.error || r.status !== 0 || !parsed || parsed.is_error) {
    const why = r.error ? r.error.message : parsed && parsed.is_error ? String(parsed.result).slice(0, 160) : 'exit ' + r.status;
    return { available: false, reason: 'headless call under alias ' + alias + ' failed: ' + why };
  }
  const row = parseResult(parsed);
  const m = spine(ctx, ['meter', '--append', '--source', row.source, '--estimated', String(row.estimated), '--tokens-in', String(row.tokens_in ?? 0), '--tokens-out', String(row.tokens_out ?? 0), '--cache-read', String(row.cache_read ?? 0), '--cache-write', String(row.cache_write ?? 0), '--stage', 'build-it', '--host', 'claude-code', '--model', 'haiku', '--tier', 'T3']);
  if (m.code !== 0) throw new Error('meter append failed: ' + m.stdout);

  git(ctx, ['add', '-A']);
  git(ctx, ['commit', '-q', '-m', 'feat: slugify (written by the real host)', '--allow-empty']);
  advance(ctx, 'VERIFYING');
  const verdicts = [];
  const artifacts = [];
  for (const d of dod.rows) {
    const c = sh(ctx, d.check);
    const rel = 'evidence/' + d.id + '.log';
    fs.mkdirSync(path.join(ctx.workdir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(ctx.workdir, rel), '$ ' + d.check + '\n' + c.stdout + c.stderr + 'exit: ' + c.code + '\n');
    verdicts.push({ row: d.id, verdict: c.code === 0 ? 'VERIFIED' : 'IMPLEMENTED-NOT-VERIFIED', evidence: c.code === 0 ? rel : null, real: true });
    artifacts.push({ path: rel, kind: 'log' });
  }
  const rec = record(ctx, { verdicts, artifacts });
  if (rec.code !== 0) throw new Error('record failed: ' + rec.stdout);
  advance(ctx, 'CONCLUDING');
  const last = spine(ctx, ['gate', 'conclude']);
  return { available: true, ctx, last, alias, model: 'haiku', cost_usd: row.cost_usd, session_id: parsed.session_id };
}
