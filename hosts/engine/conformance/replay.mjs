#!/usr/bin/env node
// Conformance replay (spec point 14, D20). Runs the lp_content card and the negatives against the compiled
// definition in order, persists runs/{run_id}/replay-state.json after each case so an interrupted run resumes.
// Usage: node replay.mjs [--case NAME|all] [--out DIR] [--run-id ID] [--expected FILE] [--kill-after N]
// Exit: 0 all cases match, 1 PARTIAL_FAILURE (some case differs), 2 usage.
// This verifies FIXTURE behaviour only. The live replay is T-N3-14 (see live/).
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadCard, runCard, evidenceResolves } from './engine-sim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CASES = ['happy', 'stale-head', 'budget-denied', 'loop-cap', 'injection', 'low-confidence'];
const FIXTURE_OF = { happy: 'lp_content-card', 'stale-head': 'stale-head', 'budget-denied': 'budget-denied', 'loop-cap': 'loop-cap', injection: 'injection', 'low-confidence': 'low-confidence' };

const atomic = (f, text) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + '.tmp', text); renameSync(f + '.tmp', f); };
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

export function compare(actual, expected) {
  const diffs = [];
  for (const [k, want] of Object.entries(expected)) {
    if (k === 'case_id') continue;
    const have = k === 'events' ? actual.events.map((e) => e.event).filter((e) => want.includes(e)) : actual[k];
    if (!isDeepStrictEqual(have, want)) diffs.push({ field: k, expected: want, actual: have });
  }
  return diffs;
}

export async function replay({ cases = CASES, out, runId = 'replay-1', expectedFile = join(HERE, 'expected.json'), killAfter = null } = {}) {
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8'));
  const dir = join(out, 'runs', runId);
  const stateFile = join(dir, 'replay-state.json');
  const state = readJson(stateFile, { run_id: runId, done: [], results: {} });
  const resumedFrom = state.done.length ? state.done.length + 1 : null;
  const executed = [];
  for (const [i, name] of cases.entries()) {
    if (state.done.includes(name)) continue;
    const card = loadCard(FIXTURE_OF[name]);
    const run = await runCard(card, { runDir: join(dir, 'cases', name) });
    const diffs = compare(run, expected[name]);
    if (name !== 'low-confidence' && run.status !== 'needs_human' && !evidenceResolves(run)) diffs.push({ field: 'evidence', expected: 'resolves', actual: 'missing file' });
    state.results[name] = { case_id: expected[name].case_id, ok: diffs.length === 0, diffs, gates: run.gates, status: run.status, exit_code: run.exit_code };
    state.done.push(name);
    executed.push(name);
    atomic(stateFile, JSON.stringify(state, null, 2) + '\n');
    if (killAfter !== null && state.done.length === killAfter) process.exit(137); // test hook: simulated kill after persisting
  }
  const failed = cases.filter((n) => !state.results[n]?.ok).map((n) => expected[n].case_id);
  const report = {
    run_id: runId, status: failed.length ? 'PARTIAL_FAILURE' : 'PASS', passed: cases.length - failed.length, total: cases.length,
    failed, resumed_from: resumedFrom, executed, results: state.results,
  };
  atomic(join(dir, 'replay-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const c = arg('--case', 'all');
  if (c !== 'all' && !CASES.includes(c)) { console.error(`unknown case ${c}; expected ${CASES.join(', ')} or all`); process.exit(2); }
  const out = arg('--out') ?? mkdtempSync(join(tmpdir(), 'n3-replay-'));
  const report = await replay({ cases: c === 'all' ? CASES : [c], out, runId: arg('--run-id', 'replay-1'), expectedFile: arg('--expected') ?? join(HERE, 'expected.json'), killAfter: arg('--kill-after') ? Number(arg('--kill-after')) : null });
  console.log(JSON.stringify({ status: report.status, passed: report.passed, total: report.total, failed: report.failed, resumed_from: report.resumed_from, out }));
  process.exit(report.failed.length ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
