import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from './errors.mjs';

export const SHAPES = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./usage-shapes.json', import.meta.url)), 'utf8')).shapes;
export const TRACE_FIELDS = ['ts', 'run_id', 'slice_id', 'stage', 'persona', 'tier', 'model', 'host', 'event', 'parent_id', 'verdict'];

function dig(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

// Normalise a provider usage object through the shape table. Returns null when no shape matches.
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  let best = null;
  for (const s of SHAPES) {
    const present = s.requires.filter((p) => dig(usage, p) !== undefined).length;
    if (present === s.requires.length) return pick(usage, s);
    // partial match on the token fields still beats nothing, but only if both in and out exist
    if (!best && dig(usage, s.fields.tokens_in) !== undefined && dig(usage, s.fields.tokens_out) !== undefined) best = s;
  }
  return best ? pick(usage, best) : null;
}

function pick(usage, shape) {
  const out = { shape: shape.id };
  for (const k of ['tokens_in', 'tokens_out', 'cache_read', 'cache_write']) {
    const p = shape.fields[k];
    out[k] = p ? num(dig(usage, p)) : null;
  }
  return out;
}

const estimateTokens = (s) => Math.ceil(String(s).length / 4);

// meterReturn: what the adapter meter() gave (usage object or null). ctx: trace fields. payload: text we can measure.
export function buildRow(meterReturn, ctx, payload) {
  const c = ctx || {};
  const row = {};
  for (const k of TRACE_FIELDS) row[k] = c[k] === undefined ? null : c[k];
  row.event = c.event || 'meter';
  const norm = normalizeUsage(meterReturn);
  if (norm) {
    Object.assign(row, { tokens_in: norm.tokens_in, tokens_out: norm.tokens_out, cache_read: norm.cache_read, cache_write: norm.cache_write, estimated: false, source: 'provider' });
    row.extra = { shape: norm.shape };
  } else if (payload !== undefined && payload !== null && String(payload).length > 0) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    Object.assign(row, { tokens_in: estimateTokens(text), tokens_out: null, cache_read: null, cache_write: null, estimated: true, source: 'estimate' });
  } else {
    Object.assign(row, { tokens_in: null, tokens_out: null, cache_read: null, cache_write: null, estimated: false, source: 'unknown' });
  }
  return row;
}

// A "tokens" claim in a model-written result body is never a measurement (G-6).
export function findModelStatedUsage(body) {
  const hits = [];
  const walk = (v, p) => {
    if (v === null || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if (/^(tokens|tokens_in|tokens_out|token_usage|usage|total_tokens|input_tokens|output_tokens)$/.test(k)) hits.push(p + k);
      walk(val, p + k + '.');
    }
  };
  let obj = body;
  if (typeof body === 'string') {
    try { obj = JSON.parse(body); } catch { obj = null; }
    if (obj === null && /"?(tokens|total_tokens|tokens_in|tokens_out)"?\s*[:=]\s*\d/.test(body)) hits.push('text');
  }
  walk(obj, '');
  return hits;
}

// Open (or re-open) an append-only meter file. Existing bytes are never rewritten.
export function openMeter(file, opts) {
  const log = (opts && opts.log) || (() => {});
  return {
    file,
    rows() {
      if (!fs.existsSync(file)) return [];
      return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    },
    append(row) {
      for (const k of ['tokens_in', 'tokens_out', 'cache_read', 'cache_write']) {
        if (row[k] !== null && !(Number.isInteger(row[k]) && row[k] >= 0)) throw fail('METER_ROW_INVALID', 1, { field: k });
      }
      if (!['provider', 'estimate', 'unknown'].includes(row.source)) throw fail('METER_SOURCE_REQUIRED', 1, { message: 'source must be provider, estimate or unknown' });
      if (typeof row.estimated !== 'boolean') throw fail('METER_ROW_INVALID', 1, { field: 'estimated' });
      if (fs.existsSync(file)) {
        const buf = fs.readFileSync(file);
        if (buf.length && buf[buf.length - 1] !== 0x0a) throw fail('METER_FILE_CORRUPT', 1, { message: 'no trailing newline; refusing to append to a torn row' });
      }
      fs.appendFileSync(file, JSON.stringify(row) + '\n');
      return row;
    },
    // No row is ever rewritten or deleted.
    rewrite(n) {
      log('METER_APPEND_ONLY row ' + n);
      throw fail('METER_APPEND_ONLY', 1, { row: n });
    }
  };
}

// Full path: adapter meter() return + the worker result body. Row values come only from the adapter/estimate.
export function recordSpawn({ file, ctx, adapterUsage, payload, resultBody, log }) {
  const lines = log || (() => {});
  const stated = findModelStatedUsage(resultBody);
  const logs = [];
  if (stated.length) {
    const msg = 'MODEL_STATED_USAGE_IGNORED ' + stated.join(',');
    logs.push(msg);
    lines(msg);
  }
  const row = buildRow(adapterUsage, ctx, payload);
  openMeter(file).append(row);
  return { row, logs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const a = process.argv.slice(2);
    const get = (n) => { const i = a.indexOf('--' + n); return i === -1 ? undefined : a[i + 1]; };
    if (a[0] === 'rewrite') return openMeter(get('file')).rewrite(Number(get('row')));
    throw fail('USAGE', 1, { message: 'meter-lib rewrite --file f --row n (the only CLI verb; rewriting always fails)' });
  });
}
