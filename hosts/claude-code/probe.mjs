#!/usr/bin/env node
// Re-probe the installed binary and compare with capabilities.json. Never rewrites the file.
//   probe.mjs --check [--caps FILE] [--bin NAME]   exit 0 match, 1 mismatch (every one listed), 2 probe failed
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareProbed, probeVersion } from '../_interface/lib/probe-compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Flags and subcommand options this adapter relies on, and the help text that must mention them.
export const REQUIRED = [
  { args: ['--help'], needles: ['--print', '--output-format', '--session-id', '--resume', '--add-dir', '--max-budget-usd'] },
  { args: ['plugin', 'validate', '--help'], needles: ['--json'] },
];

export function probe(bin = 'claude') {
  const version = probeVersion(bin);
  const missing = [];
  for (const { args, needles } of REQUIRED) {
    const text = execFileSync(bin, args, { encoding: 'utf8', timeout: 30000 });
    for (const n of needles) if (!text.includes(n)) missing.push({ field: `${args.join(' ')} ${n}`, probed: 'absent', declared: 'required' });
  }
  return { version, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const caps = JSON.parse(readFileSync(get('--caps', join(HERE, 'capabilities.json')), 'utf8'));
  let p;
  try { p = probe(get('--bin', 'claude')); } catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
  const diffs = [...compareProbed({ version_probed: p.version }, caps), ...p.missing];
  for (const d of diffs) console.log(`${d.field}: probed ${d.probed} != declared ${d.declared}`);
  if (!diffs.length) console.log('capabilities match probe');
  process.exit(diffs.length ? 1 : 0);
}
