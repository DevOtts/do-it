#!/usr/bin/env node
// Deterministic root SKILL.md from plugins/do-it/skill-src/*.md plus preset and
// persona names read from core/pipelines and core/personas, and the host table read from
// hosts/*/adapter.manifest.json (all read-only inputs).
//   --root <dir>   repo root (default: this repo)   --out <file>   write here (default root/SKILL.md)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHosts, renderSkillTable } from './hosts-table.mjs';

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const root = resolve(val('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const out = resolve(val('--out') ?? join(root, 'SKILL.md'));

const names = (dir) => {
  const p = join(root, dir);
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((f) => !f.startsWith('.')).map((f) => basename(f, extname(f))).sort();
};

const srcDir = join(root, 'plugins/do-it/skill-src');
const parts = readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
const frag = (f) => readFileSync(join(srcDir, f), 'utf8').replace(/\s+$/, '');
const head = parts.filter((f) => f < '90');
const foot = parts.filter((f) => f >= '90');

const presets = names('core/pipelines');
const personas = names('core/personas');
const lists = [];
if (presets.length) lists.push('## Presets\n\n' + presets.map((n) => `- ${n}`).join('\n'));
if (personas.length) lists.push('## Personas\n\n' + personas.map((n) => `- ${n}`).join('\n'));

const hostRows = readHosts(root);
const hosts = hostRows.length ? ['## Hosts', '', '```', renderSkillTable(hostRows), '```'].join('\n') : '';

const text = [...head.map(frag), ...lists, ...(hosts ? [hosts] : []), ...foot.map(frag)].join('\n\n') + '\n';
writeFileSync(out, text);
