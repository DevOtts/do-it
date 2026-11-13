import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { HERE, JEST_ADAPTER, cleanup, tmpDir } from '../helpers.mjs';

after(cleanup);
const HARNESS = path.join(HERE, 'jest', 'predicate-harness.cjs');
const ORIGINAL_EXPR = 'r.testExecError == null && r.numFailingTests === 0 && !r.failureMessage && r.numPassingTests > 0';

test('T-A1-15 a mutant reporter whose predicate checks only numFailingTests exits 1 with PREDICATE_VIOLATION; the original exits 0', () => {
  const dir = tmpDir('a1-mutant-');
  fs.cpSync(JEST_ADAPTER, dir, { recursive: true });
  const src = fs.readFileSync(path.join(dir, 'reporter.cjs'), 'utf8');
  assert.ok(src.includes(ORIGINAL_EXPR), 'the predicate expression is where the mutant expects it');
  fs.writeFileSync(path.join(dir, 'reporter.cjs'), src.replace(ORIGINAL_EXPR, 'r.numFailingTests == 0'));
  const mutant = cp.spawnSync(process.execPath, [HARNESS, path.join(dir, 'reporter.cjs')], { encoding: 'utf8' });
  assert.equal(mutant.status, 1);
  assert.match(mutant.stdout, /PREDICATE_VIOLATION/);
  const original = cp.spawnSync(process.execPath, [HARNESS, path.join(JEST_ADAPTER, 'reporter.cjs')], { encoding: 'utf8' });
  assert.equal(original.status, 0, original.stdout + original.stderr);
});
