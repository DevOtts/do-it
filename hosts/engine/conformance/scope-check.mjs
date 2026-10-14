#!/usr/bin/env node
// Scope check on Engine-Core (CONTRACT s5, D21): this program may touch only docs/implementation/do-it-engine-layer/.
// Changed = git status paths (modified and untracked) plus paths committed since the baseline HEAD. Each path
// outside the lane must be attributed to another program in engine-core-baseline.json, else the result is
// NEEDS_HUMAN (exit 2, never a guess). With --strict the baseline is ignored: any outside path is OUTSIDE_LANE (exit 1).
// Usage: node scope-check.mjs [--repo DIR] [--baseline FILE] [--strict]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LANE = 'docs/implementation/do-it-engine-layer/';
export const DEFAULT_REPO = '/Users/macbook/Workspace/Engine/Engine-Core';

const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function changedPaths(repo, baselineHead) {
  const set = new Set();
  for (const line of git(repo, 'status', '--porcelain', '--untracked-files=all', '-z').split('\0').filter(Boolean)) set.add(line.slice(3));
  if (baselineHead) {
    try {
      for (const p of git(repo, 'diff', '--name-only', `${baselineHead}..HEAD`).split('\n').filter(Boolean)) set.add(p);
    } catch { /* baseline sha unknown in this clone */ }
  }
  return [...set].sort();
}

export function checkScope({ repo = DEFAULT_REPO, baseline = null, strict = false } = {}) {
  const changed = changedPaths(repo, strict ? null : baseline?.head);
  const outside = changed.filter((p) => !p.startsWith(LANE));
  const owners = strict ? [] : (baseline?.other_programs ?? []);
  const attributed = [], unexplained = [];
  for (const p of outside) {
    const o = owners.find((x) => p === x.path || p.startsWith(x.path.endsWith('/') ? x.path : x.path + '/') );
    if (o) attributed.push({ path: p, owner: o.owner }); else unexplained.push(p);
  }
  return { in_lane: changed.filter((p) => p.startsWith(LANE)), attributed, unexplained };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const repo = arg('--repo', DEFAULT_REPO);
  const strict = argv.includes('--strict');
  const baseline = JSON.parse(readFileSync(arg('--baseline', join(HERE, 'engine-core-baseline.json')), 'utf8'));
  const r = checkScope({ repo, baseline, strict });
  console.log(`outside_changes: ${r.unexplained.length}`);
  console.log(`attributed_to_other_programs: ${r.attributed.length}`);
  console.log(`in_lane: ${r.in_lane.length}`);
  if (strict) { for (const p of r.unexplained) console.log(`OUTSIDE_LANE ${p}`); process.exit(r.unexplained.length ? 1 : 0); }
  for (const p of r.unexplained) console.log(`UNEXPLAINED ${p}`);
  if (r.unexplained.length) { console.log('result: NEEDS_HUMAN'); process.exit(2); }
  console.log('result: CLEAN');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
