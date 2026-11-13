'use strict';
// Child of concurrent-append.test.mjs: drives the reporter hooks over N synthetic files in one run.
// usage: node concurrent-driver.cjs <manifest file> <repo dir> <count>
const path = require('node:path');
const Reporter = require('../../adapters/jest/reporter.cjs');
const [manifestFile, cwd, count] = process.argv.slice(2);
const rep = new Reporter({}, { env: { ...process.env, DO_IT_GATE_MANIFEST: manifestFile }, cwd });
rep.onRunStart({}, {});
for (let i = 0; i < Number(count); i++) {
  const t = { path: path.join(cwd, 'spec', 'f' + String(i).padStart(3, '0') + '.spec.js') };
  rep.onTestFileStart(t);
  rep.onTestFileResult(t, {
    testExecError: null, numFailingTests: 0, failureMessage: null, numPassingTests: 1, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ invocations: 1 }], perfStats: { runtime: 1 },
  }, {});
}
rep.onRunComplete(new Set(), { numTotalTestSuites: Number(count), wasInterrupted: false, numFailedTests: 0 });
