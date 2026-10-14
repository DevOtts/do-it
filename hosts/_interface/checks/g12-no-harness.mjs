#!/usr/bin/env node
// G-12: core/ contains no harness name. Usage: g12-no-harness.mjs --root DIR
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(HERE, '..', 'harness-names.json'), 'utf8'));

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const root = ri >= 0 ? args[ri + 1] : undefined;
if (!root) { console.error('usage: g12-no-harness.mjs --root DIR'); process.exit(2); }
if (!existsSync(root)) { console.error(`root not found: ${root}`); process.exit(2); }

const re = new RegExp(`(^|[^A-Za-z])(${cfg.names.join('|')})(?![A-Za-z])`, 'i');
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (cfg.exclude_dirs.includes(name)) continue;
      walk(p);
    } else if (cfg.scan_extensions.includes(extname(name))) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const m = re.exec(line);
        if (m) hits.push(`${relative(process.cwd(), p) || p}:${i + 1}:${m[2].toLowerCase()}`);
      });
    }
  }
}
walk(root);
for (const h of hits) console.log(h);
console.log(`matches: ${hits.length}`);
process.exit(hits.length ? 1 : 0);
