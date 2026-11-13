'use strict';
// Predicate harness (T-A1-03, T-A1-15): feeds the 32 generated TestResult shapes to a reporter module's classifier and
// exits 1 printing PREDICATE_VIOLATION when the G-2 matrix is not exactly 2 PASS, 1 SKIPPED and 29 FAIL.
// usage: node predicate-harness.cjs <path to reporter.cjs>
const Reporter = require(require('node:path').resolve(process.argv[2]));

function shapes() {
  const out = [];
  for (const err of [null, { message: 'crashed', stack: 'crashed' }]) {
    for (const failing of [0, 2]) {
      for (const msg of [null, 'expect(received).toBe(expected)']) {
        for (const passing of [0, 3]) {
          for (const pending of [0, 2]) {
            out.push({ testExecError: err, numFailingTests: failing, failureMessage: msg, numPassingTests: passing, numPendingTests: pending, numTodoTests: 0, testResults: [] });
          }
        }
      }
    }
  }
  return out;
}

const tally = { PASS: 0, SKIPPED: 0, FAIL: 0 };
const bad = [];
for (const s of shapes()) {
  const r = Reporter.classify(s);
  tally[r] = (tally[r] || 0) + 1;
  const expectPass = s.testExecError === null && s.numFailingTests === 0 && s.failureMessage === null && s.numPassingTests > 0;
  const expectSkipped = s.testExecError === null && s.numFailingTests === 0 && s.failureMessage === null && s.numPassingTests === 0 && s.numPendingTests > 0;
  const want = expectPass ? 'PASS' : expectSkipped ? 'SKIPPED' : 'FAIL';
  if (r !== want) bad.push(JSON.stringify(s) + ' => ' + r + ', expected ' + want);
}
if (bad.length || tally.PASS !== 2 || tally.SKIPPED !== 1 || tally.FAIL !== 29) {
  process.stdout.write('PREDICATE_VIOLATION ' + JSON.stringify(tally) + '\n' + bad.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write('predicate ok ' + JSON.stringify(tally) + '\n');
