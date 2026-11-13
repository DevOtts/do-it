const path = require('path');
const os = require('os');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: process.env.FIXTURE_PLANTED ? ['<rootDir>/planted/**/*.spec.ts'] : ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false, tsconfig: '<rootDir>/tsconfig.json' }] },
  testSequencer: '<rootDir>/sequencer.cjs',
  cacheDirectory: process.env.FIXTURE_JEST_CACHE || path.join(os.tmpdir(), 'do-it-fixture-jest-cache'),
};
