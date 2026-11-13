import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateStoreAppend, gateStoreFailureWrite } from '../../src/gate-results.mjs';
import {
  gateFpComponentsWrite, gateFpEnv, gateFpInstalled, gateFpManifestBuild, gateFpManifestWrite, gateFpPlatform, gateFpRedactValues,
  gateKeyFor, gateWhy,
} from '../../src/gate-fingerprint.mjs';
import { NOW, cleanupTmp, finishRow, hex, iso, rid, tmpDir, tmpStore, walkFiles } from './g1-helpers.mjs';
import { changed, fpRepo, keysOf, spineOf, write } from './f1-helpers.mjs';

after(cleanupTmp);

function fakeInterp(lines, exit) {
  const f = path.join(tmpDir('g1-interp-'), 'python');
  fs.writeFileSync(f, '#!/bin/sh\n' + (exit ? 'exit ' + exit + '\n' : "printf '" + lines.join('\\n') + "\\n'\n"));
  fs.chmodSync(f, 0o755);
  return f;
}

test('T-F1-07 H2 H3: installed state moves with node_modules, the lockfile and workspace links; the python probe is keyed', () => {
  const repo = fpRepo({
    'package-lock.json': '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0"}}}\n',
    'packages/pkg/package.json': '{"name":"@w/pkg"}\n',
    'packages/pkg2/package.json': '{"name":"@w/pkg"}\n',
    '.gitignore': 'node_modules/\n',
  });
  write(repo, 'node_modules/.package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0"}}}\n');
  fs.mkdirSync(path.join(repo.dir, 'node_modules', '@w'), { recursive: true });
  fs.symlinkSync('../../packages/pkg', path.join(repo.dir, 'node_modules', '@w', 'pkg'));
  const inst = () => gateFpInstalled(repo.dir, 'jest', { env: repo.env });
  const d0 = inst();
  assert.ok(d0.text.includes('link\tnode_modules/@w/pkg\tpackages/pkg\n'));
  const f = (rel) => path.join(repo.dir, rel);
  const nm = fs.readFileSync(f('node_modules/.package-lock.json'));
  fs.writeFileSync(f('node_modules/.package-lock.json'), nm.toString().replace('1.0.0', '1.0.1'));
  assert.notEqual(inst().digest, d0.digest, 'installed version change');
  fs.writeFileSync(f('node_modules/.package-lock.json'), nm);
  const pl = fs.readFileSync(f('package-lock.json'));
  fs.writeFileSync(f('package-lock.json'), pl.toString().replace('1.0.0', '1.0.1'));
  assert.notEqual(inst().digest, d0.digest, 'lockfile change (the reverse)');
  fs.writeFileSync(f('package-lock.json'), pl);
  assert.equal(inst().digest, d0.digest);
  fs.unlinkSync(f('node_modules/@w/pkg'));
  fs.symlinkSync('../../packages/pkg2', f('node_modules/@w/pkg'));
  assert.notEqual(inst().digest, d0.digest, 'workspace link retarget');
  fs.rmSync(f('node_modules'), { recursive: true });
  assert.ok(inst().text.includes('node-installed\tnode_modules/.package-lock.json\t-\n'));
  const real = gateFpInstalled(repo.dir, 'pytest', { env: repo.env, python: 'python3' });
  assert.ok(!real.unknown, 'the real python3 probe answers');
  const pyLines = real.lines.filter((l) => l[0] === 'py' || l[0] === 'pth').map((l) => l.join('\t'));
  assert.ok(pyLines.length > 0);
  for (const l of pyLines) assert.match(l, /^py\t[^\t]+==[^\t]+$|^pth\t/);
  const a = gateFpInstalled(repo.dir, 'pytest', { env: repo.env, python: fakeInterp(['py\tpkga==1.0', 'py\tpkgb==2.0']) });
  const b = gateFpInstalled(repo.dir, 'pytest', { env: repo.env, python: fakeInterp(['py\tpkga==1.0', 'py\tpkgb==2.1']) });
  assert.notEqual(a.digest, b.digest, 'a differing probe version changes the installed digest');
  console.log('T-F1-07 installed digest moves on version, lockfile, link retarget; missing node_modules gives -; ' + pyLines.length + ' real py/pth lines; fixture probe diff changes digest');
});

