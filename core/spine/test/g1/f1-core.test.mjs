import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gateKeyFor } from '../../src/gate-fingerprint.mjs';
import { cleanupTmp, mutantCopy, tmpStore } from './g1-helpers.mjs';
import { FIX_ADAPTERS, changed, fpRepo, keysOf, spineOf, write } from './f1-helpers.mjs';

after(cleanupTmp);

const SPECS = ['src/s1.spec.ts', 'src/s2.spec.ts', 'src/s3.spec.ts', 'src/s4.spec.ts', 'src/s5.spec.ts'];

function coreRepo() {
  const files = {
    'package.json': '{"name":"fx","private":true}\n',
    'jest.config.js': "module.exports = {\n  testEnvironment: 'node',\n  setupFiles: ['<rootDir>/test/setup.ts'],\n  reporters: ['default', './scripts/rep.js'],\n};\n",
    'test/setup.ts': "import { a } from './helpers/a';\nexport const s = a;\n",
    'test/helpers/a.ts': "import { b } from './b';\nexport const a = b + 1;\n",
    'test/helpers/b.ts': 'export const b = 1;\n',
    'scripts/rep.js': 'module.exports = class R {};\n',
    'tsconfig.json': '{ "extends": "./tsconfig.base.json" }\n',
    'tsconfig.base.json': '{ "compilerOptions": { "strict": true } }\n',
    'config/x.yaml': 'a: 1\n',
    'src/unrelated.ts': 'export const u = 1;\n',
    '.gitignore': 'node_modules/\n',
  };
  for (const s of SPECS) files[s] = "test('x', () => expect(1).toBe(1));\n";
  return fpRepo(files);
}

test('T-F1-03 G-7 H7: every CORE edit changes every key; an unrelated edit changes none; a build without the core line is caught', async () => {
  const repo = coreRepo();
  const store = tmpStore();
  const reuse = { core: ['config/**'] };
  const keys = (mod) => {
    if (!mod) return keysOf(spineOf(repo, { store, reuse }), SPECS);
    const sp = mod.gateFpSpine({ repo: repo.dir, runner: 'jest', env: repo.env, store, reuse, adaptersDir: FIX_ADAPTERS, log: () => {} });
    const out = {};
    for (const f of SPECS) out[f] = mod.gateKeyFor(sp, { file: f, runner: { name: 'jest', version: '29.7.0', argv: [] }, deps: [] });
    return out;
  };
  const base = keys();
  for (const f of SPECS) assert.match(base[f].key, /^[0-9a-f]{64}$/);
  const sp0 = spineOf(repo, { store, reuse });
  assert.equal(sp0.core.wideAll, false, 'the fixture CORE resolves completely');
  for (const want of ['jest.config.js', 'test/setup.ts', 'test/helpers/a.ts', 'test/helpers/b.ts', 'scripts/rep.js', 'tsconfig.base.json', 'config/x.yaml']) {
    assert.ok(sp0.core.lines.some((l) => l[0] === 'c' && l[1] === want), 'CORE holds ' + want);
  }
  const f = (rel) => path.join(repo.dir, rel);
  const edits = [
    ['jest.config.js', () => fs.appendFileSync(f('jest.config.js'), ' '), (o) => fs.writeFileSync(f('jest.config.js'), o)],
    ['test/helpers/b.ts', () => fs.appendFileSync(f('test/helpers/b.ts'), ' '), (o) => fs.writeFileSync(f('test/helpers/b.ts'), o)],
    ['scripts/rep.js', () => fs.appendFileSync(f('scripts/rep.js'), ' '), (o) => fs.writeFileSync(f('scripts/rep.js'), o)],
    ['tsconfig.base.json', () => fs.appendFileSync(f('tsconfig.base.json'), ' '), (o) => fs.writeFileSync(f('tsconfig.base.json'), o)],
    ['src/__mocks__/fs.ts', () => write(repo, 'src/__mocks__/fs.ts', 'export default {};\n'), () => fs.rmSync(f('src/__mocks__'), { recursive: true })],
    ['config/x.yaml', () => fs.appendFileSync(f('config/x.yaml'), 'b: 2\n'), (o) => fs.writeFileSync(f('config/x.yaml'), o)],
    ['babel.config.js', () => write(repo, 'babel.config.js', 'module.exports = {};\n'), () => fs.unlinkSync(f('babel.config.js'))],
  ];
  let all = 0;
  for (const [rel, doit, undo] of edits) {
    const old = fs.existsSync(f(rel)) ? fs.readFileSync(f(rel)) : null;
    doit();
    const k = keys();
    undo(old);
    const n = changed(base, k);
    assert.equal(n, 5, rel + ': 5 of 5 keys change');
    assert.ok(SPECS.every((s) => k[s].components.core !== base[s].components.core), rel + ': components.core differs');
    all++;
  }
  assert.equal(changed(base, keys()), 0, 'restored fixture gives the base keys');
  const old = fs.readFileSync(f('src/unrelated.ts'));
  fs.appendFileSync(f('src/unrelated.ts'), ' ');
  assert.equal(changed(base, keys()), 0, 'the unrelated edit changes 0 of 5 keys');
  fs.writeFileSync(f('src/unrelated.ts'), old);
  // mutant: the core line omitted from the key
  let replaced = 0;
  const m = mutantCopy((n, t) => {
    if (n !== 'gate-fingerprint.mjs') return t;
    return t.split('\n').map((l) => { if (l.includes('// CORE-LINE')) { replaced++; return '  // core line omitted (mutant)'; } return l; }).join('\n');
  });
  assert.equal(replaced, 1);
  const mod = await import(pathToFileURL(path.join(m.src, 'gate-fingerprint.mjs')).href);
  const mb = keys(mod);
  const oldCfg = fs.readFileSync(f('jest.config.js'));
  fs.appendFileSync(f('jest.config.js'), ' ');
  const mk = keys(mod);
  fs.writeFileSync(f('jest.config.js'), oldCfg);
  assert.equal(changed(mb, mk), 0, 'the mutant does not key CORE');
  console.log('CORE-NOT-KEYED (mutant without the core line: a jest.config.js edit changed 0 of 5 keys)');
  console.log('T-F1-03 ' + all + ' of 7 CORE edits change 5 of 5 keys and components.core; unrelated edit 0 of 5');
});

