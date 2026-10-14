#!/usr/bin/env node
// Tokens per VERIFIED row from a token meter (jsonl) and a ledger (json).
// usage: node scripts/tokens-per-row.mjs --meter <token-meter.jsonl> --ledger <ledger.json>
//    or: node scripts/tokens-per-row.mjs --run-dir <.do-it/runs/ID>
// Prints one JSON object. Zero VERIFIED rows gives the string "n/a" (exit 0). A value computed
// from any row whose source is not `provider`, or whose estimated flag is set, carries estimated: true (G-6).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function tokensPerRow(meterRows, ledger) {
  const verified = (ledger.rows || []).filter((r) => r.verdict === 'VERIFIED').length;
  const total = meterRows.reduce((s, r) => s + (Number(r.tokens_in) || 0) + (Number(r.tokens_out) || 0), 0);
  const estimated = meterRows.some((r) => r.estimated === true || r.source !== 'provider');
  return {
    tokens_per_verified_row: verified === 0 ? 'n/a' : total / verified,
    verified_rows: verified,
    meter_rows: meterRows.length,
    tokens_total: total,
    estimated,
    provider_rows: meterRows.filter((r) => r.source === 'provider' && r.estimated !== true).length,
  };
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf('--' + k); return i === -1 ? null : argv[i + 1]; };
  let meter = get('meter');
  let ledger = get('ledger');
  const runDir = get('run-dir');
  if (runDir) { meter = meter || path.join(runDir, 'token-meter.jsonl'); ledger = ledger || path.join(runDir, 'ledger.json'); }
  if (!meter || !ledger) { console.error('usage: tokens-per-row.mjs --meter FILE --ledger FILE | --run-dir DIR'); return 1; }
  let led;
  try { led = JSON.parse(fs.readFileSync(ledger, 'utf8')); } catch (e) { console.error('ledger unreadable: ' + e.message); return 1; }
  process.stdout.write(JSON.stringify(tokensPerRow(readJsonl(meter), led), null, 2) + '\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
