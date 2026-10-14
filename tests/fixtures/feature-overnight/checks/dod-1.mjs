import assert from 'node:assert/strict';
import { slugify } from '../src/index.mjs';
assert.equal(slugify("  Hello World "), "hello-world");
console.log('DOD-1 ok');
