// H0 conformance suite, schemas and repo checks run against the claude-code adapter.
// `continue` cases start a child `claude`; a stub is put first on PATH so no paid call is made here
// Variant runs switch one capability off at a time; `continue.headless` is left out because the
// meter-provider case reads usage of an earlier continuation (open issue: pass a sample result).
// (the real binary is exercised by T-H1-11, T-H1-12 and T-H1-17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, '..');
const REPO = resolve(HOST, '..', '..');
const node = process.execPath;

function stubPath() {
  const bin = mkdtempSync(join(tmpdir(), 'h1-conf-bin-'));
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\nexec "${node}" "${join(HERE, 'stub-claude.mjs')}" "$@"\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  return `${bin}:${process.env.PATH}`;
}
const conf = (extra = []) => spawnSync(node, [join(REPO, 'hosts/_interface/conformance/run.mjs'), '--adapter', join(HOST, 'adapter.mjs'), '--json', ...extra],
  { encoding: 'utf8', env: { ...process.env, PATH: stubPath(), STUB_MODE: 'ok' } });

test('H1 conformance suite passes on the claude-code adapter', () => {
  const r = conf();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.failed, 0);
  assert.equal(rep.skipped.length, 0);
  assert.ok(rep.passed >= 19);
});

for (const off of ['wake.native', 'hooks.stop_gate', 'ask.native', 'spawn.native', 'meter.provider_usage']) {
  test(`H1 conformance with ${off} switched off passes (skips carry a reason)`, () => {
    const r = conf(['--off', off]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const rep = JSON.parse(r.stdout);
    assert.equal(rep.failed, 0);
    for (const s of rep.skipped) assert.ok(s.reason.length > 0);
  });
}

test('H1 schemas: adapter manifest and capabilities validate', () => {
  for (const [kind, file] of [['adapter', 'adapter.manifest.json'], ['capabilities', 'capabilities.json']]) {
    const r = spawnSync(node, [join(REPO, 'hosts/_interface/validate.mjs'), '--kind', kind, join(HOST, file)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
});

test('H1 plugin manifest equals the L5 manifest (B8) and carries the four named companions', () => {
  const mine = readFileSync(join(HOST, 'plugin/.claude-plugin/plugin.json'));
  const theirs = readFileSync(join(REPO, 'plugins/do-it/.claude-plugin/plugin.json'));
  assert.ok(mine.equals(theirs));
  const deps = JSON.parse(mine).dependencies;
  for (const n of ['plan-it', 'build-it', 'review-it', 'conclude-it']) assert.ok(deps.includes(n), n);
});

test('H1 forbidden-names check (G-14) is clean on hosts/claude-code', () => {
  const r = spawnSync(node, [join(REPO, 'hosts/_interface/checks', ['g14-no-her', 'mes-open', 'claw.mjs'].join('')), '--root', HOST], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
