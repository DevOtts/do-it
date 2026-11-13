// Drift guards (CP-01): the plugin mirror and the generated spine bundle must match their sources.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('drift: scripts/sync-mirror.mjs --check reports no DIFF', () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-mirror.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  const text = (r.stdout || '') + (r.stderr || '');
  assert.ok(!/DIFF/.test(text), 'mirror drift:\n' + text);
  assert.equal(r.status, 0, text);
});

test('drift: rebuilding the spine bundle reproduces the committed core/spine/do-it.mjs byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'drift-bundle-'));
  try {
    const out = path.join(dir, 'do-it.mjs');
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'core', 'spine', 'build.mjs'), out], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.readFileSync(out).equals(fs.readFileSync(path.join(ROOT, 'core', 'spine', 'do-it.mjs'))), 'core/spine/do-it.mjs is stale: run node core/spine/build.mjs');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
