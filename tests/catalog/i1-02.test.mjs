// T-I1-02: init-it 0.1.0 is a published optional companion; pins and marketplace agree.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPINE = path.join(ROOT, 'core', 'spine', 'do-it.mjs');

test('T-I1-02 check-pins --marketplace passes with init-it and doc-it entries', () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-pins.mjs'), '--marketplace', '--lint'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'core/companions.json'), 'utf8'));
  const e = ledger.companions.find((c) => c.name === 'init-it');
  assert.deepEqual([e.repo, e.version, e.required, e.status, e.skill_dir], ['DevOtts/init-it', '0.1.0', false, 'published', 'plugins/init-it']);
  const mp = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(mp.plugins.find((p) => p.name === 'init-it')?.version, '0.1.0');
});

test('T-I1-02 doctor --install --dry-run plans init-it 0.1.0 as optional on a clean home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'i102-'));
  try {
    const r = cp.spawnSync(process.execPath, [SPINE, 'doctor', '--install', '--host', 'opencode', '--dry-run'], { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^optional: npx skills add DevOtts\/init-it -a opencode\s+# init-it 0\.1\.0$/m);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
