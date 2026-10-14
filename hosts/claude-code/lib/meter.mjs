// Parse the `claude -p --output-format json` result event into a token-meter row (G-6).
// Field names were confirmed against a real result on claude 2.1.300 (see PROBE-NOTES.json).
export const REQUIRED_PATHS = ['session_id', 'total_cost_usd', 'usage.input_tokens', 'usage.output_tokens',
  'usage.cache_read_input_tokens', 'usage.cache_creation_input_tokens'];

const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function usageFromResult(result) {
  const u = result && typeof result === 'object' ? result.usage : null;
  if (!u || typeof u !== 'object' || num(u.input_tokens) === null || num(u.output_tokens) === null) return null;
  return {
    tokens_in: u.input_tokens,
    tokens_out: u.output_tokens,
    cache_read: num(u.cache_read_input_tokens) ?? 0,
    cache_write: num(u.cache_creation_input_tokens) ?? 0,
    cost_usd: num(result.total_cost_usd),
  };
}

export function parseResult(result) {
  const usage = usageFromResult(result);
  if (!usage) {
    return { tokens_in: null, tokens_out: null, cache_read: null, cache_write: null, cost_usd: null, estimated: false, source: 'unknown' };
  }
  return { ...usage, estimated: false, source: 'provider' };
}

// Names in REQUIRED_PATHS that the given result lacks.
export function missingPaths(result) {
  return REQUIRED_PATHS.filter((p) => at(result, p) === undefined);
}
