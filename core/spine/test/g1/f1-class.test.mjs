import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateFold } from '../../src/gate-results.mjs';
import { gateKeyFor, gateNeverCompile, gateReuseDecision } from '../../src/gate-fingerprint.mjs';
import { NOW, cleanupTmp, comps, hex, rowsToItems, streamRows, tmpStore } from './g1-helpers.mjs';
import { fpRepo, spineOf, write } from './f1-helpers.mjs';

after(cleanupTmp);

test('T-F1-06 G-16: NEVER-set files run fresh whatever the fold says; an invalid glob makes every file NEVER, visibly', () => {
  const files = ['src/guards/a.spec.ts', 'src/x/y/z.real-mongo.spec.ts', 'src/x/y.spec.ts'];
  const decide = (globs, logs) => {
    const never = gateNeverCompile(globs, { log: (m) => logs.push(m) });
    return files.map((file) => {
      const fold = gateFold(rowsToItems(streamRows([{ t: 'f', run: 1, res: 'PASS' }], {}, NOW, file)), { key: hex('k1'), components: comps('k1') }, NOW, { file });
      assert.equal(fold.reuse, 'PASS', 'the fold alone would reuse ' + file);
      return gateReuseDecision({ fold, never: never.match(file) });
    });
  };
  const logs = [];
  const d = decide(['src/guards/**', '*.real-mongo.spec.ts'], logs);
  assert.deepEqual(d[0], { reuse: false, reason: 'never-set', pattern: 'src/guards/**' });
  assert.deepEqual(d[1], { reuse: false, reason: 'never-set', pattern: '*.real-mongo.spec.ts' });
  assert.equal(d[2].reuse, 'PASS');
  assert.deepEqual(logs, []);
  const logs2 = [];
  const bad = decide(['src/guards/**', 'src/[a'], logs2);
  assert.equal(bad.filter((x) => x.reuse === false && x.reason === 'never-set').length, 3);
  assert.deepEqual(logs2, ['[gate-fingerprint] invalid reuse glob: src/[a']);
  console.log('T-F1-06 never-set 2 of 3 (pattern named), third reuse PASS; malformed glob: 3 of 3 never-set, printed');
});

test('T-F1-10 H6 WIDE readers carry the tree; a tree edit or a new untracked file invalidates WIDE only; resume is stable; the WIDE bit comes from the memo', () => {
  const repo = fpRepo({
    'jest.config.js': "module.exports = { testEnvironment: 'node' };\n",
    'src/a.spec.ts': "import fs from 'fs';\nconst raw = fs.readFileSync('x.json');\ntest('a', () => {});\n",
    'src/b.spec.ts': "import { run } from './mod';\ntest('b', () => run());\n",
    'src/mod.ts': "import { execSync } from 'child_process';\nexport const run = () => execSync('true');\n",
    'src/c.spec.ts': "test('c', () => expect(1).toBe(1));\n",
    'tests/t_x.py': 'import subprocess\n\ndef test_x():\n    assert subprocess\n',
    'docs/x.md': '# x\n',
    '.gitignore': 'node_modules/\n',
  });
  const store = tmpStore();
  const entries = [
    ['src/a.spec.ts', []], ['src/b.spec.ts', ['src/mod.ts']], ['src/c.spec.ts', []], ['tests/t_x.py', []],
  ];
  const keys = (sp) => Object.fromEntries(entries.map(([f, deps]) => [f, gateKeyFor(sp, { file: f, deps })]));
  const sp0 = spineOf(repo, { store });
  const k0 = keys(sp0);
  for (const f of ['src/a.spec.ts', 'src/b.spec.ts', 'tests/t_x.py']) {
    assert.equal(k0[f].class, 'WIDE', f);
    assert.ok(k0[f].lines.some((l) => l.startsWith('tree\t')), f + ' has a tree line');
  }
  assert.equal(k0['src/c.spec.ts'].class, 'NARROW');
  assert.ok(!k0['src/c.spec.ts'].lines.some((l) => l.startsWith('tree\t')));
  fs.appendFileSync(path.join(repo.dir, 'docs/x.md'), 'more\n');
  const k1 = keys(spineOf(repo, { store }));
  assert.notEqual(k1['src/a.spec.ts'].key, k0['src/a.spec.ts'].key);
  assert.notEqual(k1['src/b.spec.ts'].key, k0['src/b.spec.ts'].key);
  assert.equal(k1['src/c.spec.ts'].key, k0['src/c.spec.ts'].key);
  write(repo, 'fixtures/new.json', '{}\n');
  const k2 = keys(spineOf(repo, { store }));
  assert.notEqual(k2['src/a.spec.ts'].key, k1['src/a.spec.ts'].key);
  assert.notEqual(k2['src/b.spec.ts'].key, k1['src/b.spec.ts'].key);
  assert.equal(k2['src/c.spec.ts'].key, k1['src/c.spec.ts'].key);
  // kill and resume with no edit: a fresh spine over the same store gives byte-identical keys
  const sp3 = spineOf(repo, { store: { ...store } });
  const k3 = keys(sp3);
  for (const [f] of entries) assert.equal(k3[f].key, k2[f].key, f + ' identical after resume');
  assert.ok(sp3.table.memoHits >= 4, 'the WIDE bit and hash are served from the memo (hits ' + sp3.table.memoHits + ')');
  for (const [f] of entries) assert.equal(k3[f].class, k2[f].class);
  console.log('T-F1-10 a,b,t_x.py WIDE+tree, c NARROW; docs edit and untracked file move WIDE keys only; resume identical; memo hits ' + sp3.table.memoHits);
});
