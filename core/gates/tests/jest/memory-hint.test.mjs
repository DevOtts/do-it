import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { REPORTER } from '../helpers.mjs';

const { memoryHint } = createRequire(import.meta.url)(REPORTER);

test('T-A1-16 memoryHint: the repo config wins; the manifest value is a hint only', () => {
  assert.deepEqual(memoryHint({ workerIdleMemoryLimit: '50%' }, { worker_idle_memory_limit: '2GB' }), []);
  assert.deepEqual(memoryHint({}, { worker_idle_memory_limit: '2GB' }), ['--workerIdleMemoryLimit=2GB']);
  assert.deepEqual(memoryHint({}, {}), []);
  assert.deepEqual(memoryHint(undefined, undefined), []);
});
