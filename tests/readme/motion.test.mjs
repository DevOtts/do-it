// The animated README assets: generated, well formed, no scripts or external refs, reduced-motion safe,
// and every asset the README embeds exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => f.endsWith('.svg'));
const ANIMATED = ASSETS.filter((f) => !f.endsWith('-static.svg'));

test('motion assets are current with the generator', () => {
  const r = spawnSync('node', ['scripts/gen-motion-assets.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('every svg parses and carries title and desc', () => {
  for (const f of ASSETS) {
    const p = path.join(ROOT, 'assets', f);
    assert.equal(spawnSync('xmllint', ['--noout', p]).status, 0, f);
    const s = fs.readFileSync(p, 'utf8');
    assert.match(s, /<title[^>]*>[^<]+<\/title>/, f);
    assert.match(s, /<desc[^>]*>[^<]+<\/desc>/, f);
  }
});

test('animated svgs use CSS only, no script, no external reference, and honor reduced motion', () => {
  assert.ok(ANIMATED.length >= 6);
  for (const f of ANIMATED) {
    const s = fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
    assert.match(s, /@keyframes/, f);
    assert.match(s, /prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}/, f);
    assert.doesNotMatch(s, /<script|href=|xlink:|url\(http|@import/, f);
  }
});

test('static twins carry no animation', () => {
  for (const f of ASSETS.filter((x) => x.endsWith('-static.svg'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8'), /@keyframes|<animate/, f);
  }
});

test('README embeds only assets that exist, including four use-case animations', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const srcs = [...readme.matchAll(/<img src="(assets\/[^"]+)"/g)].map((m) => m[1]);
  for (const s of srcs) assert.ok(fs.existsSync(path.join(ROOT, s)), s);
  assert.equal(srcs.filter((s) => s.includes('do-it-uc-')).length, 4);
  assert.match(readme, /^## Use cases$/m);
});
