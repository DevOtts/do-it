// Tokens per VERIFIED row (D13). The breakdown always rides next to the total because subscription meters
// may weight cached reads differently (unknown).
export function kpi({ ledger, meterRows }) {
  const rows = (ledger && ledger.rows) || [];
  const verified = rows.filter((r) => r.verdict === 'VERIFIED').length;
  const m = meterRows || [];
  const breakdown = { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 };
  let estimated = false;
  let unknownRows = 0;
  for (const r of m) {
    for (const k of Object.keys(breakdown)) if (typeof r[k] === 'number') breakdown[k] += r[k];
    if (r.estimated === true || r.source === 'estimate') estimated = true;
    if (r.source === 'unknown') unknownRows++;
  }
  const total = breakdown.tokens_in + breakdown.tokens_out + breakdown.cache_read + breakdown.cache_write;
  const base = { total_tokens: total, verified_rows: verified, breakdown, estimated, unknown_rows: unknownRows };
  if (verified === 0) return { ...base, kpi: null, reason: 'NO_VERIFIED_ROWS' };
  return { ...base, kpi: total / verified };
}
