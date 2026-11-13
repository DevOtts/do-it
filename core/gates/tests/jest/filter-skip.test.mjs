import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { SPECS, cleanup, finishFiles, mkFixtureRepo, needReal, readJson, runJest, write } from '../helpers.mjs';

after(cleanup);

test('T-A1-07 [REAL] an unchanged tree reruns only the NEVER files; an edit of m04 reruns its closure dependents, the WIDE files and the NEVER files; decide once per run', async (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const first = await runJest(repo, { real });
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.finishes.filter((r) => r.result === 'PASS').length, 30);
  assert.equal(first.decideCalls, 1);

  const second = await runJest(repo, { real });
  assert.deepEqual(finishFiles(second), ['test/guards/g1.spec.ts', 'test/guards/g2.spec.ts']);
  assert.equal(second.decideCalls, 1);
  const dec = readJson(path.join(second.runDir, 'decision.json'));
  assert.equal(dec.files.filter((d) => d.decision === 'reuse').length, 28, 'reused count of decide');

  write(repo, 'src/m04.ts', fs.readFileSync(path.join(repo.dir, 'src/m04.ts'), 'utf8') + '\n// edited\n');
  const third = await runJest(repo, { real });
  assert.deepEqual(finishFiles(third), ['test/guards/g1.spec.ts', 'test/guards/g2.spec.ts', 'test/s04.spec.ts', 'test/s05.spec.ts', 'test/s08.spec.ts', 'test/s28.spec.ts']);
  assert.equal(third.decideCalls, 1);
  assert.equal(SPECS.length, 30);
});
