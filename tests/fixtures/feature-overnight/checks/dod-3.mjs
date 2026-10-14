import assert from 'node:assert/strict';
import { slugify } from '../src/index.mjs';
assert.equal(slugify("a   b---c"), "a-b-c");
console.log('DOD-3 ok');
