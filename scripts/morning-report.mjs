#!/usr/bin/env node
// Render the morning report from a harness output dir (tests/e2e/run.mjs --out DIR).
// usage: node scripts/morning-report.mjs DIR   (DIR holds finish-line.json + ledger.json, or drain-table.json)
// Pure function of the files: no timestamps, so the README block can be compared byte for byte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  return [line(headers), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)].join('\n');
}

export function renderReport(dir) {
  const fl = readJson(path.join(dir, 'finish-line.json'));
  const ledger = readJson(path.join(dir, 'ledger.json'));
  const drain = readJson(path.join(dir, 'drain-table.json'));
  const out = [];
  if (drain) {
    const counts = {};
    for (const r of drain.rows) counts[r.disposition] = (counts[r.disposition] || 0) + 1;
    out.push(table(['card', 'disposition'], drain.rows.map((r) => [r.id, r.disposition])));
    out.push('');
    out.push(Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ') + ' (' + drain.rows.length + ' cards, 0 unaccounted)');
    return out.join('\n') + '\n';
  }
  if (!fl || !ledger) throw new Error('no finish-line.json and ledger.json in ' + dir);
  const verdict = new Map(ledger.rows.map((r) => [r.row, r]));
  const rows = fl.rows.map((r) => {
    const l = verdict.get(r.id);
    const v = l ? l.verdict : 'NOT-RUN';
    return [r.id, v, r.text || '', (l && l.evidence) || r.reason || 'none'];
  });
  out.push(table(['row', 'verdict', 'definition of done', 'evidence'], rows));
  const n = rows.filter((r) => r[1] === 'VERIFIED').length;
  out.push('');
  out.push(n + ' of ' + rows.length + ' rows VERIFIED');
  return out.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('usage: morning-report.mjs DIR'); process.exit(1); }
  process.stdout.write(renderReport(process.argv[2]));
}
