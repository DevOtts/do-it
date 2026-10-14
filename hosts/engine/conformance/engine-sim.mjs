// Fixture simulation of the Engine dev-squad run for one card (D20). It drives the COMPILED definition of the
// lifecycle squad through route -> steps -> checkpoint -> merge -> conclude with the do-it guards, and
// records exact gates and exit codes. It verifies fixture behaviour only: no Engine service is called here.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compileSquad, loadSquad } from '../compile/squad-to-definition.mjs';
import { intakeCard } from '../compile/intake.mjs';
import { reviewLoop } from '../review/cap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, 'fixtures');
const SQUAD = join(HERE, '..', 'fixtures', 'lifecycle-squad.yaml');
const MIN_CONFIDENCE = 0.7;

export function loadCard(name) {
  const read = (n) => JSON.parse(readFileSync(join(FIXTURES, `${n}.json`), 'utf8'));
  const c = read(name);
  return c.extends ? { ...read(c.extends), ...Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'extends')) } : c;
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function routeCard(card) {
  const ranked = Object.entries(card.work_type_scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best[1] < MIN_CONFIDENCE) return { ask: true, candidates: ranked.slice(0, 2).map(([w]) => w), confidence: best[1] };
  return { work_type: best[0], confidence: best[1] };
}

// runCard(card, { runDir }) -> run summary + it-result written under runDir/runs/{run_id}/
export async function runCard(card, { runDir, squadPath = SQUAD } = {}) {
  const squad = loadSquad(squadPath);
  const settings = card.settings ?? { repo: 'acme/site', host: 'engine' };
  const intake = intakeCard(card, { squad, settings });
  const def = intake.definition;
  const runId = card.id;
  const dir = join(runDir, 'runs', runId);
  mkdirSync(join(dir, 'evidence'), { recursive: true });
  const gates = [];
  const rows = [];
  const events = intake.events.slice();
  const out = { run_id: runId, definition: def, repo: intake.repo, host: intake.host, tools: intake.tools, gates, events, rows };

  const evidence = (id, data) => {
    const rel = join('evidence', `${id}.json`);
    writeFileSync(join(dir, rel), JSON.stringify(data));
    return rel;
  };
  const verified = (id, data) => rows.push({ row: id, verdict: 'VERIFIED', evidence: evidence(id, data), real: false });
  const finish = (res) => {
    Object.assign(out, res);
    const result = {
      schema: 'it-result/1', stage: 'build-it', run_id: runId, head_sha: out.head_sha ?? card.head_sha,
      status: res.status, exit_code: res.exit_code, verdicts: rows, reason: res.reason ?? null,
      next: res.next_action ? { action: res.next_action } : null,
      resume: res.next_action ? { state_files: ['replay-state.json'], next_action: res.next_action } : null,
      artifacts: rows.filter((r) => r.evidence).map((r) => ({ path: r.evidence, kind: 'evidence', sha256: sha(readFileSync(join(dir, r.evidence))) })),
    };
    writeFileSync(join(dir, 'it-result.json'), JSON.stringify(result, null, 2) + '\n');
    out.result_path = join(dir, 'it-result.json');
    return out;
  };

  const route = routeCard(card);
  if (route.ask) {
    gates.push('route:ask');
    out.owner_question = { n: 1, kind: 'route', text: `Which work type is this card: ${route.candidates.join(' or ')}?`, options: route.candidates, recommendation: route.candidates[0], default: null, reversible: true };
    return finish({ run_status: 'NEEDS_HUMAN', status: 'needs_human', exit_code: 2, reason: 'ROUTE_AMBIGUOUS', step_list: null });
  }
  gates.push(`route:${route.work_type}`);
  const wt = def.router.work_types.find((w) => w.work_type === route.work_type);
  const stepIds = wt.steps;
  out.step_list = stepIds;
  out.head_sha = card.head_sha;

  for (const id of stepIds) {
    if (id === 'build' && card.budget && card.budget.admit === false && card.budget.deny_step === 'build') {
      gates.push('budget_denied:build', 'OVER_BUDGET', 'PARKED');
      return finish({ run_status: 'PARKED', status: 'blocked', exit_code: 3, reason: 'BUDGET_DENIED', next_action: 'build' });
    }
    if (id === 'review') {
      const script = card.review_script ?? [[]];
      const rl = await reviewLoop(async (n) => { gates.push(`review:round${n}`); return { findings: script[n - 1] ?? [] }; });
      if (rl.outcome === 'CONVERGED') {
        // single-round convergence reads as one gate: review:CONVERGED
        if (gates.at(-1) === 'review:round1') gates.pop();
        gates.push('review:CONVERGED');
        verified('review', { head_sha: card.head_sha, rounds: rl.rounds });
        if (card.head_moves_after_review && card.head_moves_after_review !== card.head_sha) {
          gates.push('head_moved', 'verdict_rejected:STALE_HEAD');
          rows.pop();
          rows.push({ row: 'review', verdict: 'IMPLEMENTED-NOT-VERIFIED', evidence: null, real: false });
          out.head_sha = card.head_moves_after_review;
          out.bound_head_sha = card.head_sha;
          return finish({ run_status: 'BLOCKED', status: 'blocked', exit_code: 3, reason: 'STALE_HEAD', next_action: 're-review on the new head' });
        }
        continue;
      }
      gates.push(...(rl.rounds >= 3 && rl.outcome === 'ESCALATED' ? ['review_round_refused:4'] : []), rl.outcome);
      return finish({ run_status: rl.outcome, status: 'needs_human', exit_code: 2, reason: rl.reason, rounds: rl.rounds });
    }
    gates.push(id);
    verified(id, { step: id, head_sha: card.head_sha });
    if (id === 'checkpoint-merge') { gates.push('merge'); verified('merge', { head_sha: card.head_sha }); }
  }
  return finish({ run_status: 'DONE', status: 'ok', exit_code: 0, run_verdict: 'DONE_ALL_VERIFIED' });
}

// After STALE_HEAD: re-review on the new head turns the row VERIFIED and lets the run finish.
export async function rereview(prev, { runDir }) {
  const card = { ...loadCard('lp_content-card'), id: prev.run_id, head_sha: prev.head_sha, review_script: [[]] };
  const again = await runCard(card, { runDir });
  return { ...again, rereviewed_head: prev.head_sha, review_row: again.rows.find((r) => r.row === 'review') };
}

export const evidenceResolves = (out) => out.rows.filter((r) => r.verdict === 'VERIFIED').every((r) => r.evidence && existsSync(join(dirname(out.result_path), r.evidence)));
