import path from 'node:path';
import { fail } from './errors.mjs';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';

export function ledgerPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'ledger.json');
}

export function readLedger(ctx, runId) {
  const l = readJsonIfExists(ledgerPath(ctx, runId));
  if (!l || !Array.isArray(l.rows)) return { schema: 'do-it-ledger/1', run_id: runId, rows: [] };
  return l;
}

export function writeLedger(ctx, ledger) {
  const errors = validateSchema(loadSchemaFile('ledger.schema.json'), ledger);
  if (errors.length) throw fail('LEDGER_INVALID', 1, { errors });
  atomicWriteJson(ledgerPath(ctx, ledger.run_id), ledger);
}

// One row per id: the latest verdict wins, recorded_at is kept from the first write.
export function ledgerUpsert(ledger, row) {
  const i = ledger.rows.findIndex((r) => r.row === row.row);
  if (i === -1) {
    ledger.rows.push(row);
  } else {
    ledger.rows[i] = { ...row, recorded_at: ledger.rows[i].recorded_at };
  }
}
