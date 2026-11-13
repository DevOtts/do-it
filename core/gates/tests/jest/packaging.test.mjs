import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { JEST_ADAPTER, REPO_ROOT } from '../helpers.mjs';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('T-A1-17 the adapter imports only node: modules, relative adapter files and lazily the project runner packages; never the spine', () => {
  const files = fs.readdirSync(JEST_ADAPTER).filter((f) => f.endsWith('.cjs'));
  assert.ok(files.includes('reporter.cjs') && files.includes('filter.cjs') && files.includes('closure.cjs'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(JEST_ADAPTER, f), 'utf8');
    assert.ok(!/core\/spine|do-it\.mjs|spine\/src/.test(text.replace(/\/\/.*$/gm, '').replace(/path\.join\(__dirname[^)]*\)/g, '')) || f === 'common.cjs', f + ' names the spine');
    // top-level requires (column 0) are node: built-ins or sibling adapter files
    for (const m of text.matchAll(/^(?:const|let|var)\s+[^=\n]+=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      assert.ok(m[1].startsWith('node:') || m[1].startsWith('./'), f + ' top-level require of ' + m[1]);
    }
    assert.ok(!/\bimport\s+[^(]/.test(text.replace(/\/\/.*$/gm, '')) || /^\/\//.test(text), f + ' is CommonJS');
  }
  const common = fs.readFileSync(path.join(JEST_ADAPTER, 'common.cjs'), 'utf8');
  assert.ok(!/require\([^)]*spine/.test(common), 'common.cjs never requires the spine');
  const desc = JSON.parse(fs.readFileSync(path.join(JEST_ADAPTER, 'adapter.json'), 'utf8'));
  assert.equal(desc.runner, 'jest');
  assert.equal(desc.manifest.env, 'DO_IT_GATE_MANIFEST');
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'mirror-manifest.json'), 'utf8'));
  assert.ok(manifest.pairs.some((p) => p.src === 'core/gates/adapters' && p.dst === 'plugins/do-it/gates/adapters' && p.kind === 'dir'));
  assert.ok(!manifest.pairs.some((p) => p.src === 'core/gates'), 'fixtures under core/gates/tests are not shipped');
  const check = cp.spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'sync-mirror.mjs'), '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const bundle = path.join(REPO_ROOT, 'core', 'spine', 'do-it.mjs');
  const before = sha(bundle);
  const build = cp.spawnSync(process.execPath, [path.join(REPO_ROOT, 'core', 'spine', 'build.mjs')], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  assert.equal(sha(bundle), before, 'the bundle bytes are unchanged by the adapter files');
});