test('T-F1-08 G-6: env values never reach the store, the manifest, components files, rows or output; only salted HMACs', () => {
  const repo = fpRepo({ 'jest.config.js': 'module.exports = {};\n', 'src/a.spec.ts': "test('a', () => {});\n", '.gitignore': 'node_modules/\n' });
  const v1 = 's3cr3t-value-123';
  const v2 = 'mongodb://u:pw-xyz-789@h/db';
  write(repo, '.env', 'MONGO_URI=' + v2 + '\n');
  const store = tmpStore();
  const reuse = { env: ['API_TOKEN'], env_files: ['.env'] };
  const captured = [];
  const ow = process.stdout.write;
  const ew = process.stderr.write;
  process.stdout.write = function (c, ...r) { captured.push(String(c)); return ow.call(process.stdout, c, ...r); };
  process.stderr.write = function (c, ...r) { captured.push(String(c)); return ew.call(process.stderr, c, ...r); };
  let line0;
  let runDir;
  let envDigest0;
  try {
    const run = (val) => spineOf({ ...repo, env: { ...repo.env, API_TOKEN: val } }, { store, reuse, log: (m) => process.stderr.write(m + '\n') });
    const sp = run(v1);
    gateFpComponentsWrite(store, sp);
    const k = gateKeyFor(sp, { file: 'src/a.spec.ts', deps: ['.env'] });
    assert.match(k.key, /^[0-9a-f]{64}$/);
    runDir = tmpDir('g1-run-');
    gateFpManifestWrite(runDir, gateFpManifestBuild(sp, { run_id: rid(8), scope: 'push', store_dir: store.dir }));
    gateStoreAppend(store, finishRow({ run: rid(8), at: iso(NOW), file: 'src/a.spec.ts', key: k.key, components: k.components }));
    const redact = gateFpRedactValues({ repo: repo.dir, names: reuse.env, files: reuse.env_files, env: { API_TOKEN: v1 } });
    gateStoreFailureWrite(store, 'boom ' + v1 + ' and ' + v2 + '\n', redact);
    const salt = fs.readFileSync(path.join(store.dir, '.salt'));
    const hm = crypto.createHmac('sha256', salt).update(v1).digest('hex');
    line0 = sp.env.lines.map((l) => l.join('\t')).find((l) => l.startsWith('env\tAPI_TOKEN\t'));
    assert.equal(line0, 'env\tAPI_TOKEN\t' + hm);
    envDigest0 = k.components.env;
    const sp2 = run(v1 + '-changed');
    const k2 = gateKeyFor(sp2, { file: 'src/a.spec.ts', deps: ['.env'] });
    assert.notEqual(k2.components.env, envDigest0, 'the change alters components.env');
    process.stdout.write(gateWhy(k.components, k2.components, { store, nowText: { env: sp2.env.text } }).join('\n') + '\n');
    const sp3 = run(v1);
    assert.equal(sp3.env.lines.map((l) => l.join('\t')).find((l) => l.startsWith('env\tAPI_TOKEN\t')), line0, 'restore gives the original line');
  } finally {
    process.stdout.write = ow;
    process.stderr.write = ew;
  }
  const needles = [];
  for (const v of [v1, v2, 'pw-xyz-789']) {
    needles.push(v, JSON.stringify(v).slice(1, -1), hex(v));
  }
  const hay = [...walkFiles(store.dir), ...walkFiles(runDir)].map((f) => fs.readFileSync(f).toString('latin1'));
  hay.push(captured.join(''));
  let hits = 0;
  for (const h of hay) for (const n of needles) if (h.includes(n)) hits++;
  assert.equal(hits, 0, 'values, escaped forms and plain SHA-256 found 0 times');
  assert.ok(captured.join('').includes('invalidated: env (API_TOKEN)'));
  console.log('T-F1-08 0 hits of values/escaped/sha256 across ' + hay.length + ' files+output; env line = HMAC(salt, value); change alters env, restore identical');
});

