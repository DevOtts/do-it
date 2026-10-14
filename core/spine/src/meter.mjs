import path from 'node:path';
import { fail } from './errors.mjs';
import { buildEventRow } from './events.mjs';
import { appendLine } from './fs-atomic.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { loadState, selectRunId } from './state.mjs';

export function meterPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'token-meter.jsonl');
}

// meter --append --row '<json>' (or the individual flags). A row without a
// source is refused and never appended (ruling D17, G-6).
export function cmdMeter(ctx, args) {
  const f = args.flags;
  if (!f.append) throw fail('USAGE', 1, { message: 'meter requires --append' });
  const runId = selectRunId(ctx, f);
  loadState(ctx, runId);
  let input = {};
  if (f.row !== undefined) {
    try { input = JSON.parse(f.row); } catch (e) { throw fail('METER_ROW_INVALID', 1, { message: 'row is not JSON: ' + e.message }); }
  } else {
    for (const [flag, key] of [['tokens-in', 'tokens_in'], ['tokens-out', 'tokens_out'], ['cache-read', 'cache_read'], ['cache-write', 'cache_write']]) {
      if (f[flag] !== undefined) input[key] = Number(f[flag]);
    }
    if (f.source !== undefined) input.source = f.source;
    if (f.estimated !== undefined) input.estimated = f.estimated === true || f.estimated === 'true';
    for (const [flag, key] of [['slice-id', 'slice_id'], ['stage', 'stage'], ['persona', 'persona'], ['tier', 'tier'], ['model', 'model'], ['host', 'host'], ['event', 'event'], ['parent-id', 'parent_id']]) {
      if (f[flag] !== undefined) input[key] = f[flag];
    }
  }
  if (input.source === undefined || input.source === null || input.source === '') {
    throw fail('METER_SOURCE_REQUIRED', 1, { message: 'a meter row needs source: provider, estimate or unknown' });
  }
  const row = buildEventRow(ctx, runId, { ...input, event: input.event || 'meter' });
  for (const k of ['tokens_in', 'tokens_out', 'cache_read', 'cache_write']) row[k] = input[k] === undefined ? 0 : input[k];
  row.estimated = input.estimated === undefined ? false : input.estimated;
  row.source = input.source;
  if (input.extra !== undefined) row.extra = input.extra;
  const errors = validateSchema(loadSchemaFile('token-meter.schema.json'), row);
  if (errors.length) throw fail('METER_ROW_INVALID', 1, { errors });
  appendLine(meterPath(ctx, runId), JSON.stringify(row));
  return { outcome: 'METER_APPENDED', exit: 0, run_id: runId, row };
}
