import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from '../routing/errors.mjs';
import { sha256 } from './canonical.mjs';
import { stampPath } from './drivers-load.mjs';

export const KINDS = ['anthropic', 'openai-compatible', 'deepseek', 'host-owned'];
const isCell = (o) => o && typeof o === 'object' && !Array.isArray(o) && ('status' in o || 'value' in o || 'source' in o);

function walk(node, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const p = prefix ? prefix + '.' + k : k;
    if (isCell(v)) out.push([p, v]); else if (v && typeof v === 'object') walk(v, p, out);
  }
}

export function lintDrivers(obj) {
  const errors = []; const unknown = {};
  const kinds = obj.kinds || {};
  const names = Object.keys(kinds);
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...KINDS].sort())) errors.push({ code: 'KINDS_MISMATCH', found: names });
  for (const kind of names) {
    const cells = []; walk(kinds[kind], '', cells);
    unknown[kind] = 0;
    for (const [name, c] of cells) {
      const at = kind + '.' + name;
      if (!('value' in c)) errors.push({ code: 'CELL_NO_VALUE', cell: at });
      if (typeof c.source !== 'string' || !c.source.trim()) errors.push({ code: 'CELL_NO_SOURCE', cell: at });
      if (c.status !== 'documented' && c.status !== 'unknown') { errors.push({ code: 'CELL_BAD_STATUS', cell: at, status: c.status }); continue; }
      if (c.status === 'unknown') unknown[kind]++;
      else {
        const s = String(c.source);
        if (/\[(S|U)[\]\/]/.test(s) || /secondary|unverified/i.test(s) || !/\[P/.test(s)) errors.push({ code: 'STATUS_OVERCLAIM', cell: at, source: s });
      }
    }
  }
  return { errors, unknown_cells: unknown };
}

export function checkAllowlist(dir) {
  const allow = JSON.parse(fs.readFileSync(path.join(dir, 'ALLOWLIST.json'), 'utf8')).files;
  const actual = fs.readdirSync(dir);
  const unlisted = actual.filter((f) => !allow.includes(f));
  const missing = allow.filter((f) => !actual.includes(f));
  const notes = fs.existsSync(path.join(dir, 'NOT-BUILDING.md')) ? fs.readFileSync(path.join(dir, 'NOT-BUILDING.md'), 'utf8') : '';
  const entries = notes.split('\n').filter((l) => /^\d+\.\s/.test(l));
  const uncited = entries.filter((l) => !l.includes('research/09'));
  const errors = [];
  for (const f of unlisted) errors.push({ code: 'UNLISTED_CACHE_MODULE', file: f });
  for (const f of missing) errors.push({ code: 'ALLOWLIST_MISSING_FILE', file: f });
  if (entries.length < 7) errors.push({ code: 'NOT_BUILDING_TOO_SHORT', entries: entries.length });
  for (const l of uncited) errors.push({ code: 'NOT_BUILDING_UNCITED', entry: l.slice(0, 40) });
  return { errors, listed: allow.length, not_building_entries: entries.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const a = process.argv.slice(2);
    if (a[0] === '--allowlist') {
      const dir = a[1] || path.dirname(fileURLToPath(import.meta.url));
      const r = checkAllowlist(dir);
      if (r.errors.length) throw fail(r.errors[0].code, 1, r);
      return { outcome: 'ALLOWLIST_OK', ...r };
    }
    const file = a.find((x) => !x.startsWith('--'));
    if (!file) throw fail('USAGE', 1, { message: 'lint-drivers <drivers.json> [--stamp] | --allowlist [dir]' });
    const bytes = fs.readFileSync(file);
    const r = lintDrivers(JSON.parse(bytes.toString('utf8')));
    if (r.errors.length) throw fail(r.errors[0].code, 1, r);
    if (a.includes('--stamp')) fs.writeFileSync(stampPath(file), sha256(bytes) + '\n');
    return { outcome: 'DRIVERS_LINT_OK', ...r, stamped: a.includes('--stamp') };
  });
}
