import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  gateFpComponentsWrite, gateFpGateDigest, gateFpRunnerLine, gateKeyAssemble, gateKeyFor, gateWhy,
} from '../../src/gate-fingerprint.mjs';
import { gateFpComponents } from '../../src/gate-fingerprint.mjs';
import { FIX, SRC_DIR, cleanupTmp, hex, mutantCopy, sha, tmpDir, tmpStore } from './g1-helpers.mjs';
import { FIX_ADAPTERS, fpRepo, spineOf, write } from './f1-helpers.mjs';

after(cleanupTmp);

const GOLD = path.join(FIX, 'rtg-key-golden');

test('T-F1-01 golden rtg-key/1 manifest: UTF-8 byte order, LF only, TAB path refused, runner line drops selection-only flags', () => {
  const input = JSON.parse(fs.readFileSync(path.join(GOLD, 'input.json'), 'utf8'));
  const a = gateKeyAssemble(input.spine, input.adapter);
  const want = fs.readFileSync(path.join(GOLD, 'manifest.txt'));
  assert.ok(Buffer.from(a.manifest, 'utf8').equals(want), 'manifest bytes equal manifest.txt');
  assert.equal(a.key, fs.readFileSync(path.join(GOLD, 'key.txt'), 'utf8').trim());
  assert.ok(a.manifest.startsWith('rtg-key/1\n'));
  assert.equal(a.manifest.split('\r').length - 1, 0, '0 CR');
  const iA = a.manifest.indexOf('src/Ａ.ts');
  const iX = a.manifest.indexOf('src/\u{1D4B3}.ts');
  assert.ok(iA > 0 && iX > 0 && iA < iX, 'the U+FF21 line comes before the U+1D4B3 line');
  const jsSorted = ['src/Ａ.ts', 'src/\u{1D4B3}.ts'].sort();
  assert.equal(jsSorted[0], 'src/\u{1D4B3}.ts', 'Array.prototype.sort orders them the other way');
  const tab = gateKeyAssemble(input.spine, [...input.adapter, ['dep', 'src/a\tb.ts', hex('x')]]);
  assert.equal(tab.key, null);
  assert.equal(tab.reason, 'path-unencodable');
  const base = gateFpRunnerLine('jest', '29.7.0', ['--runInBand']);
  const ci = gateFpRunnerLine('jest', '29.7.0', ['--runInBand', '--ci']);
  const sel = gateFpRunnerLine('jest', '29.7.0', ['--runInBand', '--filter=x', 'src/a.spec.ts']);
  assert.notEqual(ci[2], base[2], '--ci changes the runner digest');
  assert.equal(sel[2], base[2], 'drop-list flags leave it unchanged');
  console.log('T-F1-01 key ' + a.key.slice(0, 12) + ' = key.txt; TAB path-unencodable; --ci changes runner, --filter + path do not');
});

test('T-F1-02 golden manifest: Python stdlib ref.py builds byte-identical bytes and the same key', () => {
  const input = JSON.parse(fs.readFileSync(path.join(GOLD, 'input.json'), 'utf8'));
  const dir = tmpDir('g1-gold-');
  const nodeOut = path.join(dir, 'node.txt');
  const pyOut = path.join(dir, 'py.txt');
  fs.writeFileSync(nodeOut, gateKeyAssemble(input.spine, input.adapter).manifest);
  const key = cp.execFileSync('python3', ['-I', path.join(GOLD, 'ref.py'), path.join(GOLD, 'input.json'), pyOut], { encoding: 'utf8' }).trim();
  assert.equal(cp.spawnSync('cmp', [pyOut, nodeOut]).status, 0, 'Python manifest equals Node manifest');
  assert.equal(cp.spawnSync('cmp', [pyOut, path.join(GOLD, 'manifest.txt')]).status, 0, 'Python manifest equals manifest.txt');
  assert.equal(key, fs.readFileSync(path.join(GOLD, 'key.txt'), 'utf8').trim());
  console.log('T-F1-02 cmp exit 0 (python vs node, python vs manifest.txt); python key ' + key.slice(0, 12) + ' = key.txt');
});

