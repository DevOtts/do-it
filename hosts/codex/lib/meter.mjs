// `turn.completed.usage` events -> token-meter row (G-6). No cost field exists in codex output, so cost is
// computed only from an owner-supplied price table (prices.json) and always flagged estimated.
// Real shape observed on codex 0.156.1: input_tokens, cached_input_tokens, cache_write_input_tokens,
// output_tokens, reasoning_output_tokens. Older shapes lack cache_write_input_tokens: then cache_write is 0 and estimated.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRICES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'prices.json');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function loadPrices(path = PRICES_PATH) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// prices: { "<model>"|"default": { input_usd_per_mtok, output_usd_per_mtok?, cached_input_usd_per_mtok? } }
export function costFor(row, prices, model) {
  const p = prices && (prices[model] || prices.default);
  if (!p || num(p.input_usd_per_mtok) === null || row.tokens_in === null) return { cost_usd: null, cost_source: 'unknown' };
  const out = num(p.output_usd_per_mtok) !== null && row.tokens_out !== null ? row.tokens_out * p.output_usd_per_mtok : 0;
  const cost = (row.tokens_in * p.input_usd_per_mtok + out) / 1e6;
  return { cost_usd: Math.round(cost * 1e9) / 1e9, cost_source: 'price-table', ...(num(p.output_usd_per_mtok) === null ? { cost_partial: 'output-unpriced' } : {}) };
}

export function usageFromEvents(events, { prices = loadPrices(), model } = {}) {
  const us = events.filter((e) => e && e.type === 'turn.completed' && e.usage && typeof e.usage === 'object').map((e) => e.usage);
  if (!us.length || us.some((u) => num(u.input_tokens) === null || num(u.output_tokens) === null)) {
    return { tokens_in: null, tokens_out: null, cache_read: null, cache_write: null, cost_usd: null, cost_source: 'unknown', estimated: false, source: 'unknown' };
  }
  const sum = (k) => us.reduce((s, u) => s + (num(u[k]) ?? 0), 0);
  const hasWrite = us.every((u) => num(u.cache_write_input_tokens) !== null);
  const row = {
    tokens_in: sum('input_tokens'),
    tokens_out: sum('output_tokens'),
    cache_read: sum('cached_input_tokens'),
    cache_write: hasWrite ? sum('cache_write_input_tokens') : 0,
    extra: { reasoning_output_tokens: sum('reasoning_output_tokens') },
    unknown: ['reasoning-included-in-output'],
    source: 'provider',
  };
  const cost = costFor(row, prices, model);
  // Estimated unless the host reported every field and no cost was derived (owner ruling D5).
  row.estimated = !hasWrite || cost.cost_usd !== null;
  return { ...row, ...cost };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const file = a[a.indexOf('--jsonl') + 1];
  if (!a.includes('--jsonl') || !file) { console.error('usage: meter.mjs --jsonl FILE [--prices FILE] [--model M]'); process.exit(2); }
  const { parseJsonl } = await import('./jsonl.mjs');
  const pi = a.indexOf('--prices');
  const prices = pi >= 0 ? JSON.parse(readFileSync(a[pi + 1], 'utf8')) : loadPrices();
  const mi = a.indexOf('--model');
  console.log(JSON.stringify(usageFromEvents(parseJsonl(readFileSync(file, 'utf8')).events, { prices, model: mi >= 0 ? a[mi + 1] : undefined })));
}
