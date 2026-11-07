// R3 / X18: do-it is host-agnostic and consumer-agnostic. The pilot consumer repo, its programs and its paths appear
// only in a plan package's audit/ evidence files. Every other tracked file says "the pilot consumer repo" and reads
// paths from env (X3). Names are built from fragments so this file passes its own scan.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const j = (...p) => p.join('');
const NAMES = [
  j('eng', 'ine', '[-_ ]?', 'core'),
  j('eng', 'ine', '-', 'hq'),
  j('brain', '-(?:api|agent|docs|mcp|app|teams|runner|connectors|browser|admin|scripts|handson|dev)'),
  j('grok', 'bot'),
  j('docs', '-', 'trust'),
  j('claude', 'code', '-like'),
  j('Workspace', '/', 'Eng', 'ine'),
  j('secrets', '-', 'highway'),
  j('eng', 'ine', '-workspace'),
];
const RE = new RegExp('(' + NAMES.join('|') + ')', 'i');
// Tracked files exempt from the scan: the audit evidence of a plan package (docs/01 placed identity there by design).
const exempt = (f) => /^docs\/implementation\/[^/]+\/audit\//.test(f);
// One recorded exception, awaiting an owner decision (CP-01 fix, defect 3): the frozen do-it v1 contract names the
// pilot in its section 5 and its html twin embeds it. Contracts are not edited by fix workers.
const FROZEN_V1 = new Set(['delivery/CONTRACT.md', 'delivery/CONTRACT.html']);

export function trackedFiles(root = ROOT) {
  const r = cp.spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

export function scan(files, root = ROOT) {
  const hits = [];
  for (const f of files) {
    if (exempt(f) || FROZEN_V1.has(f)) continue;
    const p = path.join(root, f);
    let buf;
    try { buf = fs.readFileSync(p); } catch { continue; }
    if (buf.includes(0)) continue;
    const m = buf.toString('utf8').match(RE);
    if (m) hits.push(f + ': ' + m[0]);
  }
  return hits;
}

test('R3 / X18 neutral names: no tracked file outside docs/implementation/*/audit/ names the pilot consumer repo or its programs', (t) => {
  const files = trackedFiles();
  if (!files) return t.skip('not a git checkout');
  assert.ok(files.length > 100, 'found ' + files.length + ' tracked files');
  assert.deepEqual(scan(files), []);
});

test('R3 / X18 neutral names: the scan catches a planted name, and audit/ is the only exempt place', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'neutral-'));
  try {
    const planted = j('Eng', 'ine', '-', 'Core');
    fs.mkdirSync(path.join(dir, 'docs/implementation/x/audit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/implementation/x/audit/claims.md'), planted + ' evidence');
    fs.writeFileSync(path.join(dir, 'docs/implementation/x/PRD.md'), 'see ' + planted);
    fs.writeFileSync(path.join(dir, 'a.mjs'), "const p = '/Users/me/" + j('Work', 'space/Eng', 'ine') + "/x';");
    fs.writeFileSync(path.join(dir, 'clean.md'), 'the pilot consumer repo');
    const files = ['docs/implementation/x/audit/claims.md', 'docs/implementation/x/PRD.md', 'a.mjs', 'clean.md'];
    assert.deepEqual(scan(files, dir).map((h) => h.split(':')[0]), ['docs/implementation/x/PRD.md', 'a.mjs']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
