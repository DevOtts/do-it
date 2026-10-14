// Review-loop convergence controller (PRD D20, CONTRACT M2 and A6). decide() is pure over the history.
// The runner functions persist round artifacts under a review dir (.do-it/review/) and never write state.json (G-1).
// Usage: node controller.mjs decide --history <file> [--max-rounds N] [--cost-cap N] [--builder-tier T2]
//        node controller.mjs finish --exit <TOKEN>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeparate } from './contexts.mjs';
import { fail, ReviewError } from './errors.mjs';
import { classify, writeBacklog } from './severity.mjs';

export const EXITS = ['CONVERGED', 'CONVERGED_WITH_MINORS', 'STALLED', 'OVER_BUDGET'];
export const DEFAULTS = { max_rounds: 3, cost_cap_tokens: 600000, builder_tier: 'T2' };
const UP = { T3: 'T2', T2: 'T1' };

export function assertExit(token) {
  if (!EXITS.includes(token)) throw fail('EXIT_NOT_ALLOWED', 1, { exit: token, allowed: EXITS });
  return token;
}

const loopFps = (r) => classify(r.findings || []).loop.map((f) => f.fingerprint || f.id);

function stalledQuestion(round, why) {
  return { n: 1, kind: 'review-cap', text: `Review loop stalled in round ${round}: ${why}. Decide how to continue.`, options: ['take over manually', 'raise scope and retry', 'accept as is and park findings'], recommendation: 'take over manually', default: 'take over manually', reversible: true };
}

// One round's decision given its predecessors. st = { raise_used, builder_tier }.
function step(hist, st, o) {
  const cur = hist[hist.length - 1];
  const round = cur.round;
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  const { loop, backlog } = classify(cur.findings || []);
  const cost = cur.cost_tokens ?? 0;
  const estimated = hist.some((r) => r.estimated === true);
  const base = { round, loop_count: loop.length, backlog_count: backlog.length, cost_tokens: cost, estimated, builder_tier: st.builder_tier, raise_used: st.raise_used };
  const open = loop.map((f) => f.id || f.fingerprint);
  // 1 convergence
  if (loop.length === 0) return { ...base, decision: backlog.length ? 'CONVERGED_WITH_MINORS' : 'CONVERGED', exit: backlog.length ? 'CONVERGED_WITH_MINORS' : 'CONVERGED', status: null, next_round: null };
  // 2 cost cap
  if (cost > o.cost_cap_tokens) return overBudget(base, open, `cost ${cost} over cap ${o.cost_cap_tokens}${estimated ? ' (estimated)' : ''}`);
  // 3 repeated fingerprint
  if (prev) {
    const before = new Set(loopFps(prev));
    const repeat = loopFps(cur).find((fp) => before.has(fp));
    if (repeat !== undefined) {
      if (st.raise_used || !UP[st.builder_tier]) return stalled(base, open, round, `finding ${repeat} survived a fix after the tier was already raised`);
      if (round < o.max_rounds) {
        st.raise_used = true; st.builder_tier = UP[st.builder_tier];
        return { ...base, builder_tier: st.builder_tier, raise_used: true, decision: 'RAISE_TIER', exit: null, status: 'FIXING', next_round: round + 1, reason: `finding ${repeat} survived a fix` };
      }
      // no round left to use a raised tier: fall through to the counts and budget rules without spending the raise
    }
  }
  // 4 counts must fall strictly from round 2
  if (prev && loop.length >= classify(prev.findings || []).loopCount) return stalled(base, open, round, `blockers plus majors did not fall (${classify(prev.findings || []).loopCount} then ${loop.length})`);
  // 5 round budget
  if (round >= o.max_rounds) return overBudget(base, open, `round budget ${o.max_rounds} reached with ${loop.length} open`);
  // 6 continue
  return { ...base, decision: 'FIXING', exit: null, status: 'FIXING', next_round: round + 1 };
}

function stalled(base, open, round, why) {
  return { ...base, decision: 'STALLED', exit: 'STALLED', status: 'ESCALATED', next_round: null, reason: why, open_findings: open, owner_question: stalledQuestion(round, why) };
}
function overBudget(base, open, why) {
  return { ...base, decision: 'OVER_BUDGET', exit: 'OVER_BUDGET', status: 'PARKED', next_round: null, reason: why, open_findings: open, resume_note: `Parked after round ${base.round}: ${why}. Open findings: ${open.join(', ')}. Resume with a new round budget.` };
}

// history: [{ round, findings: [{id, fingerprint, severity}], cost_tokens (cumulative), estimated }]. Returns the latest round's decision.
export function decide(history, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!Array.isArray(history) || history.length === 0) throw fail('HISTORY_EMPTY', 1);
  const st = { raise_used: false, builder_tier: o.builder_tier };
  let last = null;
  for (let k = 1; k <= history.length; k++) {
    last = step(history.slice(0, k), st, o);
    if (last.exit && k < history.length) return { ...last, ended_at_round: k, rounds_after_exit: true };
  }
  return last;
}

