#!/usr/bin/env node
// Re-probe the installed binary and compare with capabilities.json. Never rewrites the file.
//   probe.mjs --check [--caps FILE] [--bin NAME]   exit 0 match, 1 mismatch (every one listed), 2 probe failed
//   probe.mjs --flags [--bin NAME]                  exit 0 when every flag the adapter uses is in the real help, else 1
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareProbed, probeVersion } from '../_interface/lib/probe-compare.mjs';
import { requestUserInputEnabled } from './lib/ask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Flags and subcommands this adapter relies on, and the help each must appear in.
export const REQUIRED = [
  { args: ['exec', '--help'], needles: [['-C', /^\s*-C,/m], ['--json', /--json/], ['-m', /^\s*-m,/m], ['-s', /^\s*-s,/m], ['subcommand resume', /^\s+resume\s/m]] },
  { args: ['exec', 'resume', '--help'], needles: [['resume --json', /--json/], ['resume --last', /--last/]] },
];

export function checkFlags(bin = 'codex') {
  const missing = [];
  for (const { args, needles } of REQUIRED) {
    const text = execFileSync(bin, args, { encoding: 'utf8', timeout: 30000 });
    for (const [name, re] of needles) if (!re.test(text)) missing.push(`${args.join(' ')}: ${name}`);
  }
  return missing;
}

export function probe(bin = 'codex') {
  const version = probeVersion(bin);
  const features = execFileSync(bin, ['features', 'list'], { encoding: 'utf8', timeout: 30000 });
  return { version, askNative: requestUserInputEnabled(features) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const bin = get('--bin', 'codex');
  if (a.includes('--flags')) {
    let missing;
    try { missing = checkFlags(bin); } catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
    for (const m of missing) console.log(`missing flag: ${m}`);
    if (!missing.length) console.log('all flags present');
    process.exit(missing.length ? 1 : 0);
  }
  const caps = JSON.parse(readFileSync(get('--caps', join(HERE, 'capabilities.json')), 'utf8'));
  let p;
  try { p = probe(bin); } catch (e) { console.error(`probe failed: ${e.message}`); process.exit(2); }
  const diffs = compareProbed({ version_probed: p.version, ask: { native: p.askNative } }, caps);
  for (const d of diffs) console.log(`${d.field}: probed ${d.probed} != declared ${d.declared}`);
  if (!diffs.length) console.log('capabilities match probe');
  process.exit(diffs.length ? 1 : 0);
}
