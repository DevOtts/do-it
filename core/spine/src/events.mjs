import path from 'node:path';
import { fail } from './errors.mjs';
import { appendLine } from './fs-atomic.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';

export const EVENT_FIELDS = ['ts', 'run_id', 'slice_id', 'stage', 'persona', 'tier', 'model', 'host', 'event', 'parent_id', 'verdict'];

export function eventsPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'events.jsonl');
}

// Frozen row: exactly the 11 trace fields; `detail` is added only when given.
export function buildEventRow(ctx, runId, fields) {
  const row = {};
  for (const k of EVENT_FIELDS) row[k] = fields[k] === undefined ? null : fields[k];
  row.ts = fields.ts || ctx.now();
  row.run_id = runId;
  if (fields.detail !== undefined) row.detail = fields.detail;
  return row;
}

export function appendEvent(ctx, runId, fields) {
  const row = buildEventRow(ctx, runId, fields);
  const errors = validateSchema(loadSchemaFile('events.schema.json'), row);
  if (errors.length) throw fail('EVENT_INVALID', 1, { errors });
  appendLine(eventsPath(ctx, runId), JSON.stringify(row));
  return row;
}
