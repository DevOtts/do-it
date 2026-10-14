// Character-based token estimate (owner ruling D5, amendment A6): ceil(chars / ratio), ratio default 4.
export const DEFAULT_RATIO = 4;

export function estimateTokens(text, ratio = DEFAULT_RATIO) {
  if (typeof text !== 'string' || text.length === 0) {
    return { tokens: null, estimated: false, source: 'unknown' };
  }
  return { tokens: Math.ceil(text.length / ratio), estimated: true, source: 'estimate' };
}

// Meter row for a call: provider usage wins; else estimate from text; else unknown (G-6).
export function meterRow(usage, text, ratio = DEFAULT_RATIO) {
  if (usage && typeof usage === 'object') {
    return { ...usage, estimated: false, source: 'provider' };
  }
  const e = estimateTokens(text, ratio);
  return { tokens_in: e.tokens, tokens_out: null, estimated: e.estimated, source: e.source };
}
