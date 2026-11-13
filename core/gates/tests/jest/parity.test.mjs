import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateFpComponents, gateFpRunnerLine, gateKeyAssemble } from '../../../spine/src/gate-fingerprint.mjs';
import { gateRowLine, gateRowParse, gateStoreScan } from '../../../spine/src/gate-results.mjs';
import { canonicalJson } from '../../../spine/src/hash.mjs';
import { COMMON, GOLDEN_ROW, cleanup, mkRepo, readJson } from '../helpers.mjs';

after(cleanup);
const common = createRequire(import.meta.url)(COMMON);
const golden = (f) => fs.readFileSync(path.join(GOLDEN_ROW, f), 'utf8');

const CORPUS = (() => {
  const base = readJson(path.join(GOLDEN_ROW, 'golden-row.json'));
  const rows = [base];
  const runId = base.run_id;
  rows.push({ ...base, type: 'start', result: undefined, counts: undefined, retried: undefined, exec_error: undefined, duration_ms: undefined, failure_ref: undefined });
  rows.push({ ...base, result: 'FAIL', exec_error: true, counts: { passed: 0, failed: 0, skipped: 0, pending: 0 }, failure_ref: 'failures/' + 'ab'.repeat(32) + '.txt' });
  rows.push({ ...base, result: 'SKIPPED', counts: { passed: 0, failed: 0, skipped: 3, pending: 2 }, file: 'tests/test_ação.py' });
  rows.push({ ...base, file: 'src/a b/\u{1D4B3}.spec.ts', retried: true });
  rows.push({ schema: base.schema, type: 'run_end', run_id: runId, at: base.at, tainted: false, reason: null, verdict: 'GATE_PASS_FRESH' });
  return rows;
})();

test('A1-08 parity: the adapter row line and crc equal the spine canonicalJson over the golden corpus', () => {
  const g = readJson(path.join(GOLDEN_ROW, 'golden-row.json'));
  assert.equal(common.rowLine(g), golden('golden-row.line').replace(/\n$/, ''));
  assert.equal(JSON.parse(common.rowLine(g)).crc, golden('golden-row.crc').trim());
  for (const row of CORPUS) {
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
    assert.equal(common.rowLine(clean), gateRowLine(clean));
    const { crc, ...rest } = JSON.parse(common.rowLine(clean));
    assert.equal(common.canonicalJson(rest), canonicalJson(rest));
    assert.equal(crc, common.rowCrc(rest));
  }
});

test('A1-08 parity: the composed rtg-key/1 manifest equals the golden manifest and key of F1', () => {
  const dir = path.join(GOLDEN_ROW, 'rtg-key-golden');
  const input = readJson(path.join(dir, 'input.json'));
  const spineTexts = input.spine.map((l) => l.join('\t'));
  const c = common.composeKey(spineTexts, input.adapter);
  assert.equal(c.manifest, fs.readFileSync(path.join(dir, 'manifest.txt'), 'utf8'));
  assert.equal(c.key, fs.readFileSync(path.join(dir, 'key.txt'), 'utf8').trim());
  assert.equal(c.key, gateKeyAssemble(input.spine, input.adapter).key);
  assert.deepEqual(common.componentsOf(c.lines), gateFpComponents([...input.spine, ...input.adapter]));
});

test('A1-08 parity: the runner line of the adapter equals gateFpRunnerLine for the same argv', () => {
  const argvs = [
    [], ['--ci'], ['--ci', '--filter=/x/filter.cjs', '--reporters=/x/reporter.cjs', 'test/a.spec.ts', '--runTestsByPath'],
    ['--config', 'jest.config.js', '--maxWorkers', '2', '--reporters', 'default', 'a.spec.ts'], ['-i', '--silent', '--testPathPattern', 'foo', '--json', '--outputFile', 'o.json'],
  ];
  for (const argv of argvs) {
    assert.deepEqual(common.runnerLine('jest', '29.7.0', argv), gateFpRunnerLine('jest', '29.7.0', argv), JSON.stringify(argv));
  }
});

test('A1-08 parity: a row written by the adapter is accepted by the L1 scan and fails the CRC check once a byte flips', () => {
  const repo = mkRepo({ 'a.txt': 'x\n' });
  const store = { backend: 'local', dir: repo.store };
  const row = CORPUS[0];
  common.appendRow(repo.store, row);
  const scan = gateStoreScan(store, {});
  assert.equal(scan.items.length, 1);
  assert.equal(scan.items[0].ok, true);
  const line = fs.readFileSync(path.join(repo.store, 'results.jsonl'), 'utf8').split('\n')[0];
  assert.ok(gateRowParse(line));
  assert.equal(gateRowParse(line.replace('"passed":12', '"passed":13')), null, 'a flipped byte is CORRUPT');
});
