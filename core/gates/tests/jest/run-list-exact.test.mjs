import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { cleanup, mkFixtureRepo, needReal, runJest, sNN, tmpDir, write } from '../helpers.mjs';

after(cleanup);

test('T-A1-09 [REAL] a run list naming a non-test file ends in COUNT_MISMATCH with exit 1; five valid paths run exactly five files', async (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  write(repo, 'docs/readme.md', 'not a test\n');
  const listFile = path.join(tmpDir('a1-list-'), 'run-list.json');
  const env = { FAKE_DECIDE_MODE: 'fixed', FAKE_DECIDE_RUNLIST: listFile };

  const bad = ['docs/readme.md', ...sNN(1, 4)];
  fs.writeFileSync(listFile, JSON.stringify({ files: bad.map((file) => ({ file })) }));
  const first = await runJest(repo, { real, paths: bad, env });
  assert.equal(first.report.reason, 'COUNT_MISMATCH');
  assert.equal(first.report.sent, 5);
  assert.equal(first.report.received, 4);
  assert.match(first.stderr, /COUNT_MISMATCH sent 5 received 4/);
  assert.equal(first.code, 1);

  const good = sNN(1, 5);
  fs.writeFileSync(listFile, JSON.stringify({ files: good.map((file) => ({ file })) }));
  const second = await runJest(repo, { real, paths: good, env });
  assert.equal(second.finishes.length, 5);
  assert.deepEqual(second.finishes.map((r) => r.file).sort(), good);
  assert.equal(second.report.reason, null);
  assert.equal(second.code, 0, second.stderr);
});
