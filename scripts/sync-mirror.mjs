#!/usr/bin/env node
// Mirror parity between source files (other lanes) and plugins/do-it copies.
//   --check   exit 0 identical, 1 on a difference (names the pair), 3 when a source is missing
//   --write   copy sources over destinations (exit 3 if any source is missing, nothing copied for it)
//   --root <dir>  repo root (default: this repo)   --manifest <file>
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const root = resolve(val('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const manifest = JSON.parse(readFileSync(resolve(val('--manifest') ?? join(root, 'scripts/mirror-manifest.json')), 'utf8'));
const write = args.includes('--write');

const walk = (dir, rel = '', skip = []) => {
  const res = [];
  for (const e of readdirSync(join(dir, rel)).sort()) {
    if (skip.includes(e)) continue;
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(join(dir, r)).isDirectory()) res.push(...walk(dir, r, skip)); else res.push(r);
  }
  return res;
};

// A pair may carry one `*` path segment in src and dst (the same sub-folder name on both sides) and an
// `exclude` list of file or folder names skipped at any depth. Expands to concrete { src, dst, kind, exclude } pairs.
const expand = (p) => {
  if (!p.src.includes('*')) return [p];
  const [pre, post] = p.src.split('*');
  const [dpre, dpost] = p.dst.split('*');
  const parent = join(root, pre);
  if (!existsSync(parent)) return [p];
  return readdirSync(parent, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && existsSync(join(parent, e.name, post)))
    .map((e) => ({ ...p, src: pre + e.name + post, dst: dpre + e.name + dpost }))
    .sort((a, b) => a.src.localeCompare(b.src));
};

let missing = 0;
let diff = 0;
for (const p of manifest.pairs.flatMap(expand)) {
  const src = join(root, p.src);
  const dst = join(root, p.dst);
  if (!existsSync(src)) { console.log(`MISSING ${p.src} (source not shipped; pair ${p.src} -> ${p.dst})`); missing++; continue; }
  const files = p.kind === 'dir' ? walk(src, '', p.exclude ?? []).map((f) => [join(src, f), join(dst, f), `${p.src}/${f}`]) : [[src, dst, p.src]];
  for (const [s, d, label] of files) {
    if (write) { mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d); continue; }
    if (!existsSync(d) || !readFileSync(s).equals(readFileSync(d))) {
      console.log(`DIFF ${label} -> ${p.dst}`);
      diff++;
    }
  }
}
if (!write && !missing && !diff) console.log('mirror ok');
process.exit(missing ? 3 : diff ? 1 : 0);
