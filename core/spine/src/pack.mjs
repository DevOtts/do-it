import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
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

// The stop gate wrote its questions with source 'stop-gate'. Before that field existed it wrote this
// exact sentence; the text is its own template, so it identifies the origin.
export function isStopGateQuestion(q) {
  return q.source === 'stop-gate' || (q.source === undefined && q.kind === 'default' && /^The run stopped with \d+ open row\(s\) after \d+ refusals: /.test(q.text));
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
  for (const id of ids) {
    const file = packPath(ctx, id);
    const pack = readJsonIfExists(file);
    if (!pack || !Array.isArray(pack.questions)) continue;
    const answersDoc = readJsonIfExists(path.join(ctx.home, 'runs', id, 'answers.json'));
    const answered = new Set((answersDoc && Array.isArray(answersDoc.answers) ? answersDoc.answers : []).map((a) => a.n));
    const now = ctx.now();
    let changed = 0;
    for (const q of pack.questions) {
      if (!isStopGateQuestion(q) || q.status === 'withdrawn') continue;
      if (answered.has(q.n)) { kept.push({ run_id: id, n: q.n }); continue; }
      q.status = 'withdrawn';
      q.withdrawn_at = now;
      q.withdrawn_reason = reason;
      withdrawn.push({ run_id: id, n: q.n });
      changed += 1;
    }
    if (!changed) continue;
    pack.pack_id = packIdOf(pack.questions);
    atomicWriteJson(file, pack);
    let st = {};
    try { st = loadState(ctx, id); } catch { /* the event still records the withdrawal */ }
    appendEvent(ctx, id, { event: 'pack_withdrawn', stage: st.stage || null, host: st.host || null, verdict: 'WITHDRAWN', detail: { by: 'stop-gate', count: changed } });
  }
  return { outcome: withdrawn.length ? 'PACK_WITHDRAWN' : 'PACK_NOOP', exit: 0, by: 'stop-gate', withdrawn, kept_answered: kept };
}
