import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { SPINE_DIR, SRC_DIR, cleanupTmp, mutantCopy } from './g1-helpers.mjs';

after(cleanupTmp);

const DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)(\w+)/gm;
const IMPORT_RE = /^import\s[\s\S]*?\sfrom\s+(['"])([^'"]+)\1;?[ \t]*$/gm;

test('T-L1-10 G-15: bundle builds, store-lane modules import only node: and ./, every top-level name starts with gate; a duplicate name fails the build', () => {
  const r = cp.spawnSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^built /);
  const mods = ['gate-results.mjs', 'gate-fingerprint.mjs'].filter((n) => fs.existsSync(path.join(SRC_DIR, n)));
  assert.ok(mods.includes('gate-results.mjs'));
  for (const n of mods) {
    const text = fs.readFileSync(path.join(SRC_DIR, n), 'utf8');
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text))) assert.ok(m[2].startsWith('node:') || m[2].startsWith('./'), n + ' imports ' + m[2]);
    DECL_RE.lastIndex = 0;
    const names = [];
    while ((m = DECL_RE.exec(text))) names.push(m[1]);
    assert.ok(names.length > 5);
    const bad = names.filter((x) => !/^gate/i.test(x));
    assert.deepEqual(bad, [], n + ' top-level names not starting with gate');
  }
  const bundle = fs.readFileSync(path.join(SPINE_DIR, 'do-it.mjs'), 'utf8');
  assert.ok(bundle.includes('// ---- gate-results.mjs ----'));
  if (mods.includes('gate-fingerprint.mjs')) assert.ok(bundle.includes('// ---- gate-fingerprint.mjs ----'));
  const emb = /^const EMBEDDED_SCHEMAS = (.*);$/m.exec(bundle);
  assert.ok(emb);
  assert.ok(Object.prototype.hasOwnProperty.call(JSON.parse(emb[1]), 'gate-result.1.schema.json'));
  // mutant: a duplicate top-level name must fail the build (proves the guard can fail)
  const m = mutantCopy((name, text) => (name === 'gate-results.mjs' ? text + '\nexport function readLedger() {}\n' : text));
  const out = path.join(m.root, 'out.mjs');
  const bad = cp.spawnSync(process.execPath, [path.join(m.spine, 'build.mjs'), out], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /duplicate top-level name readLedger/);
  console.log('T-L1-10 build exit 0; ' + mods.join(', ') + ' clean; mutant build exit ' + bad.status + ' duplicate top-level name readLedger');
});
