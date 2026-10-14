import assert from 'node:assert/strict';
import { clamp } from '../src/clamp.mjs';
assert.equal(clamp(-5, 0, 10), 0);
assert.equal(clamp(5, 0, 10), 5);
assert.equal(clamp(10, 0, 10), 10, 'the upper bound is inclusive');
assert.equal(clamp(99, 0, 10), 10);
console.log('clamp ok');
