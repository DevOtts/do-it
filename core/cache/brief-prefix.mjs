import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from '../routing/errors.mjs';
import { findVolatile } from './prefix-diff.mjs';

// The stable prefix of a brief is everything before the slice section (preamble + run-constant).
export function stablePrefix(text) {
  const i = text.indexOf('\n## slice ');
  return i === -1 ? text : text.slice(0, i);
}

export function checkBriefPrefix(text, file) {
  const prefix = stablePrefix(text);
  const m = findVolatile(prefix);
  if (m) throw fail('VOLATILE_IN_PREFIX', 1, { file, offset: Buffer.byteLength(prefix.slice(0, m.index)), sample: m[0] });
  return { outcome: 'BRIEF_PREFIX_STABLE', prefix_bytes: Buffer.byteLength(prefix) };
}

// Length in bytes of the common prefix of two briefs.
export function sharedPrefixBytes(a, b) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const f = process.argv[2];
    if (!f) throw fail('USAGE', 1, { message: 'brief-prefix <brief.md>' });
    return checkBriefPrefix(fs.readFileSync(f, 'utf8'), f);
  });
}
