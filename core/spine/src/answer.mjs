import fs from 'node:fs';
import path from 'node:path';
import { appendEvent } from './events.mjs';
import { fail } from './errors.mjs';
import { atomicWrite, atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { packPath, packIdOf } from './pack.mjs';
import { parseReply } from './reply.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { loadSettings } from './settings.mjs';
import { advanceRunStatus, loadState, runDir, selectRunId } from './state.mjs';
import { renderHtml } from '../../renderers/html.mjs';
import { renderMarkdown } from '../../renderers/markdown.mjs';
import { nativeEligible, renderNative } from '../../renderers/native.mjs';

export function answersPath(ctx, runId) { return path.join(runDir(ctx, runId), 'answers.json'); }
export function renderRecordPath(ctx, runId) { return path.join(runDir(ctx, runId), 'owner-pack.render.json'); }

export function loadPackChecked(ctx, runId) {
  const pack = readJsonIfExists(packPath(ctx, runId));
  if (!pack) throw fail('NO_PACK', 1, { run_id: runId, message: 'no owner-pack.json for this run' });
  const errors = validateSchema(loadSchemaFile('owner-pack.schema.json'), pack);
  if (errors.length) throw fail('PACK_INVALID', 1, { errors });
  return pack;
}

// Adversarial guard: the pack on disk must still be the one the owner was shown.
export function packGuard(ctx, runId, pack) {
  const current = packIdOf(pack.questions);
  const rec = readJsonIfExists(renderRecordPath(ctx, runId));
  let shown = rec ? rec.pack_id : null;
  if (rec && rec.file && fs.existsSync(rec.file) && fs.statSync(rec.file).isFile()) {
    const text = fs.readFileSync(rec.file, 'utf8');
    const m = /name="pack-id" content="([0-9a-f]+)"/.exec(text) || /<!-- pack-id: ([0-9a-f]+) -->/.exec(text);
    if (m) shown = m[1];
  }
  if (pack.pack_id !== current || (shown !== null && shown !== current)) {
    throw fail('PACK_CHANGED', 1, { run_id: runId, pack_id: current, shown_pack_id: shown, message: 'owner-pack.json changed after it was rendered; render it again' });
  }
  return current;
}

function emit(ctx, runId, state, event, verdict, detail) {
  appendEvent(ctx, runId, { event, stage: state.stage, host: state.host, verdict, detail });
}

function readAnswers(ctx, runId) {
  const doc = readJsonIfExists(answersPath(ctx, runId));
  return doc && Array.isArray(doc.answers) ? doc.answers : [];
}

export function cmdAnswer(ctx, args) {
  const f = args.flags;
  const hasReply = typeof f.reply === 'string';
  const hasRender = f.render !== undefined && f.render !== false;
  if (!hasReply && !hasRender && !f.finalize) throw fail('USAGE', 1, { message: 'answer needs --reply "<text>", --render MODE or --finalize' });
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  const pack = loadPackChecked(ctx, runId);
  if (!pack.questions.length) return { outcome: 'NO_QUESTIONS', exit: 0, run_id: runId };
  if (hasReply || f.finalize) return answerApply(ctx, runId, state, pack, f, hasReply);
  return answerRender(ctx, runId, state, pack, f);
}

function answerApply(ctx, runId, state, pack, f, hasReply) {
  const packId = packGuard(ctx, runId, pack);
  const byN = new Map(pack.questions.map((q) => [q.n, q]));
  const existing = readAnswers(ctx, runId).filter((a) => byN.has(a.n));
  const have = new Map(existing.map((a) => [a.n, a]));
  const added = [];
  const ignored = [];
  const defaultsApplied = [];

  if (hasReply) {
    const parsed = parseReply(f.reply, pack.questions);
    const unparsed = parsed.errors[0];
    if (unparsed) throw fail('ANSWER_INVALID', 1, { message: 'cannot parse reply token ' + JSON.stringify(unparsed.token), token: unparsed.token });
    for (const it of parsed.items) {
      if (!byN.has(it.n)) throw fail('ANSWER_UNKNOWN_QUESTION', 1, { n: it.n, message: 'no question ' + it.n + ' in this pack', known: pack.questions.map((q) => q.n) });
    }
    for (const n of (parsed.except ? parsed.except.numbers : [])) {
      if (!byN.has(n)) throw fail('ANSWER_UNKNOWN_QUESTION', 1, { n, message: 'no question ' + n + ' in this pack', known: pack.questions.map((q) => q.n) });
    }
    const fresh = [];
    for (const it of parsed.items) {
      const q = byN.get(it.n);
      if (it.free_text) { fresh.push({ n: it.n, answer: it.answer, source: 'reply', free_text: true }); continue; }
      if (q.options.length && !q.options.includes(it.answer)) {
        throw fail('ANSWER_INVALID', 1, { n: it.n, given: it.answer, allowed: q.options, message: 'question ' + it.n + ' accepts: ' + q.options.join(', ') });
      }
      fresh.push({ n: it.n, answer: it.answer, source: 'reply', free_text: false });
    }
    if (parsed.except) {
      const skip = new Set(parsed.except.numbers);
      const explicit = new Set(fresh.map((r) => r.n));
      for (const q of pack.questions) {
        if (skip.has(q.n) || explicit.has(q.n)) continue;
        if (q.recommendation === null || q.recommendation === undefined) continue;
        fresh.push({ n: q.n, answer: q.recommendation, source: 'recommendation', free_text: false });
      }
    }
    // first valid reply per question wins (A5)
    for (const r of fresh) {
      if (have.has(r.n)) { if (have.get(r.n).answer !== r.answer) ignored.push(r.n); continue; }
      have.set(r.n, r);
      added.push(r.n);
    }
  }

  if (f.finalize) {
    for (const q of pack.questions) {
      if (have.has(q.n)) continue;
      if (!q.reversible || q.kind === 'owner-gate' || q.default === null || q.default === undefined) continue;
      have.set(q.n, { n: q.n, answer: q.default, source: 'default', free_text: false });
      defaultsApplied.push(q.n);
      added.push(q.n);
    }
  }

  const answers = Array.from(have.values()).sort((a, b) => a.n - b.n);
  const pending = pack.questions.map((q) => q.n).filter((n) => !have.has(n));
  const complete = pending.length === 0;
  const doc = { pack_id: packId, answers, pending, complete };
  const errors = validateSchema(loadSchemaFile('answers.schema.json'), doc);
  if (errors.length) throw fail('ANSWER_INVALID', 1, { errors });
  const text = JSON.stringify(doc, null, 2) + '\n';
  const file = answersPath(ctx, runId);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before !== text) atomicWrite(file, text);
  for (const n of added) {
    const a = have.get(n);
    emit(ctx, runId, state, a.source === 'default' ? 'default_applied' : 'answer_recorded', a.source, { n, answer: a.answer, source: a.source });
  }
  const base = { run_id: runId, answers, pending, answers_file: file };
  if (ignored.length) base.ignored = ignored;
  if (!complete) return { outcome: 'PENDING', exit: 2, ...base };
  if (!added.length && before !== null) return { outcome: 'ANSWER_NOOP', exit: 0, status: state.status, ...base };
  let status = state.status;
  if (status === 'NEEDS_HUMAN') status = advanceRunStatus(ctx, state, 'BUILDING').to;
  return { outcome: 'ANSWERED', exit: 0, status, ...base };
}

