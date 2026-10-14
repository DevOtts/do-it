import assert from 'node:assert/strict';
import { slugify } from '../src/index.mjs';
assert.equal(slugify(""), ""); assert.equal(slugify(undefined), ""); assert.equal(slugify("!!!"), "");
console.log('DOD-4 ok');
