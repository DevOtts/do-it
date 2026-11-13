import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { CLOSURE_DRIVER as DRIVER, SPECS, cleanup, gitEnv, minimalManifest, mkFixtureRepo, needReal, tmpDir } from '../helpers.mjs';

after(cleanup);

test('T-A1-05 [REAL] the closure is a superset of --findRelatedTests by exactly the type-only and mock-only edges, equal on the snapshot', (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const dir = tmpDir('a1-run-');
  minimalManifest(dir);
  const env = { ...gitEnv(repo.home), FIXTURE_JEST_CACHE: repo.cache };
  const run = cp.spawnSync(process.execPath, [DRIVER, path.join(dir, 'manifest.json'), ...SPECS.map((s) => path.join(repo.dir, s))], { cwd: repo.dir, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const keys = JSON.parse(run.stdout);
  const cases = [
    ['src/shape.ts', [], ['test/s25.spec.ts']],
    ['src/mocked-only.ts', [], ['test/s26.spec.ts']],
    ['test/__snapshots__/s27.spec.ts.snap', ['test/s27.spec.ts'], ['test/s27.spec.ts']],
  ];
  for (const [mod, relatedWant, closureWant] of cases) {
    const r = cp.spawnSync(process.execPath, [real.bin, '--findRelatedTests', mod, '--listTests', '--passWithNoTests'], { cwd: repo.dir, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const related = r.stdout.split('\n').filter(Boolean).map((p) => path.relative(fs.realpathSync(repo.dir), fs.realpathSync(p)).split(path.sep).join('/')).sort();
    const dependents = keys.files.filter((f) => f.deps.some((d) => d.path === mod)).map((f) => f.file).sort();
    assert.deepEqual(related, relatedWant, 'jest findRelatedTests of ' + mod);
    assert.deepEqual(dependents, closureWant, 'closure dependents of ' + mod);
    for (const r0 of related) assert.ok(dependents.includes(r0), 'superset');
  }
});
