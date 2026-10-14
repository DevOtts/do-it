// Usage for opencode. Cost: `opencode stats --cost --json` (aggregate) or the session export's info.cost.
// Tokens: `opencode session export` -> info.tokens {input, output, reasoning, cache:{read, write}} (shape observed on v2.0.18;
// whether `run --format json` carries usage is unknown). Missing usage is unknown, never zero (G-6).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { meterRow } from '../../_interface/lib/estimate.mjs';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function statsRow(stats) {
  const cost = num(stats && stats.cost);
  return { cost_usd: cost, cost_source: cost === null ? 'unknown' : 'stats', sessions: num(stats && stats.sessions), tokens: stats && stats.tokens ? stats.tokens : null };
}

export function exportTokens(exported) {
  const t = exported && (exported.info?.tokens ?? exported.tokens);
  if (!t || typeof t !== 'object' || num(t.input) === null || num(t.output) === null) return null;
  return t;
}

// Combine a session export with an optional stats object into a token-meter row.
export function combine({ stats = null, exported = null, text } = {}) {
  const t = exportTokens(exported);
  const exportCost = num(exported && (exported.info?.cost ?? exported.cost));
  const statsCost = num(stats && stats.cost);
  const cost = exportCost ?? statsCost;
  const cost_source = exportCost !== null ? 'export' : statsCost !== null ? 'stats' : 'unknown';
  if (!t) {
    const e = meterRow(null, text);
    return { tokens_in: e.tokens_in, tokens_out: null, cache_read: null, cache_write: null, cost_usd: cost, cost_source, estimated: e.estimated, source: e.source };
  }
  return {
    tokens_in: t.input, tokens_out: t.output,
    cache_read: num(t.cache?.read) ?? 0, cache_write: num(t.cache?.write) ?? 0,
    extra: { reasoning: num(t.reasoning) },
    cost_usd: cost, cost_source, estimated: false, source: 'provider',
  };
}

export function readStats(bin = 'opencode') {
  return JSON.parse(execFileSync(bin, ['stats', '--cost', '--json', '--standalone'], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 }));
}
export function readExport(sessionId, { bin = 'opencode', cwd = process.cwd() } = {}) {
  return JSON.parse(execFileSync(bin, ['session', 'export', sessionId, '--standalone'], { encoding: 'utf8', timeout: 120000, cwd, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a.includes('--stats')) {
    try { console.log(JSON.stringify(statsRow(readStats(a.includes('--bin') ? a[a.indexOf('--bin') + 1] : 'opencode')))); } catch (e) { console.error(`stats failed: ${e.message}`); process.exit(2); }
  } else if (a.includes('--export')) {
    console.log(JSON.stringify(combine({ exported: JSON.parse(readFileSync(a[a.indexOf('--export') + 1], 'utf8')) })));
  } else { console.error('usage: meter.mjs --stats | --export FILE'); process.exit(2); }
}