test('T-F1-11 unresolved references: adapter-reported unresolved makes WIDE; a missing CORE literal makes every key WIDE; a package import adds nothing', () => {
  const repo = fpRepo({
    'jest.config.js': "module.exports = { testEnvironment: 'node' };\n",
    'src/d.spec.ts': "import { m } from './missing';\ntest('d', () => {});\n",
    'src/e.spec.ts': "test('e', () => {});\n",
    'src/f.spec.ts': "test('f', () => {});\n",
    'src/g.spec.ts': "test('g', () => {});\n",
    'src/h.spec.ts': "test('h', () => {});\n",
    '.gitignore': 'node_modules/\n',
  });
  const store = tmpStore();
  const sp = spineOf(repo, { store });
  assert.equal(gateKeyFor(sp, { file: 'src/d.spec.ts', deps: [], unresolved: 1 }).class, 'WIDE');
  assert.equal(gateKeyFor(sp, { file: 'src/e.spec.ts', deps: [], unresolved: 0 }).class, 'NARROW');
  fs.writeFileSync(path.join(repo.dir, 'jest.config.js'), "module.exports = { testEnvironment: 'node', setupFiles: ['./test/gone.ts'] };\n");
  const sp2 = spineOf(repo, { store });
  assert.ok(sp2.core.text.includes('c-unresolved\tjest.config.js\t./test/gone.ts\n'));
  const files = ['src/d.spec.ts', 'src/e.spec.ts', 'src/f.spec.ts', 'src/g.spec.ts', 'src/h.spec.ts'];
  const wide = files.filter((f) => gateKeyFor(sp2, { file: f, deps: [], unresolved: 0 }).class === 'WIDE').length;
  assert.equal(wide, 5);
  write(repo, 'node_modules/some-pkg/index.js', 'module.exports = 1;\n');
  write(repo, 'node_modules/some-pkg/package.json', '{"name":"some-pkg","main":"index.js"}\n');
  fs.writeFileSync(path.join(repo.dir, 'jest.config.js'), "const p = require('some-pkg');\nmodule.exports = { testEnvironment: 'node', globalSetup: 'some-pkg' };\n");
  const sp3 = spineOf(repo, { store });
  assert.equal(sp3.core.lines.filter((l) => l[0] === 'c-unresolved').length, 0);
  assert.equal(sp3.core.wideAll, false);
  console.log('T-F1-11 d WIDE e NARROW; c-unresolved jest.config.js ./test/gone.ts makes 5 of 5 WIDE; package import adds 0 c-unresolved');
});
