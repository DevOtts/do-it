// CP-04 part A D1: `doctor --install --dry-run` without --host must never touch disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = path.join(ROOT, 'core', 'spine', 'do-it.mjs');

test('CP-04 D1 doctor --install --dry-run (no --host) plans the shim and writes nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'doit-dry-'));
  const bin = path.join(home, 'bin');
  try {
    const r = spawnSync(process.execPath, [BUNDLE, 'doctor', '--install', '--dry-run', '--json'], {
      encoding: 'utf8', cwd: home, env: { ...process.env, HOME: home, DO_IT_USER_HOME: home, DO_IT_BIN_DIR: bin },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.outcome, 'INSTALL_PLANNED');
    assert.equal(out.dry_run, true);
    assert.equal(fs.existsSync(bin), false, 'the bin dir must not be created');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