function renderTo(ctx, runId, mode, file, content) {
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) throw new Error('target is a directory: ' + path.basename(file));
  atomicWrite(file, content);
  return file;
}

function answerRender(ctx, runId, state, pack, f) {
  const settings = loadSettings(ctx, []).values;
  const nativeMax = f['native-max'] === undefined ? 4 : Number(f['native-max']);
  if (!Number.isInteger(nativeMax) || nativeMax < 0) throw fail('USAGE', 1, { message: '--native-max must be a non-negative integer' });
  const requested = f.render === true ? settings.interaction.owner_pack : String(f.render);
  if (!['auto', 'native', 'html', 'markdown'].includes(requested)) throw fail('USAGE', 1, { message: 'unknown render mode', allowed: ['auto', 'native', 'html', 'markdown'] });
  const fallback = settings.interaction.fallback;
  let chain;
  if (requested === 'auto') chain = fallback.slice();
  else chain = [requested, ...fallback.filter((m) => m !== requested && m !== 'native')];
  if (!chain.includes('markdown')) chain.push('markdown');
  const packId = packIdOf(pack.questions);
  const dir = runDir(ctx, runId);
  for (const mode of chain) {
    if (mode === 'native') {
      if (!nativeEligible(pack, nativeMax)) continue;
      const payload = renderNative(pack);
      atomicWriteJson(renderRecordPath(ctx, runId), { mode, file: null, pack_id: packId });
      emit(ctx, runId, state, 'pack_rendered', mode, { mode, pack_id: packId, questions: pack.questions.length });
      return { outcome: 'AWAITING_REPLY', exit: 2, run_id: runId, mode, pack_id: packId, payload };
    }
    const file = path.join(dir, mode === 'html' ? 'owner-pack.html' : 'owner-pack.md');
    const content = mode === 'html' ? renderHtml({ ...pack, pack_id: packId }) : renderMarkdown({ ...pack, pack_id: packId });
    try {
      renderTo(ctx, runId, mode, file, content);
    } catch (e) {
      emit(ctx, runId, state, 'render_failed', mode, { mode, error: String(e && e.message ? e.message : e) });
      continue;
    }
    atomicWriteJson(renderRecordPath(ctx, runId), { mode, file, pack_id: packId });
    emit(ctx, runId, state, 'pack_rendered', mode, { mode, file, pack_id: packId, questions: pack.questions.length });
    return { outcome: 'AWAITING_REPLY', exit: 2, run_id: runId, mode, file, pack_id: packId };
  }
  throw fail('RENDER_FAILED', 1, { run_id: runId, message: 'no renderer could write the owner pack' });
}
