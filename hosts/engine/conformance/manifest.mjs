#!/usr/bin/env node
// Integrity manifest of the four saved Engine-Core files (D19). 
// Usage: node manifest.mjs write [--dir D] | verify [--dir D] [--manifest FILE]   verify exit 0 match, 1 mismatch
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DIR } from './spec-lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST = join(HERE, 'manifest.json');
export const FILES = ['README.md', '01-ADJUSTMENTS-TO-ENGINE-DEV-SQUAD.md', '02-ENGINE-LAYER-SPEC.md', '03-OPEN-QUESTIONS.md'];
const sha = (b) => createHash('sha256').update(b).digest('hex');

export function writeManifest(dir = DEFAULT_DIR, file = MANIFEST) {
  const files = Object.fromEntries(FILES.map((f) => [f, sha(readFileSync(join(dir, f)))]));
  writeFileSync(file, JSON.stringify({ schema: 'do-it-engine-layer-manifest/1', dir: 'docs/implementation/do-it-engine-layer', files }, null, 2) + '\n');
  return files;
}

export function verifyManifest(dir = DEFAULT_DIR, file = MANIFEST) {
  const want = JSON.parse(readFileSync(file, 'utf8')).files;
  const mismatches = [];
  for (const f of FILES) {
    const actual = sha(readFileSync(join(dir, f)));
    if (actual !== want[f]) mismatches.push({ file: f, expected: want[f], actual });
  }
  return mismatches;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const dir = arg('--dir', DEFAULT_DIR), file = arg('--manifest', MANIFEST);
  if (argv[0] === 'write') { console.log(JSON.stringify(writeManifest(dir, file), null, 2)); return; }
  const bad = verifyManifest(dir, file);
  for (const m of bad) console.log(`MISMATCH ${m.file} expected ${m.expected} actual ${m.actual}`);
  if (!bad.length) console.log('manifest ok');
  process.exitCode = bad.length ? 1 : 0;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
