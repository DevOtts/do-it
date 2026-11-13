import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cleanup, mkFixtureRepo, needReal, runJest, runListFiles } from '../helpers.mjs';

after(cleanup);

const PLANTED = ['planted/p-import-throws.spec.ts', 'planted/p-zero-tests.spec.ts', 'planted/p-all-skipped.spec.ts', 'planted/p-todo-only.spec.ts'];

test('T-A1-02 [REAL] a crashed, empty, all-skipped or todo-only suite is never a PASS, and a resumed run selects all four again (G-2)', async (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const res = await runJest(repo, { real, planted: true, paths: PLANTED });
  const by = Object.fromEntries(res.finishes.map((r) => [r.file, r]));
  assert.equal(res.finishes.length, 4, res.stderr);
  assert.equal(by[PLANTED[0]].result, 'FAIL');
  assert.equal(by[PLANTED[0]].exec_error, true);
  assert.equal(by[PLANTED[1]].result, 'FAIL');
  assert.equal(by[PLANTED[1]].exec_error, true);
  assert.equal(by[PLANTED[2]].result, 'SKIPPED');
  assert.equal(by[PLANTED[2]].counts.skipped, 3);
  assert.equal(by[PLANTED[3]].result, 'SKIPPED');
  assert.equal(by[PLANTED[3]].counts.pending, 2);
  assert.equal(res.finishes.filter((r) => r.result === 'PASS').length, 0);
  const again = await runJest(repo, { real, planted: true, paths: PLANTED, resume: true });
  assert.deepEqual(runListFiles(again), PLANTED.slice().sort(), 'none of the four is reusable');
  assert.equal(again.decideCalls, 1);
});
