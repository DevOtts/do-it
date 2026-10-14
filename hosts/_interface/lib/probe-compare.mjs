#!/usr/bin/env node
// Compare a probed object with a capabilities file; list mismatched fields. Never writes the file.
// CLI: probe-compare.mjs --caps FILE --bin PATH [--version-arg --version]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function compareProbed(probed, caps, prefix = '') {
  const out = [];
  for (const k of Object.keys(probed)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const a = probed[k], b = caps[k];
    if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object') {
      out.push(...compareProbed(a, b, path));
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ field: path, probed: a, declared: b });
    }
  }
  return out;
}

export function probeVersion(bin, versionArg = '--version') {
  const text = execFileSync(bin, [versionArg], { encoding: 'utf8', timeout: 15000 });
  const m = /\d+\.\d+\.\d+/.exec(text);
  return m ? m[0] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const capsFile = get('--caps'), bin = get('--bin');
  if (!capsFile || !bin) { console.error('usage: probe-compare.mjs --caps FILE --bin PATH'); process.exit(2); }
  const caps = JSON.parse(readFileSync(capsFile, 'utf8'));
  let version;
  try { version = probeVersion(bin, get('--version-arg', '--version')); }
  catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
  const diffs = compareProbed({ version_probed: version }, caps);
  for (const d of diffs) console.log(`${d.field}: probed ${d.probed} != declared ${d.declared}`);
  if (!diffs.length) console.log('capabilities match probe');
  process.exit(diffs.length ? 1 : 0);
}
