import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateFold, gateStoreLiveRuns, gateStoreScan } from '../../../spine/src/gate-results.mjs';
import { cleanup, mkFixtureRepo, needReal, readJson, runJest, storeHandle } from '../helpers.mjs';

after(cleanup);

test('T-A1-10 [REAL] a retried pass is PASS with retried true, folds to FLAKY, and the next decide selects it as flaky', async (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const file = 'planted/p-retry.spec.ts';
  const res = await runJest(repo, { real, planted: true, paths: [file] });
  assert.equal(res.finishes.length, 1, res.stderr);
  const row = res.finishes[0];
  assert.equal(row.result, 'PASS');
  assert.equal(row.retried, true);
  assert.equal(row.counts.passed, 1);
  const scan = gateStoreScan(storeHandle(repo), {});
  const fold = gateFold(scan.items, { key: row.key, components: row.components }, Date.now(), { file, leg: 'unit', liveRuns: gateStoreLiveRuns(scan.items), source: scan.source });
  assert.equal(fold.state, 'FLAKY');
  assert.equal(fold.reuse, null);
  const next = await runJest(repo, { real, planted: true, paths: [file] });
  const dec = readJson(path.join(next.runDir, 'decision.json')).files.find((d) => d.file === file);
  assert.equal(dec.decision, 'run');
  assert.equal(dec.why, 'flaky');
});
