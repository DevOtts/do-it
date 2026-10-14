import { DEFAULT_FILE } from './drivers-load.mjs';
import fs from 'node:fs';

export const LIMITS = { short_gap_s: 270, max_1h_gap_s: 3570, min_reuses_for_1h: 2 };

// D16: 5m up to 270 s; 1h only when the gap fits an hour and >= 2 reuses are expected; beyond an hour cold_expected.
export function decideTtl({ gap_s, expected_calls }) {
  if (gap_s <= LIMITS.short_gap_s) return { ttl: '5m', cold_expected: false };
  if (gap_s > LIMITS.max_1h_gap_s) return { ttl: '5m', cold_expected: true };
  if (expected_calls >= LIMITS.min_reuses_for_1h) return { ttl: '1h', cold_expected: false };
  return { ttl: '5m', cold_expected: false };
}

export function defaultMinTable() {
  return JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8')).kinds.anthropic.min_prefix_tokens.value;
}

// No marker below the model minimum; a model absent from the table is unknown, never assumed cacheable.
export function markerPolicy({ model, prefix_tokens, table }) {
  const t = table || defaultMinTable();
  const min = t[model];
  if (typeof min !== 'number') return { marker_policy: 'unknown', marker: false, ttl_allowed: ['5m'], cache_expected: 'unknown' };
  if (prefix_tokens < min) return { marker_policy: 'none', marker: false, event: 'BELOW_MIN_PREFIX', min_prefix_tokens: min, prefix_tokens };
  return { marker_policy: 'marker', marker: true, min_prefix_tokens: min, cache_expected: true };
}