function buildMutant(mutate, schemaMutate) {
  const m = mutantCopy(mutate);
  if (schemaMutate) {
    const f = path.join(m.root, 'core', 'schemas', 'gate-result.1.schema.json');
    fs.writeFileSync(f, schemaMutate(fs.readFileSync(f, 'utf8')));
  }
  const out = path.join(m.root, 'do-it.mjs');
  const r = cp.spawnSync(process.execPath, [path.join(m.spine, 'build.mjs'), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test('T-F1-04 H8: the gate digest covers the store-lane bundle sections, the adapter files and the embedded schema, and nothing else', () => {
  const digest = (bundle, adaptersDir) => gateFpGateDigest('jest', { bundle, adaptersDir: adaptersDir || FIX_ADAPTERS }).digest;
  const keyWith = (g) => [1, 2].map((i) => gateKeyAssemble([['gate', g], ['core', hex('c')]], [['dep', 'f' + i, hex(i)]]).key);
  const b1 = buildMutant(null);
  const b2 = buildMutant(null);
  const d0 = digest(b1);
  assert.equal(digest(b2), d0, 'identical sources give identical gate digests');
  const k0 = keyWith(d0);
  const bump = (name) => (n, t) => (n === name ? t + '\n// one byte\n' : t);
  const changes = [];
  changes.push(digest(buildMutant(bump('gate-results.mjs'))));
  changes.push(digest(buildMutant(bump('gate-fingerprint.mjs'))));
  const ad = tmpDir('g1-adapters-');
  fs.cpSync(FIX_ADAPTERS, ad, { recursive: true });
  fs.appendFileSync(path.join(ad, 'jest', 'reporter.cjs'), ' ');
  changes.push(digest(b1, ad));
  changes.push(digest(buildMutant(null, (t) => t.replace('"title": "', '"title": "x'))));
  let altered = 0;
  for (const d of changes) {
    if (d !== d0 && keyWith(d).every((k, i) => k !== k0[i])) altered++; else console.log("T-F1-04 unchanged change #" + changes.indexOf(d));
  }
  assert.equal(altered, 4, '4 of 4 changes alter the gate digest and every key');
  assert.equal(digest(buildMutant(bump('meter.mjs'))), d0, 'a meter.mjs change leaves the gate digest unchanged');
  const src = fs.readFileSync(path.join(SRC_DIR, 'gate-fingerprint.mjs'), 'utf8');
  assert.equal(src.split('GATE_' + 'VERSION').length - 1, 0);
  console.log('T-F1-04 identical builds equal; 4 of 4 changes alter digest and keys; meter.mjs change ignored; GATE_VERSION 0');
});

test('T-F1-12 H3: a gitignored build output behind a workspace symlink is hashed from disk under its realpath', () => {
  const repo = fpRepo({
    '.gitignore': 'node_modules/\npackages/*/dist/\n',
    'src/a.spec.ts': "test('a', () => {});\n",
    'packages/obs/package.json': '{"name":"@w/obs"}\n',
    'packages/obs2/package.json': '{"name":"@w/obs"}\n',
  });
  write(repo, 'packages/obs/dist/index.js', 'module.exports = 1;\n');
  write(repo, 'packages/obs2/dist/index.js', 'module.exports = 2;\n');
  fs.mkdirSync(path.join(repo.dir, 'node_modules', '@w'), { recursive: true });
  fs.symlinkSync('../../packages/obs', path.join(repo.dir, 'node_modules', '@w', 'obs'));
  const member = 'node_modules/@w/obs/dist/index.js';
  const store = tmpStore();
  const key = () => gateKeyFor(spineOf(repo, { store }), { file: 'src/a.spec.ts', deps: [member] });
  const k0 = key();
  const line = k0.lines.find((l) => l.startsWith('dep\tpackages/obs/dist/index.js\t'));
  assert.equal(line, 'dep\tpackages/obs/dist/index.js\t' + sha(path.join(repo.dir, 'packages/obs/dist/index.js')));
  fs.writeFileSync(path.join(repo.dir, 'packages/obs/dist/index.js'), 'module.exports = 9;\n');
  assert.equal(repo.git('status', '--porcelain'), '');
  const k1 = key();
  assert.notEqual(k1.key, k0.key, 'the byte change alters the key');
  fs.unlinkSync(path.join(repo.dir, 'node_modules', '@w', 'obs'));
  fs.symlinkSync('../../packages/obs2', path.join(repo.dir, 'node_modules', '@w', 'obs'));
  const k2 = key();
  assert.notEqual(k2.key, k1.key, 'the retarget alters the key');
  fs.unlinkSync(path.join(repo.dir, 'packages/obs2/dist/index.js'));
  const k3 = key();
  assert.ok(k3.lines.includes('dep\tpackages/obs2/dist/index.js\t-'), 'deletion gives a - line');
  const outside = tmpDir('g1-outside-');
  fs.writeFileSync(path.join(outside, 'index.js'), 'x\n');
  fs.symlinkSync(outside, path.join(repo.dir, 'node_modules', '@w', 'ext'));
  const k4 = gateKeyFor(spineOf(repo, { store }), { file: 'src/a.spec.ts', deps: ['node_modules/@w/ext/index.js'] });
  const out = k4.lines.find((l) => l.startsWith('dep\t@outside/'));
  assert.match(out, /^dep\t@outside\/[0-9a-f]{64}\t[0-9a-f]{64}$/);
  assert.equal(k4.manifest.split(outside).length - 1, 0, 'absolute path occurs 0 times');
  console.log('T-F1-12 realpath dep line, byte change/retarget alter key, deletion -, outside member ' + out.slice(0, 22) + '...');
});

test('T-F1-15 --why names the one component each change invalidates, never a value or an HMAC', () => {
  const repo = fpRepo({
    'jest.config.js': "module.exports = { testEnvironment: 'node' };\n",
    'src/a.spec.ts': "import { d } from './dep';\ntest('a', () => expect(d).toBe(1));\n",
    'src/dep.ts': 'export const d = 1;\n',
    '.gitignore': 'node_modules/\n',
  });
  write(repo, 'node_modules/.package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0"}}}\n');
  const store = tmpStore();
  const value = 'tok-value-abcdef-1';
  const reuse = { env: ['API_TOKEN'] };
  const fakeNode = path.join(tmpDir('g1-fakenode-'), 'node');
  fs.writeFileSync(fakeNode, '#!/bin/sh\nprintf \'["node","v99.0.0","77.1","darwin","24.6.0","arm64","12"]\'\n');
  fs.chmodSync(fakeNode, 0o755);
  const run = (envExtra, extra) => {
    const sp = spineOf({ ...repo, env: { ...repo.env, API_TOKEN: value, ...(envExtra || {}) } }, { store, reuse, ...(extra || {}) });
    gateFpComponentsWrite(store, sp);
    const k = gateKeyFor(sp, { file: 'src/a.spec.ts', deps: ['src/dep.ts'] });
    return { sp, k };
  };
  const p = run();
  const prev = p.k.components;
  const why = (r) => gateWhy(prev, r.k.components, { store, nowText: { core: r.sp.core.text, env: r.sp.env.text } });
  const results = [];
  const apply = (fn, undo, envExtra, extra) => { fn(); const r = run(envExtra, extra); undo(); results.push(why(r)); };
  const edit = (rel, text) => { const f = path.join(repo.dir, rel); const old = fs.readFileSync(f); return [() => fs.writeFileSync(f, text(old.toString())), () => fs.writeFileSync(f, old)]; };
  apply(...edit('jest.config.js', (t) => t + '// x\n'));
  apply(...edit('node_modules/.package-lock.json', (t) => t.replace('1.0.0', '1.0.1')));
  apply(() => {}, () => {}, { API_TOKEN: value + 'x' });
  apply(...edit('src/dep.ts', (t) => t + '// x\n'));
  apply(...edit('src/a.spec.ts', (t) => "import fs from 'fs';\nconst raw = fs.readFileSync('x');\n" + t));
  apply(() => {}, () => {}, undefined, { nodeBin: fakeNode });
  assert.deepEqual(results, [
    ['invalidated: core (c jest.config.js changed)'],
    ['invalidated: installed'],
    ['invalidated: env (API_TOKEN)'],
    ['invalidated: deps'],
    ['invalidated: class (NARROW to WIDE)'],
    ['invalidated: platform'],
  ]);
  for (const l of results.flat()) {
    assert.doesNotMatch(l, /[0-9a-f]{64}/);
    assert.ok(!l.includes(value));
  }
  void gateFpComponents;
  console.log('T-F1-15 ' + results.map((r) => r[0]).join(' | '));
});