// ---- runner -------------------------------------------------------------------------------------------------------
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sfile = (d) => path.join(d, 'review-state.json');
const readState = (d) => (fs.existsSync(sfile(d)) ? JSON.parse(fs.readFileSync(sfile(d), 'utf8')) : { rounds: {}, decisions: {}, started: {}, raise_used: false, builder_tier: DEFAULTS.builder_tier });
function writeState(d, s) {
  fs.mkdirSync(d, { recursive: true });
  const tmp = sfile(d) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, sfile(d));
}

export function startRound(reviewDir, n, contexts) {
  assertSeparate(contexts); // refuses before anything is written
  const s = readState(reviewDir);
  if (n > 1 && !s.decisions[n - 1]) throw fail('ROUND_OUT_OF_ORDER', 1, { round: n });
  if (n > 1 && s.decisions[n - 1].exit) throw fail('ROUND_AFTER_EXIT', 1, { round: n, exit: s.decisions[n - 1].exit });
  s.started[n] = { contexts };
  writeState(reviewDir, s);
  return { started: true, round: n };
}

// The runner writes the round result and its sha256 into the events record; the controller re-reads and verifies.
export function recordRoundResult(reviewDir, n, result) {
  const dir = path.join(reviewDir, 'rounds');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `round-${n}.json`);
  const body = JSON.stringify({ ...result, round: n }, null, 2) + '\n';
  fs.writeFileSync(file, body);
  fs.appendFileSync(path.join(reviewDir, 'events.jsonl'), JSON.stringify({ event: 'round_result', round: n, path: `rounds/round-${n}.json`, sha256: sha(body) }) + '\n');
  return file;
}

function readVerifiedRound(reviewDir, n) {
  const ev = path.join(reviewDir, 'events.jsonl');
  const rows = fs.existsSync(ev) ? fs.readFileSync(ev, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const rec = rows.filter((r) => r.event === 'round_result' && r.round === n).pop();
  if (!rec) throw fail('ROUND_RESULT_MISSING', 1, { round: n });
  const file = path.join(reviewDir, rec.path);
  if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== rec.sha256) throw fail('ROUND_RESULT_TAMPERED', 1, { round: n });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Idempotent: replaying round n returns the same decision and creates no duplicate backlog cards.
export function processRound(reviewDir, n, opts = {}) {
  const result = readVerifiedRound(reviewDir, n); // tampered => throws, round not counted, no exit
  if (result.contexts) assertSeparate(result.contexts);
  const s = readState(reviewDir);
  if (n > 1 && !s.decisions[n - 1]) throw fail('ROUND_OUT_OF_ORDER', 1, { round: n });
  const rounds = { ...s.rounds, [n]: { round: n, findings: result.findings || [], cost_tokens: result.cost_tokens ?? 0, estimated: result.estimated === true } };
  const history = Object.keys(rounds).map(Number).filter((k) => k <= n).sort((a, b) => a - b).map((k) => rounds[k]);
  const decision = decide(history, opts);
  writeBacklog(reviewDir, result.findings || [], n);
  const next = { ...s, rounds, decisions: { ...s.decisions, [n]: decision }, raise_used: decision.raise_used, builder_tier: decision.builder_tier };
  writeState(reviewDir, next);
  return decision;
}

// Cumulative tokens from a token-meter.jsonl; estimated when any contributing row is estimated or unknown (G-6).
export function costFromMeter(file) {
  if (!fs.existsSync(file)) return { cost_tokens: 0, estimated: false };
  let total = 0; let estimated = false;
  for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    total += (r.tokens_in || 0) + (r.tokens_out || 0) + (r.cache_read || 0) + (r.cache_write || 0);
    if (r.estimated === true || r.source === 'unknown') estimated = true;
  }
  return { cost_tokens: total, estimated };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
  try {
    if (a[0] === 'finish') { console.log(JSON.stringify({ exit: assertExit(opt('exit')) })); process.exit(0); }
    if (a[0] === 'decide') {
      const o = {};
      if (opt('max-rounds')) o.max_rounds = Number(opt('max-rounds'));
      if (opt('cost-cap')) o.cost_cap_tokens = Number(opt('cost-cap'));
      if (opt('builder-tier')) o.builder_tier = opt('builder-tier');
      console.log(JSON.stringify(decide(JSON.parse(fs.readFileSync(opt('history'), 'utf8')), o)));
      process.exit(0);
    }
    console.error('usage: decide|finish'); process.exit(1);
  } catch (e) {
    if (e instanceof ReviewError) { console.log(JSON.stringify({ outcome: e.outcome, ...e.extra })); process.exit(e.exit); }
    throw e;
  }
}
