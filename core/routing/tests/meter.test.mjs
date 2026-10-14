import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { buildRow, normalizeUsage, openMeter, recordSpawn } from '../meter-lib.mjs';
import { kpi } from '../kpi.mjs';
import { probeFlag } from '../tier-policy.mjs';
import { cli, lib, tmp } from './helpers.mjs';

const ctx = { run_id: 'r1', slice_id: 's1', tier: 'T2', host: 'h' };

test('T-P2-02 G-6 model-stated usage is ignored', () => {
  const dir = tmp();
  const file = path.join(dir, 'token-meter.jsonl');
  const logs = [];
  const body = JSON.stringify({ status: 'ok', tokens: 99999 });
  const { row, logs: l } = recordSpawn({ file, ctx, adapterUsage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, resultBody: body, log: (m) => logs.push(m) });
  assert.equal(row.tokens_in, 1200);
  assert.equal(row.tokens_out, 300);
  assert.equal(row.source, 'provider');
  assert.equal(row.estimated, false);
  assert.ok(l.some((m) => m.startsWith('MODEL_STATED_USAGE_IGNORED')));
  assert.ok(logs.some((m) => m.startsWith('MODEL_STATED_USAGE_IGNORED')));
  assert.ok(!fs.readFileSync(file, 'utf8').includes('99999'));
});

test('T-P2-14 G-6 meter sources are honest', () => {
  const a = buildRow({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 1, cache_read_input_tokens: 2 }, ctx);
  assert.deepEqual([a.source, a.estimated], ['provider', false]);
  const b = buildRow(null, ctx, 'x'.repeat(4000));
  assert.deepEqual([b.source, b.estimated, b.tokens_in], ['estimate', true, 1000]);
  const c = buildRow(null, ctx);
  assert.deepEqual([c.source, c.estimated, c.tokens_in, c.tokens_out], ['unknown', false, null, null]);
});

test('T-P2-15 G-6 usage shapes normalise, cache fields kept', () => {
  const s1 = normalizeUsage({ input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 7, cache_read_input_tokens: 9 });
  assert.deepEqual([s1.cache_read, s1.cache_write, s1.tokens_in], [9, 7, 100]);
  const s2 = normalizeUsage({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 });
  assert.equal(s2.cache_read, 40);
  assert.equal(s2.cache_write, null, 'no write field is null, not 0');
  const s3 = normalizeUsage({ tokens: { input: 50, output: 10, cache: { read: 30, write: 5 } } });
  assert.deepEqual([s3.tokens_in, s3.tokens_out, s3.cache_read, s3.cache_write], [50, 10, 30, 5]);
  assert.equal(normalizeUsage({ nonsense: 1 }), null);
});

test('T-P2-16 KPI tokens per VERIFIED row', () => {
  const ledger = { rows: [1, 2, 3, 4].map((i) => ({ row: 'r' + i, verdict: 'VERIFIED' })).concat([{ row: 'r5', verdict: 'BLOCKED' }]) };
  const mk = (n, extra) => ({ tokens_in: n, tokens_out: 0, cache_read: 0, cache_write: 0, estimated: false, source: 'provider', ...extra });
  const rows = [mk(10000), mk(10000), mk(10000), mk(5000), mk(5000, { estimated: true, source: 'estimate' })];
  const k = kpi({ ledger, meterRows: rows });
  assert.equal(k.kpi, 10000);
  assert.equal(k.estimated, true);
  assert.equal(k.unknown_rows, 0);
  const withUnknown = kpi({ ledger, meterRows: [...rows, { tokens_in: null, tokens_out: null, cache_read: null, cache_write: null, estimated: false, source: 'unknown' }] });
  assert.equal(withUnknown.unknown_rows, 1);
  assert.equal(withUnknown.kpi, 10000);
  const none = kpi({ ledger: { rows: [{ row: 'x', verdict: 'BLOCKED' }] }, meterRows: rows });
  assert.equal(none.kpi, null);
  assert.equal(none.reason, 'NO_VERIFIED_ROWS');
});

test('T-P2-17 [REAL] each host exposes a per-spawn model flag', () => {
  const probes = [
    { command: 'claude', args: ['--help'] },
    { command: 'codex', args: ['exec', '--help'] },
    { command: 'opencode', args: ['run', '--help'] }
  ].map((p) => probeFlag({ ...p, flag: '--model' }));
  for (const p of probes) {
    // a host whose output lacks the flag (or is not installed) is recorded unknown, never true
    assert.ok(p.per_spawn_model === true || p.per_spawn_model === 'unknown');
    assert.equal(p.found, p.per_spawn_model === true);
  }
  assert.deepEqual(probes.map((p) => p.found), [true, true, true], JSON.stringify(probes));
  // unreachable target is recorded unknown, not true
  assert.equal(probeFlag({ command: 'definitely-not-a-binary-xyz', args: ['--help'], flag: '--model' }).per_spawn_model, 'unknown');
});

test('T-P2-18 [REAL] meter file is append-only across restarts', () => {
  const file = path.join(tmp(), 'token-meter.jsonl');
  const m1 = openMeter(file);
  for (let i = 0; i < 3; i++) m1.append(buildRow({ input_tokens: i + 1, output_tokens: 1 }, { ...ctx, event: 'e' + i }));
  const before = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(before).digest('hex');
  const m2 = openMeter(file); // restart: a fresh handle on the same real file
  m2.append(buildRow(null, ctx, 'abcd'));
  m2.append(buildRow(null, ctx));
  const after = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(after.subarray(0, before.length)).digest('hex'), hash);
  const lines = after.toString('utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 5);
  lines.forEach((l) => JSON.parse(l));
  const r = cli(lib('meter-lib.mjs'), ['rewrite', '--file', file, '--row', '2']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'METER_APPEND_ONLY');
  assert.equal(fs.readFileSync(file).toString(), after.toString());
});
