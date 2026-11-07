// R3 / X18: do-it is host-agnostic and consumer-agnostic. The pilot consumer repo, its programs and its paths appear
// only in a plan package's audit/ evidence files. Every other tracked file says "the pilot consumer repo" and reads
// paths from env (X3). Names are built from fragments so this file passes its own scan.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
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
// One recorded exception (X21): the frozen do-it v1 contract names the pilot on exactly two lines, and its html twin
// embeds the same two. Pinned by the sha256 of each hit line: those exact lines pass, any other line (a third mention,
// or an edit of a pinned line) fails. Contracts are not edited by fix workers.
const sha = (l) => crypto.createHash('sha256').update(l).digest('hex');
const FROZEN_V1 = {
  'delivery/CONTRACT.md': new Set(['a893bce3af3bb2f82f18afa0828d0a4c096b3a277a9073daaa1f3e2a1e6313a3', 'a4b6c6d9979a7d82d4da4c03f23b4e2e102adf008f826d405691e623478c588c']),
  'delivery/CONTRACT.html': new Set(['534dd5ecb471c1368046472ffbf91c9d052026fbfc782a8dce07583f2735e5d2', '82b66ac61cd79af598309cd9c87968e13d9a1b7e8feacfb3fefebcdb38be7a74']),
};

export function trackedFiles(root = ROOT) {
  const r = cp.spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

export function scan(files, root = ROOT, frozen = FROZEN_V1) {
  const hits = [];
  for (const f of files) {
    if (exempt(f)) continue;
    const p = path.join(root, f);
    let buf;
    try { buf = fs.readFileSync(p); } catch { continue; }
    if (buf.includes(0)) continue;
    const pinned = frozen[f];
    if (pinned) {
      buf.toString('utf8').split('\n').forEach((line, i) => {
        const m = line.match(RE);
        if (m && !pinned.has(sha(line))) hits.push(f + ':' + (i + 1) + ': ' + m[0]);
      });
      continue;
    }
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

test('X21 pin: the frozen contract passes with exactly its recorded lines; a third mention or an edited line fails', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'neutral-x21-'));
  try {
    for (const f of Object.keys(FROZEN_V1)) {
      fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
      assert.deepEqual(scan([f], dir), [], f + ' as committed');
      const own = scan([f], dir, {});
      assert.equal(own.length, 1, 'unpinned scan reports the file');
      // mutation 1: a third mention appended
      fs.appendFileSync(path.join(dir, f), '\nsee ' + j('Eng', 'ine', '-', 'Core') + ' again\n');
      const third = scan([f], dir);
      assert.equal(third.length, 1, f + ' third mention');
      assert.match(third[0], new RegExp('^' + f.replace('.', '\\.') + ':\\d+:'));
      // mutation 2: a pinned line edited
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
      const idx = lines.findIndex((l) => RE.test(l));
      lines[idx] += ' x';
      fs.writeFileSync(path.join(dir, f), lines.join('\n'));
      assert.equal(scan([f], dir).length, 1, f + ' edited pinned line');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
