// T-K2-04: README family table and doctor --install --dry-run list doc-it as optional.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPINE = path.join(ROOT, 'core', 'spine', 'do-it.mjs');

test('T-K2-04 README family table lists doc-it and init-it as optional', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const table = readme.slice(readme.indexOf('## do-it x the family'));
  assert.match(table, /\| \[doc-it\]\(https:\/\/github\.com\/DevOtts\/doc-it\) \(optional\) \|.*source tiers, archive closeout, expiry, stale checkout/);
  assert.match(table, /\| \[init-it\]\(https:\/\/github\.com\/DevOtts\/init-it\) \(optional\) \|.*registers a session against an implementation/);
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.match(skill, /doc-it: documentation rules and checks/);
});

test('T-K2-04 doctor --install --dry-run on a temp HOME lists doc-it as optional', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'k2-'));
  try {
    const r = cp.spawnSync(process.execPath, [SPINE, 'doctor', '--install', '--host', 'codex', '--dry-run'], { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^optional: npx skills add DevOtts\/doc-it -a codex/m);
    assert.doesNotMatch(r.stdout, /^npx skills add DevOtts\/doc-it/m);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
