#!/usr/bin/env node
// Counts spec points and adjustments in the saved Engine-Core files and checks the two hygiene items (D19).
// Usage: node spec-lint.mjs [--dir DIR]   exit 0 clean, 1 findings
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DIR = '/Users/macbook/Workspace/Engine/Engine-Core/docs/implementation/do-it-engine-layer';
const SPEC = '02-ENGINE-LAYER-SPEC.md', ADJ = '01-ADJUSTMENTS-TO-ENGINE-DEV-SQUAD.md';

function section(text, header) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.startsWith(header));
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < lines.length && !lines[k].startsWith('## '); k++) out.push(lines[k]);
  return out;
}

export function lintSpec(specText, adjText) {
  const findings = [];
  const pts = section(specText, '## C.').filter((l) => /^\d+\.\s/.test(l));
  const nums = pts.map((l) => Number(/^(\d+)\./.exec(l)[1]));
  const contiguous = nums.length > 0 && nums.every((n, i) => n === i + 1);
  if (nums.length !== 15 || !contiguous) findings.push({ rule: 'SPEC_POINTS', message: `expected 15 contiguous points, found ${nums.length}` });
  for (const n of [6, 9, 10, 15]) {
    const line = pts.find((l) => l.startsWith(`${n}.`)) ?? '';
    if (!line.includes('**NEW')) findings.push({ rule: 'NEW_ITEM_MISSING', message: `point ${n} has no NEW item` });
  }
  const adjItems = adjText.split('\n').filter((l) => /^\d+\.\s\*\*/.test(l));
  if (adjItems.length !== 12) findings.push({ rule: 'ADJUSTMENTS', message: `expected 12 adjustments, found ${adjItems.length}` });
  if (!/Recommended first batch: 1, 2, 4, 6, 7\./.test(adjText)) findings.push({ rule: 'FIRST_BATCH', message: 'recommended first batch 1, 2, 4, 6, 7 not stated' });
  if (!/^Status: PROPOSED/m.test(adjText)) findings.push({ rule: 'ADJ_STATUS', message: 'adjustments header does not say PROPOSED' });

  // Hygiene (D19): loop cap is 3 per PD-06; point 6 backends are local, git-branch, engine.
  const stale = specText.split('\n').map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => /loop cap 2/i.test(l));
  for (const { l, n } of stale) findings.push({ rule: 'LOOP_CAP_2', line: n, message: `stale loop cap 2: ${l.trim().slice(0, 80)}` });
  if (!/3 per PD-06/.test(specText)) findings.push({ rule: 'LOOP_CAP_3_MISSING', message: 'spec does not state cap 3 per PD-06' });
  const p6 = pts.find((l) => l.startsWith('6.')) ?? '';
  const cardBackend = /\(`local`,\s*`git-branch`,\s*`card`\)/.test(p6);
  const hasAll = ['`local`', '`git-branch`', '`engine`'].every((b) => p6.includes(b));
  if (cardBackend || !hasAll) findings.push({ rule: 'POINT6_BACKENDS', message: 'point 6 must list local, git-branch, engine (card is an implementation, not a backend)' });
  else if (/\bcard\b/i.test(p6) && !/card[^.]*implementation|implementation[^.]*card/i.test(p6)) findings.push({ rule: 'POINT6_CARD_NOTE', message: 'the word card appears in point 6 outside an implementation note' });
  return { spec_points: nums.length, adjustments: adjItems.length, findings };
}

export function lintDir(dir = DEFAULT_DIR) {
  return lintSpec(readFileSync(join(dir, SPEC), 'utf8'), readFileSync(join(dir, ADJ), 'utf8'));
}

function main() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--dir');
  const r = lintDir(di >= 0 ? argv[di + 1] : DEFAULT_DIR);
  console.log(`spec_points: ${r.spec_points}`);
  console.log(`adjustments: ${r.adjustments}`);
  for (const f of r.findings) console.log(`FINDING ${f.rule}${f.line ? ` line ${f.line}` : ''}: ${f.message}`);
  process.exit(r.findings.length ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
