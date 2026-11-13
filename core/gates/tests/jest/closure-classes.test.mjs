import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { CLOSURE, FILTER, FAKE_DECIDE_CMD, cleanup, fakeResolver, minimalManifest, mkRepo, tmpDir } from '../helpers.mjs';

after(cleanup);
const require = createRequire(import.meta.url);
const closure = require(CLOSURE);
const filter = require(FILTER);

const REPO = {
  'tmpl.spec.js': "const name = 'x';\nrequire(`./dyn/${name}`);\ntest('t', () => {});\n",
  'wide1.spec.js': "const fs = require('fs');\nfs.readFileSync(__filename);\ntest('t', () => {});\n",
  'member.spec.js': "require('./execmod');\ntest('t', () => {});\n",
  'execmod.js': "module.exports = () => require('child_process').execSync('true');\n",
  'plain.spec.js': "require('./plainmod');\ntest('t', () => {});\n",
  'plainmod.js': "module.exports = 1;\n",
  'boom.spec.js': "require('./plainmod');\ntest('t', () => {});\n",
};

test('T-A1-06 closure classes: template require, readFileSync and a member with execSync are WIDE; a plain spec NARROW; a throwing resolver is unknown and still runs (G-1)', async () => {
  const repo = mkRepo(REPO);
  const dir = tmpDir('a1-run-');
  const manifest = minimalManifest(dir);
  const paths = ['tmpl.spec.js', 'wide1.spec.js', 'member.spec.js', 'plain.spec.js'].map((f) => path.join(repo.dir, f));
  const keys = closure.buildKeys({ paths, repo: fs.realpathSync(repo.dir), manifest, resolver: fakeResolver(false), config: {}, argv: [], version: '29.7.0' });
  assert.deepEqual(keys.files.map((f) => f.class), ['WIDE', 'WIDE', 'WIDE', 'NARROW']);
  assert.ok(keys.files.every((f) => !f.unknown));
  assert.equal(keys.files[0].unresolved, 1, 'the template require counts as unresolved');
  assert.deepEqual(keys.files[3].deps.map((d) => d.path), ['plain.spec.js', 'plainmod.js']);

  // the throwing resolver: unknown, and the filter keeps the file even when decide omitted it
  const boom = path.join(repo.dir, 'boom.spec.js');
  const k2 = closure.buildKeys({ paths: [boom], repo: fs.realpathSync(repo.dir), manifest, resolver: fakeResolver(true), config: {}, argv: [], version: '29.7.0' });
  assert.equal(k2.files[0].unknown, true);
  assert.equal(k2.files[0].class, 'WIDE');
  assert.equal(k2.errors.length, 1);
  const emptyList = path.join(dir, 'empty-list.json');
  fs.writeFileSync(emptyList, JSON.stringify({ files: [] }));
  const env = {
    ...process.env, DO_IT_GATE_MANIFEST: path.join(dir, 'manifest.json'), DO_IT_GATE_DECIDE: FAKE_DECIDE_CMD,
    FAKE_DECIDE_MODE: 'fixed', FAKE_DECIDE_RUNLIST: emptyList,
  };
  const out = await filter.filterPaths([boom, path.join(repo.dir, 'plain.spec.js')], {
    env, cwd: repo.dir, context: { resolver: fakeResolver(true), config: {}, version: '29.7.0' }, log: () => {},
  });
  assert.deepEqual(out.filtered.map((x) => path.basename(x.test)), ['boom.spec.js', 'plain.spec.js'], 'unknown files run (both are unknown under a throwing resolver)');
  const ok = await filter.filterPaths([boom, path.join(repo.dir, 'plain.spec.js')], {
    env, cwd: repo.dir, context: { resolver: { ...fakeResolver(false), resolveModule: (f, s) => (/boom/.test(f) ? fakeResolver(true).resolveModule(f, s) : fakeResolver(false).resolveModule(f, s)) }, config: {}, version: '29.7.0' }, log: () => {},
  });
  assert.deepEqual(ok.filtered.map((x) => path.basename(x.test)), ['boom.spec.js'], 'only the unknown file is added to an empty run list');
});
