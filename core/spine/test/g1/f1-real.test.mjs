import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateStoreOpen } from '../../src/gate-results.mjs';
import { gateFpComponentsWrite, gateFpHashPath, gateFpManifestBuild, gateFpManifestWrite, gateKeyFor, gateWhy } from '../../src/gate-fingerprint.mjs';
import { cleanupTmp, rid, tmpDir, tmpStore } from './g1-helpers.mjs';
import { FIX_ADAPTERS, fpRepo, keysOf, spineOf, write } from './f1-helpers.mjs';

after(cleanupTmp);

const FILES = ['src/a.spec.ts', 'src/b.spec.ts', 'src/c.spec.ts', 'src/d.spec.ts', 'src/e.spec.ts'];

test('T-F1-05 [REAL] G-8: two real worktrees with identical bytes and installed state give identical keys and manifest lines; installed drift is named', () => {
  const files = { 'jest.config.js': "module.exports = { testEnvironment: 'node' };\n", 'package-lock.json': '{"lockfileVersion":3}\n', '.gitignore': 'node_modules/\n' };
  for (const f of FILES) files[f] = "test('" + f + "', () => {});\n";
  const repo = fpRepo(files);
  const wt = path.join(tmpDir('g1-wt-'), 'second');
  repo.git('worktree', 'add', '-q', '--detach', wt, 'HEAD');
  const nmLock = '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0"}}}\n';
  write(repo, 'node_modules/.package-lock.json', nmLock);
  write({ dir: wt }, 'node_modules/.package-lock.json', nmLock);
  const s1 = gateStoreOpen({ cwd: repo.dir, env: repo.env });
  const s2 = gateStoreOpen({ cwd: wt, env: repo.env });
  assert.equal(s1.dir, s2.dir);
  const sp1 = spineOf(repo, { store: s1 });
  const sp2 = spineOf({ ...repo, dir: wt }, { store: s2 });
  const k1 = keysOf(sp1, FILES);
  const k2 = keysOf(sp2, FILES);
  assert.equal(FILES.filter((f) => k1[f].key && k1[f].key === k2[f].key).length, 5, '5 of 5 keys identical');
  const run1 = tmpDir('g1-run1-');
  const run2 = tmpDir('g1-run2-');
  const m1 = JSON.parse(fs.readFileSync(gateFpManifestWrite(run1, gateFpManifestBuild(sp1, { run_id: rid(1), store_dir: s1.dir })), 'utf8'));
  const m2 = JSON.parse(fs.readFileSync(gateFpManifestWrite(run2, gateFpManifestBuild(sp2, { run_id: rid(2), store_dir: s2.dir })), 'utf8'));
  assert.equal(JSON.stringify(m1.lines), JSON.stringify(m2.lines), 'manifest lines byte-identical');
  const linesText = m1.lines.join('\n') + '\n' + m2.lines.join('\n');
  assert.equal(linesText.split(repo.dir).length - 1, 0);
  assert.equal(linesText.split(wt).length - 1, 0);
  gateFpComponentsWrite(s1, sp1);
  fs.appendFileSync(path.join(wt, 'node_modules/.package-lock.json'), ' ');
  const sp3 = spineOf({ ...repo, dir: wt }, { store: s2 });
  gateFpComponentsWrite(s2, sp3);
  const k3 = keysOf(sp3, FILES);
  assert.equal(FILES.filter((f) => k3[f].key !== k1[f].key).length, 5, '5 of 5 keys differ after the change');
  const why = gateWhy(k1[FILES[0]].components, k3[FILES[0]].components, { store: s1 });
  assert.deepEqual(why, ['invalidated: installed']);
  repo.git('worktree', 'remove', '--force', wt);
  console.log('T-F1-05 5 of 5 keys identical across real worktrees, manifest lines identical, 0 absolute paths; drift: 5 of 5 differ, ' + why[0]);
});

test('T-F1-14 [REAL] H2 H3 H7 on the pilot consumer jest repo: installed, workspace links and CORE closure, read-only', (t) => {
  const pilot = process.env.PILOT_JEST_REPO;
  if (!pilot || !fs.existsSync(pilot)) {
    console.log('IMPLEMENTED-NOT-VERIFIED: PILOT_JEST_REPO not set (the pilot consumer jest repo is the [REAL] target)');
    t.skip('IMPLEMENTED-NOT-VERIFIED: PILOT_JEST_REPO not set');
    return;
  }
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  const status = () => cp.execFileSync('git', ['-C', pilot, 'status', '--porcelain'], { env, encoding: 'utf8', maxBuffer: 1 << 28 });
  const before = status();
  const store = tmpStore();
  const sp = spineOf({ dir: pilot, env }, { store, reuse: { env: [], env_files: [] }, adaptersDir: FIX_ADAPTERS });
  assert.equal(sp.reason, null, 'every spine component known');
  const inst = sp.installed.text;
  const nodeLine = /^node-installed\tnode_modules\/\.package-lock\.json\t([0-9a-f]{64})$/m.exec(inst);
  const lockLine = /^lock\tpackage-lock\.json\t([0-9a-f]{64})$/m.exec(inst);
  assert.ok(nodeLine, 'node-installed line with a digest');
  assert.ok(lockLine, 'lock line with a digest');
  assert.notEqual(nodeLine[1], lockLine[1]);
  // the pilot is a workspace repo: some installed link line points a node_modules package at a repo folder
  const link = /^link\tnode_modules\/((?:@[^/\t]+\/)?[^/\t]+)\t([^\t\n]+)$/m.exec(inst);
  assert.ok(link, 'a workspace link line node_modules/<pkg> -> <repo folder>');
  const h = gateFpHashPath(pilot, 'node_modules/' + link[1] + '/package.json', sp.table);
  assert.ok(h.path.startsWith(link[2] + '/'), 'member resolves under the linked repo folder (' + h.path + ')');
  // every config literal that names an existing repo file is CORE (derived from the config, no pilot names here)
  const cfgText = fs.readFileSync(path.join(pilot, 'jest.config.js'), 'utf8');
  const wants = new Set(['jest.config.js']);
  for (const m of cfgText.matchAll(/['"](?:<rootDir>\/|\.\/)([^'"*?$^|()[\]{}]+)['"]/g)) {
    const rel = path.posix.normalize(m[1]);
    if (fs.existsSync(path.join(pilot, rel)) && fs.statSync(path.join(pilot, rel)).isFile()) wants.add(rel);
  }
  assert.ok(wants.size >= 2, 'the pilot config references at least one repo file');
  for (const want of wants) {
    assert.ok(sp.core.lines.some((l) => l[0] === 'c' && l[1] === want), 'CORE holds ' + want);
  }
  const after = status();
  assert.equal(after, before, 'git status --porcelain identical before and after');
  console.log('T-F1-14 installed node-installed + lock (distinct digests), link ' + link[0].split('\t').slice(1).join(' -> ') + ', CORE ' + sp.core.lines.length + ' lines incl. config/reporter/setup, status unchanged');
});
