import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { REPORTER } from '../helpers.mjs';

const Reporter = createRequire(import.meta.url)(REPORTER);

test('T-A1-03 the G-2 predicate over 32 generated TestResult shapes: exactly 2 PASS, 1 SKIPPED, 29 FAIL', () => {
  const tally = { PASS: 0, SKIPPED: 0, FAIL: 0 };
  const skipped = [];
  const passed = [];
  for (const err of [null, { message: 'crashed' }]) {
    for (const failing of [0, 2]) {
      for (const msg of [null, 'boom']) {
        for (const passing of [0, 3]) {
          for (const pending of [0, 2]) {
            const s = { testExecError: err, numFailingTests: failing, failureMessage: msg, numPassingTests: passing, numPendingTests: pending, numTodoTests: 0 };
            const r = Reporter.classify(s);
            tally[r]++;
            if (r === 'SKIPPED') skipped.push([err, failing, msg, passing, pending]);
            if (r === 'PASS') passed.push([err, failing, msg, passing, pending]);
          }
        }
      }
    }
  }
  assert.deepEqual(tally, { PASS: 2, SKIPPED: 1, FAIL: 29 });
  assert.deepEqual(skipped, [[null, 0, null, 0, 2]]);
  assert.deepEqual(passed.map((p) => p[3]), [3, 3]);
  // the buildFailureTestResult shape (a crashed suite): no failing tests, an exec error, nothing passed
  assert.equal(Reporter.classify({ testExecError: { message: 'x' }, numFailingTests: 0, failureMessage: null, numPassingTests: 0, numPendingTests: 0, numTodoTests: 0 }), 'FAIL');
  // todo-only counts as skipped, never PASS
  assert.equal(Reporter.classify({ testExecError: null, numFailingTests: 0, failureMessage: null, numPassingTests: 0, numPendingTests: 0, numTodoTests: 2 }), 'SKIPPED');
});
