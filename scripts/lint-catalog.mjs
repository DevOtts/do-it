#!/usr/bin/env node
// Lint the companion-plugin change catalog (R3, G-14). Read-only.
//   node scripts/lint-catalog.mjs <catalog.md> [--root <repo>] [--write-json <out.json>]
// Exit 0 clean, 1 on any finding (messages are `{section}: ...`), 2 on usage error.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SECTIONS = ['all companions', 'prompt-it', 'plan-it', 'build-it', 'review-it', 'conclude-it', 'parallel-lifecycle', 'deploy-it', 'reconcile-it'];
export const SIZES = { 'all companions': 'M', 'prompt-it': 'S', 'plan-it': 'M', 'build-it': 'S', 'review-it': 'M', 'conclude-it': 'S', 'parallel-lifecycle': 'S', 'deploy-it': 'L', 'reconcile-it': 'M' };
export const FIELDS = ['Owner repo', 'Current state', 'Exact changes', 'Size', 'Verification case'];
export const VERIFY_VALUES = ['auto', 'attended', 'judgement'];
export const SEVERITY = ['blocker', 'major', 'minor', 'nit'];
// G-14: the two out-of-scope host names must not appear. Built from parts so this file never matches a repo scan.
const OUT_OF_SCOPE = new RegExp(`${'herm'}es|${'open'}claw`, 'i');
const ID = /\bT-[A-Z]\d-\d{2}\b/g;

export function parseSections(md) {
  const out = new Map();
  const parts = md.split(/^## (.+?)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim(), parts[i + 1]);
  return out;
}

export function parseFields(body) {
  const fields = {};
  const re = /^\*\*(Owner repo|Current state|Exact changes|Size|Verification case):\*\*[ \t]*/gm;
  const hits = [...body.matchAll(re)];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : body.length;
    fields[m[1]] = body.slice(m.index + m[0].length, end).trim();
  });
  return fields;
}

export function parseTables(md) {
  const tables = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|.*\|\s*$/.test(lines[i]) || !/^\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const header = cells(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\|.*\|\s*$/.test(lines[j])) rows.push(cells(lines[j++]));
    tables.push({ header, rows, line: i + 1 });
    i = j - 1;
  }
  return tables;
}

export function parseFenced(md) {
  const blocks = {};
  for (const m of md.matchAll(/^```json (\S+)\n([\s\S]*?)^```/gm)) blocks[m[1]] = JSON.parse(m[2]);
  return blocks;
}

export function parseCitations(md) {
  return [...md.matchAll(/`([\w.\-/]+):(\d+)` contains «([^»]+)»/g)].map((m) => ({ path: m[1], line: Number(m[2]), text: m[3] }));
}

export function epicIds(root) {
  const dir = join(root, 'delivery/epics');
  const text = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  return new Set(text.match(ID) ?? []);
}

export function lint(md, root) {
  const errs = [];
  const sections = parseSections(md);
  const names = [...sections.keys()].filter((n) => SECTIONS.includes(n));
  if (names.join('|') !== SECTIONS.join('|')) errs.push(`structure: expected sections ${SECTIONS.join(', ')} in order; found ${[...sections.keys()].join(', ')}`);
  for (const name of SECTIONS) {
    if (!sections.has(name)) { errs.push(`${name}: missing section`); continue; }
    const f = parseFields(sections.get(name));
    for (const field of FIELDS) if (!f[field]) errs.push(`${name}: missing ${field}`);
    if (f.Size && f.Size.split(/\s+/)[0] !== SIZES[name]) errs.push(`${name}: Size ${f.Size.split(/\s+/)[0]} != ${SIZES[name]} (docs/05)`);
  }
  const known = epicIds(root);
  for (const id of new Set(md.match(ID) ?? [])) if (!known.has(id)) errs.push(`unknown case id ${id} (not in delivery/epics)`);
  if (OUT_OF_SCOPE.test(md)) errs.push('scope: out-of-scope host name present (G-14)');

  const tables = parseTables(md);
  // ownership matrix: one writer per path
  const seen = new Map();
  for (const t of tables.filter((x) => x.header[0] === 'Path' && x.header[1] === 'Writer')) {
    for (const [path, writer] of t.rows) {
      if (/[,/&]| and /.test(writer)) errs.push(`review-it: path ${path} has multiple writers (${writer})`);
      if (seen.has(path)) errs.push(`review-it: path ${path} listed with two writers (${seen.get(path)}, ${writer})`);
      seen.set(path, writer);
    }
  }
  const sev = md.match(/^Severity classes: (.+?)\.?$/m);
  if (!sev || sev[1].split(/,\s*/).join('|') !== SEVERITY.join('|')) errs.push(`review-it: severity classes must be ${SEVERITY.join(', ')}`);
  // Verify column grammar (G-8)
  for (const t of tables) {
    const col = t.header.indexOf('Verify');
    if (col < 0) continue;
    t.rows.forEach((r, i) => { if (!VERIFY_VALUES.includes(r[col])) errs.push(`plan-it: Verify column value ${JSON.stringify(r[col])} not in ${VERIFY_VALUES.join('/')} (table line ${t.line}, row ${i + 1})`); });
  }
  return errs;
}

export function toJson(md) {
  const sections = parseSections(md);
  const fenced = parseFenced(md);
  return {
    schema: 'do-it-catalog/1',
    sections: SECTIONS.filter((n) => sections.has(n)).map((name) => {
      const f = parseFields(sections.get(name));
      return { name, owner_repo: f['Owner repo'], size: f.Size?.split(/\s+/)[0], verification_cases: f['Verification case']?.match(ID) ?? [], citations: parseCitations(sections.get(name)) };
    }),
    fenced,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const file = a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--root' && a[i - 1] !== '--write-json');
  const rootArg = a[a.indexOf('--root') + 1];
  const root = resolve(a.includes('--root') ? rootArg : join(dirname(fileURLToPath(import.meta.url)), '..'));
  if (!file) { console.error('usage: lint-catalog.mjs <catalog.md> [--root dir] [--write-json out]'); process.exit(2); }
  try { statSync(file); } catch { console.error(`cannot read ${file}`); process.exit(2); }
  const md = readFileSync(file, 'utf8');
  const errs = lint(md, root);
  if (a.includes('--write-json') && !errs.length) writeFileSync(a[a.indexOf('--write-json') + 1], `${JSON.stringify(toJson(md), null, 2)}\n`);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log(`catalog ok: ${SECTIONS.length} sections`);
}
