import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent, eventsPath } from './events.mjs';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { canonicalJson, sha256Bytes } from './hash.mjs';
import { listRunIds, loadState } from './state.mjs';

export function packPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'owner-pack.json');
}

export function packIdOf(questions) {
  return sha256Bytes(canonicalJson(questions));
}

// Stages only append questions; numbering is stable and duplicates by text are ignored (ruling D7).
export function packAppend(ctx, runId, questions) {
  const file = packPath(ctx, runId);
  const pack = readJsonIfExists(file) || { pack_id: null, run_id: runId, questions: [], created_at: ctx.now() };
  const added = [];
  for (const q of questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) continue;
    if (pack.questions.some((x) => x.text === q.text && x.status !== 'withdrawn')) continue;
    const n = pack.questions.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    const row = {
      n,
      kind: q.kind || 'default',
      text: q.text,
      options: Array.isArray(q.options) ? q.options : [],
      recommendation: q.recommendation === undefined ? null : q.recommendation,
      default: q.default === undefined ? null : q.default,
      reversible: q.reversible === undefined ? true : !!q.reversible,
    };
    if (typeof q.source === 'string' && q.source) row.source = q.source;
    pack.questions.push(row);
    added.push(row);
  }
  if (added.length || !fs.existsSync(file)) {
    pack.pack_id = packIdOf(pack.questions);
    atomicWriteJson(file, pack);
  }
  return added;
}

// Questions still waiting on the owner: not withdrawn and not answered in answers.json.
export function openPackQuestions(ctx, runId) {
  const pack = readJsonIfExists(packPath(ctx, runId));
  if (!pack || !Array.isArray(pack.questions)) return [];
  const doc = readJsonIfExists(path.join(ctx.home, 'runs', runId, 'answers.json'));
  const answered = new Set((doc && Array.isArray(doc.answers) ? doc.answers : []).map((a) => a.n));
  return pack.questions.filter((q) => q.status !== 'withdrawn' && !answered.has(q.n));
}

// The sentence the stop gate writes when it parks a run at patience. `record` refuses a result question that
// starts with it (STOP_GATE_TEXT_RESERVED), so only the gate writes it.
export const STOP_GATE_TEXT = /^The run stopped with \d+ open row\(s\) after \d+ refusals: /;
const STOP_GATE_IDS = /^The run stopped with \d+ open row\(s\) after \d+ refusals: (.*)\. Resume the run or close it with the open rows as residuals\?$/;

// CP-03 R5-S1-H10: which questions did the stop gate itself write? Only the gate writes `stop_parked` events:
// since 1.1 the event names the question's number; a 1.0.x (or pre-release 1.1) event names the open rows,
// which the question's text repeats. A `source` field proves nothing: a result file could set one.
export function stopGateMarks(ctx, runId) {
  const numbers = new Set();
  const openLists = new Set();
  let lines = [];
  try { lines = fs.readFileSync(eventsPath(ctx, runId), 'utf8').split('\n'); } catch { /* no events */ }
  for (const line of lines) {
    if (!line.includes('"stop_parked"')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.event !== 'stop_parked' || !ev.detail || typeof ev.detail !== 'object') continue;
    if (Number.isInteger(ev.detail.question)) numbers.add(ev.detail.question);
    else if (Array.isArray(ev.detail.open)) openLists.add(ev.detail.open.join(', '));
  }
  return { numbers, openLists };
}

export function isStopGateQuestion(q, marks) {
  if (!q || !marks) return false;
  if (marks.numbers.has(q.n)) return true;
  if (q.kind !== 'default' || typeof q.text !== 'string') return false;
  const m = STOP_GATE_IDS.exec(q.text);
  return !!m && marks.openLists.has(m[1]);
}

export const WITHDRAW_REASON = 'withdrawn: the stop gate raised this for a run it should not have gated';

// pack withdraw --by stop-gate [--run <id>] [--reason <text>] (D10): unanswered stop-gate questions
// become `withdrawn` and stay in the pack with the date and the reason. Answered questions and stage
// questions are untouched. Without --run every run's pack is considered. A second call changes nothing.
export function cmdPack(ctx, args) {
  const f = args.flags;
  if (args.positionals[1] !== 'withdraw') throw fail('USAGE', 1, { message: 'pack needs a subcommand', subcommands: ['withdraw'] });
  if (f.by !== 'stop-gate') throw fail('USAGE', 1, { message: 'pack withdraw requires --by stop-gate' });
  let ids;
  if (f.run) {
    if (!fs.existsSync(packPath(ctx, f.run)) && !fs.existsSync(path.join(ctx.home, 'runs', f.run))) throw fail('RUN_NOT_FOUND', 1, { run_id: f.run });
    ids = [f.run];
  } else {
    ids = listRunIds(ctx);
  }
  const reason = typeof f.reason === 'string' && f.reason ? f.reason : WITHDRAW_REASON;
  const withdrawn = [];
  const kept = [];
  const refused = [];
  for (const id of ids) {
    const file = packPath(ctx, id);
    const pack = readJsonIfExists(file);
    if (!pack || !Array.isArray(pack.questions)) continue;
    const answersDoc = readJsonIfExists(path.join(ctx.home, 'runs', id, 'answers.json'));
    const answered = new Set((answersDoc && Array.isArray(answersDoc.answers) ? answersDoc.answers : []).map((a) => a.n));
    const marks = stopGateMarks(ctx, id);
    const now = ctx.now();
    const picks = [];
    for (const q of pack.questions) {
      if (q.status === 'withdrawn' || !isStopGateQuestion(q, marks)) continue;
      if (answered.has(q.n)) { kept.push({ run_id: id, n: q.n }); continue; }
      picks.push(q);
    }
    if (!picks.length) continue;
    let st = null;
    try { st = loadState(ctx, id); } catch { /* the event still records the withdrawal */ }
    // CP-03 R5-S1-H10: a NEEDS_HUMAN run waits on its open questions. Withdrawing the last one would leave it
    // waiting on nobody, outside the stop gate for good, so the withdrawal is refused for that run.
    const left = pack.questions.filter((q) => q.status !== 'withdrawn' && !answered.has(q.n) && !picks.includes(q));
    if (st && st.status === 'NEEDS_HUMAN' && !left.length) {
      refused.push({ run_id: id, questions: picks.map((q) => q.n), reason: 'run ' + id + ' is NEEDS_HUMAN and these are its last open owner-pack questions; answer them (do-it answer) instead' });
      continue;
    }
    for (const q of picks) {
      q.status = 'withdrawn';
      q.withdrawn_at = now;
      q.withdrawn_reason = reason;
      withdrawn.push({ run_id: id, n: q.n });
    }
    pack.pack_id = packIdOf(pack.questions);
    atomicWriteJson(file, pack);
    appendEvent(ctx, id, { event: 'pack_withdrawn', stage: (st && st.stage) || null, host: (st && st.host) || null, verdict: 'WITHDRAWN', detail: { by: 'stop-gate', count: picks.length } });
  }
  if (refused.length && (f.run || !withdrawn.length)) {
    throw fail('PACK_WITHDRAW_REFUSED', 1, { by: 'stop-gate', refused, withdrawn, message: refused.map((r) => r.reason).join('; ') });
  }
  return { outcome: withdrawn.length ? 'PACK_WITHDRAWN' : 'PACK_NOOP', exit: 0, by: 'stop-gate', withdrawn, kept_answered: kept, ...(refused.length ? { refused } : {}) };
}
