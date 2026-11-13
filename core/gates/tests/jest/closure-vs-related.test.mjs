import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { CLOSURE_DRIVER as DRIVER, FIXTURE, SPECS, cleanup, gitEnv, minimalManifest, mkFixtureRepo, needReal, readJson, tmpDir } from '../helpers.mjs';

after(cleanup);

test('T-A1-04 [REAL] closure-derived dependents equal jest --findRelatedTests for util, m02, m03, m04, m06, m07', (t) => {
  const real = needReal(t);
  if (!real) return;
  const repo = mkFixtureRepo(real);
  const dir = tmpDir('a1-run-');
  minimalManifest(dir);
  const env = { ...gitEnv(repo.home), FIXTURE_JEST_CACHE: repo.cache };
  const run = cp.spawnSync(process.execPath, [DRIVER, path.join(dir, 'manifest.json'), ...SPECS.map((s) => path.join(repo.dir, s))], { cwd: repo.dir, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const keys = JSON.parse(run.stdout);
  assert.equal(keys.files.length, 30);
  const expected = readJson(path.join(FIXTURE, 'expected-closures.json'));
  for (const f of keys.files) {
    assert.deepEqual(f.deps.map((d) => d.path).filter((p) => p !== f.file).sort(), expected.closures[f.file].slice().sort(), 'closure of ' + f.file);
    assert.equal(f.class === 'WIDE', expected.wide.includes(f.file), 'class of ' + f.file);
  }
  const want = { 'src/util.ts': 14, 'src/m02.ts': 4, 'src/m03.ts': 3, 'src/m04.ts': 2, 'src/m06.ts': 9, 'src/m07.ts': 9 };
  let equal = 0;
  for (const [mod, size] of Object.entries(want)) {
    const dependents = keys.files.filter((f) => f.deps.some((d) => d.path === mod)).map((f) => f.file).sort();
    const r = cp.spawnSync(process.execPath, [real.bin, '--findRelatedTests', mod, '--listTests', '--passWithNoTests'], { cwd: repo.dir, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const related = r.stdout.split('\n').filter(Boolean).map((p) => path.relative(fs.realpathSync(repo.dir), fs.realpathSync(p)).split(path.sep).join('/')).sort();
    assert.equal(dependents.length, size, mod + ' dependents');
    assert.deepEqual(dependents, related, mod);
    equal++;
  }
  assert.equal(equal, 6);
});
