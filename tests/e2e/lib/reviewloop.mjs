// Review-loop roteiro: a scripted reviewer feeds findings per round; the REAL controller (core/pipelines/review-loop)
// decides each round and the REAL spine holds the run. The stub reviewer/runner/builder make no model call.
import fs from 'node:fs';
import path from 'node:path';
import { costFromMeter, processRound, recordRoundResult, startRound } from '../../../core/pipelines/review-loop/controller.mjs';
import { advance, meterStub, startRun } from './fixture.mjs';
import { doItDir, readJson, readJsonl, record, runDirOf, spine, writeJson } from './spine.mjs';

export const reviewDirOf = (ctx) => path.join(doItDir(ctx), 'review');

function itFindings(round) {
  // The fixture names the severity `sev`; a finding's id doubles as its fingerprint so a recurrence is detectable.
  return round.findings.map((f) => ({ id: f.id, fingerprint: f.id, severity: f.sev, title: f.id }));
}

export function runReview(ctx, variantName) {
  const variant = readJson(path.join(ctx.workdir, variantName + '.json'));
  startRun(ctx, 'review-loop', 'Review the change until it converges');
  advance(ctx, 'BUILDING', 'VERIFYING', 'REVIEWING');
  const dir = reviewDirOf(ctx);
  const meter = path.join(runDirOf(ctx), 'token-meter.jsonl');
  const opts = variant.token_ceiling !== undefined ? { cost_cap_tokens: variant.token_ceiling } : {};
  const decisions = [];
  for (const rd of variant.rounds) {
    startRound(dir, rd.round, { reviewer: 'rev-' + rd.round, runner: 'run-' + rd.round, builder: 'bld-' + rd.round });
    meterStub(ctx, 'review-it', rd.cost_tokens, 0);
    const cost = costFromMeter(meter);
    recordRoundResult(dir, rd.round, { findings: itFindings(rd), cost_tokens: cost.cost_tokens, estimated: cost.estimated, fingerprint: rd.fingerprint, contexts: { reviewer: 'rev-' + rd.round, runner: 'run-' + rd.round, builder: 'bld-' + rd.round } });
    const d = processRound(dir, rd.round, opts);
    decisions.push(d);
    if (d.exit) break;
  }
  const last = decisions[decisions.length - 1];
  ctx.review = { dir, decisions, last, variant };
  return last;
}

// The spine side of a STALLED exit: the review-cap question reaches the owner pack; with no owner reply the run escalates.
export function escalateStalled(ctx, decision) {
  const qfile = path.join(ctx.workdir, 'results', 'review-cap-question.json');
  writeJson(qfile, { questions: [decision.owner_question] });
  const rec = record(ctx, { stage: 'review-it', status: 'needs_human', pending_human: { questions_path: 'results/review-cap-question.json' } });
  const esc = spine(ctx, ['gate', 'advance', '--to', 'ESCALATED']);
  return { rec, esc };
}

// The spine side of OVER_BUDGET: the state file that resumes at the breached round is declared, then the run parks.
export function parkOverBudget(ctx, decision) {
  const rel = path.relative(ctx.workdir, path.join(ctx.review.dir, 'review-state.json'));
  const rec = record(ctx, { stage: 'review-it', status: 'ok', resume: { state_files: [rel], next_action: 'resume the review loop at round ' + decision.round + ' with a new round budget' } });
  const park = spine(ctx, ['park', '--reason', 'over_budget']);
  return { rec, park };
}

export const reviewEvents = (ctx) => readJsonl(path.join(ctx.review.dir, 'events.jsonl'));
export const backlogCards = (ctx) => {
  const d = path.join(ctx.review.dir, 'backlog');
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};