test('T-F1-09 H4: env files and names keyed by HMAC; removal, directory, unset and empty are distinct and safe', () => {
  const repo = fpRepo({ 'jest.config.js': 'module.exports = {};\n', 'src/a.spec.ts': "test('a', () => {});\n", 'src/b.spec.ts': "test('b', () => {});\n", '.gitignore': '.env\n' });
  write(repo, '.env', 'REQUIRE_REAL_MONGO=1\n');
  const store = tmpStore();
  const reuse = { env: [], env_files: ['.env'] };
  const files = ['src/a.spec.ts', 'src/b.spec.ts'];
  const s0 = spineOf(repo, { store, reuse });
  const k0 = keysOf(s0, files);
  fs.writeFileSync(path.join(repo.dir, '.env'), 'REQUIRE_REAL_MONGO=0\n');
  const s1 = spineOf(repo, { store, reuse });
  const k1 = keysOf(s1, files);
  assert.notEqual(s1.env.digest, s0.env.digest);
  assert.equal(changed(k0, k1), 2, 'every key changes');
  assert.ok(files.every((f) => k1[f].components.env !== k0[f].components.env));
  fs.unlinkSync(path.join(repo.dir, '.env'));
  assert.ok(spineOf(repo, { store, reuse }).env.text.includes('env\tfile:.env\t-\n'));
  fs.mkdirSync(path.join(repo.dir, '.env'));
  const sd = spineOf(repo, { store, reuse });
  assert.ok(sd.env.text.includes('env\tfile:.env\t*\n'));
  const kd = keysOf(sd, files);
  assert.ok(files.every((f) => kd[f].key === null && kd[f].reason === 'env-unhashable'));
  fs.rmdirSync(path.join(repo.dir, '.env'));
  const salt = crypto.randomBytes(32);
  const unset = gateFpEnv({ repo: repo.dir, names: ['NAME'], files: [], env: {}, salt });
  assert.equal(unset.text, 'env\tNAME\t-\n');
  const empty = gateFpEnv({ repo: repo.dir, names: ['NAME'], files: [], env: { NAME: '' }, salt });
  assert.match(empty.text, /^env\tNAME\t[0-9a-f]{64}\n$/);
  assert.notEqual(empty.text, unset.text);
  console.log('T-F1-09 .env edit changes env + 2 of 2 keys; removal -, directory * (key null env-unhashable); unset - vs empty HMAC');
});

test('T-F1-16 G-1 unknown platform or installed state: key null for that runner only', () => {
  const p = gateFpPlatform({ runtime: 'node', env: process.env });
  const line = p.join('\t');
  const f = line.split('\t');
  assert.equal(f.length, 8);
  assert.equal(f[0], 'platform');
  assert.equal(f[1], 'node');
  assert.match(f[2], /^v[0-9]+\./);
  assert.ok(f[3].length > 0, 'ICU version');
  assert.equal(f[4], process.platform);
  assert.equal(f[6], process.arch);
  assert.match(f[7], /^[0-9]+$/);
  const repo = fpRepo({ 'jest.config.js': 'module.exports = {};\n', 'src/a.spec.ts': "test('a', () => {});\n", 'tests/test_a.py': 'def test_a():\n    pass\n' });
  const emptyBin = tmpDir('g1-nobin-');
  fs.symlinkSync(cp.execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim(), path.join(emptyBin, 'git'));
  const noNode = spineOf({ ...repo, env: { ...repo.env, PATH: emptyBin } }, {});
  const kn = gateKeyFor(noNode, { file: 'src/a.spec.ts', deps: [] });
  assert.equal(kn.key, null);
  assert.equal(kn.reason, 'platform-unknown');
  const badPy = fakeInterp([], 1);
  const py = spineOf(repo, { runner: 'pytest', python: badPy });
  const kp = gateKeyFor(py, { file: 'tests/test_a.py', runner: { name: 'pytest', version: '8.0.0', argv: [] }, deps: [] });
  assert.equal(kp.key, null);
  assert.equal(kp.reason, 'installed-unknown');
  const js = spineOf(repo, { runner: 'jest', python: badPy });
  assert.match(gateKeyFor(js, { file: 'src/a.spec.ts', deps: [] }).key, /^[0-9a-f]{64}$/);
  console.log('T-F1-16 platform line 8 fields (' + f.slice(1, 3).join(' ') + '); no runtime on PATH platform-unknown; python probe exit 1 installed-unknown for pytest, jest key non-null');
});
