#!/usr/bin/env node
// Pin ledger checks. Read-only on siblings.
//   --siblings <dir>  compare sibling marketplace pins to core/companions.json (exit 1 on drift)
//   --self            do-it version equal across plugin.json, marketplace entry, companions.json
//   --marketplace     sibling version labels in this repo's marketplace.json equal companions.json (exit 1 on drift)
//   --lint            companions.json pins are exact semver (planned entries have null)
//   --root <dir>      repo root (default: this repo)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const root = resolve(val('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ledger = JSON.parse(readFileSync(join(root, 'core/companions.json'), 'utf8'));
const out = [];
let drift = 0;

if (flag('--lint')) {
  for (const c of ledger.companions) {
    if (c.status === 'planned') {
      if (c.version !== null) { out.push(`lint: ${c.name} planned entry must have version null`); drift++; }
    } else if (typeof c.version !== 'string' || !SEMVER.test(c.version)) {
      out.push(`lint: ${c.name} version ${JSON.stringify(c.version)} is not exact semver`); drift++;
    }
  }
}

if (flag('--self')) {
  const pj = join(root, 'plugins/do-it/.claude-plugin/plugin.json');
  const mj = join(root, '.claude-plugin/marketplace.json');
  const seen = [
    [pj, JSON.parse(readFileSync(pj, 'utf8')).version],
    [mj, JSON.parse(readFileSync(mj, 'utf8')).plugins.find((p) => p.name === 'do-it')?.version],
    [join(root, 'core/companions.json'), ledger.self?.version],
  ];
  const want = seen[0][1];
  for (const [f, v] of seen) if (v !== want) { out.push(`self: ${f} has ${v}, expected ${want}`); drift++; }
}

if (flag('--marketplace')) {
  // The do-it marketplace lists each sibling with a version label. The host shows that label, so it must
  // equal the pin in companions.json. (A drifted label once made installs look like old versions.)
  const mj = join(root, '.claude-plugin/marketplace.json');
  const pins = new Map(ledger.companions.filter((c) => c.status === 'published').map((c) => [c.name, c.version]));
  for (const p of JSON.parse(readFileSync(mj, 'utf8')).plugins ?? []) {
    if (p.name === 'do-it' || !pins.has(p.name)) continue;
    if (p.version !== pins.get(p.name)) { out.push(`marketplace: ${mj} lists ${p.name} ${p.version}, expected ${pins.get(p.name)}`); drift++; }
  }
}

const sib = val('--siblings');
if (sib) {
  const base = resolve(sib);
  const pins = new Map(ledger.companions.filter((c) => c.status === 'published').map((c) => [c.name, c.version]));
  for (const d of readdirSync(base).sort()) {
    if (d === 'do-it' || d === '.worktrees') continue;
    const f = join(base, d, '.claude-plugin/marketplace.json');
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const lines = text.split('\n');
    let m;
    try { m = JSON.parse(text); } catch { continue; }
    for (const p of m.plugins ?? []) {
      if (!pins.has(p.name) || p.version === undefined) continue;
      const ni = lines.findIndex((l) => l.includes(`"name": "${p.name}"`));
      const indent = lines[ni].match(/^\s*/)[0];
      let vl = -1;
      for (let i = ni + 1; i < lines.length; i++) {
        if (lines[i].startsWith(`${indent}"name"`)) break;
        if (lines[i].startsWith(`${indent}"version"`)) { vl = i; break; }
      }
      if (p.version !== pins.get(p.name)) {
        out.push(`${f}:${vl + 1} ${p.name} found ${p.version} expected ${pins.get(p.name)}`);
        drift++;
      }
    }
  }
}

console.log(out.length ? out.join('\n') : 'no drift');
process.exit(drift ? 1 : 0);
