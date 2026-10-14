#!/usr/bin/env node
// Re-probe the installed binary and compare with capabilities.json. Never rewrites the file.
//   probe.mjs --check [--caps FILE] [--bin NAME]   exit 0 match, 1 mismatch (every one listed), 2 probe failed
//   probe.mjs --flags [--bin NAME]                  exit 0 when every flag the adapter uses is in the real `run --help`, else 1
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareProbed, probeVersion } from '../_interface/lib/probe-compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// v2 flags this adapter relies on (checked against `opencode run --help`, never against 1.x docs).
export const REQUIRED = [
  { args: ['run', '--help'], needles: [['--format', /--format\b/], ['-m', /--model,?\s*-m|-m,\s*--model|--model, -m/], ['--auto', /--auto\b/], ['--standalone', /--standalone\b/], ['-s', /--session,\s*-s|-s,\s*--session/]] },
  { args: ['stats', '--help'], needles: [['stats --cost', /--cost\b/], ['stats --json', /--json\b/]] },
  { args: ['session', 'export', '--help'], needles: [['session export', /Export session data/]] },
];

export function checkFlags(bin = 'opencode') {
  const missing = [];
  for (const { args, needles } of REQUIRED) {
    const text = execFileSync(bin, args, { encoding: 'utf8', timeout: 30000 });
    for (const [name, re] of needles) if (!re.test(text)) missing.push(`${args.join(' ')}: ${name}`);
  }
  return missing;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const bin = get('--bin', 'opencode');
  if (a.includes('--flags')) {
    let missing;
    try { missing = checkFlags(bin); } catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
    for (const m of missing) console.log(`missing flag: ${m}`);
    if (!missing.length) console.log('all flags present');
    process.exit(missing.length ? 1 : 0);
  }
  const caps = JSON.parse(readFileSync(get('--caps', join(HERE, 'capabilities.json')), 'utf8'));
  let version, missing;
  try { version = probeVersion(bin); missing = checkFlags(bin); } catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
  const diffs = [...compareProbed({ version_probed: version }, caps), ...missing.map((m) => ({ field: m, probed: 'absent', declared: 'required' }))];
  for (const d of diffs) console.log(`${d.field}: probed ${d.probed} != declared ${d.declared}`);
  if (!diffs.length) console.log('capabilities match probe');
  process.exit(diffs.length ? 1 : 0);
}
