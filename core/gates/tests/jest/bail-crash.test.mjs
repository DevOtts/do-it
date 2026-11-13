import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cleanup, mkFixtureRepo, needReal, runJest } from '../helpers.mjs';

after(cleanup);

test('T-A1-11 [REAL] --bail (bail 1; jest 29.7 ignores the --bail=1 spelling) leaves exactly 3 finish rows and a non-tainted BAIL report; a worker that kills itself is one FAIL with exec_error', async (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const files = [1, 2, 3, 4, 5].map((i) => 'planted/p-bail-' + i + '.spec.ts');
  const bail = await runJest(repo, { real, planted: true, paths: files, args: ['--bail', '--runInBand'] });
  assert.deepEqual(bail.finishes.map((r) => r.file).sort(), files.slice(0, 3));
  assert.equal(bail.finishes.find((r) => r.file === files[2]).result, 'FAIL');
  assert.equal(bail.report.reason, 'BAIL');
  assert.equal(bail.report.interrupted, true);
  assert.equal(bail.report.tainted, false);

  const repo2 = mkFixtureRepo(real);
  const killer = 'planted/p-worker-kill.spec.ts';
  const crash = await runJest(repo2, { real, planted: true, paths: [killer, 'planted/p-plain-1.spec.ts'], args: ['--maxWorkers=2'] });
  const rows = crash.finishes.filter((r) => r.file === killer);
  assert.equal(rows.length, 1, crash.stderr);
  assert.equal(rows[0].result, 'FAIL');
  assert.equal(rows[0].exec_error, true);
  assert.equal(crash.finishes.filter((r) => r.result === 'PASS' && r.file === killer).length, 0);
});
