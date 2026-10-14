import { normalizeUsage } from '../routing/meter-lib.mjs';

export const MIN_REQUESTS = 20;
export const REGRESSION = { relative_drop: 0.15, min_window: 10 };
const n = (v) => (typeof v === 'number' ? v : null);

// Cache fields from a provider usage object; absent fields stay null, never 0 (G-6).
export function cacheFields(usage) {
  const u = normalizeUsage(usage);
  return u ? { cache_read: u.cache_read, cache_write: u.cache_write, uncached: u.tokens_in } : { cache_read: null, cache_write: null, uncached: null };
}

// rows: [{cache_read, cache_write, uncached|tokens_in}] kept exactly as given.
export function hitRate(rows) {
  if (rows.length < MIN_REQUESTS) return { hit_rate: null, event: 'TOO_FEW_REQUESTS', requests: rows.length, rows };
  let read = 0; let write = 0; let unc = 0; let writeUnknown = false;
  for (const r of rows) {
    read += n(r.cache_read) || 0;
    unc += n(r.uncached !== undefined ? r.uncached : r.tokens_in) || 0;
    if (n(r.cache_write) === null) writeUnknown = true; else write += r.cache_write;
  }
  const denom = read + write + unc;
  const out = { hit_rate: denom === 0 ? null : read / denom, requests: rows.length, rows };
  if (writeUnknown) out.write_unknown = true;
  return out;
}

const rateOf = (x) => (typeof x === 'number' ? x : hitRate(x).hit_rate);

// baseline and window are hit rates or row arrays; a window below min_window requests is not judged.
export function detectRegression(baseline, window, opts = REGRESSION) {
  if (Array.isArray(window) && window.length < opts.min_window) return { event: null, reason: 'TOO_FEW_REQUESTS' };
  const b = typeof baseline === 'number' ? baseline : baseline.length >= MIN_REQUESTS ? hitRate(baseline).hit_rate : null;
  const w = typeof window === 'number' ? window : rowsRate(window);
  if (b === null || w === null || b === 0) return { event: null };
  if ((b - w) / b > opts.relative_drop) return { event: 'CACHE_REGRESSION', baseline_rate: b, window_rate: w };
  return { event: null, baseline_rate: b, window_rate: w };
}

function rowsRate(rows) {
  let read = 0; let write = 0; let unc = 0;
  for (const r of rows) { read += n(r.cache_read) || 0; write += n(r.cache_write) || 0; unc += n(r.uncached !== undefined ? r.uncached : r.tokens_in) || 0; }
  const d = read + write + unc;
  return d === 0 ? null : read / d;
}
export { rateOf };
