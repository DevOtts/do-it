import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gateStoreMemoAppend } from '../../src/gate-results.mjs';
import { GATE_FP_WIDE_DIGEST, gateFpStatCacheClear, gateKeyFor } from '../../src/gate-fingerprint.mjs';
import { cleanupTmp, hex, mutantCopy, sha, tmpStore } from './g1-helpers.mjs';
import { FIX_ADAPTERS, fpRepo, spineOf } from './f1-helpers.mjs';

after(cleanupTmp);

function hashRepo() {
  return fpRepo({ 'jest.config.js': 'module.exports = {};\n', 'x.ts': 'export const x = 1;\n', 'src/x.spec.ts': "test('x', () => {});\n", '.gitignore': 'node_modules/\n' });
}

const keyOf = (sp) => gateKeyFor(sp, { file: 'src/x.spec.ts', deps: ['x.ts'] }).key;

test('T-F1-13 adversarial blob memo: hits are true, bypass flags and attributes are honoured, a lying memo is caught and discarded', async () => {
  // (a) clean tracked file
  const repo = hashRepo();
  const store = tmpStore();
  spineOf(repo, { store });
  gateFpStatCacheClear();
  const sa = spineOf(repo, { store });
  assert.ok(sa.table.memoHits >= 1);
  assert.equal(sa.table.hashes['x.ts'], sha(path.join(repo.dir, 'x.ts')));
  // (b) assume-unchanged and skip-worktree edits change the key
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    const r = hashRepo();
    const st = tmpStore();
    const k0 = keyOf(spineOf(r, { store: st }));
    r.git('update-index', flag, 'x.ts');
    fs.writeFileSync(path.join(r.dir, 'x.ts'), 'export const x = 2;\n');
    assert.equal(r.git('diff-files', '--name-only'), '', 'git does not list the flagged file as modified');
    gateFpStatCacheClear();
    const k1 = keyOf(spineOf(r, { store: st }));
    assert.notEqual(k1, k0, flag + ': the edit changes the key');
  }
  // (c) a valid-CRC memo line mapping x.ts's blob to a wrong SHA-256, verified at 100%
  const rc = hashRepo();
  const sc = tmpStore();
  const diskKey = keyOf(spineOf(rc, { store: null }));
  const blob = rc.git('rev-parse', ':x.ts').trim();
  spineOf(rc, { store: sc });
  gateStoreMemoAppend(sc, [{ b: blob, s: hex('wrong'), w: { [GATE_FP_WIDE_DIGEST]: [0, 0] } }]);
  gateFpStatCacheClear();
  const spc = spineOf({ ...rc, env: { ...rc.env, DO_IT_FAULT: 'memo_verify_all' } }, { store: sc });
  assert.ok(spc.logs.includes('[gate-fingerprint] blob memo mismatch: memo discarded'));
  assert.ok(fs.readdirSync(sc.dir).some((n) => /^blobmemo\.jsonl\.bad-[0-9]+$/.test(n)), 'memo renamed to blobmemo.jsonl.bad-{at}');
  assert.equal(keyOf(spc), diskKey, 'every key equals the disk-computed key');
  // (d) .gitattributes disables the memo
  const rd = fpRepo({ '.gitattributes': '* text eol=crlf\n', 'x.ts': 'export const x = 1;\n', 'src/x.spec.ts': "test('x', () => {});\n" });
  const sd = tmpStore();
  spineOf(rd, { store: sd });
  assert.equal(spineOf(rd, { store: sd }).table.memoHits, 0);
  // (e) mutant without memo verification, run on (c)
  let replaced = 0;
  const m = mutantCopy((n, t) => {
    if (n !== 'gate-fingerprint.mjs') return t;
    return t.split('\n').map((l) => { if (l.includes('// MEMO-VERIFY')) { replaced++; return '  const sample = []; // verification removed (mutant)'; } return l; }).join('\n');
  });
  assert.equal(replaced, 1);
  const mod = await import(pathToFileURL(path.join(m.src, 'gate-fingerprint.mjs')).href);
  const re = hashRepo();
  const se = tmpStore();
  const mspine = (env) => mod.gateFpSpine({ repo: re.dir, runner: 'jest', env, store: se, adaptersDir: FIX_ADAPTERS, log: () => {} });
  const eDisk = mod.gateKeyFor(mod.gateFpSpine({ repo: re.dir, runner: 'jest', env: re.env, store: null, adaptersDir: FIX_ADAPTERS, log: () => {} }), { file: 'src/x.spec.ts', deps: ['x.ts'] }).key;
  mspine(re.env);
  const eblob = re.git('rev-parse', ':x.ts').trim();
  gateStoreMemoAppend(se, [{ b: eblob, s: hex('wrong'), w: { [mod.GATE_FP_WIDE_DIGEST]: [0, 0] } }]);
  mod.gateFpStatCacheClear();
  const eKey = mod.gateKeyFor(mspine({ ...re.env, DO_IT_FAULT: 'memo_verify_all' }), { file: 'src/x.spec.ts', deps: ['x.ts'] }).key;
  assert.notEqual(eKey, eDisk, 'the mutant key differs from the disk key');
  console.log('MEMO-TAMPER-UNDETECTED (mutant without verification keyed x.ts by the lying memo)');
  console.log('T-F1-13 (a) memo hits ' + sa.table.memoHits + ' = disk; (b) both flags change the key; (c) mismatch caught, memo renamed, disk key; (d) hits 0; (e) mutant caught');
});
