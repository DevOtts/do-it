import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateRowErrors, gateRowParse } from '../../../spine/src/gate-results.mjs';
import { REPORTER, cleanup, mkManifest, mkRepo, readJson, storeRows, synthKeys, testResult, walkFiles } from '../helpers.mjs';

after(cleanup);
const Reporter = createRequire(import.meta.url)(REPORTER);

test('T-A1-01 one start and one finish row per file, valid and CRC-true, FAIL text redacted and content-addressed (G-6)', () => {
  const SECRET = 'sup3r-s3cret-value-9137';
  const files = ['spec/a.spec.js', 'spec/b.spec.js', 'spec/c.spec.js'];
  const repo = mkRepo(Object.fromEntries(files.map((f) => [f, "test('x', () => {});\n"])));
  const m = mkManifest(repo, { envNames: ['GATE_TEST_SECRET'] });
  synthKeys(repo, m, files);
  const env = { ...process.env, DO_IT_GATE_MANIFEST: m.manifestFile, GATE_TEST_SECRET: SECRET };
  const rep = new Reporter({}, { env, cwd: repo.dir });
  rep.onRunStart({}, {});
  const results = [
    testResult({ numPassingTests: 2 }),
    testResult({ numPassingTests: 0, numFailingTests: 1, failureMessage: 'expected ' + SECRET + ' to equal other\n    at spec/b.spec.js:1' }),
    testResult({ numPassingTests: 0, numPendingTests: 2 }),
  ];
  files.forEach((f, i) => {
    const t = { path: path.join(repo.dir, f) };
    rep.onTestFileStart(t);
    rep.onTestFileResult(t, results[i], {});
  });
  rep.onRunComplete(new Set(), { numTotalTestSuites: 3, wasInterrupted: false, numFailedTests: 1 });
  const rows = storeRows(repo);
  assert.equal(rows.length, 6);
  for (const f of files) {
    assert.equal(rows.filter((r) => r.type === 'start' && r.file === f).length, 1);
    assert.equal(rows.filter((r) => r.type === 'finish' && r.file === f).length, 1);
  }
  const raw = fs.readFileSync(path.join(repo.store, 'results.jsonl'), 'utf8').split('\n').filter(Boolean);
  for (const line of raw) {
    assert.ok(Buffer.byteLength(line) + 1 <= 4096, 'row size');
    const row = JSON.parse(line);
    assert.deepEqual(gateRowErrors(row), [], line);
    const { crc, ...rest } = row;
    assert.equal(crc, crypto.createHash('sha256').update(canon(rest)).digest('hex').slice(0, 16));
    assert.ok(gateRowParse(line), 'the spine scan accepts the line');
  }
  const fin = Object.fromEntries(rows.filter((r) => r.type === 'finish').map((r) => [r.file, r]));
  assert.deepEqual(files.map((f) => fin[f].result), ['PASS', 'FAIL', 'SKIPPED']);
  const ref = fin[files[1]].failure_ref;
  const side = path.join(repo.store, ref);
  const bytes = fs.readFileSync(side);
  assert.equal(ref, 'failures/' + crypto.createHash('sha256').update(bytes).digest('hex') + '.txt');
  assert.match(bytes.toString('utf8'), /\[env:GATE_TEST_SECRET\]/);
  for (const f of [...walkFiles(repo.store), ...walkFiles(m.runDir)]) {
    assert.ok(!fs.readFileSync(f).includes(SECRET), 'secret value leaked into ' + f);
  }
  const report = readJson(path.join(m.runDir, 'runner-report.json'));
  assert.equal(report.tainted, false);
  assert.equal(rows.filter((r) => r.type === 'run_end' || r.type === 'run_start').length, 0, 'the adapter writes no run rows');
});

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
