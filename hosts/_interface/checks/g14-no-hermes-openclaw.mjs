#!/usr/bin/env node
// G-14: no hermes/openclaw folder, adapter or test in the repo. Usage: g14-no-hermes-openclaw.mjs --root DIR
// Both path names and file contents are checked only inside the code dirs listed in harness-names.json
// (research and planning docs may discuss the removed hosts).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(HERE, '..', 'harness-names.json'), 'utf8')).g14;

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const root = ri >= 0 ? args[ri + 1] : undefined;
if (!root) { console.error('usage: g14-no-hermes-openclaw.mjs --root DIR'); process.exit(2); }
if (!existsSync(root)) { console.error(`root not found: ${root}`); process.exit(2); }

const re = new RegExp(cfg.names.join('|'), 'i');
const hits = [];
const inScope = (rel) => cfg.content_scan_dirs.includes(rel.split('/')[0]);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(root, p).split(sep).join('/');
    const st = statSync(p);
    if (st.isDirectory()) {
      if (cfg.path_skip_dirs.includes(name)) continue;
      if (cfg.exclude_dirs.includes(rel)) continue;
      if (inScope(rel) && re.test(name)) hits.push(`${rel}:path:${name.match(re)[0].toLowerCase()}`);
      walk(p);
      continue;
    }
    if (cfg.exclude_files.includes(rel)) continue;
    if (inScope(rel) && re.test(name)) hits.push(`${rel}:path:${name.match(re)[0].toLowerCase()}`);
    const top = rel.split('/')[0];
    if (cfg.content_scan_dirs.includes(top) && cfg.content_scan_extensions.includes(extname(name))) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const m = re.exec(line);
        if (m) hits.push(`${rel}:${i + 1}:${m[0].toLowerCase()}`);
      });
    }
  }
}
walk(root);
for (const h of hits) console.log(h);
console.log(`matches: ${hits.length}`);
process.exit(hits.length ? 1 : 0);
