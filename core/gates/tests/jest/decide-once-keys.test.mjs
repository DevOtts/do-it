import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { FAKE_DECIDE, FILTER, REPORTER, cleanup, fakeResolver, mkManifest, mkRepo, readJson, storeRows, testResult, write } from '../helpers.mjs';

after(cleanup);
const require = createRequire(import.meta.url);
const filter = require(FILTER);
const Reporter = require(REPORTER);

const FILES = Array.from({ length: 30 }, (_, i) => 'spec/s' + String(i + 1).padStart(2, '0') + '.spec.js');

test('T-A1-13 decide is called once; keys.json has 30 keyed entries; a dependency edited mid-run yields KEY_DRIFT and no finish row', async () => {
  const repo = mkRepo({
    'src/util.js': 'module.exports = 1;\n',
    ...Object.fromEntries(FILES.map((f, i) => [f, i === 4 ? "require('../src/util');\ntest('x', () => {});\n" : "test('x', () => {});\n"])),
  });
  const m = mkManifest(repo, { alwaysRun: [] });
  const calls = path.join(m.runDir, 'calls');
  const env = { ...process.env, DO_IT_GATE_MANIFEST: m.manifestFile, DO_IT_GATE_DECIDE: FAKE_DECIDE, FAKE_DECIDE_COUNT_FILE: calls };
  const paths = FILES.map((f) => path.join(repo.dir, f));
  const out = await filter.filterPaths(paths, { env, cwd: repo.dir, context: { resolver: fakeResolver(false), config: {}, version: '29.7.0' }, log: () => {} });
  assert.equal(out.filtered.length, 30);
  assert.equal(fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).length, 1, 'decide invoked exactly once');
  const keys = readJson(path.join(m.runDir, 'keys.json'));
  assert.equal(keys.files.length, 30);
  assert.ok(keys.files.every((f) => f.class && Array.isArray(f.deps) && f.deps.length >= 1));
  assert.deepEqual(keys.files[4].deps.map((d) => d.path), ['spec/s05.spec.js', 'src/util.js']);

  // adversarial re-read: the dependency changes after keys.json was written and before the finish row
  write(repo, 'src/util.js', 'module.exports = 2;\n');
  const rep = new Reporter({}, { env, cwd: repo.dir });
  rep.onRunStart({}, {});
  for (const p of paths) {
    const t = { path: p };
    rep.onTestFileStart(t);
    rep.onTestFileResult(t, testResult(), {});
  }
  rep.onRunComplete(new Set(), { numTotalTestSuites: 30, wasInterrupted: false, numFailedTests: 0 });
  const fin = storeRows(repo).filter((r) => r.type === 'finish').map((r) => r.file);
  assert.equal(fin.length, 29);
  assert.ok(!fin.includes('spec/s05.spec.js'), 'the affected file gets no finish row');
  const report = readJson(path.join(m.runDir, 'runner-report.json'));
  assert.equal(report.reason, 'KEY_DRIFT');
  assert.equal(report.tainted, false);
});
