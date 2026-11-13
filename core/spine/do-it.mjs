#!/usr/bin/env node
// do-it spine: built by core/spine/build.mjs from core/spine/src. Do not edit.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EMBEDDED_SCHEMAS = {"answers.schema.json":{"$id":"do-it-answers/1","title":"answers.json: the parsed owner reply, deterministic (no timestamps)","type":"object","required":["pack_id","answers","pending","complete"],"properties":{"pack_id":{"type":"string","minLength":1},"complete":{"type":"boolean"},"pending":{"type":"array","items":{"type":"integer","minimum":1}},"answers":{"type":"array","items":{"type":"object","required":["n","answer","source","free_text"],"properties":{"n":{"type":"integer","minimum":1},"answer":{"type":"string"},"source":{"enum":["reply","recommendation","default"]},"free_text":{"type":"boolean"}},"additionalProperties":false}}},"additionalProperties":false},"do-it-state.1.schema.json":{"$id":"do-it-state/1","title":"do-it run state (written only by the spine)","type":"object","required":["schema","run_id","preset","request","status","size","host","stage","slices","gates","handoffs","stop_refusals","review","created_at","updated_at"],"properties":{"schema":{"const":"do-it-state/1"},"run_id":{"type":"string","minLength":1},"preset":{"type":["string","null"]},"request":{"type":"string"},"status":{"enum":["INTAKE","PLANNING","AWAIT_RATIFY","BUILDING","VERIFYING","REVIEWING","FIXING","DEPLOYING","PROVING","CONCLUDING","DONE","NEEDS_HUMAN","PARKED","BLOCKED","FAILED","PARTIAL_FAILURE","ROLLED_BACK","ESCALATED"]},"size":{"type":["integer","string","null"]},"host":{"type":["string","null"]},"stage":{"type":["string","null"]},"slices":{"type":"array","items":{"type":"object","required":["id","status"],"properties":{"id":{"type":"string","minLength":1},"lane":{"type":["string","null"]},"tier":{"type":["string","null"]},"wave":{"type":["string","null"]},"status":{"type":"string"},"attempts":{"type":"integer","minimum":0},"escalations":{"type":"integer","minimum":0}}}},"gates":{"type":"object"},"handoffs":{"type":"integer","minimum":0},"stop_refusals":{"type":"integer","minimum":0},"review":{"type":"object","required":["round","exit"],"properties":{"round":{"type":"integer","minimum":0},"exit":{"type":["string","null"]}}},"created_at":{"type":"string","minLength":1},"updated_at":{"type":"string","minLength":1},"ceiling":{"type":["string","object","null"]},"park":{"type":["object","null"]},"handoff_state":{"type":["string","object","null"]},"run_verdict":{"enum":["DONE_ALL_VERIFIED","DONE_WITH_RESIDUALS","BLOCKED","NEEDS_RESET","USAGE_LIMIT",null]},"deploy":{"type":["object","null"]},"last_journal":{"type":["string","null"]}}},"events.schema.json":{"$id":"do-it-event/1","title":"events.jsonl row (trace fields frozen for v2 exporters)","type":"object","required":["ts","run_id","slice_id","stage","persona","tier","model","host","event","parent_id","verdict"],"properties":{"ts":{"type":"string","minLength":1},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"stage":{"type":["string","null"]},"persona":{"type":["string","null"]},"tier":{"type":["string","null"]},"model":{"type":["string","null"]},"host":{"type":["string","null"]},"event":{"type":"string","minLength":1},"parent_id":{"type":["string","null"]},"verdict":{"type":["string","null"]},"detail":{"type":["object","string","null"]}},"additionalProperties":false},"finish-line.schema.json":{"$id":"do-it-finish-line/1","title":"finish-line.json: rows that must all become terminal","type":"object","required":["rows"],"properties":{"rows":{"type":"array","items":{"type":"object","required":["id","kind","state"],"properties":{"id":{"type":"string","minLength":1},"kind":{"enum":["wave","package","dod"]},"state":{"enum":["OPEN","DONE","PARKED","BLOCKED"]},"evidence":{"type":["string","null"]},"owner_question":{"type":["string","null"]},"reason":{"type":["string","null"]},"archived_to":{"type":["string","null"]},"run_id":{"type":["string","null"]}}}}}},"gate-manifest.1.schema.json":{"$id":"do-it-gate-manifest/1","title":"rtg-manifest/1: the per-run manifest a gate run hands to its runner adapter (names, paths, digests, HMACs; never a value)","type":"object","required":["schema","run_id","scope","leg","clean","runner","lines","components","hashes","wide_patterns","wide_hits","wide_all","tree","dirty","never","env_names","env_files"],"additionalProperties":false,"properties":{"schema":{"const":"rtg-manifest/1"},"run_id":{"type":"string","pattern":"^g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}$"},"scope":{"enum":["edit","push","train","nightly"]},"leg":{"type":"string","minLength":1},"clean":{"type":"boolean"},"runner":{"enum":["jest","pytest","vitest"]},"lines":{"type":"array","items":{"type":"string","minLength":1}},"argv_sha":{"type":"string","pattern":"^[0-9a-f]{64}$"},"components":{"type":"object","additionalProperties":false,"properties":{"gate":{"type":"string","pattern":"^[0-9a-f]{64}$"},"core":{"type":"string","pattern":"^[0-9a-f]{64}$"},"installed":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"},"env":{"type":"string","pattern":"^[0-9a-f]{64}$"},"platform":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"}}},"hashes":{"type":"object","additionalProperties":{"type":"string","pattern":"^([0-9a-f]{64}|-)$"}},"wide_patterns":{"type":"object","required":["node","python"],"additionalProperties":false,"properties":{"node":{"type":"string"},"python":{"type":"string"}}},"wide_hits":{"type":"array","items":{"type":"string"}},"wide_all":{"type":"boolean"},"tree":{"type":"string","pattern":"^[0-9a-f]{64}$"},"dirty":{"type":"array","items":{"type":"string"}},"never":{"type":"array","items":{"type":"string"}},"env_names":{"type":"array","items":{"type":"string"}},"env_files":{"type":"array","items":{"type":"string"}},"platform_expect":{"type":["array","null"],"items":{"type":"string"}},"store_dir":{"type":["string","null"]},"reason":{"type":["string","null"]}}},"gate-result.1.schema.json":{"$id":"do-it-gate-result/1","title":"gate results store row (one canonical JSON line of results.jsonl)","type":"object","required":["schema","type","run_id","at","crc"],"additionalProperties":false,"properties":{"schema":{"const":"do-it-gate-result/1"},"type":{"enum":["start","finish","run_start","run_end","clean"]},"run_id":{"type":"string","pattern":"^g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}$"},"at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$"},"file":{"type":"string","minLength":1},"leg":{"type":"string","minLength":1,"pattern":"^[A-Za-z0-9_.:-]+$"},"scope":{"enum":["edit","push","train","nightly"]},"key":{"type":"string","pattern":"^[0-9a-f]{64}$"},"components":{"type":"object","additionalProperties":false,"properties":{"gate":{"type":"string","pattern":"^[0-9a-f]{64}$"},"runner":{"type":"string","pattern":"^[0-9a-f]{64}$"},"core":{"type":"string","pattern":"^[0-9a-f]{64}$"},"installed":{"type":"string","pattern":"^[0-9a-f]{64}$"},"env":{"type":"string","pattern":"^[0-9a-f]{64}$"},"platform":{"type":"string","pattern":"^[0-9a-f]{64}$"},"deps":{"type":"string","pattern":"^[0-9a-f]{64}$"},"class":{"enum":["NARROW","WIDE"]},"tree":{"type":"string","pattern":"^[0-9a-f]{64}$"}}},"result":{"enum":["PASS","FAIL","SKIPPED","DESELECTED"]},"retried":{"type":"boolean"},"counts":{"type":"object","required":["passed","failed","skipped","pending"],"additionalProperties":false,"properties":{"passed":{"type":"integer","minimum":0},"failed":{"type":"integer","minimum":0},"skipped":{"type":"integer","minimum":0},"pending":{"type":"integer","minimum":0}}},"exec_error":{"type":"boolean"},"duration_ms":{"type":"integer","minimum":0},"failure_ref":{"type":["string","null"],"pattern":"^failures/[0-9a-f]{64}\\.txt$"},"clean":{"type":"boolean"},"tree_dirty":{"type":"boolean"},"tainted":{"type":"boolean"},"reason":{"type":["string","null"]},"verdict":{"type":"string","pattern":"^[A-Z][A-Z_]*$"},"pid":{"type":"integer","minimum":1},"pid_start":{"type":["string","null"]},"crc":{"type":"string","pattern":"^[0-9a-f]{16}$"}}},"it-result.1.schema.json":{"$id":"it-result/1","title":"Result file every stage writes as its last act","type":"object","required":["schema","stage","run_id","status","exit_code"],"properties":{"schema":{"const":"it-result/1"},"stage":{"enum":["prompt-it","plan-it","build-it","review-it","deploy-it","conclude-it","reconcile-it"]},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"version":{"type":["string","null"]},"head_sha":{"type":["string","null"]},"status":{"enum":["ok","needs_human","blocked","failed","context_reset","usage_limit"]},"exit_code":{"type":"integer","minimum":0,"maximum":3},"verdicts":{"type":"array","items":{"type":"object","required":["row","verdict"],"properties":{"row":{"type":"string","minLength":1},"verdict":{"enum":["VERIFIED","IMPLEMENTED-NOT-VERIFIED","BLOCKED"]},"evidence":{"type":["string","null"]},"real":{"type":"boolean"}}}},"reason":{"type":["string","null"]},"run_verdict":{"enum":["DONE_ALL_VERIFIED","DONE_WITH_RESIDUALS","BLOCKED","NEEDS_RESET","USAGE_LIMIT",null]},"next":{"type":["object","null"]},"pending_human":{"type":["object","null"]},"artifacts":{"type":"array","items":{"type":"object","required":["path"],"properties":{"path":{"type":"string"},"kind":{"type":["string","null"]},"sha256":{"type":["string","null"]}}}},"resume":{"type":["object","null"]},"tokens":{"type":["object","null"]},"rollback":{"type":"boolean"},"legs":{"type":"array","items":{"type":"object","required":["leg","state"],"properties":{"leg":{"type":"string","minLength":1},"state":{"enum":["DEPLOYED_VERIFIED","DEPLOYED_UNVERIFIED","HELD","FAILED","NEEDS_HUMAN","ROLLED_BACK","ROLLBACK_FAILED"]},"evidence":{"type":["string","null"]},"compensate":{"type":["string","object","array","null"]}}}}}},"ledger.schema.json":{"$id":"do-it-ledger/1","title":"ledger.json: latest verdict and evidence per DoD row","type":"object","required":["schema","run_id","rows"],"properties":{"schema":{"const":"do-it-ledger/1"},"run_id":{"type":"string","minLength":1},"rows":{"type":"array","items":{"type":"object","required":["row","verdict","evidence","evidence_sha256","real","recorded_at","updated_at"],"properties":{"row":{"type":"string","minLength":1},"verdict":{"enum":["VERIFIED","IMPLEMENTED-NOT-VERIFIED","BLOCKED"]},"evidence":{"type":["string","null"]},"evidence_path":{"type":["string","null"]},"evidence_sha256":{"type":["string","null"]},"real":{"type":"boolean"},"reason":{"type":["string","null"]},"recorded_at":{"type":"string","minLength":1},"updated_at":{"type":"string","minLength":1}}}}}},"owner-pack.schema.json":{"$id":"do-it-owner-pack/1","title":"owner-pack.json: the single set of questions for the human","type":"object","required":["pack_id","run_id","questions","created_at"],"properties":{"pack_id":{"type":["string","null"]},"run_id":{"type":"string","minLength":1},"created_at":{"type":"string","minLength":1},"questions":{"type":"array","items":{"type":"object","required":["n","kind","text","options","recommendation","default","reversible"],"properties":{"n":{"type":"integer","minimum":1},"kind":{"type":"string","minLength":1},"text":{"type":"string","minLength":1},"options":{"type":"array","items":{"type":"string"}},"recommendation":{"type":["string","null"]},"default":{"type":["string","null"]},"reversible":{"type":"boolean"},"source":{"type":"string","minLength":1},"status":{"enum":["withdrawn"]},"withdrawn_at":{"type":"string"},"withdrawn_reason":{"type":"string"}},"additionalProperties":false}}},"additionalProperties":false},"readiness.schema.json":{"$id":"do-it-readiness/1","title":"plan/READINESS.json: the verdict that lets a build start (G-8)","type":"object","required":["decisions","preflight"],"properties":{"decisions":{"type":["array","object"]},"preflight":{"type":"object","required":["passed"],"properties":{"passed":{"type":"boolean"}}},"credentials":{"type":"array","items":{"type":"string","minLength":1}},"owner_dependent_slices":{"type":"integer","minimum":0},"review_checkpoints":{"type":"object","required":["schema","count","checkpoints"],"properties":{"schema":{"const":"review-checkpoints/1"},"count":{"type":"integer","minimum":0},"level":{"enum":["none","light","standard","heightened","full"]},"checkpoints":{"type":"array","items":{"type":"object","required":["id","kind","evidence"],"properties":{"id":{"type":"string","pattern":"^CP-\\d{2}$"},"kind":{"enum":["phase","wave","adversarial","pre-merge","pre-release"]},"evidence":{"type":"string","minLength":1},"at":{"type":"string"},"review":{"type":"string"},"blocks":{"type":"string"},"gates":{"type":"array","minItems":1,"items":{"enum":["dependents","promotion","merge","release"]}},"covers":{"type":"array","items":{"type":"string","minLength":1}}}}}}},"slices":{"type":"array","items":{"type":"object","required":["id"],"properties":{"id":{"type":"string","minLength":1},"lane":{"type":["string","null"]},"tier":{"type":["string","null"]},"class":{"enum":["deterministic","gather","implementation","hard",null]},"depends_on":{"type":"array","items":{"type":"string"}},"wave":{"type":["string","null"]},"depends_on_owner_answer":{"type":"boolean"}}}}}},"settings.schema.json":{"$id":"do-it-settings/1","title":"do-it settings (workspace, global or merged)","type":"object","additionalProperties":false,"properties":{"version":{"const":1},"interaction":{"type":"object","additionalProperties":false,"properties":{"owner_pack":{"enum":["auto","native","html","markdown"]},"fallback":{"type":"array","items":{"enum":["native","html","markdown"]}}}},"host":{"type":"object","additionalProperties":false,"properties":{"driver":{"type":"string","minLength":1},"alias":{"type":["string","null"]}}},"isolation":{"type":"object","additionalProperties":false,"properties":{"driver":{"type":"string","minLength":1}}},"state":{"type":"object","properties":{"backend":{"type":"string","minLength":1}},"additionalProperties":{"type":"object"}},"secrets":{"type":"object","additionalProperties":false,"properties":{"provider":{"enum":["file","env","aws-secrets-manager","onepassword","1password"]},"ref":{"type":"string"}}},"handoff":{"type":"object","additionalProperties":false,"properties":{"mode":{"enum":["auto","ask"]},"max_per_run":{"type":"integer","minimum":1}}},"review":{"type":"object","additionalProperties":false,"properties":{"max_rounds":{"type":"integer","minimum":1},"cost_cap_tokens":{"type":"integer","minimum":1}}},"tiers":{"type":"object","additionalProperties":false,"properties":{"T1":{"type":"string"},"T2":{"type":"string"},"T3":{"type":"string"}}},"ceilings":{"type":"object","additionalProperties":false,"properties":{"warn_tokens":{"type":"integer","minimum":0},"warn_pct":{"type":"number","minimum":0,"maximum":100},"block_tokens":{"type":"integer","minimum":0},"block_pct":{"type":"number","minimum":0,"maximum":100}}},"stop_gate":{"type":"object","additionalProperties":false,"properties":{"patience":{"type":"integer","minimum":0}}},"observability":{"type":"object","additionalProperties":false,"properties":{"provider":{"type":"string","minLength":1}}}}},"token-meter.schema.json":{"$id":"do-it-token-meter/1","title":"token-meter.jsonl row: the event fields plus usage fields","type":"object","required":["ts","run_id","slice_id","stage","persona","tier","model","host","event","parent_id","verdict","tokens_in","tokens_out","cache_read","cache_write","estimated","source"],"properties":{"ts":{"type":"string","minLength":1},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"stage":{"type":["string","null"]},"persona":{"type":["string","null"]},"tier":{"type":["string","null"]},"model":{"type":["string","null"]},"host":{"type":["string","null"]},"event":{"type":"string","minLength":1},"parent_id":{"type":["string","null"]},"verdict":{"type":["string","null"]},"tokens_in":{"type":["integer","null"],"minimum":0},"tokens_out":{"type":["integer","null"],"minimum":0},"cache_read":{"type":["integer","null"],"minimum":0},"cache_write":{"type":["integer","null"],"minimum":0},"estimated":{"type":"boolean"},"source":{"enum":["provider","estimate","unknown"]},"extra":{"type":["object","null"]}},"additionalProperties":false}};

// ---- answer.mjs ----
function answersPath(ctx, runId) { return path.join(runDir(ctx, runId), 'answers.json'); }
function renderRecordPath(ctx, runId) { return path.join(runDir(ctx, runId), 'owner-pack.render.json'); }

function loadPackChecked(ctx, runId) {
  const pack = readJsonIfExists(packPath(ctx, runId));
  if (!pack) throw fail('NO_PACK', 1, { run_id: runId, message: 'no owner-pack.json for this run' });
  const errors = validateSchema(loadSchemaFile('owner-pack.schema.json'), pack);
  if (errors.length) throw fail('PACK_INVALID', 1, { errors });
  return pack;
}

// Adversarial guard: the pack on disk must still be the one the owner was shown.
function packGuard(ctx, runId, pack) {
  const current = packIdOf(pack.questions);
  const rec = readJsonIfExists(renderRecordPath(ctx, runId));
  let shown = rec ? rec.pack_id : null;
  if (rec && rec.file && fs.existsSync(rec.file) && fs.statSync(rec.file).isFile()) {
    const text = readText(rec.file);
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

function cmdAnswer(ctx, args) {
  const f = args.flags;
  const hasReply = typeof f.reply === 'string';
  const hasRender = f.render !== undefined && f.render !== false;
  if (!hasReply && !hasRender && !f.finalize) throw fail('USAGE', 1, { message: 'answer needs --reply "<text>", --render MODE or --finalize' });
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  const pack = loadPackChecked(ctx, runId);
  if (!pack.questions.some((q) => q.status !== 'withdrawn')) return { outcome: 'NO_QUESTIONS', exit: 0, run_id: runId };
  if (hasReply || f.finalize) return answerApply(ctx, runId, state, pack, f, hasReply);
  return answerRender(ctx, runId, state, pack, f);
}

// Withdrawn questions stay in owner-pack.json (and in its id) but are never asked or counted.
function activePack(pack) {
  return { ...pack, questions: pack.questions.filter((q) => q.status !== 'withdrawn') };
}

function answerApply(ctx, runId, state, fullPack, f, hasReply) {
  const packId = packGuard(ctx, runId, fullPack);
  const pack = activePack(fullPack);
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
  const before = fs.existsSync(file) ? readText(file) : null;
  if (before !== text) atomicWrite(file, text, { cap: STATE_READ_CAP });
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

function answerRender(ctx, runId, state, fullPack, f) {
  const pack = activePack(fullPack);
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
  const packId = packIdOf(fullPack.questions);
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

// ---- ceiling.mjs ----
// G-5, ruling D4: absolute tokens or window percent, whichever fires first.
function ceilingLevel(ceilings, ctxTokens, windowTokens) {
  const pct = (ctxTokens / windowTokens) * 100;
  if (ctxTokens >= ceilings.block_tokens || pct >= ceilings.block_pct) {
    return { level: 'BLOCKED', by: ctxTokens >= ceilings.block_tokens ? 'absolute' : 'percent', pct };
  }
  if (ctxTokens >= ceilings.warn_tokens || pct >= ceilings.warn_pct) {
    return { level: 'WARN', by: ctxTokens >= ceilings.warn_tokens ? 'absolute' : 'percent', pct };
  }
  return { level: 'OK', by: null, pct };
}

function ceilingNumber(flags, name) {
  const raw = flags[name];
  if (raw === undefined || !/^\d+$/.test(String(raw)) || Number(raw) <= 0) throw fail('USAGE', 1, { message: 'gate ceiling requires --ctx-tokens N and --window W as positive integers' });
  return Number(raw);
}

function handoffWritten(state) {
  const h = state.handoff_state;
  return !!(h && typeof h === 'object' && h.path && fs.existsSync(h.path));
}

// `next` refuses while the ceiling block stands; it clears only when the fresh
// conductor calls `resume`. Nothing is written here.
function ceilingBlock(_ctx, state) {
  if (state.ceiling !== 'BLOCKED') return null;
  return {
    outcome: 'CEILING_BLOCKED',
    exit: 3,
    run_id: state.run_id,
    action: 'NONE',
    handoff_written: handoffWritten(state),
    message: handoffWritten(state) ? 'handoff written; start a fresh conductor and call resume' : 'write a handoff (do-it handoff) before continuing',
  };
}

function gateCeiling(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const ctxTokens = ceilingNumber(args.flags, 'ctx-tokens');
  const windowTokens = ceilingNumber(args.flags, 'window');
  const ceilings = loadSettings(ctx, args.sets).values.ceilings;
  const r = ceilingLevel(ceilings, ctxTokens, windowTokens);
  const pct = Math.round(r.pct * 10) / 10;
  const keep = state.ceiling === 'BLOCKED' ? 'BLOCKED' : r.level;
  if (state.ceiling !== keep) {
    state.ceiling = keep;
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'ceiling_' + r.level.toLowerCase(), stage: state.stage, host: state.host, verdict: r.level, detail: { ctx_tokens: ctxTokens, window: windowTokens, pct, by: r.by } });
  }
  const base = { run_id: runId, ctx_tokens: ctxTokens, window: windowTokens, pct, by: r.by, ceiling: state.ceiling };
  if (r.level === 'BLOCKED') return { outcome: 'CEILING_BLOCKED', exit: 3, ...base, handoff_written: handoffWritten(state) };
  return { outcome: r.level === 'WARN' ? 'CEILING_WARN' : 'CEILING_OK', exit: 0, ...base };
}

// ---- cli.mjs ----
const BOOL_FLAGS = new Set(['json', 'migrate', 'install', 'secrets', 'append', 'force', 'finalize', 'help', 'version', 'verbose', 'dry-run', 'take-over']);
const COMMANDS = ['init', 'start', 'next', 'record', 'gate', 'answer', 'handoff', 'resume', 'park', 'pack', 'status', 'meter', 'doctor'];

function parseArgs(argv) {
  const out = { positionals: [], flags: {}, sets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-v') { out.flags.version = true; continue; }
    if (!a.startsWith('--')) { out.positionals.push(a); continue; }
    let name = a.slice(2);
    let value;
    const eq = name.indexOf('=');
    if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
    if (name === 'set') {
      if (value === undefined) { value = argv[i + 1]; i++; }
      out.sets.push(value === undefined ? '' : value);
      continue;
    }
    if (BOOL_FLAGS.has(name) && value === undefined) { out.flags[name] = true; continue; }
    if (value === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { value = next; i++; } else value = true;
    }
    out.flags[name] = value;
  }
  return out;
}

function notImplemented(epic, what) {
  return { outcome: 'NOT_IMPLEMENTED', exit: 1, epic, command: what };
}

function renderHuman(result) {
  const lines = ['OUTCOME: ' + result.outcome];
  if (Array.isArray(result.say)) lines.push(...result.say);
  for (const key of Object.keys(result)) {
    if (key === 'outcome' || key === 'say') continue;
    if (key === 'lines') { lines.push(...result[key]); continue; }
    const v = result[key];
    lines.push(key + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  }
  return lines.join('\n') + '\n';
}

function dispatch(ctx, args) {
  const cmd = args.positionals[0];
  switch (cmd) {
    case 'init': return cmdInit(ctx, args);
    case 'start': return cmdStart(ctx, args);
    case 'status': return cmdStatus(ctx, args);
    case 'meter': return cmdMeter(ctx, args);
    case 'doctor': return cmdDoctor(ctx, args);
    case 'record': return cmdRecord(ctx, args);
    case 'gate': return cmdGate(ctx, args);
    case 'next': return cmdNext(ctx, args);
    case 'answer': return cmdAnswer(ctx, args);
    case 'handoff': return cmdHandoff(ctx, args);
    case 'resume': return cmdResume(ctx, args);
    case 'park': return cmdPark(ctx, args);
    case 'pack': return cmdPack(ctx, args);
    default:
      throw fail('USAGE', 1, { message: 'unknown command', commands: COMMANDS });
  }
}

// In-process entry: no process globals are read or written, so tests and the
// built file share one code path. Returns { exit, stdout }.
function cliMain(argv, opts) {
  const args = parseArgs(argv);
  const json = !!args.flags.json;
  let result;
  let ctx = null;
  try {
    if (args.flags.version) {
      result = { outcome: 'VERSION', exit: 0, version: DO_IT_VERSION };
      return { exit: 0, stdout: json ? JSON.stringify(result) + '\n' : DO_IT_VERSION + '\n' };
    }
    if (!args.positionals.length || args.flags.help) {
      result = { outcome: 'USAGE', exit: args.flags.help ? 0 : 1, commands: COMMANDS };
    } else {
      // CP-03 R5-S1-M11: a hook stop names the host's cwd with --cwd and may run the spine from anywhere (the
      // hook spawns it from the plugin root, which always exists). The cwd's home is found from --cwd; when
      // that folder is gone or cannot be entered there is no cwd home, and the registry homes still gate.
      const stopCwd = args.positionals[0] === 'gate' && args.positionals[1] === 'stop' && typeof args.flags.cwd === 'string' && args.flags.cwd
        ? path.resolve((opts && opts.cwd) || '.', args.flags.cwd) : null;
      ctx = makeCtx({ cwd: stopCwd || (opts && opts.cwd), env: opts && opts.env });
      redactInit(ctx);
      result = dispatch(ctx, args);
    }
  } catch (e) {
    if (e instanceof CliError) {
      result = { outcome: e.outcome, exit: e.exit, ...e.extra };
    } else {
      result = { outcome: 'INTERNAL_ERROR', exit: 1, message: String(e && e.message ? e.message : e) };
    }
  }
  const exit = typeof result.exit === 'number' ? result.exit : 0;
  result.exit = exit;
  if (ctx) {
    if (result.root === undefined) result.root = ctx.root;
    if (result.home === undefined) result.home = ctx.home;
  }
  // CP-03 R4-L4: redact after the outcome is decided. Every free-text field is redacted; the protocol
  // fields (outcome, exit) are the spine's own words and are never rewritten, so no secret value can turn
  // a STOP_REFUSED into something a host reads as "allowed".
  const shown = { ...redactValue(result), outcome: result.outcome, exit };
  const stdout = json ? JSON.stringify(shown) + '\n' : renderHuman(shown);
  if (ctx) redactFlushEvents(ctx, result);
  return { exit, stdout };
}

function cmdStart(ctx, args) {
  const f = args.flags;
  if (typeof f.request !== 'string' || !f.request.trim()) throw fail('USAGE', 1, { message: 'start requires --request "<text>"' });
  const settings = loadSettings(ctx, args.sets);
  const runId = newRunId(ctx);
  const session = resolveSession(ctx, f);
  const size = f.size === undefined ? null : (/^\d+$/.test(String(f.size)) ? Number(f.size) : String(f.size));
  const state = newState(ctx, runId, {
    preset: typeof f.preset === 'string' ? f.preset : null,
    request: f.request,
    size,
    host: typeof f.host === 'string' ? f.host : settings.values.host.driver,
    owner: { session_id: session.id, cwd: ctx.cwd },
  });
  const routed = state.preset ? null : route(f.request);
  if (routed && routed.preset) {
    state.preset = routed.preset;
    if (state.size === null && routed.size !== null) state.size = routed.size;
  }
  fs.mkdirSync(path.join(runDir(ctx, runId), 'results'), { recursive: true });
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'run_started', stage: state.stage, host: state.host, verdict: null });
  if (routed && routed.preset) {
    appendEvent(ctx, runId, { event: 'route', stage: state.stage, host: state.host, verdict: routed.preset, detail: { rule: routed.rule, model_call: false } });
  }
  const out = { outcome: 'STARTED', exit: 0, run_id: runId, status: state.status, preset: state.preset, root: ctx.root, home: ctx.home };
  // the stop gate finds this run from any cwd the session stops in (CP-03 R3-S1-H7)
  const regErr = registerSessionRun(ctx, session.id, runId);
  if (regErr) out.session_registry_error = regErr;
  // an explicit id outranks the host's live one (2.1); say so, since only the recorded id is gated
  if (session.conflict) out.session_conflict = session.conflict;
  return out;
}

function cmdStatus(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const removed = cleanStaleTmp(runDir(ctx, runId)) + cleanStaleTmp(path.join(runDir(ctx, runId), 'results'));
  const state = loadState(ctx, runId);
  return {
    outcome: 'STATUS',
    exit: 0,
    run_id: runId,
    status: state.status,
    preset: state.preset,
    stage: state.stage,
    host: state.host,
    root: ctx.root,
    home: ctx.home,
    slices: state.slices,
    handoffs: state.handoffs,
    stop_refusals: state.stop_refusals,
    run_verdict: state.run_verdict === undefined ? null : state.run_verdict,
    last_take_over: takeOvers(state).pop() || null,
    board: renderBoard(rowsForRun(readFinishLine(ctx), runId, adoptsUnattributed(state))),
    stale_tmp_removed: removed,
    unreadable_runs: unreadableRuns(ctx),
  };
}

function cmdGate(ctx, args) {
  const sub = args.positionals[1];
  switch (sub) {
    case 'verify': return gateVerify(ctx, args);
    case 'conclude': return gateConclude(ctx, args);
    case 'advance': return gateAdvance(ctx, args);
    case 'build': return gateBuild(ctx, args);
    case 'stop': return gateStop(ctx, args);
    case 'route': return gateRoute(ctx, args);
    case 'ceiling': return gateCeiling(ctx, args);
    case 'escalate': return gateEscalate(ctx, args);
    default:
      throw fail('USAGE', 1, { message: 'gate needs a subcommand', subcommands: ['verify', 'conclude', 'advance', 'build', 'stop', 'route', 'ceiling', 'escalate'] });
  }
}

function gateAdvance(ctx, args) {
  const to = args.flags.to;
  if (typeof to !== 'string') throw fail('USAGE', 1, { message: 'gate advance requires --to STATUS' });
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const moved = advanceRunStatus(ctx, state, to);
  return { outcome: 'ADVANCED', exit: 0, run_id: runId, from: moved.from, status: moved.to };
}

// gate escalate --reason "<text>": hand a run that already waits on the owner (NEEDS_HUMAN, with an open
// owner-pack question) or has FAILED over to the owner for good. It starts only from a status that already
// does not gate a stop, so it never switches a gate off (CP-03 R3-S1-H6); the reason is kept in the event.
const ESCALATE_FROM = ['NEEDS_HUMAN', 'FAILED'];
function gateEscalate(ctx, args) {
  const f = args.flags;
  // CP-03 R6-S1-L4: the same reason rule as every status that ends the gate (no placeholder, no invisible text)
  const reason = cleanReason(f.reason);
  if (!reason) throw fail('USAGE', 1, { message: 'gate escalate requires --reason "<why the owner must take the run>" (a placeholder or invisible text is no reason)' });
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (!ESCALATE_FROM.includes(state.status)) {
    throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'ESCALATED', allowed_from: ESCALATE_FROM, message: 'gate escalate starts only from a run that already waits on the owner or has failed' });
  }
  const open = openPackQuestions(ctx, runId);
  if (state.status === 'NEEDS_HUMAN' && !open.length) {
    throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'ESCALATED', message: 'no open owner-pack question: nothing hands the run to the owner' });
  }
  // CP-03 R4-S1-H8: ESCALATED is terminal, so the owner must find it waiting in the pack. From FAILED with no
  // open question, the reason itself becomes one (and the failure's recorded cause goes with it).
  let question = null;
  if (state.status === 'FAILED' && !open.length) {
    const cause = state.status_reason && state.status_reason.status === 'FAILED' ? state.status_reason.reason : null;
    const added = packAppend(ctx, runId, [{
      kind: 'escalation',
      source: 'gate-escalate',
      text: 'The run failed and was escalated to you: ' + reason + (cause ? ' (recorded cause: ' + cause + ')' : '') + '. Restart it, or close it with its open rows as residuals?',
      options: ['restart run', 'close with residuals'],
      recommendation: 'restart run',
      default: null,
      reversible: true,
    }]);
    if (!added.length && !openPackQuestions(ctx, runId).length) {
      throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'ESCALATED', message: 'the escalation question could not be written to the owner pack' });
    }
    question = added.length ? added[0].n : null;
  }
  const from = state.status;
  state.status = 'ESCALATED';
  state.status_reason = { status: 'ESCALATED', reason, stage: state.stage, at: ctx.now() };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'escalated', stage: state.stage, host: state.host, verdict: 'ESCALATED', detail: { from, reason, ...(question ? { question } : {}) } });
  return { outcome: 'ESCALATED', exit: 0, run_id: runId, from, status: 'ESCALATED', reason, ...(question ? { pack_question: question } : {}) };
}

// ---- conclude.mjs ----
// G-13: close only with every row accounted, no live worker, no pending wake.
function computeRunVerdict(ledger, fl) {
  const rows = ledger.rows;
  if (!rows.length) return 'DONE_WITH_RESIDUALS';
  if (rows.some((r) => r.verdict !== 'VERIFIED')) return 'DONE_WITH_RESIDUALS';
  if (fl.rows.some((r) => r.state !== 'DONE')) return 'DONE_WITH_RESIDUALS';
  return 'DONE_ALL_VERIFIED';
}

function gateConclude(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const reverified = verifyEvidence(ctx, runId, state);
  const ledger = readLedger(ctx, runId);
  const fl = rowsForRun(readFinishLine(ctx), runId, adoptsUnattributed(state));
  const reasons = [];

  const inLedger = new Set(ledger.rows.map((r) => r.row));
  const unaccounted = fl.rows.filter((r) => {
    if (inLedger.has(r.id)) return false;
    if (r.state === 'DONE' && r.evidence) return false;
    if (r.state === 'PARKED' && r.owner_question) return false;
    if (r.state === 'BLOCKED' && r.reason) return false;
    return true;
  }).map((r) => r.id);
  if (unaccounted.length) reasons.push({ reason: 'unaccounted_row', ids: unaccounted });

  const live = state.slices.filter((s) => s.status === 'RUNNING').map((s) => s.id);
  if (live.length) reasons.push({ reason: 'live_worker', ids: live });

  const wake = readJsonIfExists(path.join(ctx.home, 'runs', runId, 'wake.json'));
  if (wake && wake.status === 'scheduled') reasons.push({ reason: 'pending_wake', ids: wake.id ? [String(wake.id)] : [] });

  const legs = (state.deploy && state.deploy.legs) || [];
  if (legs.some((l) => l.state !== 'DEPLOYED_VERIFIED') || state.status === 'PARTIAL_FAILURE' || state.status === 'ROLLED_BACK') {
    reasons.push({ reason: 'deploy_not_reverified', ids: legs.filter((l) => l.state !== 'DEPLOYED_VERIFIED').map((l) => l.leg) });
  }
  if (reasons.length) {
    appendEvent(ctx, runId, { event: 'conclude_refused', verdict: reasons[0].reason, detail: { reasons } });
    throw fail('CONCLUDE_REFUSED', 1, { run_id: runId, reason: reasons[0].reason, ids: reasons[0].ids, reasons });
  }

  const runVerdict = computeRunVerdict(ledger, fl);
  state.status = 'DONE';
  state.run_verdict = runVerdict;
  state.stage = 'conclude-it';
  writeState(ctx, state);
  const taken = takeOvers(state);
  appendEvent(ctx, runId, { event: 'concluded', stage: 'conclude-it', host: state.host, verdict: runVerdict, ...(taken.length ? { detail: { take_overs: taken } } : {}) });
  const residuals = ledger.rows.filter((r) => r.verdict !== 'VERIFIED').map((r) => r.row);
  return { outcome: 'CONCLUDED', exit: 0, run_id: runId, status: 'DONE', run_verdict: runVerdict, residuals, reverified: reverified.map((c) => c.row), take_overs: taken };
}

// ---- ctx.mjs ----
function realpathSafe(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

function gitInfo(cwd, env) {
  try {
    const out = cp.execFileSync('git', ['rev-parse', '--show-toplevel', '--git-common-dir'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
    const top = realpathSafe(out[0].trim());
    const common = realpathSafe(path.resolve(cwd, out[1].trim()));
    const main = path.basename(common) === '.git' ? path.dirname(common) : top;
    return { top, main: realpathSafe(main) };
  } catch {
    return null;
  }
}

// Home rule (ruling D7): DO_IT_HOME wins; else the main checkout of the git
// repository (so every worktree shares one .do-it/); else the working directory.
function makeCtx(opts) {
  const env = opts.env || process.env;
  const cwd = realpathSafe(opts.cwd || process.cwd());
  const git = gitInfo(cwd, env);
  let root;
  let home;
  if (env.DO_IT_HOME) {
    root = realpathSafe(path.resolve(cwd, env.DO_IT_HOME));
    home = root;
  } else {
    root = git ? git.main : cwd;
    home = path.join(root, '.do-it');
  }
  return {
    cwd,
    env,
    git,
    repo: git ? git.top : cwd,
    root,
    home,
    userHome: env.HOME || os.homedir(),
    now: () => new Date().toISOString(),
  };
}

// ---- doctor.mjs ----
function cmdDoctor(ctx, args) {
  const f = args.flags;
  if (f.install) return typeof f.host === 'string' ? cmdInstallCompanions(ctx, args) : cmdInstall(ctx, args);
  if (f.migrate) return cmdMigrate(ctx);
  if (f.secrets) return doctorSecrets(ctx, args);
  const loaded = loadSettings(ctx, args.sets);
  const settings = {};
  for (const e of loaded.entries) settings[e.key] = { value: e.value, source: e.source };
  return {
    outcome: 'DOCTOR_OK',
    exit: 0,
    version: DO_IT_VERSION,
    node: process.version,
    root: ctx.root,
    home: ctx.home,
    repo: ctx.repo,
    files: loaded.files,
    entries: loaded.entries,
    settings,
  };
}

// ---- errors.mjs ----
class CliError extends Error {
  constructor(outcome, exit, extra) {
    super(outcome);
    this.outcome = outcome;
    this.exit = exit;
    this.extra = extra || {};
  }
}

function fail(outcome, exit, extra) {
  return new CliError(outcome, exit === undefined ? 1 : exit, extra);
}

// ---- events.mjs ----
const EVENT_FIELDS = ['ts', 'run_id', 'slice_id', 'stage', 'persona', 'tier', 'model', 'host', 'event', 'parent_id', 'verdict'];

function eventsPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'events.jsonl');
}

// Frozen row: exactly the 11 trace fields; `detail` is added only when given.
function buildEventRow(ctx, runId, fields) {
  const row = {};
  for (const k of EVENT_FIELDS) row[k] = fields[k] === undefined ? null : fields[k];
  row.ts = fields.ts || ctx.now();
  row.run_id = runId;
  if (fields.detail !== undefined) row.detail = fields.detail;
  return row;
}

function appendEvent(ctx, runId, fields) {
  const row = buildEventRow(ctx, runId, fields);
  const errors = validateSchema(loadSchemaFile('events.schema.json'), row);
  if (errors.length) throw fail('EVENT_INVALID', 1, { errors });
  appendJsonLine(eventsPath(ctx, runId), row);
  return row;
}

// ---- evidence.mjs ----
function normalizeRel(p) {
  return path.normalize(String(p)).replace(/^\.\//, '');
}

function insideDir(real, base) {
  const rel = path.relative(base, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Evidence forms (D15): a path under the repo, `result:<file>` under runs/<id>/results/,
// or `sha256:<hex>` naming an entry in the result's artifacts[] whose file hashes to it.
// The spine re-reads the file; it never trusts mtime or the model's claim.
function resolveEvidence(ctx, runId, evidence, artifacts) {
  if (typeof evidence !== 'string' || !evidence.trim()) return { ok: false, reason: 'empty' };
  const ev = evidence.trim();
  const arts = Array.isArray(artifacts) ? artifacts : [];
  if (ev.startsWith('sha256:')) {
    const hex = ev.slice(7).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) return { ok: false, reason: 'bad_sha256' };
    const art = arts.find((a) => a && typeof a.sha256 === 'string' && a.sha256.toLowerCase().replace(/^sha256:/, '') === hex && a.path);
    if (!art) return { ok: false, reason: 'no_matching_artifact' };
    const inner = resolveEvidence(ctx, runId, art.path, []);
    if (!inner.ok) return { ok: false, reason: 'artifact_file_' + inner.reason };
    if (inner.sha256 !== hex) return { ok: false, reason: 'artifact_hash_differs' };
    return { ...inner, kind: art.kind || null };
  }
  let abs;
  let bases;
  let stored = ev;
  if (ev.startsWith('result:')) {
    const resultsDir = path.join(ctx.home, 'runs', runId, 'results');
    abs = path.resolve(resultsDir, ev.slice(7));
    bases = [resultsDir];
  } else {
    abs = path.resolve(ctx.repo, ev);
    bases = [ctx.repo, ctx.home];
    stored = normalizeRel(ev);
  }
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  const baseReals = bases.map((b) => { try { return fs.realpathSync(b); } catch { return b; } });
  if (!baseReals.some((b) => insideDir(real, b))) return { ok: false, reason: 'outside_repo' };
  let st;
  try { st = fs.statSync(real); } catch { return { ok: false, reason: 'missing' }; }
  if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  const art = arts.find((a) => a && a.path && normalizeRel(a.path) === stored);
  return { ok: true, path: stored, abs: real, sha256: sha256File(real), mtime_ms: st.mtimeMs, kind: art ? art.kind || null : null };
}

// ---- finish-line.mjs ----
// finish-line.json: the board of rows that must all become terminal (CONTRACT section 2).
// States: OPEN, DONE (the closed state, needs evidence), PARKED (needs owner_question),
// BLOCKED (needs reason).
const BOARD_CAP = 1200;

function finishLinePath(ctx) {
  return path.join(ctx.home, 'finish-line.json');
}

// CP-03 R5-S1-L4: a board that cannot be read is a named refusal (FINISH_LINE_UNREADABLE, with the file and
// the cause, never its content), not an INTERNAL_ERROR, so `next` after a park tells the agent what to fix.
function readFinishLine(ctx, opts) {
  const file = finishLinePath(ctx);
  let fl;
  try { fl = readJsonRegular(file, STATE_READ_CAP); } catch (e) {
    const error = String(e && e.code ? e.code + ': ' + e.message : (e && e.message) || e);
    throw fail('FINISH_LINE_UNREADABLE', 1, { file, error, message: 'finish-line.json cannot be read (' + error + '); restore it from git or fix it by hand, then run the command again' });
  }
  if (!fl || !Array.isArray(fl.rows)) {
    // CP-03 R5-S1-L2: on the stop path a board that parses but is not { rows: [...] } is as unknown as one
    // that does not parse (A16 fails closed); a missing board is still an empty one
    if (opts && opts.strict && fs.existsSync(file)) {
      const error = 'EBOARD: rows is not a list in ' + file;
      throw fail('FINISH_LINE_UNREADABLE', 1, { file, error, message: 'finish-line.json cannot be read (' + error + '); restore it from git or fix it by hand, then run the command again' });
    }
    return { rows: [] };
  }
  // CP-03 R6-S1-L3: on the stop path every row must be a row (an object with a string id and state); a null or
  // a number in rows is as unknown as a garbled board, never an INTERNAL_ERROR or an empty board
  if (opts && opts.strict) {
    const bad = fl.rows.findIndex((r) => !r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || typeof r.state !== 'string');
    if (bad !== -1) {
      const error = 'EBOARD: row ' + bad + ' is not an object with a string id and state in ' + file;
      throw fail('FINISH_LINE_UNREADABLE', 1, { file, error, message: 'finish-line.json cannot be read (' + error + '); restore it from git or fix it by hand, then run the command again' });
    }
  }
  return fl;
}

function writeFinishLine(ctx, fl) {
  const errors = validateSchema(loadSchemaFile('finish-line.schema.json'), fl);
  if (errors.length) throw fail('FINISH_LINE_INVALID', 1, { errors });
  atomicWriteJson(finishLinePath(ctx), fl);
}

// A row's identity is (run_id, id): row ids are namespaced per run, so two runs of one preset (or two
// plans with the same slice ids) each get their own rows (CP-03 S1-H1). A row written before run_id
// existed has none. Only a legacy run (state with no owner object, written by 1.0.x) may adopt such a
// row; a 1.1 run never does, or a 1.0.x board's rows would stand in for the run's own and it would
// seed nothing (CP-03 R2-S1-H3). `adopt` is false unless the caller passes adoptsUnattributed(state).
// A legacy run that `resume` later bound to a session keeps adopting (owner.adopted_legacy, CP-03 R3-L7).
function adoptsUnattributed(state) {
  if (!state) return false;
  const o = state.owner;
  return !(o && typeof o === 'object') || o.adopted_legacy === true;
}

function findRow(fl, id, runId, adopt) {
  const rid = runId || null;
  if (rid) {
    const own = fl.rows.find((r) => r.id === id && r.run_id === rid);
    if (own) return own;
    if (!adopt) return null;
  }
  return fl.rows.find((r) => r.id === id && !r.run_id) || null;
}

function hasRow(fl, id, runId, adopt) {
  return !!findRow(fl, id, runId, adopt);
}

function finishLineUpsert(fl, id, patch, runId, adopt) {
  let row = findRow(fl, id, runId, adopt);
  if (!row) {
    row = { id, kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null };
    if (runId) row.run_id = runId;
    fl.rows.push(row);
  } else if (runId && !row.run_id) {
    row.run_id = runId;
  }
  Object.assign(row, patch);
  return row;
}

// The rows one run answers for: its own, plus unattributed rows of an older board only when the run may
// adopt them. Every caller passes adoptsUnattributed(state), the same rule seeding uses: next, status,
// handoff, conclude and both stop paths (CP-03 R3-S1-M6). A 1.1 run therefore never answers for, and is
// never held by, a 1.0.x row that `record` would refuse to let it close; a legacy run still counts them.
function rowsForRun(fl, runId, includeUnattributed) {
  return { rows: fl.rows.filter((r) => r.run_id === runId || (includeUnattributed && !r.run_id)) };
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// Terminal = closed with evidence, or PARKED with a question, or BLOCKED with a reason.
function rowTerminal(row) {
  if (row.state === 'DONE') return nonEmpty(row.evidence);
  if (row.state === 'PARKED') return nonEmpty(row.owner_question);
  if (row.state === 'BLOCKED') return nonEmpty(row.reason);
  return false;
}

function rowClosed(row) {
  return row.state === 'DONE' && nonEmpty(row.evidence);
}

// A package row (a slice) closes by itself once every one of its case rows
// (`T-<slice>-<n>`) is terminal: DONE when all are DONE, else BLOCKED naming the
// ones that are not. A package with no case rows, or with one still open, is left alone.
// Case rows count only for the package of the same run (rows are namespaced per run). An unattributed
// row (an older board) pairs only with an unattributed package, or with the legacy run named by
// `legacyRunId` (the one run allowed to adopt it): a 1.1 package never closes on a 1.0.x case row.
function sameRun(pkg, c, legacyRunId) {
  if ((pkg.run_id || null) === (c.run_id || null)) return true;
  if (!legacyRunId) return false;
  return (!c.run_id && pkg.run_id === legacyRunId) || (!pkg.run_id && c.run_id === legacyRunId);
}

function autoClosePackages(fl, legacyRunId) {
  const closed = [];
  for (const pkg of fl.rows) {
    if (pkg.kind !== 'package' || pkg.state !== 'OPEN' || pkg.id.includes(':')) continue;
    const re = new RegExp('^T-' + pkg.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d');
    const cases = fl.rows.filter((r) => r.kind === 'dod' && sameRun(pkg, r, legacyRunId) && re.test(r.id));
    if (!cases.length || !cases.every(rowTerminal)) continue;
    const notDone = cases.filter((r) => r.state !== 'DONE');
    if (notDone.length) {
      pkg.state = 'BLOCKED';
      pkg.reason = 'auto-closed: ' + notDone.length + ' of ' + cases.length + ' case rows not DONE: ' + notDone.map((r) => r.id + ' ' + r.state).join(', ');
    } else {
      pkg.state = 'DONE';
      pkg.evidence = 'auto-closed: all ' + cases.length + ' case rows DONE (' + cases.map((r) => r.id).join(', ') + ')';
      pkg.reason = null;
    }
    closed.push(pkg.id);
  }
  return closed;
}

function openRows(fl) {
  return fl.rows.filter((r) => !rowTerminal(r));
}

// Signature of row states: any change in it is progress for the stop-gate.
function rowsSignature(fl) {
  return fl.rows.map((r) => r.id + '=' + r.state + (rowTerminal(r) ? '+' : '-')).join('|');
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '~' : t;
}

// Roughly 300 tokens, never more than BOARD_CAP characters, deterministic.
function renderBoard(fl) {
  const rows = fl.rows;
  const closed = rows.filter(rowClosed);
  const parked = rows.filter((r) => r.state === 'PARKED');
  const blocked = rows.filter((r) => r.state === 'BLOCKED');
  const open = rows.filter((r) => !rowClosed(r) && r.state !== 'PARKED' && r.state !== 'BLOCKED');
  const build = (detail) => {
    const lines = ['FINISH LINE: ' + closed.length + ' of ' + rows.length + ' closed'];
    if (open.length) lines.push('OPEN (' + open.length + '): ' + open.map((r) => r.id).join(' '));
    if (parked.length) lines.push('PARKED (' + parked.length + '): ' + parked.map((r) => r.id + (detail ? ' [' + clip(r.owner_question, detail) + ']' : '')).join('; '));
    if (blocked.length) lines.push('BLOCKED (' + blocked.length + '): ' + blocked.map((r) => r.id + (detail ? ' [' + clip(r.reason, detail) + ']' : '')).join('; '));
    return lines.join('\n');
  };
  for (const detail of [40, 16, 0]) {
    const text = build(detail);
    if (text.length <= BOARD_CAP) return text;
  }
  // very large boards: keep the counts and as many ids as fit
  let text = build(0);
  while (text.length > BOARD_CAP - 24) {
    const cut = text.lastIndexOf(' ', BOARD_CAP - 30);
    text = text.slice(0, cut > 0 ? cut : BOARD_CAP - 30);
  }
  return text + ' ... (truncated)';
}

// ---- fs-atomic.mjs ----
const TMP_PATTERN = /\.tmp-\d+-[0-9a-f]{8}$/;

// temp file in the same directory, fsync, rename. opts.faultAfterTmp is the
// DO_IT_FAULT=after_tmp test hook: stop after the temp file is durable.
// CP-03 R7-S1-M14: opts.cap refuses, before anything touches disk, a write the spine could not read back
// through its own capped reader. The previous file stays intact and the error is STATE_TOO_LARGE.
function atomicWrite(file, data, opts) {
  const buf = typeof data === 'string' ? Buffer.from(redactText(data), 'utf8') : data;
  assertWithinCap(file, buf.length, opts && opts.cap);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'w', (opts && opts.mode) || 0o666);
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (opts && opts.faultAfterTmp) throw fail('FAULT_INJECTED', 1, { fault: 'after_tmp' });
  fs.renameSync(tmp, file);
  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch {
    // directory fsync is best effort
  }
}

// JSON is redacted value by value (keys untouched, R5-S1-L3), then written as bytes so it is not redacted again.
function jsonBytes(value) {
  return Buffer.from(JSON.stringify(redactJsonValues(value), null, 2) + '\n', 'utf8');
}

// Every JSON file the spine writes is read back through readJsonIfExists/readJsonRegular, capped at
// STATE_READ_CAP unless the caller names a tighter cap (the session registry: REGISTRY_READ_CAP).
function atomicWriteJson(file, value, opts) {
  atomicWrite(file, jsonBytes(value), { cap: STATE_READ_CAP, ...(opts || {}) });
}

function assertWithinCap(file, size, cap) {
  if (cap && size > cap) {
    throw fail('STATE_TOO_LARGE', 1, { file, bytes: size, cap, message: path.basename(file) + ' would be ' + size + ' bytes, above the ' + cap + '-byte read cap; nothing was written' });
  }
}

// CP-03 R6-S1-M13: every append goes through appendRegular. Opening a FIFO for writing blocks until a reader
// appears, which no timer inside the spine can break; O_NONBLOCK makes a reader-less FIFO fail with ENXIO at
// once, and anything that is not a regular file (FIFO, device, socket, directory, symlink) is refused.
function appendRegular(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let st = null;
  try { st = fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st && !st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  const c = fs.constants;
  const flags = c.O_WRONLY | c.O_APPEND | c.O_CREAT | (c.O_NONBLOCK || 0) | (c.O_NOFOLLOW || 0);
  const fd = fs.openSync(file, flags, 0o666);
  try {
    if (!fs.fstatSync(fd).isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    const buf = Buffer.from(text, 'utf8');
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
  } finally {
    fs.closeSync(fd);
  }
}

// RTG L1 (PRD-1 D4): one O_APPEND write per record, no redaction (the bytes carry a CRC computed by the caller).
// The file must be a regular file (FIFO-safe as appendRegular). When the file's last byte is not LF (a torn tail
// left by a crash) the buffer is prefixed with LF inside the SAME write, so the fragment cannot swallow the record.
// The caller bounds the buffer size; this returns { written, expected } and never retries a short write, except
// that a short write is followed by a lone LF so the next record starts on a fresh line.
function appendRecord(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let st = null;
  try { st = fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st && !st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  const c = fs.constants;
  const flags = c.O_RDWR | c.O_APPEND | c.O_CREAT | (c.O_NONBLOCK || 0) | (c.O_NOFOLLOW || 0);
  const fd = fs.openSync(file, flags, 0o666);
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    let out = buf;
    let prefixed = false;
    if (fst.size > 0) {
      const last = Buffer.alloc(1);
      const got = fs.readSync(fd, last, 0, 1, fst.size - 1);
      if (got === 1 && last[0] !== 0x0a) { out = Buffer.concat([Buffer.from('\n'), buf]); prefixed = true; }
    }
    const written = fs.writeSync(fd, out, 0, out.length);
    if (written !== out.length) { try { fs.writeSync(fd, Buffer.from('\n'), 0, 1); } catch { /* best effort */ } }
    return { written, expected: out.length, prefixed };
  } finally {
    fs.closeSync(fd);
  }
}

// RTG L1 (PRD-1 D7, D8): create `file` exactly once with `buf`: temp file (exclusive, `mode`), fsync, then link(2)
// onto the final name, so a reader never sees partial bytes and concurrent first-writers converge on one winner.
// Returns true when this call created the file, false when it already existed (left untouched).
function writeFileOnce(file, buf, mode) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'wx', mode === undefined ? 0o644 : mode);
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

function appendLine(file, line) {
  appendRegular(file, redactText(line) + '\n');
}

function appendJsonLine(file, value) {
  appendRegular(file, JSON.stringify(redactJsonValues(value)) + '\n');
}

// CP-03 R5-S1-M10: a FIFO, a device or an endless file must never hang the spine. readRegularFile reads only a
// regular file, at most `cap` bytes. opts.noFollow refuses a symlink outright (lstat; the session registry
// never follows one); otherwise a symlink is followed but must still end at a regular file.
// Errors carry a code (ENOENT, ENOTREG, EFBIG, ...) and never quote the file's content.
const REGISTRY_READ_CAP = 64 * 1024;
const STATE_READ_CAP = 16 * 1024 * 1024;
// CP-03 R8-S1-M15: what the spine ACCEPTS into a state (or board) it seeds leaves 1 MiB of headroom under the
// read cap, so the run's own later bookkeeping (stop refusals, signatures, statuses) never meets the cap.
// Sizes are measured as written: jsonBytes, after redaction.
const STATE_HEADROOM = 1024 * 1024;
const STATE_ACCEPT_CAP = STATE_READ_CAP - STATE_HEADROOM;
// files the spine hashes or copies whole (results, evidence, migrated files) and append-only logs
const BULK_READ_CAP = 256 * 1024 * 1024;

function fileKind(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFIFO()) return 'fifo';
  if (st.isDirectory()) return 'directory';
  if (st.isSocket()) return 'socket';
  if (st.isCharacterDevice() || st.isBlockDevice()) return 'device';
  return 'other';
}

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function readRegularFile(file, cap, opts) {
  const st = opts && opts.noFollow ? fs.lstatSync(file) : fs.statSync(file);
  if (!st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  if (st.size > cap) throw codedError('EFBIG', 'larger than ' + cap + ' bytes: ' + file);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0) | (opts && opts.noFollow ? (fs.constants.O_NOFOLLOW || 0) : 0);
  const fd = fs.openSync(file, flags);
  try {
    if (!fs.fstatSync(fd).isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    const buf = Buffer.alloc(Math.min(cap, Math.max(st.size, 0)) + 1);
    let n = 0;
    for (;;) {
      const got = fs.readSync(fd, buf, n, buf.length - n, null);
      if (!got) break;
      n += got;
      if (n > cap) throw codedError('EFBIG', 'larger than ' + cap + ' bytes: ' + file);
      if (n === buf.length) break;
    }
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

// JSON from a regular file; a parse error is reported without the file's content.
function readJsonRegular(file, cap, opts) {
  let bytes;
  try { bytes = readRegularFile(file, cap, opts); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw codedError('EJSON', 'not valid JSON: ' + file); }
}

// CP-03 R6-S1-M13: the spine reads no file but through readRegularFile (a source lint holds this).
function readText(file, cap) {
  return readRegularFile(file, cap || STATE_READ_CAP).toString('utf8');
}

// null when absent; a parse error is a SyntaxError as before; a FIFO or a device is ENOTREG, never a hang.
function readJsonIfExists(file) {
  let text;
  try {
    text = readText(file, STATE_READ_CAP);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text);
}

function cleanStaleTmp(dir) {
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    if (TMP_PATTERN.test(name)) {
      try { fs.unlinkSync(path.join(dir, name)); removed++; } catch { /* ignore */ }
    }
  }
  return removed;
}

// ---- gate-fingerprint.mjs ----
// Fingerprint and invalidation (resumable test gates, epic F1; PRD-1 D16-D24, CONTRACT §2.2-§2.3, §4.6, §11 A1, A5, A6).
// Builds the rtg-key/1 manifest of a test file. Every unknown input yields key null (the file runs, G-1). Env values never
// leave this module except as salted HMACs (G-6).

const GATE_FP_NODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const GATE_FP_RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
// CONTRACT §4.6 Node pattern, written in two pieces so the spine's raw-read source lint does not flag the literal.
const GATE_FP_WIDE_NODE = 'read' + 'FileSync|readdirSync|glob|execSync|spawnSync|execFileSync|child_process|git ';
const GATE_FP_WIDE_PY = 'open\\(|subprocess|Path\\(|glob|os\\.listdir';
const GATE_FP_WIDE_DIGEST = sha256Bytes('rtg-wide/1\n' + GATE_FP_WIDE_NODE + '\n' + GATE_FP_WIDE_PY + '\n').slice(0, 16);
const GATE_FP_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'uv.lock', 'Pipfile.lock'];
const GATE_FP_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Per-runner descriptor table (D19 config files, D24 selection-only flags dropped from the runner line).
const GATE_FP_RUNNERS = {
  jest: {
    runtime: 'node',
    configs: [/^jest\.config\.(js|ts|cjs|mjs|json)$/, /^package\.json$/, /^babel\.config\.[^/]+$/, /^\.babelrc[^/]*$/, /^\.swcrc$/],
    drop: ['--filter', '--runTestsByPath', '--json', '--outputFile', '--reporters', '--testPathPattern'],
    dropValue: ['--filter', '--outputFile', '--reporters', '--testPathPattern'],
    bool: ['--ci', '--runInBand', '-i', '--silent', '--verbose', '--json', '--runTestsByPath', '--detectOpenHandles', '--forceExit', '--passWithNoTests', '--coverage', '--no-cache', '--watchAll=false'],
  },
  vitest: {
    runtime: 'node',
    configs: [/^vitest\.config\.[^/]+$/, /^vite\.config\.[^/]+$/, /^vitest\.workspace\.[^/]+$/, /^package\.json$/],
    drop: ['--reporter', '--outputFile', '--run'],
    dropValue: ['--reporter', '--outputFile'],
    bool: ['--run', '--silent', '--coverage', '--no-threads', '--passWithNoTests'],
  },
  pytest: {
    runtime: 'python',
    configs: [/^pyproject\.toml$/, /^pytest\.ini$/, /^setup\.cfg$/, /^tox\.ini$/],
    drop: ['--do-it-manifest', '--json-report', '--json-report-file', '-q', '-v'],
    dropValue: ['--do-it-manifest', '--json-report-file'],
    bool: ['-q', '-v', '-x', '-s', '--json-report'],
  },
};

function gateFpLog(opts) {
  return (opts && opts.log) || ((m) => process.stderr.write(m + '\n'));
}

function gateFpGit(repo, args, env) {
  return cp.execFileSync('git', args, {
    cwd: repo, env: { ...(env || process.env), GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function gateFpSplitZ(buf) {
  return buf.toString('utf8').split('\0').filter((s) => s !== '');
}

// == manifest assembly (D16) ==
function gateFpSortLines(lines) {
  return lines.slice().sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

function gateFpLineText(fields) {
  return fields.map(String).join('\t');
}

function gateFpEncodable(fields) {
  return fields.every((f) => typeof f === 'string' && !/[\t\n\r]/.test(f) && f.isWellFormed());
}

// gateKeyAssemble(spineLines, adapterLines): each line is an array of fields. Returns {key, manifest, lines} or
// {key: null, reason: 'path-unencodable'}.
function gateKeyAssemble(spineLines, adapterLines) {
  const all = [...(spineLines || []), ...(adapterLines || [])];
  for (const l of all) if (!Array.isArray(l) || !gateFpEncodable(l.map(String))) return { key: null, reason: 'path-unencodable', manifest: null };
  const texts = gateFpSortLines(all.map(gateFpLineText));
  const manifest = 'rtg-key/1\n' + texts.map((t) => t + '\n').join('');
  return { key: sha256Bytes(Buffer.from(manifest, 'utf8')), manifest, lines: texts };
}

// argv minus selection-only flags, in original order, joined by NUL, hashed (D24, research table #19).
function gateFpRunnerLine(name, version, argv, drop) {
  const d = drop || GATE_FP_RUNNERS[name] || { drop: [], dropValue: [], bool: [] };
  const dropSet = new Set(d.drop || []);
  const dropValue = new Set(d.dropValue || []);
  const bool = new Set(d.bool || []);
  const kept = [];
  const args = argv || [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a.startsWith('-')) {
      const flag = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
      if (dropSet.has(flag)) {
        if (!a.includes('=') && dropValue.has(flag) && i + 1 < args.length && !String(args[i + 1]).startsWith('-')) i++;
        continue;
      }
      kept.push(a);
      continue;
    }
    // positional: a test path when it does not follow a flag that may take a value (unknown flags keep their value)
    const prev = i > 0 ? String(args[i - 1]) : '';
    const prevTakesValue = prev.startsWith('-') && !prev.includes('=') && !bool.has(prev) && !dropSet.has(prev);
    if (!prevTakesValue) continue;
    kept.push(a);
  }
  return ['runner', name + '@' + version, sha256Bytes(Buffer.from(kept.join('\0'), 'utf8'))];
}

function gateFpComponents(lines) {
  const texts = lines.map(gateFpLineText);
  const by = (tag) => lines.filter((l) => l[0] === tag);
  const one = (tag) => { const l = by(tag)[0]; return l ? l : null; };
  const out = {};
  if (one('gate')) out.gate = one('gate')[1];
  if (one('runner')) out.runner = sha256Bytes(gateFpLineText(one('runner')));
  if (one('core')) out.core = one('core')[1];
  if (one('installed')) out.installed = one('installed')[1];
  out.env = sha256Bytes(gateFpSortLines(by('env').map(gateFpLineText)).map((t) => t + '\n').join(''));
  if (one('platform')) out.platform = sha256Bytes(gateFpLineText(one('platform')));
  if (one('class')) out.class = one('class')[1];
  if (one('tree')) out.tree = one('tree')[1];
  out.deps = sha256Bytes(gateFpSortLines(by('dep').map(gateFpLineText)).map((t) => t + '\n').join(''));
  void texts;
  return out;
}

// == file hashing (D18) ==
const gateFpStatCache = new Map();

function gateFpWideBits(rel, bytes) {
  const ext = path.extname(rel).toLowerCase();
  const text = GATE_FP_NODE_EXT.includes(ext) || ext === '.py' ? bytes.toString('utf8') : '';
  const nodeHit = GATE_FP_NODE_EXT.includes(ext) && new RegExp(GATE_FP_WIDE_NODE).test(text);
  const pyHit = ext === '.py' && new RegExp(GATE_FP_WIDE_PY).test(text);
  return [nodeHit ? 1 : 0, pyHit ? 1 : 0];
}

// Hash of the on-disk bytes (through symlinks) with the in-process stat cache. Returns {sha, wide} or {sha: '-'}.
function gateFpHashDisk(abs, rel) {
  let st;
  try { st = fs.statSync(abs, { bigint: true }); } catch { return { sha: '-', wide: [0, 0] }; }
  if (!st.isFile()) return { sha: '-', wide: [0, 0], notFile: true };
  const ck = [st.dev, st.ino, st.size, st.mtimeNs, st.ctimeNs].join(':');
  const hit = gateFpStatCache.get(ck);
  if (hit && hit.rel === rel) return { sha: hit.sha, wide: hit.wide };
  let bytes;
  try { bytes = readRegularFile(abs, BULK_READ_CAP); } catch { return { sha: '-', wide: [0, 0], unreadable: true }; }
  const out = { sha: sha256Bytes(bytes), wide: gateFpWideBits(rel, bytes) };
  gateFpStatCache.set(ck, { ...out, rel });
  return out;
}

function gateFpStatCacheClear() {
  gateFpStatCache.clear();
}

// Repo-relative realpath of a member (D18): symlinks resolved; outside the repository => @outside/{sha256(abs)};
// a missing tail is resolved through its deepest existing ancestor.
function gateFpRealRel(repo, rel) {
  const root = fs.realpathSync(repo);
  const abs = path.resolve(root, rel);
  let base = abs;
  const rest = [];
  let real = null;
  for (;;) {
    try { real = fs.realpathSync(base); break; } catch { /* walk up */ }
    const parent = path.dirname(base);
    if (parent === base) break;
    rest.unshift(path.basename(base));
    base = parent;
  }
  const full = real ? path.join(real, ...rest) : abs;
  const r = path.relative(root, full);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return { rel: '@outside/' + sha256Bytes(full), abs: full, outside: true };
  return { rel: r.split(path.sep).join('/'), abs: full, outside: false };
}

function gateFpHashPath(repo, rel, table) {
  const rr = gateFpRealRel(repo, rel);
  if (!rr.outside && table && table.hashes && Object.prototype.hasOwnProperty.call(table.hashes, rr.rel)) {
    return { path: rr.rel, sha: table.hashes[rr.rel], wide: (table.wide && table.wide[rr.rel]) || [0, 0] };
  }
  const h = gateFpHashDisk(rr.abs, rr.rel);
  return { path: rr.rel, sha: h.sha, wide: h.wide || [0, 0] };
}

function gateFpMemoDisabled(repo, env, tracked) {
  if ((tracked || []).some((p) => p === '.gitattributes' || p.endsWith('/.gitattributes'))) return 'gitattributes';
  try { if (fs.existsSync(path.join(repo, '.gitattributes'))) return 'gitattributes'; } catch { /* ignore */ }
  try {
    const common = gateFpGit(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'], env).toString('utf8').trim();
    if (fs.existsSync(path.join(common, 'info', 'attributes'))) return 'info-attributes';
  } catch { /* ignore */ }
  let autocrlf = '';
  try { autocrlf = gateFpGit(repo, ['config', '--get', 'core.autocrlf'], env).toString('utf8').trim(); } catch { autocrlf = ''; }
  if (autocrlf && autocrlf !== 'false') return 'autocrlf';
  let filters = '';
  try { filters = gateFpGit(repo, ['config', '--get-regexp', '^filter\\.'], env).toString('utf8').trim(); } catch { filters = ''; }
  if (filters) return 'filter';
  return null;
}

function gateFpMemoSample(hits, fault) {
  if (!hits.length) return [];
  if (fault === 'memo_verify_all') return hits.slice();
  const n = Math.max(1, Math.ceil(hits.length / 100));
  const pick = new Set();
  while (pick.size < n) pick.add(hits[crypto.randomInt(hits.length)]);
  return Array.from(pick);
}

// {hashes: {path: sha|-}, wide: {path: [node, py]}, tracked, untracked, dirty, memoHits, memoDisabled, links}
function gateFpHashTable(repo, store, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const log = gateFpLog(o);
  const fault = env.DO_IT_FAULT || '';
  const ls = gateFpSplitZ(gateFpGit(repo, ['ls-files', '-s', '-v', '-z'], env));
  const entries = [];
  for (const rec of ls) {
    const m = /^(\S+) ([0-7]+) ([0-9a-f]+) ([0-9]+)\t([\s\S]*)$/.exec(rec);
    if (!m) continue;
    if (m[4] !== '0' && entries.some((e) => e.path === m[5])) continue;
    entries.push({ tag: m[1], mode: m[2], blob: m[3], path: m[5] });
  }
  const untracked = gateFpSplitZ(gateFpGit(repo, ['ls-files', '-o', '--exclude-standard', '-z'], env));
  const dirty = new Set(gateFpSplitZ(gateFpGit(repo, ['diff-files', '-z', '--name-only'], env)));
  // declared env files are keyed by salted HMAC only (G-6): never plain-hashed into the table, the tree or the memo
  const exclude = new Set(o.exclude || []);
  for (let i = entries.length - 1; i >= 0; i--) if (exclude.has(entries[i].path)) entries.splice(i, 1);
  for (let i = untracked.length - 1; i >= 0; i--) if (exclude.has(untracked[i])) untracked.splice(i, 1);
  const tracked = entries.map((e) => e.path);
  const memoDisabled = store ? gateFpMemoDisabled(repo, env, tracked) : 'no-store';
  const memoFile = store ? path.join(store.dir, 'blobmemo.jsonl') : null;
  let memo = memoDisabled ? new Map() : gateStoreMemoRead(store);
  const hashes = {};
  const wide = {};
  const hits = [];
  const fresh = [];
  const links = {};
  const pd = GATE_FP_WIDE_DIGEST;
  const fromDisk = (e) => {
    const h = gateFpHashDisk(path.join(repo, e.path), e.path);
    hashes[e.path] = h.sha;
    wide[e.path] = h.wide || [0, 0];
    return h;
  };
  for (const e of entries) {
    if (e.mode === '120000') {
      const rr = gateFpRealRel(repo, e.path);
      links[e.path] = rr.rel;
      const h = gateFpHashDisk(rr.abs, rr.rel);
      hashes[e.path] = h.sha;
      wide[e.path] = h.wide || [0, 0];
      continue;
    }
    if (e.mode === '160000') { hashes[e.path] = sha256Bytes('gitlink ' + e.blob); wide[e.path] = [0, 0]; continue; }
    const bypass = /^[a-z]$/.test(e.tag) || e.tag === 'S' || dirty.has(e.path);
    const m = !memoDisabled && !bypass ? memo.get(e.blob) : undefined;
    if (m && m.w && Array.isArray(m.w[pd])) {
      hashes[e.path] = m.s;
      wide[e.path] = m.w[pd];
      hits.push(e);
      continue;
    }
    const h = fromDisk(e);
    if (!memoDisabled && !bypass && h.sha !== '-') fresh.push({ b: e.blob, s: h.sha, w: { [pd]: h.wide } });
  }
  // adversarial verification of memo hits (1%, at least 1; all under DO_IT_FAULT=memo_verify_all)
  const sample = gateFpMemoSample(hits, fault); // MEMO-VERIFY
  let mismatch = false;
  for (const e of sample) {
    const h = gateFpHashDisk(path.join(repo, e.path), e.path);
    if (h.sha !== hashes[e.path]) { mismatch = true; break; }
  }
  let memoHits = hits.length;
  if (mismatch) {
    log('[gate-fingerprint] blob memo mismatch: memo discarded');
    try { fs.renameSync(memoFile, memoFile + '.bad-' + Date.now()); } catch { /* already moved */ }
    memo = new Map();
    for (const e of hits) {
      const h = fromDisk(e);
      if (h.sha !== '-') fresh.push({ b: e.blob, s: h.sha, w: { [pd]: h.wide } });
    }
    memoHits = 0;
  }
  if (!memoDisabled && fresh.length) { try { gateStoreMemoAppend(store, fresh); } catch { /* memo is an optimisation */ } }
  for (const rel of untracked) {
    const h = gateFpHashDisk(path.join(repo, rel), rel);
    hashes[rel] = h.sha;
    wide[rel] = h.wide || [0, 0];
  }
  return { hashes, wide, tracked, untracked, dirty: Array.from(dirty).sort(), memoHits, memoDisabled, links };
}

function gateFpTree(table) {
  const lines = Object.keys(table.hashes).map((p) => 't\t' + p + '\t' + table.hashes[p]);
  return sha256Bytes('rtg-tree/1\n' + gateFpSortLines(lines).map((l) => l + '\n').join(''));
}

// == globs and the NEVER set (D23) ==
function gateGlobRe(pattern) {
  const p = String(pattern);
  const conv = (s, allowBrace) => {
    let re = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '*') {
        if (s[i + 1] === '*') {
          i++;
          if (s[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
        } else re += '[^/]*';
      } else if (c === '?') re += '[^/]';
      else if (c === '[') {
        const j = s.indexOf(']', i + 2);
        if (j < 0) throw new Error('unclosed [');
        let body = s.slice(i + 1, j);
        if (body.startsWith('!')) body = '^' + body.slice(1);
        re += '[' + body.replace(/\\/g, '\\\\') + ']';
        i = j;
      } else if (c === '{') {
        if (!allowBrace) throw new Error('nested {');
        const j = s.indexOf('}', i + 1);
        if (j < 0) throw new Error('unclosed {');
        const body = s.slice(i + 1, j);
        if (body.includes('{')) throw new Error('nested {');
        re += '(?:' + body.split(',').map((alt) => conv(alt, false)).join('|') + ')';
        i = j;
      } else if (c === ']' || c === '}') {
        throw new Error('unbalanced ' + c);
      } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
    }
    return re;
  };
  return new RegExp('^' + conv(p.replace(/^\.?\//, ''), true) + '$');
}

function gateGlobMatch(file, pattern, compiled) {
  const re = compiled || gateGlobRe(pattern);
  const target = String(pattern).includes('/') ? file : file.split('/').pop();
  return re.test(target);
}

// {match(file) => {never, pattern}, invalid: [patterns]}; an unparsable pattern makes every file NEVER, printed once.
function gateNeverCompile(globs, opts) {
  const log = gateFpLog(opts);
  const list = [];
  const invalid = [];
  for (const g of globs || []) {
    try { list.push({ pattern: g, re: gateGlobRe(g) }); } catch { invalid.push(g); }
  }
  for (const g of invalid) log('[gate-fingerprint] invalid reuse glob: ' + g);
  return {
    invalid,
    match(file) {
      if (invalid.length) return { never: true, pattern: invalid[0] };
      for (const x of list) if (gateGlobMatch(file, x.pattern, x.re)) return { never: true, pattern: x.pattern };
      return { never: false, pattern: null };
    },
  };
}

function gateNeverMatch(file, globs, opts) {
  return gateNeverCompile(globs, opts).match(file);
}

// NEVER precedence lives here only (G-16): V1 must call this for every file.
function gateReuseDecision(input) {
  const fold = (input && input.fold) || {};
  const never = input && input.never;
  if (never && never.never) return { reuse: false, reason: 'never-set', pattern: never.pattern };
  return { reuse: fold.reuse || false, reason: fold.reason || 'no-row', pattern: null };
}

// == CORE sub-manifest (D19) ==
function gateFpTsPaths(repo) {
  try {
    const raw = readRegularFile(path.join(repo, 'tsconfig.json'), 1024 * 1024).toString('utf8');
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
    const j = JSON.parse(stripped);
    const co = (j && j.compilerOptions) || {};
    return { baseUrl: co.baseUrl || null, paths: co.paths || {} };
  } catch {
    return { baseUrl: null, paths: {} };
  }
}

function gateFpIsFile(abs) {
  try { return fs.statSync(abs).isFile(); } catch { return false; }
}

function gateFpResolveFile(repo, relBase) {
  const abs = path.join(repo, relBase);
  if (gateFpIsFile(abs)) return relBase;
  for (const ext of GATE_FP_RESOLVE_EXT) if (gateFpIsFile(abs + ext)) return relBase + ext;
  for (const ext of GATE_FP_RESOLVE_EXT) if (gateFpIsFile(path.join(abs, 'index' + ext))) return relBase + '/index' + ext;
  return null;
}

// resolve a specifier from a repo-relative directory: {rel} | {unresolved: true} | {pkg: true}
function gateFpResolveSpec(repo, fromDir, spec, ts) {
  const norm = (p) => path.posix.normalize(p);
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const rel = norm(path.posix.join(fromDir || '.', spec));
    if (rel.startsWith('..')) return { unresolved: true };
    const r = gateFpResolveFile(repo, rel);
    return r ? { rel: r } : { unresolved: true };
  }
  if (spec.startsWith('/')) return { unresolved: true };
  const tsc = ts || { baseUrl: null, paths: {} };
  for (const [pat, targets] of Object.entries(tsc.paths || {})) {
    const star = pat.indexOf('*');
    let tail = null;
    if (star < 0) { if (spec === pat) tail = ''; } else if (spec.startsWith(pat.slice(0, star)) && spec.endsWith(pat.slice(star + 1))) {
      tail = spec.slice(star, spec.length - (pat.length - star - 1));
    }
    if (tail === null) continue;
    for (const t of Array.isArray(targets) ? targets : []) {
      const rel = norm(path.posix.join(tsc.baseUrl || '.', String(t).replace('*', tail)));
      const r = rel.startsWith('..') ? null : gateFpResolveFile(repo, rel);
      if (r) return { rel: r };
    }
    return { unresolved: true };
  }
  if (tsc.baseUrl) {
    const rel = norm(path.posix.join(tsc.baseUrl, spec));
    const r = rel.startsWith('..') ? null : gateFpResolveFile(repo, rel);
    if (r && !r.startsWith('node_modules/')) return { rel: r };
  }
  return { pkg: true };
}

function gateFpSpecifiers(text) {
  const out = [];
  const res = [
    /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+)?from\s+['"]([^'"\n]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const re of res) { let m; while ((m = re.exec(text))) out.push(m[1]); }
  return Array.from(new Set(out));
}

function gateFpLiterals(text) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    if (m[2].includes('\\')) continue;
    out.push(m[2]);
  }
  return out;
}

// gateFpCore(repo, runner, table, {reuseCore, gateDigest, env}) => {lines, text, digest, wideAll, unresolved}
function gateFpCore(repo, runner, table, opts) {
  const o = opts || {};
  const desc = GATE_FP_RUNNERS[runner] || { configs: [] };
  const ts = gateFpTsPaths(repo);
  const all = Object.keys(table.hashes);
  const members = new Map();
  const unresolved = [];
  let wideAll = false;
  const addMember = (rel) => {
    if (members.has(rel)) return false;
    const h = gateFpHashPath(repo, rel, table);
    members.set(h.path, h.sha);
    return true;
  };
  const configs = all.filter((p) => !p.includes('/') && desc.configs.some((re) => re.test(p))).sort();
  const queue = [];
  for (const cfg of configs) {
    addMember(cfg);
    let text = '';
    try { text = readRegularFile(path.join(repo, cfg), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    if (runner === 'vitest' && /forceRerunTriggers/.test(text)) {
      const fm = /forceRerunTriggers\s*:\s*\[([^\]]*)\]/.exec(text);
      const body = fm ? fm[1].trim() : null;
      if (body === null || !/^(\s*(['"])[^'"\n]*\2\s*,?)*\s*$/.test(body)) wideAll = true;
      else for (const lit of gateFpLiterals(body)) {
        let re = null;
        try { re = gateGlobRe(lit.replace(/^\*\*\//, '**/')); } catch { wideAll = true; continue; }
        for (const p of all) if (gateGlobMatch(p, lit, re)) addMember(p);
      }
    }
    for (const lit0 of gateFpLiterals(text)) {
      let lit = lit0;
      if (lit.startsWith('<rootDir>')) lit = '.' + lit.slice('<rootDir>'.length);
      if (!(lit.startsWith('./') || lit.startsWith('../'))) continue;
      if (/[*?$^|()[\]{}]/.test(lit)) continue;
      const r = gateFpResolveSpec(repo, path.posix.dirname(cfg), lit, ts);
      if (r.rel) { if (addMember(r.rel)) queue.push(r.rel); continue; }
      const ext = path.posix.extname(lit).toLowerCase();
      if (GATE_FP_RESOLVE_EXT.includes(ext) || ext === '.py') unresolved.push([cfg, lit0]);
    }
  }
  // static closure of config-referenced modules
  const seen = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!GATE_FP_NODE_EXT.includes(path.posix.extname(rel).toLowerCase())) continue;
    if (rel.startsWith('node_modules/') || rel.includes('/node_modules/')) continue;
    let text = '';
    try { text = readRegularFile(path.join(repo, rel), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    for (const spec of gateFpSpecifiers(text)) {
      const r = gateFpResolveSpec(repo, path.posix.dirname(rel), spec, ts);
      if (r.pkg) continue;
      if (r.unresolved) { unresolved.push([rel, spec]); continue; }
      if (r.rel.startsWith('node_modules/') || r.rel.includes('/node_modules/')) continue;
      if (addMember(r.rel)) queue.push(r.rel);
    }
  }
  for (const p of all) {
    const base = p.split('/').pop();
    if (/^tsconfig.*\.json$/.test(base) || base === 'conftest.py' || p.split('/').slice(0, -1).includes('__mocks__')) addMember(p);
  }
  // gates.reuse.core globs: the hash table plus a direct walk under each literal prefix (reaches ignored files)
  for (const g of o.reuseCore || []) {
    let re;
    try { re = gateGlobRe(g); } catch { wideAll = true; continue; }
    for (const p of all) if (gateGlobMatch(p, g, re)) addMember(p);
    const segs = String(g).replace(/^\.?\//, '').split('/');
    const literalDir = [];
    for (let i = 0; i < segs.length - 1; i++) { if (/[*?[{]/.test(segs[i])) break; literalDir.push(segs[i]); }
    const start = path.join(repo, ...literalDir);
    const walk = (dir, depth) => {
      if (depth > 32) return;
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const abs = path.join(dir, e.name);
        const rel = path.relative(repo, abs).split(path.sep).join('/');
        if (e.isDirectory()) walk(abs, depth + 1);
        else if (gateGlobMatch(rel, g, re)) addMember(rel);
      }
    };
    if (literalDir.length) walk(start, 0);
  }
  if (unresolved.length) wideAll = true;
  const lines = [];
  for (const [p, s] of members) lines.push(['c', p, s]);
  for (const [from, lit] of unresolved) lines.push(['c-unresolved', from, lit]);
  if (o.gateDigest) lines.push(['c-gate', o.gateDigest]);
  const okLines = lines.filter((l) => gateFpEncodable(l));
  if (okLines.length !== lines.length) wideAll = true;
  const text = 'rtg-core/1\n' + gateFpSortLines(okLines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines: okLines, text, digest: sha256Bytes(text), wideAll, unresolved };
}

// == installed, env, platform (D20) ==
const GATE_FP_PY_PROBE = [
  'import hashlib, os, site, sys, sysconfig',
  'from importlib import metadata',
  'out = set()',
  'for d in metadata.distributions():',
  '    n = d.metadata.get("Name")',
  '    v = d.version',
  '    if n and v and "\\t" not in n + v and "\\n" not in n + v:',
  '        out.add("py\\t%s==%s" % (n, v))',
  'dirs = set()',
  'for k in ("purelib", "platlib"):',
  '    p = sysconfig.get_paths().get(k)',
  '    if p: dirs.add(p)',
  'try:',
  '    dirs.update(site.getsitepackages())',
  'except Exception:',
  '    pass',
  'for d in sorted(dirs):',
  '    try:',
  '        names = sorted(os.listdir(d))',
  '    except OSError:',
  '        continue',
  '    for f in names:',
  '        if f.endswith(".pth"):',
  '            with open(os.path.join(d, f), "rb") as fh:',
  '                out.add("pth\\t%s\\t%s" % (f, hashlib.sha256(fh.read()).hexdigest()))',
  'sys.stdout.write("\\n".join(sorted(out)) + "\\n")',
].join('\n');

function gateFpPython(repo, opts) {
  const o = opts || {};
  if (o.python) return o.python;
  const argv0 = o.argv && o.argv[0] ? String(o.argv[0]) : '';
  if (/(^|\/)python[0-9.]*$/.test(argv0)) return argv0;
  const venv = path.join(repo, '.venv', 'bin', 'python');
  if (gateFpIsFile(venv)) return venv;
  return 'python3';
}

function gateFpPyProbe(python, env) {
  const r = cp.spawnSync(python, ['-I', '-c', GATE_FP_PY_PROBE], { env: env || process.env, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 });
  if (r.error || r.status !== 0) return null;
  const lines = r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (!lines.every((l) => (l[0] === 'py' && l.length === 2 && /^[^\t]+==[^\t]+$/.test(l[1])) || (l[0] === 'pth' && l.length === 3))) return null;
  return lines;
}

// gateFpInstalled(repo, runner, {env, python, argv}) => {lines, text, digest} | {unknown: true, reason: 'installed-unknown'}
function gateFpInstalled(repo, runner, opts) {
  const o = opts || {};
  const lines = [];
  const rootFiles = (() => { try { return fs.readdirSync(repo); } catch { return []; } })();
  for (const name of rootFiles.slice().sort()) {
    if (GATE_FP_LOCKS.includes(name) || /^requirements.*\.txt$/.test(name)) {
      const h = gateFpHashDisk(path.join(repo, name), name);
      if (!h.notFile) lines.push(['lock', name, h.sha]);
    }
  }
  const nmDirs = ['node_modules'];
  try {
    for (const p of fs.readdirSync(path.join(repo, 'packages')).sort()) {
      if (fs.existsSync(path.join(repo, 'packages', p, 'node_modules'))) nmDirs.push('packages/' + p + '/node_modules');
    }
  } catch { /* no packages/ */ }
  for (const d of nmDirs) {
    const rel = d + '/.package-lock.json';
    lines.push(['node-installed', rel, gateFpHashDisk(path.join(repo, rel), rel).sha]);
  }
  const nm = path.join(repo, 'node_modules');
  const linkLine = (relName) => {
    const rr = gateFpRealRel(repo, 'node_modules/' + relName);
    lines.push(['link', 'node_modules/' + relName, rr.rel]);
  };
  let top = [];
  try { top = fs.readdirSync(nm, { withFileTypes: true }); } catch { top = []; }
  for (const e of top.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isSymbolicLink()) { linkLine(e.name); continue; }
    if (e.isDirectory() && e.name.startsWith('@')) {
      let sub = [];
      try { sub = fs.readdirSync(path.join(nm, e.name), { withFileTypes: true }); } catch { sub = []; }
      for (const s of sub.sort((a, b) => (a.name < b.name ? -1 : 1))) if (s.isSymbolicLink()) linkLine(e.name + '/' + s.name);
    }
  }
  if (runner === 'pytest') {
    const py = gateFpPyProbe(gateFpPython(repo, o), o.env);
    if (!py) return { unknown: true, reason: 'installed-unknown', lines: null, text: null, digest: null };
    for (const l of py) lines.push(l);
  }
  const okLines = lines.filter((l) => gateFpEncodable(l));
  if (okLines.length !== lines.length) return { unknown: true, reason: 'installed-unknown', lines: null, text: null, digest: null };
  const text = 'rtg-installed/1\n' + gateFpSortLines(okLines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines: okLines, text, digest: sha256Bytes(text) };
}

function gateFpHmac(salt, bytes) {
  return crypto.createHmac('sha256', salt).update(bytes).digest('hex');
}

// gateFpEnv({repo, names, files, env, salt}) => {lines, text, digest, unhashable}
function gateFpEnv(input) {
  const { repo, salt } = input;
  const env = input.env || {};
  const lines = [];
  let unhashable = false;
  for (const name of input.names || []) {
    const n = String(name);
    if (!GATE_FP_ENV_NAME.test(n)) { lines.push(['env', gateFpEncodable([n]) ? n : sha256Bytes(n).slice(0, 16), '*']); unhashable = true; continue; }
    const v = env[n];
    lines.push(['env', n, v === undefined ? '-' : gateFpHmac(salt, Buffer.from(String(v), 'utf8'))]);
  }
  for (const f of input.files || []) {
    const rel = String(f);
    if (!gateFpEncodable([rel]) || path.isAbsolute(rel) || rel.split('/').includes('..')) { lines.push(['env', 'file:' + sha256Bytes(rel).slice(0, 16), '*']); unhashable = true; continue; }
    let tok;
    try {
      tok = gateFpHmac(salt, readRegularFile(path.join(repo, rel), 16 * 1024 * 1024));
    } catch (e) {
      tok = e && e.code === 'ENOENT' ? '-' : '*';
    }
    if (tok === '*') unhashable = true;
    lines.push(['env', 'file:' + rel, tok]);
  }
  const text = gateFpSortLines(lines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines, text, digest: sha256Bytes(text), unhashable };
}

// {NAME: value} for every declared name that is set and every KEY=VALUE of every declared env file (D8 redaction set).
function gateFpRedactValues(input) {
  const out = {};
  const env = input.env || {};
  for (const n of input.names || []) if (typeof env[n] === 'string') out[n] = env[n];
  for (const f of input.files || []) {
    let text = '';
    try { text = readRegularFile(path.join(input.repo, String(f)), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) out[m[1]] = v;
    }
  }
  return out;
}

const GATE_FP_NODE_PROBE = "const os=require('os');process.stdout.write(JSON.stringify(['node',process.version,String(process.versions.icu||'-'),os.platform(),os.release(),os.arch(),String(os.cpus().length)]))";
const GATE_FP_PY_PLATFORM = 'import json, os, platform, sys; sys.stdout.write(json.dumps(["python", platform.python_version(), "-", sys.platform, platform.release(), platform.machine(), str(os.cpu_count() or 0)]))';

// gateFpPlatform({runtime: 'node'|'python', bin, env}) => ['platform', 7 fields] or null (probe failed)
function gateFpPlatform(input) {
  const o = input || {};
  const runtime = o.runtime || 'node';
  const bin = o.bin || (runtime === 'node' ? 'node' : 'python3');
  const args = runtime === 'node' ? ['-e', GATE_FP_NODE_PROBE] : ['-I', '-c', GATE_FP_PY_PLATFORM];
  const r = cp.spawnSync(bin, args, { env: o.env || process.env, encoding: 'utf8', timeout: 60000 });
  if (r.error || r.status !== 0) return null;
  let f;
  try { f = JSON.parse(r.stdout); } catch { return null; }
  if (!Array.isArray(f) || f.length !== 7 || !f.every((x) => typeof x === 'string' && x.length && !/[\t\n\r]/.test(x))) return null;
  return ['platform', ...f];
}

// == gate component (D21) ==
function gateFpBundleSection(text, name) {
  const marker = '// ---- ' + name + ' ----\n';
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const j = text.indexOf('\n// ---- ', i + marker.length);
  return text.slice(i, j < 0 ? text.length : j);
}

function gateFpFilesUnder(dir) {
  const out = [];
  const go = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) go(path.join(d, e.name), r); else out.push(r);
    }
  };
  go(dir, '');
  return out.sort();
}

// gateFpGateDigest(runner, {bundle, adaptersDir}) => {digest, text}
function gateFpGateDigest(runner, opts) {
  const o = opts || {};
  const self = fileURLToPath(import.meta.url);
  const bundled = typeof EMBEDDED_SCHEMAS !== 'undefined';
  const bundle = o.bundle || (bundled ? self : null);
  const lines = [];
  const adaptersRoot = o.adaptersDir || (bundle ? path.join(path.dirname(bundle), '..', 'gates', 'adapters') : path.join(path.dirname(self), '..', '..', 'gates', 'adapters'));
  const adir = path.join(adaptersRoot, runner);
  for (const rel of gateFpFilesUnder(adir)) {
    let bytes;
    try { bytes = readRegularFile(path.join(adir, rel), BULK_READ_CAP); } catch { bytes = Buffer.from('-'); }
    lines.push('adapter:' + rel + '\t' + sha256Bytes(bytes));
  }
  if (bundle) {
    const text = readRegularFile(bundle, BULK_READ_CAP).toString('utf8');
    const a = gateFpBundleSection(text, 'gate-results.mjs');
    const b = gateFpBundleSection(text, 'gate-fingerprint.mjs');
    if (a === null || b === null) lines.push('bundle\t' + sha256Bytes(text));
    else { lines.push('section:gate-results.mjs\t' + sha256Bytes(a)); lines.push('section:gate-fingerprint.mjs\t' + sha256Bytes(b)); }
    const m = /^const EMBEDDED_SCHEMAS = (.*);$/m.exec(text);
    let schema = null;
    try { schema = m ? JSON.parse(m[1])['gate-result.1.schema.json'] : null; } catch { schema = null; }
    lines.push('schema:gate-result.1.schema.json\t' + sha256Bytes(schema ? canonicalJson(schema) : '-'));
  } else {
    const dir = path.dirname(self);
    for (const n of ['gate-results.mjs', 'gate-fingerprint.mjs']) {
      lines.push('source:' + n + '\t' + sha256Bytes(readRegularFile(path.join(dir, n), BULK_READ_CAP)));
    }
    lines.push('schema:gate-result.1.schema.json\t' + sha256Bytes(canonicalJson(loadSchemaFile('gate-result.1.schema.json'))));
  }
  const text = 'rtg-gate/1\n' + gateFpSortLines(lines).map((l) => l + '\n').join('');
  return { digest: sha256Bytes(text), text };
}

// == class (D22) ==
function gateClassify(input) {
  const o = input || {};
  if (o.wideAll || (o.unresolved || 0) > 0) return 'WIDE';
  for (const m of o.members || []) if (o.wideHits && o.wideHits.has(m)) return 'WIDE';
  return 'NARROW';
}

// == spine components for one runner (D16-D23) ==
// gateFpSpine({repo, runner, store, env, reuse: {core, env, env_files, always_run, never_reuse}, python, nodeBin,
//   bundle, adaptersDir, argv, log}) => spine (pass to gateKeyFor). spine.reason is set when a component is unknown.
function gateFpSpine(opts) {
  try {
    return gateFpSpineBuild(opts);
  } catch (e) {
    // a resolver or probe crash is an unknown component: every key is null and every file runs (G-1, CONTRACT §6)
    return { reason: 'fingerprint-error', error: (e && (e.outcome || e.code || e.message)) || 'error', lines: [], runner: opts && opts.runner };
  }
}

function gateFpSpineBuild(opts) {
  const o = opts || {};
  const repo = fs.realpathSync(o.repo);
  const env = o.env || process.env;
  const runner = o.runner;
  const reuse = o.reuse || {};
  const desc = GATE_FP_RUNNERS[runner] || { runtime: 'node' };
  const log = gateFpLog(o);
  const table = gateFpHashTable(repo, o.store || null, { env, log, exclude: (reuse.env_files || []).map(String) });
  const gate = gateFpGateDigest(runner, { bundle: o.bundle, adaptersDir: o.adaptersDir });
  const core = gateFpCore(repo, runner, table, { reuseCore: reuse.core || [], gateDigest: gate.digest, env });
  const installed = gateFpInstalled(repo, runner, { env, python: o.python, argv: o.argv });
  const salt = o.store ? gateStoreSalt(o.store, { log }) : crypto.randomBytes(32);
  const envc = gateFpEnv({ repo, names: reuse.env || [], files: reuse.env_files || [], env, salt });
  const platform = gateFpPlatform({ runtime: desc.runtime, bin: desc.runtime === 'node' ? o.nodeBin : gateFpPython(repo, o), env });
  const wideHits = new Set();
  for (const [p, w] of Object.entries(table.wide)) if (w && (w[0] || w[1])) wideHits.add(p);
  let reason = null;
  if (installed.unknown) reason = 'installed-unknown';
  else if (!platform) reason = 'platform-unknown';
  else if (envc.unhashable) reason = 'env-unhashable';
  const lines = [['gate', gate.digest], ['core', core.digest], ...envc.lines];
  if (!installed.unknown) lines.push(['installed', installed.digest]);
  if (platform) lines.push(platform);
  const spine = {
    repo, runner, reason, table, wideHits, wideAll: core.wideAll, tree: gateFpTree(table), lines,
    gate, core, installed, env: envc, platform, never: gateNeverCompile([...(reuse.always_run || []), ...(reuse.never_reuse || [])], { log }),
    envFileTokens: new Map(envc.lines.filter((l) => l[1].startsWith('file:')).map((l) => [l[1].slice(5), l[2]])),
    neverGlobs: [...(reuse.always_run || []), ...(reuse.never_reuse || [])], envNames: reuse.env || [], envFiles: reuse.env_files || [],
  };
  return spine;
}

// gateKeyFor(spine, {file, runner: {name, version, argv}, deps: [path | [path, sha]], unresolved, wide})
//   => {key, components, manifest, lines, reason}
function gateKeyFor(spine, entry) {
  if (!spine || spine.reason) return { key: null, reason: (spine && spine.reason) || 'no-spine', components: null };
  const e = entry || {};
  const file = String(e.file || '');
  if (!file || !gateFpEncodable([file])) return { key: null, reason: 'path-unencodable', components: null };
  const r = e.runner || {};
  const runnerLine = gateFpRunnerLine(r.name || spine.runner, r.version || '-', r.argv || []);
  const depLines = new Map();
  const members = [];
  let wideMember = false;
  for (const d of [file, ...(e.deps || [])]) {
    if (Array.isArray(d)) {
      depLines.set(String(d[0]), ['dep', String(d[0]), String(d[1])]);
      members.push(String(d[0]));
      continue;
    }
    const h = gateFpHashPath(spine.repo, String(d), spine.table);
    if (spine.envFileTokens && spine.envFileTokens.has(h.path)) {
      // a declared env file in a closure is keyed by its HMAC token, never by a plain SHA-256 of its bytes (G-6)
      const tok = spine.envFileTokens.get(h.path);
      if (tok === '*') return { key: null, reason: 'env-unhashable', components: null };
      depLines.set(h.path, ['dep', h.path, tok]);
      members.push(h.path);
      continue;
    }
    depLines.set(h.path, ['dep', h.path, h.sha]);
    members.push(h.path);
    if (h.wide && (h.wide[0] || h.wide[1])) wideMember = true;
  }
  const cls = wideMember || e.wide ? 'WIDE' : gateClassify({ members, unresolved: e.unresolved || 0, wideHits: spine.wideHits, wideAll: spine.wideAll });
  const adapterLines = [runnerLine, ['class', cls], ...(cls === 'WIDE' ? [['tree', spine.tree]] : []), ...depLines.values()];
  const spineLines = spine.lines.filter((l) => l[0] !== 'core');
  spineLines.push(['core', spine.core.digest]); // CORE-LINE
  const a = gateKeyAssemble(spineLines, adapterLines);
  if (!a.key) return { key: null, reason: a.reason, components: null };
  const all = [...spineLines, ...adapterLines];
  return { key: a.key, components: gateFpComponents(all), manifest: a.manifest, lines: a.lines, class: cls, reason: null };
}

// == components files, run manifest, --why (D17, D24) ==
function gateFpComponentsWrite(store, spine) {
  if (!store || !store.dir || !spine) return [];
  const out = [];
  for (const text of [spine.gate && spine.gate.text, spine.core && spine.core.text, spine.installed && spine.installed.text, spine.env && spine.env.text]) {
    if (typeof text !== 'string') continue;
    const sha = sha256Bytes(text);
    writeFileOnce(path.join(store.dir, 'components', sha + '.txt'), Buffer.from(text, 'utf8'), 0o644);
    out.push(sha);
  }
  return out;
}

function gateFpComponentText(store, digest) {
  if (!store || !store.dir || !/^[0-9a-f]{64}$/.test(String(digest || ''))) return null;
  try { return readRegularFile(path.join(store.dir, 'components', digest + '.txt'), 16 * 1024 * 1024).toString('utf8'); } catch { return null; }
}

function gateFpLineMap(text, tag) {
  const m = new Map();
  for (const l of String(text || '').split('\n')) {
    const f = l.split('\t');
    if (f[0] === tag && f.length >= 3) m.set(f[1], f.slice(2).join('\t'));
  }
  return m;
}

// gateWhy(prev, now, {store, nowText: {core, env}}) => lines like "invalidated: core (c jest.config.js changed)".
// Env lines name the variable, never a value or an HMAC. A class change subsumes the deps and tree lines it implies.
function gateWhy(prev, now, opts) {
  const o = opts || {};
  const p = prev || {};
  const n = now || {};
  const order = ['gate', 'runner', 'core', 'installed', 'env', 'platform', 'class', 'tree', 'deps'];
  const val = (x, k) => (x[k] === undefined ? null : x[k]);
  const differs = (k) => val(p, k) !== val(n, k);
  const out = [];
  for (const k of order) {
    if (!differs(k)) continue;
    if ((k === 'deps' || k === 'tree') && differs('class')) continue;
    if (k === 'core') {
      const a = gateFpComponentText(o.store, p.core);
      const b = (o.nowText && o.nowText.core) || gateFpComponentText(o.store, n.core);
      if (a && b) {
        const ma = gateFpLineMap(a, 'c');
        const mb = gateFpLineMap(b, 'c');
        const det = [];
        for (const [path0, s] of mb) { if (!ma.has(path0)) det.push('c ' + path0 + ' added'); else if (ma.get(path0) !== s) det.push('c ' + path0 + ' changed'); }
        for (const path0 of ma.keys()) if (!mb.has(path0)) det.push('c ' + path0 + ' removed');
        if (gateFpLineMap(a, 'c-unresolved').size !== gateFpLineMap(b, 'c-unresolved').size) det.push('unresolved CORE references changed');
        if (!det.length && a !== b) det.push('gate code changed');
        out.push('invalidated: core' + (det.length ? ' (' + det.sort().join(', ') + ')' : ''));
      } else out.push('invalidated: core');
      continue;
    }
    if (k === 'env') {
      const a = gateFpComponentText(o.store, p.env);
      const b = (o.nowText && o.nowText.env) || gateFpComponentText(o.store, n.env);
      if (a !== null && b !== null) {
        const ma = gateFpLineMap(a, 'env');
        const mb = gateFpLineMap(b, 'env');
        const names = new Set();
        for (const [nm, t] of mb) if (ma.get(nm) !== t) names.add(nm);
        for (const nm of ma.keys()) if (!mb.has(nm)) names.add(nm);
        out.push('invalidated: env' + (names.size ? ' (' + Array.from(names).sort().join(', ') + ')' : ''));
      } else out.push('invalidated: env');
      continue;
    }
    if (k === 'class') { out.push('invalidated: class (' + (val(p, 'class') || '-') + ' to ' + (val(n, 'class') || '-') + ')'); continue; }
    out.push('invalidated: ' + k);
  }
  return out;
}

function gateFpRunDir(runId) {
  return path.join(os.tmpdir(), 'do-it-gate-' + runId);
}

// The rtg-manifest/1 object for adapters (names, paths, digests and HMACs only; no value, G-6).
function gateFpManifestBuild(spine, run) {
  const r = run || {};
  const wideHits = Array.from(spine.wideHits || []).sort();
  return {
    schema: 'rtg-manifest/1',
    run_id: r.run_id,
    scope: r.scope || 'push',
    leg: r.leg || 'unit',
    clean: !!r.clean,
    runner: spine.runner,
    lines: gateFpSortLines(spine.lines.map(gateFpLineText)),
    argv_sha: sha256Bytes(Buffer.from((r.argv || []).join('\0'), 'utf8')),
    components: { gate: spine.gate.digest, core: spine.core.digest, installed: spine.installed.digest || null, env: spine.env.digest, platform: spine.platform ? sha256Bytes(gateFpLineText(spine.platform)) : null },
    hashes: spine.table.hashes,
    wide_patterns: { node: GATE_FP_WIDE_NODE, python: GATE_FP_WIDE_PY },
    wide_hits: wideHits,
    wide_all: !!spine.wideAll,
    tree: spine.tree,
    dirty: spine.table.dirty,
    never: spine.neverGlobs || [],
    env_names: spine.envNames || [],
    env_files: spine.envFiles || [],
    platform_expect: spine.platform ? spine.platform.slice(1) : null,
    store_dir: r.store_dir || null,
    reason: spine.reason || null,
  };
}

function gateFpManifestWrite(runDir, manifest) {
  const errors = validateSchema(loadSchemaFile('gate-manifest.1.schema.json'), manifest);
  if (errors.length) throw fail('GATE_MANIFEST_INVALID', 1, { errors: errors.map((e) => e.pointer + ' ' + e.message) });
  const file = path.join(runDir, 'manifest.json');
  atomicWriteJson(file, manifest, { cap: BULK_READ_CAP });
  return file;
}

// ---- gate-queue.mjs ----
// Per-machine gate admission (CONTRACT §2.5, §3, §4.3–§4.5, §8 M3; PRD-4 D1–D15). Q1: admission half.
// Files under {HOME}/.do-it/queue/: .lock/ (owner.json), seq, tickets/, holders/, corrupt/.
// Every top-level name starts with gateQueue (bundle unique-name rule, G-15).
//
// Concurrency model:
// - The lock is a directory renamed into place already holding owner.json, so `.lock/` never exists without an
//   owner; it is held only for synchronous read-modify-write (seq + ticket write, admission rename).
// - Liveness (pid + start time) is judged OUTSIDE the lock: "dead" and "start time differs" are permanent for a
//   given file, so a reclaim decided early stays right; removal is one unlink (exactly one remover wins and prints).
// - Release is one unlink of the caller's own holder file: it only lowers held memory, so it needs no lock.

const gateQueuePollMs = 2000;
const gateQueueReprintMs = 60000;
const gateQueueDefaults = { budget_pct: 60, timeout_s: 14400, swap_used_max_mb: null };
const gateQueueEntryCap = 64 * 1024;
const gateQueueNameRe = /^(\d{10})-(\d+)\.json$/;

function gateQueueRoot(ctx) {
  return path.join(ctx.userHome, '.do-it', 'queue');
}

function gateQueueName(seq, pid) {
  return String(seq).padStart(10, '0') + '-' + pid + '.json';
}

function gateQueueErrWriter(ctx) {
  if (ctx && typeof ctx.stderrWrite === 'function') return (line) => ctx.stderrWrite(line + '\n');
  return (line) => process.stderr.write(line + '\n');
}

// ---- settings (Q1-07, PRD-4 D14): global layer only, never the workspace file ----

function gateQueueSettings(ctx) {
  const file = settingsPaths(ctx).global;
  let doc = null;
  try { doc = readJsonRegular(file, gateQueueEntryCap * 16); } catch (e) {
    throw fail('QUEUE_SETTINGS_INVALID', 1, { file, message: 'global settings unreadable: ' + (e.code || 'error') });
  }
  const q = doc && doc.gates && doc.gates.queue;
  const out = { ...gateQueueDefaults };
  if (q == null) return out;
  if (typeof q !== 'object' || Array.isArray(q)) throw fail('QUEUE_SETTINGS_INVALID', 1, { file, key: 'gates.queue', message: 'gates.queue must be an object' });
  const bad = (key, rule, v) => fail('QUEUE_SETTINGS_INVALID', 1, { file, key: 'gates.queue.' + key, message: 'gates.queue.' + key + ' must be ' + rule + ' (got ' + JSON.stringify(v) + ')' });
  if (q.budget_pct != null) {
    if (!Number.isInteger(q.budget_pct) || q.budget_pct < 1 || q.budget_pct > 90) throw bad('budget_pct', 'an integer 1-90', q.budget_pct);
    out.budget_pct = q.budget_pct;
  }
  if (q.timeout_s != null) {
    if (!Number.isInteger(q.timeout_s) || q.timeout_s < 1) throw bad('timeout_s', 'an integer >= 1', q.timeout_s);
    out.timeout_s = q.timeout_s;
  }
  if (q.swap_used_max_mb != null) {
    if (!Number.isInteger(q.swap_used_max_mb) || q.swap_used_max_mb < 1) throw bad('swap_used_max_mb', 'an integer >= 1 or null', q.swap_used_max_mb);
    out.swap_used_max_mb = q.swap_used_max_mb;
  }
  return out;
}

function gateQueueBudgetMb(budgetPct, totalMb) {
  return Math.floor((budgetPct / 100) * totalMb);
}

// ---- entries ----

function gateQueueReadEntry(file, name) {
  let v;
  try { v = readJsonRegular(file, gateQueueEntryCap); } catch (e) {
    if (e.code === 'ENOENT') return { gone: true };
    return { corrupt: true };
  }
  if (v === null) return { gone: true };
  const m = gateQueueNameRe.exec(name);
  if (!v || typeof v !== 'object' || !Number.isInteger(v.seq) || !Number.isInteger(v.pid) || !m || Number(m[1]) !== v.seq || Number(m[2]) !== v.pid) return { corrupt: true };
  if (v.peak_mb != null && !(Number.isInteger(v.peak_mb) && v.peak_mb >= 1)) return { corrupt: true };
  return { entry: v };
}

function gateQueueListNames(dir) {
  try { return fs.readdirSync(dir).filter((n) => gateQueueNameRe.test(n)).sort(); } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function gateQueueQuarantine(root, kind, name, err) {
  const from = path.join(root, kind, name);
  const dir = path.join(root, 'corrupt');
  fs.mkdirSync(dir, { recursive: true });
  let to = path.join(dir, name);
  if (fs.existsSync(to)) to = path.join(dir, name + '.' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'));
  try { fs.renameSync(from, to); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  err('[gate-queue] corrupt ' + (kind === 'holders' ? 'holder' : 'ticket') + ' file ' + name + ' quarantined');
}

// Read both directories, quarantine damaged entries, reclaim dead ones (never kills anything).
// mine = the caller's own file name (never judged, never reclaimed).
function gateQueueScan(root, err, mine) {
  const raw = { tickets: [], holders: [] };
  for (const kind of ['tickets', 'holders']) {
    for (const name of gateQueueListNames(path.join(root, kind))) {
      const r = gateQueueReadEntry(path.join(root, kind, name), name);
      if (r.gone) continue;
      if (r.corrupt) { gateQueueQuarantine(root, kind, name, err); continue; }
      raw[kind].push({ ...r.entry, kind, name, file: path.join(root, kind, name) });
    }
  }
  const others = [...raw.tickets, ...raw.holders].filter((e) => !(mine && e.name === mine));
  const starts = gateProcStartMany(others.filter((e) => e.pid_start).map((e) => e.pid));
  const out = { tickets: [], holders: [] };
  for (const kind of ['tickets', 'holders']) {
    for (const e of raw[kind]) {
      if (mine && e.name === mine) { out[kind].push(e); continue; }
      const state = gateProcState(e.pid, e.pid_start, starts);
      if (state === 'dead' || state === 'start time differs') {
        try {
          fs.unlinkSync(e.file);
          err('[gate-queue] reclaimed seq=' + e.seq + ' pid ' + e.pid + ' (' + state + ')');
        } catch (x) { if (x.code !== 'ENOENT') throw x; }
        continue;
      }
      out[kind].push(e);
    }
    out[kind].sort((a, b) => a.seq - b.seq);
  }
  return out;
}

function gateQueuePeakOf(e, budgetMb) {
  return e.peak_mb == null ? budgetMb : e.peak_mb;
}

function gateQueueWho(e) {
  return (e.label || '?') + ' (' + path.basename(e.cwd || '?') + ', pid ' + e.pid + ')';
}

// ---- lock (PRD-4 D2) ----

function gateQueueLockOwnerState(root, err) {
  const lockDir = path.join(root, '.lock');
  let st;
  try { st = fs.statSync(lockDir); } catch { return null; }
  let owner;
  try { owner = readJsonRegular(path.join(lockDir, 'owner.json'), gateQueueEntryCap); } catch { owner = undefined; }
  const age = Date.now() - st.mtimeMs;
  let dead;
  if (!owner || !Number.isInteger(owner.pid)) dead = age > 10000;
  else {
    // a fresh lock is judged on kill 0 alone; a lock held over 30 s also has its start time checked (PID reuse)
    const s = gateProcState(owner.pid, age > 30000 ? owner.pid_start : null);
    dead = s === 'dead' || s === 'start time differs';
  }
  return { dead, owner, key: JSON.stringify(owner === undefined ? null : owner) };
}

function gateQueueLockSteal(root, seen, err) {
  const mutex = path.join(root, '.lock.steal');
  try { fs.mkdirSync(mutex); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - fs.statSync(mutex).mtimeMs > 10000) fs.rmdirSync(mutex); } catch { /* raced */ }
    return;
  }
  try {
    const again = gateQueueLockOwnerState(root, err);
    if (!again || !again.dead || again.key !== seen.key) return;
    const stale = path.join(root, '.lock.stale-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
    try { fs.renameSync(path.join(root, '.lock'), stale); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    fs.rmSync(stale, { recursive: true, force: true });
    err('[gate-queue] stale queue lock (owner ' + (seen.owner && Number.isInteger(seen.owner.pid) ? seen.owner.pid : 'unknown') + ' dead) reclaimed');
  } finally {
    try { fs.rmdirSync(mutex); } catch { /* gone */ }
  }
}

async function gateQueueLock(root, run) {
  fs.mkdirSync(root, { recursive: true });
  const me = { pid: process.pid, pid_start: run.selfStart, at: new Date().toISOString(), nonce: crypto.randomBytes(8).toString('hex') };
  const tmpDir = path.join(root, '.lock.tmp-' + process.pid + '-' + me.nonce);
  atomicWriteJson(path.join(tmpDir, 'owner.json'), me);
  try {
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmpDir, path.join(root, '.lock'));
        return me;
      } catch (e) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      }
      const seen = gateQueueLockOwnerState(root, run.err);
      if (seen && seen.dead) gateQueueLockSteal(root, seen, run.err);
      if (run.aborted) return null;
      await run.sleep(5 + Math.floor(Math.random() * 25), true);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function gateQueueUnlock(root, me) {
  if (!me) return;
  const lockDir = path.join(root, '.lock');
  let owner = null;
  try { owner = readJsonRegular(path.join(lockDir, 'owner.json'), gateQueueEntryCap); } catch { owner = null; }
  if (!owner || owner.pid !== me.pid || owner.nonce !== me.nonce) return;
  // rename first: `.lock` is freed in one step and a contender never sees a half-removed lock
  const gone = path.join(root, '.lock.rel-' + process.pid + '-' + me.nonce);
  try { fs.renameSync(lockDir, gone); } catch { return; }
  fs.rmSync(gone, { recursive: true, force: true });
}

async function gateQueueWithLock(root, run, fn) {
  const me = await gateQueueLock(root, run);
  if (!me) return { aborted: true };
  try { return { value: fn() }; } finally { gateQueueUnlock(root, me); }
}

// ---- seq (monotonic; recomputed from the highest seq on disk when unreadable) ----

function gateQueueDiskMaxSeq(root) {
  let max = 0;
  for (const kind of ['tickets', 'holders', 'corrupt']) {
    let names = [];
    try { names = fs.readdirSync(path.join(root, kind)); } catch { names = []; }
    for (const n of names) { const m = /^(\d{10})-/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
  }
  return max;
}

// Lock scratch dirs left by a process killed mid-acquire or mid-release (.lock.tmp-, .lock.stale-, .lock.rel-
// with a dead pid). Runs under the lock; a live pid's dir is in use and kept.
function gateQueueSweepLockScratch(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch { return; }
  for (const n of names) {
    const m = /^\.lock\.(?:tmp|stale|rel)-(\d+)-/.exec(n);
    if (!m) continue;
    if (gateProcState(Number(m[1]), null) === 'dead') fs.rmSync(path.join(root, n), { recursive: true, force: true });
  }
}

function gateQueueNextSeq(root) {
  gateQueueSweepLockScratch(root);
  const file = path.join(root, 'seq');
  let cur = null;
  try { cur = readJsonRegular(file, 4096); } catch { cur = null; }
  const base = Math.max(Number.isInteger(cur) && cur >= 0 ? cur : 0, gateQueueDiskMaxSeq(root));
  const next = base + 1;
  atomicWriteJson(file, next);
  return next;
}

// ---- waiting runtime: abortable sleep and signal handling ----

const gateQueueSignalNo = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

function gateQueueRuntime(ctx) {
  const run = {
    err: gateQueueErrWriter(ctx),
    aborted: null,
    wake: null,
    selfStart: gateProcStart(process.pid),
    handlers: [],
    // resolves true when a signal aborted the sleep. lockSpin sleeps are not woken early (tiny).
    sleep(ms, lockSpin) {
      if (run.aborted && !lockSpin) return Promise.resolve(true);
      return new Promise((resolve) => {
        const t = setTimeout(() => { run.wake = null; resolve(!!run.aborted); }, Math.max(0, ms));
        if (!lockSpin) run.wake = () => { clearTimeout(t); run.wake = null; resolve(true); };
      });
    },
    onSignal: null,
    trap() {
      for (const sig of Object.keys(gateQueueSignalNo)) {
        const h = () => {
          if (run.onSignal) { run.onSignal(sig); return; }
          if (!run.aborted) run.aborted = sig;
          if (run.wake) run.wake();
        };
        process.on(sig, h);
        run.handlers.push([sig, h]);
      }
    },
    untrap() {
      for (const [sig, h] of run.handlers) process.removeListener(sig, h);
      run.handlers = [];
    },
  };
  return run;
}

// ---- admission (Q1-05, Q1-06; PRD-4 D11–D13) ----

function gateQueueDefaultLabel(ctx, argv) {
  const repo = ctx.git && ctx.git.top ? ctx.git.top : ctx.cwd;
  const first = argv && argv.length ? path.basename(String(argv[0])) : 'gate';
  return path.basename(repo) + ':' + first;
}

function gateQueueIntOpt(v, flag) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : NaN);
  if (!Number.isInteger(n) || n < 1) throw fail('USAGE', 1, { message: flag + ' must be an integer >= 1 (got ' + JSON.stringify(v) + ')' });
  return n;
}

// Prints, once per invocation, CONTRACT §6's budget-only line, or one `signal unavailable: {name}` per
// missing signal (PRD-4 D6).
function gateQueueSignalReporter(err) {
  const warned = new Set();
  let budgetOnlySaid = false;
  return (sig) => {
    if (gateSignalsBudgetOnly(sig)) {
      if (!budgetOnlySaid) err('[gate-queue] memory signals unavailable: budget-only admission');
      budgetOnlySaid = true;
      return;
    }
    for (const n of sig.unavailable || []) {
      if (!warned.has(n)) { warned.add(n); err('[gate-queue] signal unavailable: ' + n); }
    }
  };
}

// Blocks (asynchronously) until ADMITTED, WAIT_TIMEOUT, REJECTED or a signal. One process, one ticket,
// a 2 s poll; non-head waiters read no memory signals (PRD-4 D15).
async function gateQueueAdmitCore(ctx, opts, run) {
  const root = gateQueueRoot(ctx);
  const err = run.err;
  const settings = gateQueueSettings(ctx);
  const peak = opts.peakMb == null ? null : gateQueueIntOpt(opts.peakMb, '--peak-mb');
  const timeoutS = opts.timeoutS == null ? settings.timeout_s : gateQueueIntOpt(opts.timeoutS, '--timeout-s');
  const label = opts.label || gateQueueDefaultLabel(ctx, opts.argv);
  const sigOpts = { env: ctx.env, platform: opts.platform, linuxRoot: opts.linuxRoot, sleep: (ms) => run.sleep(ms) };
  const sigState = {};
  const say = gateQueueSignalReporter(err);
  const sig0 = gateSignalsRead(sigOpts, sigState);
  say(sig0);
  const budget = gateQueueBudgetMb(settings.budget_pct, sig0.total_mb);
  if (peak != null && peak > budget) {
    err('[REJECTED] gate-queue: peak ' + peak + ' MB above budget ' + budget + ' MB · not started');
    return { outcome: 'GATE_QUEUE_REJECTED', exit: 1, peak_mb: peak, budget_mb: budget };
  }
  if (peak == null) err('[gate-queue] peak undeclared: exclusive');
  const t0 = Date.now();
  const deadline = t0 + timeoutS * 1000;
  const entry = {
    seq: null, pid: process.pid, pid_start: run.selfStart, pgid: null, cwd: ctx.cwd,
    repo: ctx.git && ctx.git.top ? ctx.git.top : null, label, peak_mb: peak,
    enqueued_at: new Date(t0).toISOString(), admitted_at: null, reason: null, checked_at: null,
  };
  const ticketFile = () => path.join(root, 'tickets', gateQueueName(entry.seq, entry.pid));
  const enq = await gateQueueWithLock(root, run, () => {
    entry.seq = gateQueueNextSeq(root);
    atomicWriteJson(ticketFile(), entry);
    return entry.seq;
  });
  if (enq.aborted) return gateQueueInterrupted(run, null);
  const mine = gateQueueName(entry.seq, entry.pid);
  const removeTicket = () => { try { fs.unlinkSync(ticketFile()); } catch (e) { if (e.code !== 'ENOENT') throw e; } };
  {
    const v = gateQueueScan(root, err, mine);
    const n = v.holders.length + v.tickets.length;
    const p = v.holders.length + v.tickets.findIndex((e) => e.name === mine) + 1;
    err('[gate-queue] enqueued seq=' + entry.seq + ' position ' + p + '/' + n + ' peak=' + (peak == null ? 'exclusive' : peak + ' MB') + ' label=' + label);
  }
  let lastLine = null;
  let lastAt = 0;
  let lastWaitFor = 'turn';
  let lastPos = '1/1';
  for (;;) {
    if (run.aborted) { removeTicket(); return gateQueueInterrupted(run, entry.seq); }
    const v = gateQueueScan(root, err, mine);
    if (!v.tickets.some((e) => e.name === mine)) {
      // quarantined or removed under us: re-write it with the same seq (keeps the FIFO place)
      atomicWriteJson(ticketFile(), entry);
      err('[gate-queue] ticket file missing: re-written seq=' + entry.seq);
      v.tickets.push({ ...entry, name: mine });
      v.tickets.sort((a, b) => a.seq - b.seq);
    }
    const idx = v.tickets.findIndex((e) => e.name === mine);
    const n = v.holders.length + v.tickets.length;
    const pos = (v.holders.length + idx + 1) + '/' + n;
    const held = v.holders.reduce((s, e) => s + gateQueuePeakOf(e, budget), 0);
    let reason;
    let waitFor;
    let ahead = 'none';
    if (idx > 0) {
      reason = 'turn';
      waitFor = 'turn';
      ahead = gateQueueWho(v.tickets[idx - 1]);
    } else {
      const q = { peakMb: peak, budgetMb: budget, swapUsedMaxMb: settings.swap_used_max_mb };
      const sig = await gateQueueHeadSignals(sigOpts, sigState, say, { ...q, heldMb: held }, deadline);
      if (run.aborted) continue;
      let dec = gateSignalsDecide(sig, { ...q, heldMb: held });
      if (dec.admit && sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0) {
        // the 5 s swap-out window is not complete yet (deadline too close to wait it out): not admitted on a guess
        dec = { admit: false, reason: 'swap-out to stop (measuring)', wait_for: 'swap-out to stop' };
      }
      if (dec.admit) {
        const res = await gateQueueWithLock(root, run, () => gateQueueTryAdmit(root, entry, mine, budget, q, sig));
        if (res.aborted) continue;
        if (res.value.admitted) {
          const w = Math.round((Date.now() - t0) / 1000);
          err('[gate-queue] admitted seq=' + entry.seq + ' after ' + w + ' s · peak ' + (peak == null ? 'exclusive' : peak + ' MB') +
            ' · held ' + res.value.held + '/' + budget + ' MB · signals ' + sig.source);
          return { outcome: 'GATE_QUEUE_ADMITTED', exit: 0, seq: entry.seq, name: mine, root, peak_mb: peak, budget_mb: budget, held_mb: res.value.held, label, waited_s: w, entry: res.value.entry };
        }
        dec = res.value.dec;
      }
      reason = dec.reason;
      waitFor = dec.wait_for;
      const blockers = v.holders.slice().sort((a, b) => gateQueuePeakOf(b, budget) - gateQueuePeakOf(a, budget));
      if (blockers.length) ahead = gateQueueWho(blockers[0]);
    }
    lastWaitFor = waitFor;
    lastPos = pos;
    const line = '[gate-queue] position ' + pos + ' · waiting for ' + reason + ' · ahead: ' + ahead;
    const now = Date.now();
    if (line !== lastLine || now - lastAt >= gateQueueReprintMs) {
      err(line);
      if (line !== lastLine) {
        entry.reason = reason;
        entry.checked_at = new Date(now).toISOString();
        atomicWriteJson(ticketFile(), entry);
      }
      lastLine = line;
      lastAt = now;
    }
    if (Date.now() >= deadline) {
      removeTicket();
      const w = Math.round((Date.now() - t0) / 1000);
      err('[WAIT-TIMEOUT] gate-queue: waited ' + w + ' s at position ' + lastPos + ' for ' + lastWaitFor + ' · not started · retryable');
      return { outcome: 'GATE_WAIT_TIMEOUT', exit: 3, seq: entry.seq, waited_s: w, waiting_for: lastWaitFor };
    }
    await run.sleep(Math.min(gateQueuePollMs, Math.max(0, deadline - Date.now())));
  }
}

// The head's signal read. The swap-out rate needs two reads >= 5 s apart; the extra wait is paid only when
// every other condition would admit (a waiter blocked on pressure or budget never sleeps for it), and never
// past the deadline.
async function gateQueueHeadSignals(sigOpts, sigState, say, q, deadline) {
  let sig = gateSignalsRead(sigOpts, sigState);
  if (sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0 && gateSignalsDecide(sig, q).admit &&
      Date.now() + sig.swapout_pending_ms < deadline) {
    sig = await gateSignalsReadSettled(sigOpts, sigState);
  }
  say(sig);
  return sig;
}

// Under the lock: still the head, still fits; then the ticket becomes a holder by rename.
function gateQueueTryAdmit(root, entry, mine, budget, q, sig) {
  const lower = gateQueueListNames(path.join(root, 'tickets')).filter((n) => n < mine);
  if (lower.length) return { admitted: false, dec: { reason: 'turn', wait_for: 'turn' } };
  let held = 0;
  for (const name of gateQueueListNames(path.join(root, 'holders'))) {
    const r = gateQueueReadEntry(path.join(root, 'holders', name), name);
    if (r.entry) held += gateQueuePeakOf(r.entry, budget);
  }
  const dec = gateSignalsDecide(sig, { ...q, heldMb: held });
  if (!dec.admit) return { admitted: false, dec };
  const now = new Date().toISOString();
  const holder = { ...entry, admitted_at: now, reason: null, checked_at: now };
  const tf = path.join(root, 'tickets', mine);
  atomicWriteJson(tf, holder);
  fs.mkdirSync(path.join(root, 'holders'), { recursive: true });
  fs.renameSync(tf, path.join(root, 'holders', mine));
  return { admitted: true, held: held + gateQueuePeakOf(entry, budget), entry: holder };
}

function gateQueueInterrupted(run, seq) {
  const sig = run.aborted || 'SIGTERM';
  return { outcome: 'GATE_INTERRUPTED', exit: 128 + gateQueueSignalNo[sig], signal: sig, seq, started: false };
}

// Release = remove the caller's own holder file. Never kills; never needs the lock (it only lowers held).
function gateQueueRelease(ctx, admitted, exitCode, cleaned) {
  const err = gateQueueErrWriter(ctx);
  try { fs.unlinkSync(path.join(admitted.root, 'holders', admitted.name)); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    err('[gate-queue] holder file missing at release');
  }
  err('[gate-queue] released seq=' + admitted.seq + ' exit=' + exitCode + ' cleaned=' + (cleaned || 0));
}

// In-process admission for `gate run` (CONTRACT §11 A8). Resolves to the CLI's result object; on ADMITTED it
// carries release(exitCode). Signals while waiting remove the ticket (GATE_INTERRUPTED, never started).
async function gateQueueAdmit(ctx, opts) {
  const run = gateQueueRuntime(ctx);
  run.trap();
  let res;
  try { res = await gateQueueAdmitCore(ctx, opts || {}, run); } finally { run.untrap(); }
  if (res.outcome === 'GATE_QUEUE_ADMITTED') {
    let done = false;
    res.release = (exitCode, cleaned) => {
      if (done) return;
      done = true;
      gateQueueRelease(ctx, res, exitCode == null ? 0 : exitCode, cleaned);
    };
  }
  return res;
}

// The live holder named by DO_IT_GATE_HOLDER that is an ancestor of this process, or null (forged, stale,
// or not above us). Used by nested admission and `gate run` (CONTRACT §11 A8).
function gateQueueHeldBySelf(ctx) {
  const v = ctx && ctx.env ? ctx.env.DO_IT_GATE_HOLDER : null;
  const m = /^(\d+)-(\d+)$/.exec(v || '');
  if (!m) return null;
  const seq = Number(m[1]);
  const pid = Number(m[2]);
  const name = gateQueueName(seq, pid);
  const r = gateQueueReadEntry(path.join(gateQueueRoot(ctx), 'holders', name), name);
  if (!r.entry) return null;
  const st = gateProcState(pid, r.entry.pid_start);
  if (st !== 'alive' && st !== 'alive-unverified') return null;
  let p = process.pid;
  for (let i = 0; i < 64 && p && p > 1; i++) {
    if (p === pid) return r.entry;
    p = gateProcParent(p);
  }
  return null;
}

// Q1 basic run (Q2 replaces it with process-group cleanup): spawn, wait, release, exit passthrough.
// Signals while running are forwarded to the child; the queue then exits 128 + N (PRD-4 D18).
async function gateQueueRunChild(ctx, admitted, argv, run) {
  const err = run.err;
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let interrupted = null;
    const finish = (exit, extra) => {
      if (settled) return;
      settled = true;
      run.onSignal = null;
      resolve({ exit, ...extra });
    };
    try {
      child = cp.spawn(argv[0], argv.slice(1), {
        cwd: ctx.cwd, stdio: 'inherit',
        env: { ...ctx.env, DO_IT_GATE_HOLDER: admitted.seq + '-' + process.pid },
      });
    } catch (e) {
      err('[gate-queue] command failed to start: ' + (e.code || 'error'));
      finish(127, { start_error: e.code || 'error' });
      return;
    }
    run.onSignal = (sig) => {
      interrupted = interrupted || sig;
      try { child.kill(sig); } catch { /* gone */ }
    };
    child.on('error', (e) => {
      if (child.pid == null || e.code === 'ENOENT' || e.code === 'EACCES') {
        err('[gate-queue] command failed to start: ' + (e.code || 'error'));
        finish(127, { start_error: e.code || 'error' });
      }
    });
    child.on('exit', (code, signal) => {
      let exit = code;
      if (exit == null) exit = 128 + (os.constants.signals[signal] || 0);
      if (interrupted) finish(128 + gateQueueSignalNo[interrupted], { command_exit: exit, signal: interrupted });
      else finish(exit, { command_exit: exit });
    });
  });
}

// `do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command` (CLI entry; async).
// args: parseArgs shape; the command argv comes from args.passthrough (the `--` tail; V1's cli.mjs names it).
async function gateQueueCmd(ctx, args) {
  const flags = (args && args.flags) || {};
  const argv = (args && (args.passthrough || args.rest || args['--'])) || [];
  if (flags.status) throw fail('USAGE', 1, { message: 'gate queue --status arrives with Q2' });
  if (!Array.isArray(argv) || !argv.length) throw fail('USAGE', 1, { message: 'usage: do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command' });
  const run = gateQueueRuntime(ctx);
  run.trap();
  try {
    let admitted;
    try {
      admitted = await gateQueueAdmitCore(ctx, {
        peakMb: flags['peak-mb'] === undefined ? null : flags['peak-mb'],
        timeoutS: flags['timeout-s'] === undefined ? null : flags['timeout-s'],
        label: typeof flags.label === 'string' ? flags.label : null,
        argv,
      }, run);
    } catch (e) {
      if (e && e.outcome === 'QUEUE_SETTINGS_INVALID') run.err('[gate-queue] ' + (e.extra.message || 'queue settings invalid') + ' · not started');
      throw e;
    }
    if (admitted.outcome !== 'GATE_QUEUE_ADMITTED') return admitted;
    if (run.aborted) {
      // a signal landed between admission and spawn: never start
      gateQueueRelease(ctx, admitted, 128 + gateQueueSignalNo[run.aborted], 0);
      return gateQueueInterrupted(run, admitted.seq);
    }
    const r = await gateQueueRunChild(ctx, admitted, argv, run);
    gateQueueRelease(ctx, admitted, r.exit, 0);
    if (r.signal) return { outcome: 'GATE_INTERRUPTED', exit: r.exit, seq: admitted.seq, signal: r.signal, command_exit: r.command_exit };
    if (r.start_error) return { outcome: 'GATE_QUEUE_START_FAILED', exit: 127, seq: admitted.seq, error: r.start_error };
    return { outcome: 'GATE_QUEUE_RAN', exit: r.exit, seq: admitted.seq, label: admitted.label };
  } finally {
    run.untrap();
  }
}

// ---- gate-results.mjs ----
// Gate results store (resumable test gates, epic L1; PRD-1 D1-D15, CONTRACT §2.1, §8 M1/M5, §11 A3-A6).
// One append-only store per repository under {git-common-dir}/do-it/gate-results/. Every error path fails toward
// running more (G-1): no store, an unreadable store, a corrupt line or an unknown key never yields a reuse.

const GATE_ROW_SCHEMA = 'do-it-gate-result/1';
const GATE_ROW_MAX_JSON = 4094;
const GATE_STORE_ROWS = 'results.jsonl';
const GATE_STORE_BASE = 'results.base.jsonl';
const GATE_STORE_BASE_SCHEMA = 'do-it-gate-base/1';
const GATE_STORE_SEG_RE = /^results\.seg-([0-9]+)\.jsonl$/;
const GATE_STORE_LOCK_STALE_MS = 60000;
const GATE_FAILURE_CAP = 1024 * 1024;
const GATE_FOLD_DEFAULTS = Object.freeze({
  resume: false,
  ttlMs: 86400000,
  unstableMs: 604800000,
  flakyCarryMs: 604800000,
  skewMs: 60000,
});

// == process start time (CONTRACT §11 A8, build decision Y4) ==
// COORDINATOR WIRING POINT: the queue lane exports gateProcStart(pid) from gate-signals.mjs. After both lanes merge,
// replace the body of gateStoreProcStartDefault with `return gateProcStart(pid);` (and add the relative import).
// Until then every caller may inject opts.procStart. A null start time counts as "dead or differs" (G-1 direction):
// a run whose owner cannot be proven alive is never treated as live, and a lock whose owner cannot be proven alive
// is reclaimable (the compaction nonce check then aborts the loser before it can replace the base).
function gateStoreProcStartDefault(pid) {
  void pid;
  return null;
}

function gateStorePidAlive(pid, pidStart, procStart) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (!e || e.code !== 'EPERM') return false;
  }
  let nowStart = null;
  try { nowStart = (procStart || gateStoreProcStartDefault)(pid); } catch { nowStart = null; }
  if (nowStart === null || nowStart === undefined || pidStart === null || pidStart === undefined) return false;
  return String(nowStart) === String(pidStart);
}

// == store handle (D1, D14) ==
// {backend: 'local', dir} or null when the cwd is not inside a git repository (store unavailable: every file runs).
function gateStoreOpen(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const env = o.env || process.env;
  const run = (args) => cp.execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let common = null;
  try {
    common = run(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  } catch {
    try { common = path.resolve(cwd, run(['rev-parse', '--git-common-dir'])); } catch { common = null; }
  }
  if (!common) return null;
  let real = common;
  try { real = fs.realpathSync(common); } catch { /* keep as resolved */ }
  return { backend: 'local', dir: path.join(real, 'do-it', 'gate-results') };
}

// == rows: CRC and validation (D3, D5) ==
function gateRowCrc(rowWithoutCrc) {
  return sha256Bytes(canonicalJson(rowWithoutCrc)).slice(0, 16);
}

function gatePassInvariant(row) {
  const c = row && row.counts;
  return row.exec_error === false && !!c && c.failed === 0 && c.passed >= 1 && (row.failure_ref === null || row.failure_ref === undefined);
}

function gateRowStringsOk(v) {
  if (typeof v === 'string') return v.isWellFormed();
  if (Array.isArray(v)) return v.every(gateRowStringsOk);
  if (v && typeof v === 'object') return Object.entries(v).every(([k, x]) => k.isWellFormed() && gateRowStringsOk(x));
  if (typeof v === 'number') return Number.isSafeInteger(v);
  return true;
}

// Schema plus the invariants the schema subset cannot express. opts.passInvariant (default true) adds the PASS
// invariant (G-2 defence in depth). The scanner does not apply it: the fold re-applies it as FAIL (D13 step 5).
function gateRowErrors(row, opts) {
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['row is not an object'];
  for (const e of validateSchema(loadSchemaFile('gate-result.1.schema.json'), { ...row, crc: row.crc === undefined ? '0000000000000000' : row.crc })) {
    errors.push(e.pointer + ' ' + e.message);
  }
  if (!gateRowStringsOk(row)) errors.push('a string is not well-formed UTF-16 or a number is not a safe integer');
  const fileRow = row.type === 'start' || row.type === 'finish';
  if (fileRow) {
    if (typeof row.file !== 'string') errors.push('/file is required on ' + row.type);
    if (typeof row.key !== 'string') errors.push('/key is required on ' + row.type);
  } else {
    if ('file' in row) errors.push('/file is not allowed on ' + row.type);
    if ('key' in row) errors.push('/key is not allowed on ' + row.type);
    if ('result' in row) errors.push('/result is not allowed on ' + row.type);
  }
  if (row.type === 'finish' && !('result' in row)) errors.push('/result is required on finish');
  if (row.type !== 'finish' && 'result' in row) errors.push('/result is allowed on finish only');
  for (const k of ['tainted', 'reason', 'verdict']) if (k in row && row.type !== 'run_end') errors.push('/' + k + ' is allowed on run_end only');
  for (const k of ['pid', 'pid_start']) if (k in row && row.type !== 'run_start') errors.push('/' + k + ' is allowed on run_start only');
  if (typeof row.file === 'string') {
    const f = row.file;
    if (/[\t\n\r]/.test(f)) errors.push('/file contains TAB, LF or CR');
    if (f.startsWith('/')) errors.push('/file is absolute');
    if (f.split('/').some((seg) => seg === '..')) errors.push('/file has a .. segment');
  }
  if (!opts || opts.passInvariant !== false) {
    if (row.type === 'finish' && row.result === 'PASS' && !gatePassInvariant(row)) {
      errors.push('PASS invariant: requires exec_error false, counts.failed 0, counts.passed >= 1, failure_ref null');
    }
  }
  return errors;
}

// The line on disk is exactly canonicalJson(row with crc). Returns the line (without LF) or throws GATE_ROW_INVALID.
function gateRowLine(row) {
  const r = {};
  for (const [k, v] of Object.entries(row || {})) if (v !== undefined && k !== 'crc') r[k] = v;
  if (r.schema === undefined) r.schema = GATE_ROW_SCHEMA;
  const errors = gateRowErrors(r);
  if (errors.length) throw fail('GATE_ROW_INVALID', 1, { errors });
  const crc = gateRowCrc(r);
  return canonicalJson({ ...r, crc });
}

// D4: one bounded O_APPEND write per row. Rows larger than 4094 bytes of canonical JSON throw GATE_ROW_TOO_LARGE.
function gateStoreAppend(store, row) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  const line = gateRowLine(row);
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length > GATE_ROW_MAX_JSON) throw fail('GATE_ROW_TOO_LARGE', 1, { bytes: bytes.length, max: GATE_ROW_MAX_JSON });
  const res = appendRecord(path.join(store.dir, GATE_STORE_ROWS), Buffer.concat([bytes, Buffer.from('\n')]));
  if (res.written !== res.expected) throw fail('GATE_ROW_SHORT_WRITE', 1, { written: res.written, expected: res.expected });
  return { line, crc: JSON.parse(line).crc };
}

// == scan (D2, D6) ==
// Parses one stored line. Returns the row or null when the line is corrupt (parse, CRC, schema or structural invariant).
function gateRowParse(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || typeof obj.crc !== 'string') return null;
  const rest = { ...obj };
  delete rest.crc;
  if (gateRowCrc(rest) !== obj.crc) return null; // CRC-GUARD: a row whose bytes changed after writing is CORRUPT
  if (gateRowErrors(obj, { passInvariant: false }).length) return null;
  return obj;
}

function gateRowAttribute(raw) {
  const out = {};
  const str = (name) => {
    const m = new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(raw);
    if (!m) return undefined;
    try { return JSON.parse('"' + m[1] + '"'); } catch { return undefined; }
  };
  const file = str('file');
  if (typeof file === 'string' && file) out.file = file;
  const leg = str('leg');
  if (typeof leg === 'string' && leg) out.leg = leg;
  const key = /"key"\s*:\s*"([0-9a-f]{64})"/.exec(raw);
  if (key) out.key = key[1];
  const run = /g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}/.exec(raw);
  if (run) out.run_id = run[0];
  return out;
}

function gateStoreReadFile(file) {
  try {
    return { bytes: readRegularFile(file, BULK_READ_CAP) };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { bytes: null };
    return { error: e };
  }
}

function gateStoreSegments(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .map((n) => ({ name: n, m: GATE_STORE_SEG_RE.exec(n) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.name, n: Number(x.m[1]) }))
    .sort((a, b) => a.n - b.n);
}

// The base file's first line is a metadata line recording how many bytes of each segment it absorbed, written in the
// same atomic rename as the base content. A scan skips the absorbed bytes, so a crash between the base rename and the
// segment clean-up can never present a row twice (PRD-1 D11; see the results file for this refinement of D2).
function gateStoreBaseMeta(firstLine) {
  let obj;
  try { obj = JSON.parse(firstLine); } catch { return null; }
  if (!obj || typeof obj !== 'object' || obj.schema !== GATE_STORE_BASE_SCHEMA || typeof obj.crc !== 'string') return null;
  const rest = { ...obj };
  delete rest.crc;
  if (gateRowCrc(rest) !== obj.crc) return null;
  if (!obj.absorbed || typeof obj.absorbed !== 'object') return null;
  return obj;
}

function gateStoreSplit(bytes) {
  const parts = bytes.toString('utf8').split('\n');
  return parts.filter((l) => l.trim() !== '');
}

// Reads every row file in scan order. opts.withActive (default true) includes results.jsonl.
// Returns {source, lines: [{raw, from}], absorbedOld, segSizes, error}. source: 'local' | 'none' | 'unavailable'.
function gateStoreReadAll(store, opts) {
  if (!store || !store.dir) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  const dir = store.dir;
  let st = null;
  try { st = fs.statSync(dir); } catch (e) {
    if (e && e.code === 'ENOENT') return { source: 'none', lines: [], absorbedOld: {}, segSizes: {} };
    return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  }
  if (!st.isDirectory()) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  const lines = [];
  let absorbedOld = {};
  const base = gateStoreReadFile(path.join(dir, GATE_STORE_BASE));
  if (base.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
  if (base.bytes) {
    const all = gateStoreSplit(base.bytes);
    const meta = all.length ? gateStoreBaseMeta(all[0]) : null;
    if (meta) { absorbedOld = meta.absorbed; all.shift(); }
    for (const raw of all) lines.push({ raw, from: GATE_STORE_BASE });
  }
  const segSizes = {};
  for (const seg of gateStoreSegments(dir)) {
    const r = gateStoreReadFile(path.join(dir, seg.name));
    if (r.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
    if (!r.bytes) continue;
    segSizes[seg.name] = r.bytes.length;
    const skip = Number.isInteger(absorbedOld[seg.name]) && absorbedOld[seg.name] <= r.bytes.length ? absorbedOld[seg.name] : 0;
    for (const raw of gateStoreSplit(r.bytes.subarray(skip))) lines.push({ raw, from: seg.name, tail: skip > 0 });
  }
  if (!opts || opts.withActive !== false) {
    const act = gateStoreReadFile(path.join(dir, GATE_STORE_ROWS));
    if (act.error) return { source: 'unavailable', lines: [], absorbedOld: {}, segSizes: {} };
    if (act.bytes) for (const raw of gateStoreSplit(act.bytes)) lines.push({ raw, from: GATE_STORE_ROWS });
  }
  return { source: 'local', lines, absorbedOld, segSizes };
}

function gateStoreItem(raw, pos) {
  const row = gateRowParse(raw);
  if (row) return { pos, ok: true, row };
  return { pos, ok: false, ...gateRowAttribute(raw) };
}

function gateStoreKeep(item, filter) {
  if (!filter || (filter.file === undefined && filter.leg === undefined)) return true;
  const leg = filter.leg;
  if (item.ok) {
    const r = item.row;
    if (r.type !== 'start' && r.type !== 'finish') return true;
    if (filter.file !== undefined && r.file !== filter.file) return false;
    if (leg !== undefined && (r.leg || 'unit') !== leg) return false;
    return true;
  }
  if (filter.file !== undefined && item.file !== undefined && item.file !== filter.file) return false;
  if (leg !== undefined && item.file !== undefined && item.leg !== undefined && item.leg !== leg) return false;
  return true;
}

// Never throws on content. With {file, leg}: that file's start/finish items, every run-level row, every corrupt item
// attributed to that file and every unattributed corrupt item.
function gateStoreScan(store, filter) {
  const all = gateStoreReadAll(store);
  const items = [];
  let corrupt = 0;
  let unattributed = 0;
  all.lines.forEach((l, pos) => {
    const it = gateStoreItem(l.raw, pos);
    if (!gateStoreKeep(it, filter)) return;
    if (!it.ok) { corrupt++; if (it.file === undefined) unattributed++; }
    items.push(it);
  });
  return { items, corrupt, unattributed, source: all.source };
}

// == liveness of runs (D13 inputs; CONTRACT §11 A4) ==
// Impure: the set of run ids whose run_start owner is alive (pid answers AND start time equals pid_start) and that
// have no run_end. The fold itself never touches the OS.
function gateStoreLiveRuns(items, opts) {
  const procStart = (opts && opts.procStart) || gateStoreProcStartDefault;
  const list = Array.isArray(items) ? items : (items && items.items) || [];
  const ended = new Set();
  const starts = new Map();
  for (const it of list) {
    if (!it || !it.ok) continue;
    if (it.row.type === 'run_end') ended.add(it.row.run_id);
    if (it.row.type === 'run_start' && !starts.has(it.row.run_id)) starts.set(it.row.run_id, it.row);
  }
  const live = new Set();
  for (const [id, row] of starts) {
    if (ended.has(id)) continue;
    if (gateStorePidAlive(row.pid, row.pid_start, procStart)) live.add(id);
  }
  return live;
}

// == fold: pure (D13; CONTRACT §8 M1, §11 A3, A5). No fs, no child_process, no clock below this line. ==
const GATE_COMPONENT_ORDER = ['gate', 'runner', 'core', 'installed', 'env', 'platform', 'class', 'tree', 'deps'];

function gateFoldMs(at) {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : NaN;
}

function gateFoldSelect(all, opts) {
  const leg = opts.leg || 'unit';
  const out = [];
  for (const it of all) {
    if (!it) continue;
    if (it.ok) {
      const r = it.row;
      if (r.type === 'start' || r.type === 'finish') {
        if (opts.file !== undefined && r.file !== opts.file) continue;
        if ((r.leg || 'unit') !== leg) continue;
      }
      out.push(it);
    } else {
      if (opts.file !== undefined && it.file !== undefined && it.file !== opts.file) continue;
      if (it.file !== undefined && it.leg !== undefined && it.leg !== leg) continue;
      out.push(it);
    }
  }
  return out.map((it, i) => ({ it, i })).sort((a, b) => (a.it.pos - b.it.pos) || (a.i - b.i)).map((x) => x.it);
}

// gateFold(rows, keyNow, now, opts): rows = gateStoreScan items (or the scan result itself) for one (file, leg);
// keyNow = {key, components} or null; now = epoch ms; opts = {file, leg, resume, liveRuns, ttlMs, unstableMs,
// flakyCarryMs, skewMs, source}. Returns {state, reuse, passRow, key, kills, flakyPasses, unstableUntil,
// invalidated, reason, corrupt}.
function gateFold(rows, keyNow, now, opts) {
  const o = { ...GATE_FOLD_DEFAULTS, ...(opts || {}) };
  const scanObj = rows && !Array.isArray(rows) ? rows : null;
  const all = scanObj ? scanObj.items || [] : rows || [];
  const source = o.source || (scanObj ? scanObj.source : undefined);
  const live = o.liveRuns instanceof Set ? o.liveRuns : new Set(o.liveRuns || []);
  const out = {
    state: 'NEVER_RUN', reuse: null, passRow: null, key: keyNow && keyNow.key ? keyNow.key : null,
    kills: 0, flakyPasses: 0, unstableUntil: null, invalidated: [], reason: 'no-row', corrupt: 0,
  };
  // step 1: unknown component => the file runs (G-1)
  if (!keyNow || typeof keyNow.key !== 'string' || !keyNow.key) { out.reason = 'key-unknown'; return out; }
  const items = gateFoldSelect(all, o);
  out.corrupt = items.filter((it) => !it.ok).length;
  if (items.length === 0 && (source === 'none' || source === 'unavailable')) { out.reason = 'no-store'; return out; }
  const K = keyNow.key;

  // step 2: de-dup start/finish on (type, run_id, file, leg); step 3: run table
  const seen = new Set();
  const runs = new Map();
  const cleans = [];
  const finishes = [];
  const starts = [];
  const corrupts = [];
  for (const it of items) {
    if (!it.ok) { corrupts.push({ pos: it.pos, attributed: it.file !== undefined }); continue; }
    const r = it.row;
    if (r.type === 'start' || r.type === 'finish') {
      const k = r.type + '\0' + r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit');
      if (seen.has(k)) continue;
      seen.add(k);
      (r.type === 'start' ? starts : finishes).push({ pos: it.pos, row: r });
      continue;
    }
    const run = runs.get(r.run_id) || { start: null, end: null };
    if (r.type === 'run_start' && !run.start) run.start = r;
    if (r.type === 'run_end' && !run.end) run.end = r;
    runs.set(r.run_id, run);
    if (r.type === 'clean') cleans.push({ pos: it.pos, row: r });
  }
  let horizon = null;
  for (let i = cleans.length - 1; i >= 0; i--) {
    const run = runs.get(cleans[i].row.run_id);
    if (run && run.end && run.end.tainted === true) continue;
    const h = gateFoldMs(run && run.start ? run.start.at : cleans[i].row.at);
    if (Number.isFinite(h)) { horizon = h; break; }
  }
  const lastCorruptPos = corrupts.length ? Math.max(...corrupts.map((c) => c.pos)) : -1;

  // steps 4-5: corrupt voiding and normalisation of every finish
  const norm = finishes.map((f) => {
    const r = f.row;
    let res = r.result === 'DESELECTED' ? 'SKIPPED' : r.result;
    let inv = false;
    if (res === 'PASS' && !gatePassInvariant(r)) { res = 'FAIL'; inv = true; }
    let ignore = null;
    if (res === 'PASS' || res === 'SKIPPED') {
      const run = runs.get(r.run_id);
      if (lastCorruptPos > f.pos) ignore = 'voided-by-corrupt';
      else if (run && run.end && run.end.tainted === true) ignore = 'tainted-run';
      else if (!(run && run.end) && live.has(r.run_id)) ignore = 'live-run';
      else if (!o.resume && (!(run && run.end) || run.end.verdict === 'GATE_INTERRUPTED')) ignore = 'interrupted-run';
    }
    return { pos: f.pos, row: r, res, inv, ignore, at: gateFoldMs(r.at) };
  });

  // step 9: FLAKY carry-over from another key of the same file (A5)
  let flakyAt = null;
  const byKey = new Map();
  for (const f of norm) {
    if (f.ignore === 'voided-by-corrupt') continue;
    if (!byKey.has(f.row.key)) byKey.set(f.row.key, []);
    byKey.get(f.row.key).push(f);
  }
  for (const [k, list] of byKey) {
    if (k === K) continue;
    let prev = null;
    for (const f of list) {
      let ev = false;
      if (f.res === 'PASS' && f.row.retried === true) ev = true;
      if (prev && ((prev.res === 'PASS' && f.res === 'FAIL') || (prev.res === 'FAIL' && f.res === 'PASS'))) ev = true;
      if (ev && Number.isFinite(f.at) && (flakyAt === null || f.at > flakyAt)) flakyAt = f.at;
      if (f.res === 'PASS' || f.res === 'FAIL') prev = f;
    }
  }
  const carry = flakyAt !== null && now < flakyAt + o.flakyCarryMs;

  // step 6: key-scoped machine
  const onKey = norm.filter((f) => f.row.key === K);
  const usable = onKey.filter((f) => f.ignore === null);
  let st = carry ? 'FLAKY' : 'NEVER_RUN';
  let n = 0;
  let carried = carry;
  let decisive = null;
  for (const f of usable) {
    if (f.res === 'PASS') {
      if (f.row.retried === true) { st = 'FLAKY'; n = 0; carried = false; }
      else if (st === 'FAIL') { st = 'FLAKY'; n = 1; carried = false; }
      else if (st === 'FLAKY') { n++; if (n >= 2) { st = 'PASS'; n = 0; } }
      else st = 'PASS';
      decisive = f;
    } else if (f.res === 'FAIL') {
      if (st === 'PASS' || st === 'FLAKY') { st = 'FLAKY'; n = 0; carried = false; } else st = 'FAIL';
      decisive = f;
    } else if (f.res === 'SKIPPED') {
      if (st !== 'FAIL' && st !== 'FLAKY') { st = 'SKIPPED'; decisive = f; }
    }
  }

  // step 7: kills and live starts on the key
  const finished = new Set(finishes.map((f) => f.row.run_id + '\0' + f.row.file + '\0' + (f.row.leg || 'unit')));
  const lastFinishOnKey = onKey.length ? Math.max(...onKey.map((f) => f.pos)) : -1;
  let kills = 0;
  let lastOpen = null;
  let lastOpenFilePos = -1;
  for (const s of starts) {
    if (finished.has(s.row.run_id + '\0' + s.row.file + '\0' + (s.row.leg || 'unit'))) continue;
    lastOpenFilePos = Math.max(lastOpenFilePos, s.pos);
    if (s.row.key !== K || s.pos <= lastFinishOnKey) continue;
    const run = runs.get(s.row.run_id);
    const running = !(run && run.end) && live.has(s.row.run_id);
    if (!running) kills++;
    if (!lastOpen || s.pos > lastOpen.pos) lastOpen = { pos: s.pos, running };
  }
  out.kills = kills;

  // step 4 (state): the latest item for the file is a corrupt line attributed to it => CORRUPT
  const lastAttributedCorrupt = corrupts.filter((c) => c.attributed).reduce((m, c) => Math.max(m, c.pos), -1);
  const lastFileEvent = Math.max(finishes.length ? Math.max(...finishes.map((f) => f.pos)) : -1, lastOpenFilePos);
  if (lastAttributedCorrupt > lastFileEvent) {
    out.state = 'CORRUPT';
    out.reason = 'voided-by-corrupt';
    return out;
  }
  if (lastOpen) {
    if (lastOpen.running) { out.state = 'RUNNING'; out.reason = 'live-run'; return out; }
    out.state = kills >= 2 ? 'SUSPECT_KILLER' : 'KILLED';
    out.reason = kills >= 2 ? 'suspect-killer' : 'killed';
    return out;
  }

  // step 8: UNSTABLE_UNDER_REUSE (file level, any key)
  let u = null;
  let uPos = -1;
  const nonCleanPass = new Set();
  for (const f of norm) {
    if (f.ignore === 'voided-by-corrupt') continue;
    if (f.res === 'PASS' && f.row.clean !== true) nonCleanPass.add(f.row.key);
    if (f.row.clean === true && f.res === 'FAIL' && nonCleanPass.has(f.row.key) && Number.isFinite(f.at)) { u = f.at; uPos = f.pos; }
  }
  if (u !== null) {
    const until = u + o.unstableMs;
    const cleanAfter = norm.filter((f) => f.pos > uPos && f.row.clean === true && (f.res === 'FAIL' || (f.ignore === null && f.res === 'PASS')));
    const last2 = cleanAfter.slice(-2);
    const cleared = now >= until && last2.length === 2 && last2.every((f) => f.res === 'PASS');
    if (!cleared) {
      out.state = 'UNSTABLE_UNDER_REUSE';
      out.unstableUntil = until;
      out.reason = 'unstable';
      return out;
    }
  }

  // step 10: no usable finish on the key
  if (usable.length === 0) {
    const ignored = onKey.filter((f) => f.ignore !== null);
    if (ignored.length) {
      out.reason = ignored[ignored.length - 1].ignore;
      return out;
    }
    const others = norm.filter((f) => f.row.key !== K);
    if (others.length) {
      const prev = others[others.length - 1].row.components || {};
      const nowC = keyNow.components || {};
      out.invalidated = GATE_COMPONENT_ORDER.filter((c) => (prev[c] === undefined ? null : prev[c]) !== (nowC[c] === undefined ? null : nowC[c]));
      out.reason = 'invalidated';
      return out;
    }
    out.reason = 'no-row';
    return out;
  }

  out.state = st;
  out.flakyPasses = st === 'FLAKY' ? n : 0;
  if (st === 'FLAKY') { out.reason = carried ? 'flaky-carry' : 'flaky'; return out; }
  if (st === 'FAIL') { out.reason = decisive && decisive.inv ? 'pass-invariant' : 'failed'; return out; }
  if (st === 'NEVER_RUN') { out.reason = 'no-row'; return out; }
  // step 11: age of a PASS or SKIPPED
  out.passRow = { run_id: decisive.row.run_id, at: decisive.row.at };
  const at = decisive.at;
  if (!Number.isFinite(at) || at > now + o.skewMs) { out.reason = 'future-timestamp'; return out; }
  if (at < now - o.ttlMs || (horizon !== null && at < horizon)) { out.state = 'EXPIRED'; out.reason = 'expired'; return out; }
  out.reuse = st;
  out.reason = st === 'PASS' ? 'ok' : 'skipped';
  return out;
}
// == end fold: pure ==

// == salt (D7) ==
function gateStoreSalt(store, opts) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  const log = (opts && opts.log) || ((m) => process.stderr.write(m + '\n'));
  const file = path.join(store.dir, '.salt');
  fs.mkdirSync(store.dir, { recursive: true });
  const read = () => readRegularFile(file, 4096, { noFollow: true });
  let bytes = null;
  try { bytes = read(); } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
    writeFileOnce(file, crypto.randomBytes(32), 0o600);
    bytes = read();
  }
  if (bytes.length !== 32) {
    atomicWrite(file, crypto.randomBytes(32), { mode: 0o600 });
    log('[gate-results] salt rotated');
    bytes = read();
  }
  try {
    const st = fs.statSync(file);
    if ((st.mode & 0o777) !== 0o600) fs.chmodSync(file, 0o600);
  } catch { /* best effort */ }
  return Buffer.from(bytes);
}

// == failure side files (D8) ==
function gateStoreRedact(text, redactValues) {
  let out = String(text);
  const forms = [];
  for (const [name, value] of Object.entries(redactValues || {})) {
    if (typeof value !== 'string' || value.length < 6) continue;
    forms.push([value, name]);
    const esc = JSON.stringify(value).slice(1, -1);
    if (esc !== value) forms.push([esc, name]);
  }
  forms.sort((a, b) => b[0].length - a[0].length);
  for (const [form, name] of forms) if (out.includes(form)) out = out.split(form).join('[REDACTED:' + name + ']');
  return out;
}

function gateStoreFailureWrite(store, text, redactValues) {
  if (!store || !store.dir) throw fail('GATE_STORE_UNAVAILABLE', 1, {});
  let bytes = Buffer.from(gateStoreRedact(text, redactValues), 'utf8');
  if (bytes.length > GATE_FAILURE_CAP) {
    const marker = Buffer.from('\n[truncated]\n', 'utf8');
    bytes = Buffer.concat([Buffer.from(bytes.subarray(0, GATE_FAILURE_CAP - marker.length).toString('utf8'), 'utf8'), marker]);
  }
  const sha = sha256Bytes(bytes);
  writeFileOnce(path.join(store.dir, 'failures', sha + '.txt'), bytes, 0o644);
  return 'failures/' + sha + '.txt';
}

// == blob memo file (D9) ==
function gateStoreMemoLine(entry) {
  const r = { b: entry.b, s: entry.s, w: entry.w || {} };
  return canonicalJson({ ...r, crc: gateRowCrc(r) });
}

function gateStoreMemoRead(store, file) {
  const memo = new Map();
  if (!store || !store.dir) return memo;
  const r = gateStoreReadFile(file || path.join(store.dir, 'blobmemo.jsonl'));
  if (!r.bytes) return memo;
  for (const raw of gateStoreSplit(r.bytes)) {
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (!obj || typeof obj.b !== 'string' || typeof obj.s !== 'string' || typeof obj.crc !== 'string') continue;
    if (!/^[0-9a-f]{40,64}$/.test(obj.b) || !/^[0-9a-f]{64}$/.test(obj.s)) continue;
    const rest = { ...obj };
    delete rest.crc;
    if (gateRowCrc(rest) !== obj.crc) continue;
    const prev = memo.get(obj.b);
    memo.set(obj.b, { s: obj.s, w: { ...(prev ? prev.w : {}), ...(obj.w && typeof obj.w === 'object' ? obj.w : {}) } });
  }
  return memo;
}

function gateStoreMemoAppend(store, entries) {
  if (!store || !store.dir) return 0;
  const file = path.join(store.dir, 'blobmemo.jsonl');
  let n = 0;
  for (const e of entries || []) {
    if (!e || !/^[0-9a-f]{40,64}$/.test(e.b || '') || !/^[0-9a-f]{64}$/.test(e.s || '')) continue;
    const buf = Buffer.from(gateStoreMemoLine(e) + '\n', 'utf8');
    if (buf.length > 4096) continue;
    appendRecord(file, buf);
    n++;
  }
  return n;
}

// == live-owner lock (D10) ==
function gateStoreLockOwner(lockDir) {
  try {
    const obj = JSON.parse(readRegularFile(path.join(lockDir, 'owner.json'), 65536).toString('utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

function gateStoreLock(store, opts) {
  if (!store || !store.dir) return { ok: false, outcome: 'GATE_STORE_UNAVAILABLE' };
  const procStart = (opts && opts.procStart) || gateStoreProcStartDefault;
  const lockDir = path.join(store.dir, '.lock');
  fs.mkdirSync(store.dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      const nonce = crypto.randomBytes(8).toString('hex');
      let pidStart = null;
      try { pidStart = procStart(process.pid); } catch { pidStart = null; }
      const owner = { pid: process.pid, pid_start: pidStart === undefined ? null : pidStart, cwd: process.cwd(), at: new Date().toISOString(), nonce };
      atomicWrite(path.join(lockDir, 'owner.json'), Buffer.from(JSON.stringify(owner) + '\n', 'utf8'));
      return { ok: true, nonce, dir: lockDir };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
    const owner = gateStoreLockOwner(lockDir);
    let dead;
    if (owner) dead = !gateStorePidAlive(owner.pid, owner.pid_start, procStart);
    else {
      let age = 0;
      try { age = Date.now() - fs.statSync(lockDir).mtimeMs; } catch { age = Infinity; }
      dead = age > GATE_STORE_LOCK_STALE_MS;
    }
    if (!dead) return { ok: false, outcome: 'COMPACTION_BUSY', owner };
    const stale = path.join(store.dir, '.lock.stale-' + (owner && owner.pid ? owner.pid : 0) + '-' + crypto.randomBytes(4).toString('hex'));
    try { fs.renameSync(lockDir, stale); } catch { /* another reclaimer won; retry mkdir */ }
    try { fs.rmSync(stale, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  return { ok: false, outcome: 'COMPACTION_BUSY', owner: gateStoreLockOwner(lockDir) };
}

function gateStoreUnlock(store, lock) {
  if (!store || !store.dir || !lock || !lock.nonce) return false;
  const lockDir = path.join(store.dir, '.lock');
  const owner = gateStoreLockOwner(lockDir);
  if (!owner || owner.nonce !== lock.nonce) return false;
  const gone = path.join(store.dir, '.lock.released-' + crypto.randomBytes(4).toString('hex'));
  try { fs.renameSync(lockDir, gone); } catch { return false; }
  try { fs.rmSync(gone, { recursive: true, force: true }); } catch { /* best effort */ }
  return true;
}

// == compaction (D11, D12; CONTRACT §8 M5) ==
// Fold-preserving reduction over scan-ordered lines: drops only (1) start/finish duplicates on
// (type, run_id, file, leg) after the first, (2) start rows whose (run_id, file, leg) has a finish, and (3) run rows
// (run_start, run_end) of runs that own no kept row and wrote no clean row. Corrupt lines are kept verbatim. Every
// other row is kept, so fold(compact(rows)) equals fold(rows) for every key and every now (T-L1-14).
function gateStoreReduce(lines) {
  const parsed = lines.map((l) => ({ raw: l.raw, row: gateRowParse(l.raw) }));
  const finished = new Set();
  for (const p of parsed) {
    if (p.row && p.row.type === 'finish') finished.add(p.row.run_id + '\0' + p.row.file + '\0' + (p.row.leg || 'unit'));
  }
  const seen = new Set();
  const keep = parsed.map(() => true);
  const owning = new Set();
  parsed.forEach((p, i) => {
    const r = p.row;
    if (!r) return;
    if (r.type === 'start' || r.type === 'finish') {
      const k = r.type + '\0' + r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit');
      if (seen.has(k)) { keep[i] = false; return; }
      seen.add(k);
      if (r.type === 'start' && finished.has(r.run_id + '\0' + r.file + '\0' + (r.leg || 'unit'))) { keep[i] = false; return; }
      owning.add(r.run_id);
    }
    if (r.type === 'clean') owning.add(r.run_id);
  });
  parsed.forEach((p, i) => {
    const r = p.row;
    if (r && (r.type === 'run_start' || r.type === 'run_end') && !owning.has(r.run_id)) keep[i] = false;
  });
  return parsed.filter((_, i) => keep[i]).map((p) => p.raw);
}

function gateStoreSleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function gateStoreSizes(dir) {
  const out = {};
  for (const s of gateStoreSegments(dir)) {
    try { out[s.name] = fs.statSync(path.join(dir, s.name)).size; } catch { /* vanished */ }
  }
  return out;
}

function gateStoreFlakyView(store, lines, now) {
  const items = lines.map((raw, pos) => gateStoreItem(raw, pos));
  const byFile = new Map();
  for (const it of items) {
    if (!it.ok || it.row.type !== 'finish') continue;
    byFile.set(it.row.file + '\0' + (it.row.leg || 'unit'), it.row);
  }
  const files = [];
  for (const [fk, last] of byFile) {
    const [file, leg] = fk.split('\0');
    const f = gateFold(items, { key: last.key, components: last.components || {} }, now, { file, leg, resume: true });
    if (f.state === 'FLAKY' || f.state === 'UNSTABLE_UNDER_REUSE') files.push({ file, leg, key: last.key, state: f.state });
  }
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.leg < b.leg ? -1 : 1));
  atomicWriteJson(path.join(store.dir, 'views', 'flaky.json'), { schema: 'rtg-flaky-view/1', at: new Date(now).toISOString(), files });
  return files.length;
}

// gateStoreCompact(store, {now, env, procStart, settleMs, log}) => {outcome, states, ...}
// outcome: COMPACTED | COMPACTION_BUSY | ROLLED_BACK (states lists COMPACTING, COMPACTION_ABORTED, ROLLED_BACK).
function gateStoreCompact(store, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const fault = env.DO_IT_FAULT || '';
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const log = o.log || ((m) => process.stderr.write(m + '\n'));
  const settleMs = Number.isFinite(o.settleMs) ? o.settleMs : 250;
  if (!store || !store.dir) return { outcome: 'GATE_STORE_UNAVAILABLE', states: [] };
  const states = ['COMPACTING'];
  const lock = gateStoreLock(store, o);
  if (!lock.ok) return { outcome: 'COMPACTION_BUSY', states: ['COMPACTION_BUSY'], owner: lock.owner || null };
  const dir = store.dir;
  const tmpDir = path.join(dir, 'tmp');
  const tmpBase = path.join(tmpDir, 'base-' + lock.nonce + '.jsonl');
  try {
    // 2: freeze the active file as the next segment
    const before = gateStoreReadAll(store, { withActive: false });
    let maxN = 0;
    for (const s of gateStoreSegments(dir)) maxN = Math.max(maxN, s.n);
    for (const name of Object.keys(before.absorbedOld)) {
      const m = GATE_STORE_SEG_RE.exec(name);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    const active = path.join(dir, GATE_STORE_ROWS);
    let st = null;
    try { st = fs.statSync(active); } catch { st = null; }
    if (st && st.size > 0) fs.renameSync(active, path.join(dir, 'results.seg-' + (maxN + 1) + '.jsonl'));
    // 3: wait until every frozen segment's size is stable across two reads settleMs apart
    let prev = gateStoreSizes(dir);
    for (let i = 0; i < 40; i++) {
      gateStoreSleep(settleMs);
      const cur = gateStoreSizes(dir);
      if (canonicalJson(cur) === canonicalJson(prev)) break;
      prev = cur;
    }
    // 4: read base + segment tails, reduce, write the temp base
    const read = gateStoreReadAll(store, { withActive: false });
    if (read.source !== 'local') throw fail('GATE_STORE_UNAVAILABLE', 1, {});
    const late = read.lines.filter((l) => l.tail && Object.prototype.hasOwnProperty.call(read.absorbedOld, l.from)).length;
    const kept = gateStoreReduce(read.lines);
    const absorbed = {};
    for (const [name, size] of Object.entries(read.segSizes)) absorbed[name] = size;
    const metaBody = { schema: GATE_STORE_BASE_SCHEMA, absorbed, at: new Date(now).toISOString() };
    const metaLine = canonicalJson({ ...metaBody, crc: gateRowCrc(metaBody) });
    const buf = Buffer.from([metaLine, ...kept].join('\n') + '\n', 'utf8');
    atomicWrite(tmpBase, buf);
    if (fault === 'compact_after_tmp') throw fail('FAULT_INJECTED', 1, { fault });
    if (fault === 'compact_steal_lock') {
      atomicWrite(path.join(dir, '.lock', 'owner.json'), Buffer.from(JSON.stringify({ pid: process.pid, pid_start: null, cwd: process.cwd(), at: new Date().toISOString(), nonce: 'stolen-' + crypto.randomBytes(4).toString('hex') }) + '\n', 'utf8'));
    }
    const owner = gateStoreLockOwner(path.join(dir, '.lock'));
    if (!owner || owner.nonce !== lock.nonce) throw fail('COMPACTION_LOCK_LOST', 1, {});
    fs.renameSync(tmpBase, path.join(dir, GATE_STORE_BASE));
    if (fault === 'compact_after_base_rename') throw fail('FAULT_INJECTED', 1, { fault });
    // 5: segments absorbed by the previous compaction are now absorbed twice over; remove them
    for (const name of Object.keys(read.absorbedOld)) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* already gone */ }
    }
    if (late > 0) log('[gate-results] ' + late + ' late rows recovered');
    // 6: derived view, release
    try { gateStoreFlakyView(store, kept, now); } catch { /* derived, never authoritative */ }
    gateStoreUnlock(store, lock);
    states.push('COMPACTED');
    return { outcome: 'COMPACTED', states, kept: kept.length, read: read.lines.length, late };
  } catch (e) {
    states.push('COMPACTION_ABORTED');
    try { fs.rmSync(tmpBase, { force: true }); } catch { /* best effort */ }
    for (const d of [dir, tmpDir]) {
      let names = [];
      try { names = fs.readdirSync(d); } catch { names = []; }
      for (const n of names) if (/\.tmp-\d+-[0-9a-f]{8}$/.test(n)) { try { fs.unlinkSync(path.join(d, n)); } catch { /* best effort */ } }
    }
    gateStoreUnlock(store, lock);
    states.push('ROLLED_BACK');
    return { outcome: 'ROLLED_BACK', states, error: e && (e.outcome || e.code || e.message) };
  }
}

// ---- gate-signals.mjs ----
// Memory signals and process liveness for the gate queue (CONTRACT §2.5, §4.5, §6; PRD-4 D3–D8).
// Every top-level name here starts with gateSignals or gateProc (bundle unique-name rule, G-15).
// MB = 1,048,576 bytes everywhere. The darwin free-page count and the OS free-memory
// call under-read badly on a compressing kernel; the available estimate is the compressor-aware one.

const gateSignalsSwapWindowMs = 5000;
const gateSignalsMB = 1048576;
const gateSignalsSmallCap = 1024 * 1024;

function gateSignalsPressureName(level) {
  const n = Number(level);
  if (n === 1) return 'normal';
  if (n === 2) return 'warn';
  if (n === 4) return 'critical';
  // anything other than 1 waits (PRD-4 D4); an unknown level is named, never guessed
  return Number.isFinite(n) ? 'level ' + n : null;
}

// `vm_stat` text -> { pagesize, counters by label }. Labels are matched by name, never by line position.
function gateSignalsParseVmStat(text) {
  const out = { pagesize: null, counters: {} };
  const head = /page size of (\d+) bytes/.exec(text || '');
  if (head) out.pagesize = Number(head[1]);
  for (const line of String(text || '').split('\n')) {
    const m = /^"?([^":]+)"?:\s+(\d+)\.?\s*$/.exec(line.trim());
    if (m) out.counters[m[1].trim()] = Number(m[2]);
  }
  return out;
}

// `vm.swapusage` text -> used MB (`used = 4602.81M`), or null.
function gateSignalsParseSwapUsage(text) {
  const m = /used = ([\d.]+)([KMG])/.exec(text || '');
  if (!m) return null;
  const v = Number(m[1]);
  const mult = m[2] === 'K' ? 1 / 1024 : m[2] === 'G' ? 1024 : 1;
  return Math.round(v * mult * 100) / 100;
}

// Pure darwin parse over captured text (Q1-01). Returns the signal object without the swap-out rate
// (that needs two reads; see gateSignalsSwapRate) plus the raw Swapouts counter.
function gateSignalsParseDarwin(cap) {
  const vm = gateSignalsParseVmStat(cap.vmstatText);
  const pagesize = Number(cap.pagesizeText) || vm.pagesize || null;
  const memsize = Number(String(cap.memsizeText || '').trim()) || null;
  const pressureRaw = String(cap.pressureText == null ? '' : cap.pressureText).trim();
  const pressure = pressureRaw === '' ? null : gateSignalsPressureName(pressureRaw);
  const unavailable = [];
  if (pressure == null) unavailable.push('pressure');
  const total_mb = memsize ? Math.round(memsize / gateSignalsMB) : null;
  let avail_est_bytes = null;
  const c = vm.counters;
  const anon = c['Anonymous pages'];
  const wired = c['Pages wired down'];
  const comp = c['Pages occupied by compressor'];
  if (memsize && pagesize && [anon, wired, comp].every(Number.isFinite)) {
    const totalPages = Math.floor(memsize / pagesize);
    avail_est_bytes = Math.max(0, totalPages - anon - wired - comp) * pagesize;
  } else unavailable.push('available memory');
  const swap_used_mb = gateSignalsParseSwapUsage(cap.swapText);
  if (swap_used_mb == null) unavailable.push('swap used');
  const swapouts = Number.isFinite(c.Swapouts) ? c.Swapouts : null;
  return {
    source: 'darwin',
    pressure,
    total_mb,
    avail_est_bytes,
    avail_mb: avail_est_bytes == null ? null : Math.round(avail_est_bytes / gateSignalsMB),
    swap_used_mb,
    swapouts,
    pagesize,
    unavailable,
  };
}

// Swap-out rate in MB/s from two cumulative page-counter samples {at_ms, pages, pagesize}; null when the
// two reads are less than the 5 s window apart (CONTRACT §4.5) or a counter is missing.
function gateSignalsSwapRate(prev, cur) {
  if (!prev || !cur || !Number.isFinite(prev.pages) || !Number.isFinite(cur.pages)) return null;
  const dt = cur.at_ms - prev.at_ms;
  if (!(dt >= gateSignalsSwapWindowMs)) return null;
  const pages = Math.max(0, cur.pages - prev.pages);
  return Math.round((pages * (cur.pagesize || prev.pagesize || 4096) / gateSignalsMB / (dt / 1000)) * 1000) / 1000;
}

// Rolling sampler kept in the caller's per-process state: rate over the newest sample at least 5 s old.
function gateSignalsSample(state, sample) {
  if (!state.samples) state.samples = [];
  const s = state.samples;
  if (!Number.isFinite(sample.pages)) return { rate: null, window_ms: null, pending_ms: null };
  s.push(sample);
  let base = null;
  for (let i = s.length - 2; i >= 0; i--) {
    if (sample.at_ms - s[i].at_ms >= gateSignalsSwapWindowMs) { base = s[i]; break; }
  }
  // keep the window bounded: drop samples older than the chosen base
  if (base) { const k = s.indexOf(base); if (k > 0) s.splice(0, k); }
  if (s.length > 64) s.splice(0, s.length - 64);
  if (!base) return { rate: null, window_ms: null, pending_ms: gateSignalsSwapWindowMs - (sample.at_ms - s[0].at_ms) };
  return { rate: gateSignalsSwapRate(base, sample), window_ms: sample.at_ms - base.at_ms, pending_ms: 0 };
}

function gateSignalsExec(file, args) {
  return cp.execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, env: { ...process.env, LC_ALL: 'C' } });
}

// Live darwin read (Q1-01). Each sysctl key is read on its own line; one failing key leaves only its signal
// unavailable. state carries the swap-out sampler between reads of one process.
function gateSignalsReadDarwin(state) {
  const st = state || {};
  const keys = ['kern.memorystatus_vm_pressure_level', 'vm.swapusage', 'hw.memsize', 'hw.pagesize'];
  const vals = {};
  for (const k of keys) {
    try { vals[k] = gateSignalsExec('/usr/sbin/sysctl', ['-n', k]).trim(); } catch { vals[k] = null; }
  }
  let vmstatText = '';
  try { vmstatText = gateSignalsExec('/usr/bin/vm_stat', []); } catch { vmstatText = ''; }
  const at_ms = Date.now();
  const sig = gateSignalsParseDarwin({
    pressureText: vals['kern.memorystatus_vm_pressure_level'],
    swapText: vals['vm.swapusage'],
    memsizeText: vals['hw.memsize'],
    pagesizeText: vals['hw.pagesize'],
    vmstatText,
  });
  const r = gateSignalsSample(st, { at_ms, pages: sig.swapouts, pagesize: sig.pagesize });
  sig.swapout_mb_per_s = r.rate;
  sig.swapout_window_ms = r.window_ms;
  sig.swapout_pending_ms = r.pending_ms;
  if (sig.swapouts == null) sig.unavailable.push('swap-out');
  sig.at = new Date(at_ms).toISOString();
  if (!sig.total_mb && sig.avail_mb == null && sig.pressure == null) return gateSignalsUnavailable(sig.at);
  return sig;
}

function gateSignalsReadSmall(file) {
  try { return readRegularFile(file, gateSignalsSmallCap).toString('utf8'); } catch { return null; }
}

function gateSignalsKb(text, name) {
  const m = new RegExp('^' + name + ':\\s+(\\d+)\\s*kB', 'm').exec(text || '');
  return m ? Number(m[1]) : null;
}

// PSI text -> 'warn' when some avg10 > 10 or full avg10 > 0, else 'normal'; null when unparseable.
function gateSignalsParsePsi(text) {
  const some = /^some\s+avg10=([\d.]+)/m.exec(text || '');
  const full = /^full\s+avg10=([\d.]+)/m.exec(text || '');
  if (!some && !full) return null;
  if (some && Number(some[1]) > 10) return 'warn';
  if (full && Number(full[1]) > 0) return 'warn';
  return 'normal';
}

// Linux read (Q1-02, PRD-4 D5) under a root path so tests feed a fixture tree. Swap-out pages are taken as
// 4 KiB (pswpout counts pages; flagged for a live Linux [REAL] run).
function gateSignalsReadLinux(root, state) {
  const st = state || {};
  const r = root || '/';
  const at_ms = Date.now();
  const meminfo = gateSignalsReadSmall(path.join(r, 'proc', 'meminfo'));
  const unavailable = [];
  const memTotalKb = gateSignalsKb(meminfo, 'MemTotal');
  const memAvailKb = gateSignalsKb(meminfo, 'MemAvailable');
  const swapTotalKb = gateSignalsKb(meminfo, 'SwapTotal');
  const swapFreeKb = gateSignalsKb(meminfo, 'SwapFree');
  let total_mb = memTotalKb == null ? null : Math.round(memTotalKb / 1024);
  let avail_mb = memAvailKb == null ? null : Math.round(memAvailKb / 1024);
  const cg = path.join(r, 'sys', 'fs', 'cgroup');
  const maxText = gateSignalsReadSmall(path.join(cg, 'memory.max'));
  const limit = maxText && /^\d+\s*$/.test(maxText) ? Number(maxText.trim()) : null;
  let psiText = null;
  if (limit != null) {
    const limitMb = Math.round(limit / gateSignalsMB);
    total_mb = total_mb == null ? limitMb : Math.min(total_mb, limitMb);
    const curText = gateSignalsReadSmall(path.join(cg, 'memory.current'));
    if (curText && /^\d+\s*$/.test(curText)) {
      const room = Math.round(Math.max(0, limit - Number(curText.trim())) / gateSignalsMB);
      avail_mb = avail_mb == null ? room : Math.min(avail_mb, room);
    }
    psiText = gateSignalsReadSmall(path.join(cg, 'memory.pressure'));
  }
  if (psiText == null) psiText = gateSignalsReadSmall(path.join(r, 'proc', 'pressure', 'memory'));
  const pressure = gateSignalsParsePsi(psiText);
  if (pressure == null) unavailable.push('pressure');
  if (avail_mb == null) unavailable.push('available memory');
  const swap_used_mb = swapTotalKb != null && swapFreeKb != null ? Math.round((swapTotalKb - swapFreeKb) / 1024 * 100) / 100 : null;
  if (swap_used_mb == null) unavailable.push('swap used');
  const vmstat = gateSignalsReadSmall(path.join(r, 'proc', 'vmstat'));
  const pm = /^pswpout\s+(\d+)/m.exec(vmstat || '');
  const pages = pm ? Number(pm[1]) : null;
  if (pages == null) unavailable.push('swap-out');
  const rr = gateSignalsSample(st, { at_ms, pages, pagesize: 4096 });
  const at = new Date(at_ms).toISOString();
  if (total_mb == null && avail_mb == null && pressure == null) return gateSignalsUnavailable(at);
  return {
    source: 'linux', pressure, total_mb, avail_mb, swap_used_mb,
    swapout_mb_per_s: rr.rate, swapout_window_ms: rr.window_ms, swapout_pending_ms: pages == null ? null : rr.pending_ms,
    unavailable, at,
  };
}

function gateSignalsUnavailable(at, totalMb) {
  return {
    source: 'unavailable', pressure: null,
    total_mb: totalMb || Math.round(os.totalmem() / gateSignalsMB),
    avail_mb: null, swap_used_mb: null, swapout_mb_per_s: null, swapout_window_ms: null, swapout_pending_ms: null,
    unavailable: ['pressure', 'available memory', 'swap used', 'swap-out'], at: at || new Date().toISOString(),
  };
}

// R19 test seam: DO_IT_GATE_SIGNALS names a JSON fixture, re-read on every poll; no sysctl, no 5 s window.
function gateSignalsReadFixture(file) {
  let fx = null;
  try { fx = readJsonRegular(file, gateSignalsSmallCap); } catch { fx = null; }
  const at = new Date().toISOString();
  if (!fx || typeof fx !== 'object') return gateSignalsUnavailable(at);
  if (fx.unavailable === true) return gateSignalsUnavailable(at, Number(fx.total_mb) || null);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sig = {
    source: 'fixture',
    pressure: typeof fx.pressure === 'string' ? fx.pressure : null,
    total_mb: num(fx.total_mb) || Math.round(os.totalmem() / gateSignalsMB),
    avail_mb: num(fx.avail_mb),
    swap_used_mb: num(fx.swap_used_mb),
    swapout_mb_per_s: num(fx.swapout_mb_per_s),
    swapout_window_ms: null, swapout_pending_ms: null,
    unavailable: [], at,
  };
  if (sig.pressure == null) sig.unavailable.push('pressure');
  if (sig.avail_mb == null) sig.unavailable.push('available memory');
  if (sig.swap_used_mb == null) sig.unavailable.push('swap used');
  if (sig.swapout_mb_per_s == null) sig.unavailable.push('swap-out');
  return sig;
}

// One read of the machine (fixture, darwin, linux, or unavailable). opts.env (ctx.env), opts.platform and
// opts.linuxRoot exist for tests. Never blocks for the swap-out window; see gateSignalsReadSettled.
function gateSignalsRead(opts, state) {
  const o = opts || {};
  const env = o.env || process.env;
  if (env.DO_IT_GATE_SIGNALS) return gateSignalsReadFixture(env.DO_IT_GATE_SIGNALS);
  const platform = o.platform || process.platform;
  if (platform === 'darwin') return gateSignalsReadDarwin(state);
  if (platform === 'linux') return gateSignalsReadLinux(o.linuxRoot || '/', state);
  return gateSignalsUnavailable();
}

// A read whose swap-out rate spans the full 5 s window: when the sampler has no old-enough sample yet, wait
// (abortable) and read again. opts.sleep(ms) -> Promise<boolean aborted>.
async function gateSignalsReadSettled(opts, state) {
  let sig = gateSignalsRead(opts, state);
  for (let i = 0; i < 4 && sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0; i++) {
    const aborted = opts && opts.sleep ? await opts.sleep(sig.swapout_pending_ms + 50) : await new Promise((res) => setTimeout(() => res(false), sig.swapout_pending_ms + 50));
    if (aborted) return sig;
    sig = gateSignalsRead(opts, state);
  }
  return sig;
}

// Budget-only when no memory signal is readable (CONTRACT §6).
function gateSignalsBudgetOnly(sig) {
  return sig.source === 'unavailable' || (sig.pressure == null && sig.avail_mb == null && sig.swap_used_mb == null && sig.swapout_mb_per_s == null);
}

function gateSignalsGb(mb) {
  return (mb / 1024).toFixed(1);
}

// R13 conditions in order (PRD-4 D11). peakMb null = exclusive: reserves the whole budget, and the
// available-memory check is skipped (no declared number to compare; pressure and swap still guard).
// Returns { admit, reason, wait_for } — wait_for is the reason without its "(now …)" detail.
function gateSignalsDecide(sig, q) {
  const peak = q.peakMb == null ? q.budgetMb : q.peakMb;
  if (sig.pressure != null && sig.pressure !== 'normal') {
    return { admit: false, reason: 'memory pressure normal (now ' + sig.pressure + ')', wait_for: 'memory pressure normal' };
  }
  if (sig.swapout_mb_per_s != null && sig.swapout_mb_per_s > 1) {
    return { admit: false, reason: 'swap-out to stop (' + sig.swapout_mb_per_s.toFixed(1) + ' MB/s)', wait_for: 'swap-out to stop' };
  }
  if (q.peakMb != null && sig.avail_mb != null && sig.avail_mb < q.peakMb) {
    return { admit: false, reason: gateSignalsGb(q.peakMb) + ' GB free (' + gateSignalsGb(sig.avail_mb) + ' GB now)', wait_for: gateSignalsGb(q.peakMb) + ' GB free' };
  }
  if (q.swapUsedMaxMb != null && sig.swap_used_mb != null && sig.swap_used_mb > q.swapUsedMaxMb) {
    return { admit: false, reason: 'swap used below ' + q.swapUsedMaxMb + ' MB (' + Math.round(sig.swap_used_mb) + ' MB now)', wait_for: 'swap used below ' + q.swapUsedMaxMb + ' MB' };
  }
  if (q.heldMb + peak > q.budgetMb) {
    return { admit: false, reason: 'budget (' + q.heldMb + ' MB held + ' + peak + ' MB > ' + q.budgetMb + ' MB)', wait_for: 'budget' };
  }
  return { admit: true, reason: null, wait_for: null };
}

// ---- process start time and liveness (CONTRACT §2.5, PRD-4 D3) ----

// Start times for many pids in one `ps` call (darwin) or /proc reads (linux). Map pid -> 'darwin:{text}' |
// 'linux:{ticks}'. A pid missing from the map had no readable start time (dead, hidden, or ps failed).
function gateProcStartMany(pids, platform) {
  const plat = platform || process.platform;
  const out = new Map();
  const list = Array.from(new Set(pids.filter((p) => Number.isInteger(p) && p > 0)));
  if (!list.length) return out;
  if (plat === 'darwin') {
    let text = '';
    try {
      text = gateSignalsExec('/bin/ps', ['-o', 'pid=,lstart=', '-p', list.join(',')]);
    } catch (e) {
      text = e && typeof e.stdout === 'string' ? e.stdout : '';
    }
    for (const line of text.split('\n')) {
      const m = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
      if (m) out.set(Number(m[1]), 'darwin:' + m[2]);
    }
    return out;
  }
  if (plat === 'linux') {
    for (const pid of list) {
      const stat = gateSignalsReadSmall('/proc/' + pid + '/stat');
      if (!stat) continue;
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      // fields after "pid (comm)" start at field 3; starttime is field 22
      if (rest[19] && /^\d+$/.test(rest[19])) out.set(pid, 'linux:' + rest[19]);
    }
  }
  return out;
}

function gateProcStart(pid) {
  return gateProcStartMany([pid]).get(pid) || null;
}

function gateProcSignalZero(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); }
}

// 'alive' | 'alive-unverified' (answers kill 0, start time unreadable: fail toward waiting) | 'dead' |
// 'start time differs'. starts: optional Map from gateProcStartMany for batching.
function gateProcState(pid, start, starts) {
  if (!Number.isInteger(pid) || pid <= 0) return 'dead';
  if (!gateProcSignalZero(pid)) return 'dead';
  if (!start) return 'alive-unverified';
  const now = starts ? starts.get(pid) : gateProcStart(pid);
  if (!now) return gateProcSignalZero(pid) ? 'alive-unverified' : 'dead';
  return now === start ? 'alive' : 'start time differs';
}

function gateProcAlive(pid, start, starts) {
  const s = gateProcState(pid, start, starts);
  return s === 'alive' || s === 'alive-unverified';
}

// Parent pid (for the ancestor walk of nested admission).
function gateProcParent(pid, platform) {
  const plat = platform || process.platform;
  if (plat === 'linux') {
    const stat = gateSignalsReadSmall('/proc/' + pid + '/stat');
    if (!stat) return null;
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return Number(rest[1]) || null;
  }
  try {
    const t = gateSignalsExec('/bin/ps', ['-o', 'ppid=', '-p', String(pid)]).trim();
    return Number(t) || null;
  } catch { return null; }
}

// ---- handoff.mjs ----
const HANDOFF_MAX_CHARS = 32000;
const HANDOFF_EVENTS = 5;
const HANDOFF_EVENT_CLIP = 700;

function handoffPath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'handoff.md');
}

// Files a fresh process needs: the run's own files plus whatever the last result
// listed in resume.state_files. Declared files that are gone are returned as missing.
function collectStateFiles(ctx, runId, state) {
  const dir = runDir(ctx, runId);
  const found = [];
  const missing = [];
  const add = (abs, required) => {
    if (fs.existsSync(abs)) { if (!found.includes(abs)) found.push(abs); } else if (required) missing.push(abs);
  };
  for (const n of ['state.json', 'events.jsonl', 'ledger.json', 'owner-pack.json']) add(path.join(dir, n), n === 'state.json');
  add(path.join(ctx.home, 'finish-line.json'), false);
  add(path.join(ctx.home, 'plan', 'READINESS.json'), false);
  const declared = state.handoff_state && Array.isArray(state.handoff_state.state_files) ? state.handoff_state.state_files : [];
  for (const rel of declared) add(path.resolve(ctx.repo, rel), true);
  return { files: found, missing };
}

function nextActionOf(state) {
  const h = state.handoff_state;
  if (h && typeof h.next_action === 'string' && h.next_action.trim()) return h.next_action.trim();
  return 'run `do-it next --run ' + state.run_id + '` and follow its action';
}

function resumeCommand(runId) {
  return 'do-it resume --run ' + runId;
}

function lastEvents(ctx, runId, n) {
  let lines = [];
  try { lines = readText(eventsPath(ctx, runId), BULK_READ_CAP).split('\n').filter(Boolean); } catch { /* none yet */ }
  return lines.slice(-n).map((l) => (l.length > HANDOFF_EVENT_CLIP ? l.slice(0, HANDOFF_EVENT_CLIP) : l));
}

function renderHandoff(ctx, state, files, board, events) {
  const lines = [
    '# do-it handoff ' + state.run_id,
    '',
    'resume_prompt: You are the fresh conductor for run ' + state.run_id + '. Read this file, call `' + resumeCommand(state.run_id) + '`, then `do-it next` and follow it.',
    'run_status: ' + state.status,
    'next_action: ' + nextActionOf(state),
    '',
    'state_files:',
    ...files.map((f) => '- ' + f),
    '',
    'board:',
    board,
    '',
    'events (last ' + HANDOFF_EVENTS + '):',
    ...events.map((e) => '- ' + e),
    '',
  ];
  return lines.join('\n');
}

function runContinueHook(ctx, hook, file) {
  const r = cp.spawnSync(hook, [file], { env: ctx.env, cwd: ctx.cwd, stdio: 'ignore', timeout: 120000 });
  return { ok: !r.error && r.status === 0, status: r.error ? null : r.status, error: r.error ? r.error.code || 'spawn_error' : null };
}

function escalateHandoffCap(ctx, runId, state, cap) {
  packAppend(ctx, runId, [{
    kind: 'owner-gate',
    text: 'The handoff cap of ' + cap + ' was reached without a fresh conductor starting. Start one by hand (' + resumeCommand(runId) + ') or stop the run?',
    options: ['start by hand', 'stop run'],
    recommendation: 'start by hand',
    default: 'start by hand',
    reversible: true,
  }]);
  if (state.status !== 'ESCALATED') {
    const from = state.status;
    state.status = 'ESCALATED';
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'handoff_escalated', stage: state.stage, host: state.host, verdict: 'ESCALATED', detail: { from, handoffs: state.handoffs, cap } });
  }
  return { outcome: 'ESCALATED', exit: 2, run_id: runId, status: 'ESCALATED', handoffs: state.handoffs, cap, message: 'handoff cap of ' + cap + ' reached; owner pack asks' };
}

// M3: write handoff.md, count the attempt, then start a fresh conductor through the
// host's continue hook (env DO_IT_HOST_CONTINUE, the handoff path as its only argument).
function cmdHandoff(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const settings = loadSettings(ctx, args.sets).values.handoff;
  const cap = settings.max_per_run;
  if (state.handoffs >= cap) return escalateHandoffCap(ctx, runId, state, cap);

  const { files, missing } = collectStateFiles(ctx, runId, state);
  if (missing.length) throw fail('HANDOFF_PATH_INVALID', 1, { run_id: runId, missing });
  const board = renderBoard(rowsForRun(readFinishLine(ctx), runId, adoptsUnattributed(state)));
  const events = lastEvents(ctx, runId, HANDOFF_EVENTS);
  let text = renderHandoff(ctx, state, files, board, events);
  if (text.length > HANDOFF_MAX_CHARS) text = renderHandoff(ctx, state, files, board.slice(0, 1200), events.map((e) => e.slice(0, 200))).slice(0, HANDOFF_MAX_CHARS);
  const file = handoffPath(ctx, runId);
  atomicWrite(file, text);

  state.handoffs += 1;
  state.handoff_state = { ...(typeof state.handoff_state === 'object' && state.handoff_state ? state.handoff_state : {}), path: file, written_at: ctx.now(), state_files: (state.handoff_state && state.handoff_state.state_files) || [] };
  const hook = ctx.env.DO_IT_HOST_CONTINUE;
  const mode = settings.mode === 'ask' || !hook ? 'ask' : 'auto';
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'handoff_written', stage: state.stage, host: state.host, verdict: mode, detail: { path: file, attempt: state.handoffs } });

  if (mode === 'ask') {
    const line = 'Run: ' + resumeCommand(runId) + '   (handoff: ' + file + ')';
    return { outcome: 'HANDOFF_ASK', exit: 2, run_id: runId, mode, handoffs: state.handoffs, handoff: file, command: line, say: [line] };
  }
  const hr = runContinueHook(ctx, hook, file);
  if (hr.ok) {
    appendEvent(ctx, runId, { event: 'handoff_started', stage: state.stage, host: state.host, verdict: 'HANDOFF_STARTED', detail: { attempt: state.handoffs } });
    return { outcome: 'HANDOFF_STARTED', exit: 0, run_id: runId, mode, handoffs: state.handoffs, handoff: file };
  }
  appendEvent(ctx, runId, { event: 'handoff_failed', stage: state.stage, host: state.host, verdict: 'HANDOFF_FAILED', detail: { attempt: state.handoffs, exit: hr.status, error: hr.error } });
  if (state.handoffs >= cap) return escalateHandoffCap(ctx, runId, state, cap);
  throw fail('HANDOFF_FAILED', 1, { run_id: runId, mode, handoffs: state.handoffs, handoff: file, hook_exit: hr.status, retry_allowed: true });
}

// ---- hash.mjs ----
function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(readRegularFile(file, BULK_READ_CAP));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

// ---- init.mjs ----
const ENV_EXAMPLE_TEXT = [
  '# Credential NAMES only. Values live in the secrets provider named in',
  '# .do-it/settings.json (references only), never in this file.',
  '# Add one NAME= line per credential the project needs, with no value.',
  '',
].join('\n');

const GITIGNORE_LINES = ['.do-it/runs/', '.secrets/'];

function writeIfDifferent(file, text) {
  let current = null;
  try { current = readText(file); } catch { /* absent */ }
  if (current === text) return false;
  atomicWrite(file, text);
  return true;
}

function cmdInit(ctx, args) {
  const f = args.flags;
  const provider = f['secrets-provider'];
  const ref = f['secrets-ref'];
  const schema = loadSchemaFile('settings.schema.json');
  fs.mkdirSync(ctx.home, { recursive: true });
  const settingsFile = path.join(ctx.home, 'settings.json');
  let settings;
  let existed = fs.existsSync(settingsFile);
  if (existed) {
    try { settings = JSON.parse(readText(settingsFile)); } catch (e) {
      throw fail('SETTINGS_INVALID', 1, { errors: [{ file: settingsFile, pointer: '', message: 'JSON parse error: ' + e.message }] });
    }
  } else {
    settings = settingsClone(SETTINGS_DEFAULTS);
  }
  if (!isPlainObject(settings.secrets)) settings.secrets = settingsClone(SETTINGS_DEFAULTS.secrets);
  if (provider !== undefined) settings.secrets.provider = provider;
  if (ref !== undefined) settings.secrets.ref = ref;
  const secretHits = settingsScanSecrets(settings, '', []);
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, { errors: secretHits.map((k) => ({ file: settingsFile, key: k, pointer: '/' + k.split('.').join('/') })) });
  }
  const errors = validateSchema(schema, settings);
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors: errors.map((e) => ({ file: settingsFile, pointer: e.pointer, message: e.message })) });

  const changed = [];
  if (writeIfDifferent(settingsFile, JSON.stringify(settings, null, 2) + '\n')) changed.push(settingsFile);
  const envExample = path.join(ctx.home, '.env.example');
  if (!fs.existsSync(envExample) && writeIfDifferent(envExample, ENV_EXAMPLE_TEXT)) changed.push(envExample);

  const ignoreFile = path.join(ctx.repo, '.gitignore');
  let ignoreText = '';
  try { ignoreText = readText(ignoreFile); } catch { /* absent */ }
  const present = new Set(ignoreText.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !present.has(l));
  if (missing.length) {
    const prefix = ignoreText.length && !ignoreText.endsWith('\n') ? '\n' : '';
    atomicWrite(ignoreFile, ignoreText + prefix + missing.join('\n') + '\n');
    changed.push(ignoreFile);
  }
  return {
    outcome: changed.length ? 'INIT_OK' : 'INIT_NOOP',
    exit: 0,
    root: ctx.root,
    home: ctx.home,
    changed,
    secrets: settings.secrets,
  };
}

// ---- install.mjs ----
function installSource() {
  const self = fileURLToPath(import.meta.url);
  if (path.basename(self) === 'do-it.mjs') return self;
  return path.join(path.dirname(self), '..', 'do-it.mjs');
}

function cmdInstall(ctx, args = { flags: {} }) {
  const source = installSource();
  if (!fs.existsSync(source)) throw fail('INSTALL_NO_BUILD', 1, { message: 'run node core/spine/build.mjs first', source });
  const binDir = ctx.env.DO_IT_BIN_DIR ? path.resolve(ctx.cwd, ctx.env.DO_IT_BIN_DIR) : path.join(ctx.userHome, '.do-it', 'bin');
  const dest = path.join(binDir, 'do-it');
  // --dry-run never touches disk: it reports the plan only (CP-04 part A, D1).
  if (args && args.flags && args.flags['dry-run']) return { outcome: 'INSTALL_PLANNED', exit: 0, dry_run: true, bin_dir: binDir, path: dest, version: DO_IT_VERSION, source };
  fs.mkdirSync(binDir, { recursive: true });
  atomicWrite(dest, readRegularFile(source, BULK_READ_CAP));
  fs.chmodSync(dest, 0o755);
  let printed = '';
  try {
    printed = cp.execFileSync(process.execPath, [dest, '--version'], { encoding: 'utf8', env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw fail('INSTALL_VERIFY_FAILED', 1, { dest, message: 'installed file did not run: ' + e.message });
  }
  if (printed !== DO_IT_VERSION) throw fail('INSTALL_VERIFY_FAILED', 1, { dest, printed, expected: DO_IT_VERSION });
  return { outcome: 'INSTALLED', exit: 0, bin_dir: binDir, path: dest, version: printed, sha256: sha256File(dest) };
}

function loadCompanions(ctx) {
  const candidates = [
    path.join(path.dirname(installSource()), '..', 'companions.json'),
    path.join(ctx.root, 'core', 'companions.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(readText(file));
  }
  throw fail('INSTALL_NO_COMPANIONS', 1, { message: 'core/companions.json not found', tried: candidates });
}

// Fallback for hosts without a plugin manifest: one `npx skills add` per
// required companion, in order, recorded per host so a re-run installs only the
// missing ones. Stops at the first failure (PARTIAL_FAILURE).
function cmdInstallCompanions(ctx, args) {
  const host = args.flags.host;
  const dry = !!args.flags['dry-run'];
  const required = loadCompanions(ctx).companions.filter((c) => c.required);
  const stateFile = path.join(ctx.home, 'companions-installed.json');
  let done = {};
  try { done = JSON.parse(readText(stateFile)); } catch { done = {}; }
  const have = new Set(done[host] || []);
  const cmdOf = (c) => ['skills', 'add', c.repo, '-a', host];
  const todo = required.filter((c) => !have.has(c.name));
  const finished = required.filter((c) => have.has(c.name)).map((c) => c.name);
  if (dry) {
    // Optional companions are listed (never installed by this command) so the owner can opt in by hand.
    const optional = loadCompanions(ctx).companions.filter((c) => !c.required && c.status === 'published');
    const lines = todo.map((c) => 'npx ' + cmdOf(c).join(' '));
    for (const c of optional) lines.push('optional: npx ' + cmdOf(c).join(' ') + '  # ' + c.name + ' ' + c.version);
    return { outcome: 'INSTALL_DRY_RUN', exit: 0, host, lines };
  }
  for (const c of todo) {
    const r = cp.spawnSync('npx', cmdOf(c), { encoding: 'utf8', env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) {
      return {
        outcome: 'PARTIAL_FAILURE',
        exit: 1,
        host,
        failed: c.name,
        finished,
        missing: todo.slice(todo.indexOf(c)).map((x) => x.name),
        message: ((r.stderr || '') + (r.error ? String(r.error.message) : '')).trim(),
      };
    }
    finished.push(c.name);
    done[host] = finished.slice();
    atomicWriteJson(stateFile, done);
  }
  return { outcome: 'INSTALLED_COMPANIONS', exit: 0, host, finished, missing: [] };
}

// ---- ladder.mjs ----
// Failure ladder (D14, CONTRACT M1): FAILED, retry one tier up once with a
// written reason, second failure ESCALATED.
const TIER_UP = { T3: 'T2', T2: 'T1', T1: 'T1' };
const RETRY_REASON = 'retry after FAILED';
const LADDER_MAX_ATTEMPTS = 2;

function ladderEscalated(slice) {
  return (slice.attempts || 0) >= LADDER_MAX_ATTEMPTS;
}

// Called by `next`: every FAILED slice with one attempt is requeued one tier up.
// Returns the changes so the caller can log them.
function ladderRetry(state) {
  const changes = [];
  for (const s of state.slices) {
    if (s.status !== 'FAILED' || ladderEscalated(s)) continue;
    const from = s.tier || 'T2';
    s.tier = TIER_UP[from] || 'T1';
    s.escalations = (s.escalations || 0) + 1;
    s.status = 'READY';
    changes.push({ slice_id: s.id, from, to: s.tier, reason: RETRY_REASON });
  }
  return changes;
}

function escalationQuestion(slice) {
  return {
    kind: 'owner-gate',
    text: 'Slice ' + slice.id + ' failed twice (attempts ' + slice.attempts + ', last tier ' + (slice.tier || 'unknown') + ') and was escalated. How should it proceed?',
    options: ['re-plan slice', 'take over manually', 'drop slice'],
    recommendation: 're-plan slice',
    default: 're-plan slice',
    reversible: true,
  };
}

// ---- ledger.mjs ----
function ledgerPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'ledger.json');
}

function readLedger(ctx, runId) {
  const l = readJsonIfExists(ledgerPath(ctx, runId));
  if (!l || !Array.isArray(l.rows)) return { schema: 'do-it-ledger/1', run_id: runId, rows: [] };
  return l;
}

function writeLedger(ctx, ledger) {
  const errors = validateSchema(loadSchemaFile('ledger.schema.json'), ledger);
  if (errors.length) throw fail('LEDGER_INVALID', 1, { errors });
  atomicWriteJson(ledgerPath(ctx, ledger.run_id), ledger);
}

// One row per id: the latest verdict wins, recorded_at is kept from the first write.
function ledgerUpsert(ledger, row) {
  const i = ledger.rows.findIndex((r) => r.row === row.row);
  if (i === -1) {
    ledger.rows.push(row);
  } else {
    ledger.rows[i] = { ...row, recorded_at: ledger.rows[i].recorded_at };
  }
}

// ---- legs.mjs ----
// Deploy legs (D17): the multi-leg cascade PARTIAL_FAILURE -> ROLLED_BACK -> re-verify,
// or ESCALATED when a compensation fails. Pure planning; record.mjs persists it.
const LEG_PASSED = 'DEPLOYED_VERIFIED';

function legsLookRolledBack(state, result) {
  if (result.rollback === true) return true;
  const legs = result.legs || [];
  if (legs.some((l) => l.state === 'ROLLED_BACK' || l.state === 'ROLLBACK_FAILED')) return true;
  const plan = state.deploy && state.deploy.rollback_plan;
  if (state.status === 'PARTIAL_FAILURE' && Array.isArray(plan) && plan.length) {
    return legs.length > 0 && legs.every((l) => plan.includes(l.leg) && !String(l.state).startsWith('DEPLOYED'));
  }
  return false;
}

function legRow(leg, resolved, now, extra) {
  const base = {
    evidence: leg.evidence || null,
    evidence_path: resolved ? resolved.path : null,
    evidence_sha256: resolved ? resolved.sha256 : null,
    real: false,
    reason: null,
    recorded_at: now,
    updated_at: now,
  };
  return { ...base, ...extra };
}

// Returns { runStatus, outcome, exit, deploy, ledgerRows, events, questions, flOps }.
function planDeploy(ctx, runId, state, result, resolveLeg) {
  const now = ctx.now();
  const legs = result.legs;
  const prev = state.deploy || { legs: [], rollback_plan: [], rollback_event_ts: null };
  const plan = { ledgerRows: [], events: [], questions: [], flOps: [] };

  if (legsLookRolledBack(state, result)) {
    const legStates = prev.legs.map((l) => ({ ...l }));
    const failedLegs = [];
    for (const leg of legs) {
      const r = resolveLeg(leg);
      const rolled = leg.state === 'ROLLED_BACK' && result.status !== 'failed';
      const existing = legStates.find((l) => l.leg === leg.leg);
      const entry = { leg: leg.leg, state: rolled ? 'ROLLED_BACK' : 'ROLLBACK_FAILED', evidence: leg.evidence || null, evidence_sha256: r ? r.sha256 : null, compensate: existing ? existing.compensate : null };
      if (existing) Object.assign(existing, entry); else legStates.push(entry);
      if (rolled) {
        plan.ledgerRows.push(legRow(leg, r, now, { row: 'ROLLBACK:' + leg.leg, verdict: 'VERIFIED' }));
        plan.ledgerRows.push(legRow(leg, null, now, { row: 'DEPLOY:' + leg.leg, verdict: 'IMPLEMENTED-NOT-VERIFIED', evidence: null, reason: 'rolled_back' }));
      } else {
        failedLegs.push({ leg: leg.leg, evidence: leg.evidence || null });
      }
    }
    if (failedLegs.length) {
      const f = failedLegs[0];
      plan.questions.push({
        kind: 'owner-gate',
        text: 'Rollback of leg ' + f.leg + ' failed (evidence: ' + (f.evidence || 'none') + '). The deploy is half rolled back; how should it be resolved?',
        options: ['retry rollback', 'manual rollback', 'leave as is'],
        recommendation: 'manual rollback',
        default: 'manual rollback',
        reversible: false,
      });
      plan.events.push({ event: 'rollback_failed', stage: result.stage, verdict: 'ESCALATED', detail: { legs: failedLegs.map((x) => x.leg) } });
      plan.runStatus = 'ESCALATED';
      plan.outcome = 'ESCALATED';
      plan.exit = 2;
      plan.deploy = { ...prev, legs: legStates };
      return plan;
    }
    const order = prev.rollback_plan || [];
    const complete = order.length > 0 && order.every((name) => (legStates.find((l) => l.leg === name) || {}).state === 'ROLLED_BACK');
    plan.deploy = { ...prev, legs: legStates, rollback_event_ts: complete ? now : prev.rollback_event_ts };
    if (complete) {
      plan.events.push({ event: 'rolled_back', stage: result.stage, verdict: 'ROLLED_BACK', ts: now, detail: { legs: order } });
      plan.runStatus = 'ROLLED_BACK';
      plan.outcome = 'ROLLED_BACK';
      plan.exit = 0;
    } else {
      plan.events.push({ event: 'rollback_recorded', stage: result.stage, verdict: null, detail: { legs: legs.map((l) => l.leg) } });
      plan.runStatus = state.status;
      plan.outcome = 'RECORDED';
      plan.exit = 0;
    }
    return plan;
  }

  const legStates = legs.map((leg) => {
    const r = resolveLeg(leg);
    return { leg: leg.leg, state: leg.state, evidence: leg.evidence || null, evidence_sha256: r ? r.sha256 : null, compensate: leg.compensate === undefined ? null : leg.compensate };
  });
  for (const leg of legs) {
    const r = resolveLeg(leg);
    const passed = leg.state === LEG_PASSED;
    plan.ledgerRows.push(legRow(leg, r, now, { row: 'DEPLOY:' + leg.leg, verdict: passed ? 'VERIFIED' : 'IMPLEMENTED-NOT-VERIFIED', reason: passed ? null : 'leg_' + String(leg.state).toLowerCase() }));
  }
  const passedLegs = legs.filter((l) => l.state === LEG_PASSED).map((l) => l.leg);
  const anyFailed = legs.some((l) => l.state === 'FAILED');
  const needsHuman = legs.some((l) => l.state === 'NEEDS_HUMAN');
  plan.deploy = { legs: legStates, rollback_plan: [], rollback_event_ts: prev.rollback_event_ts || null };
  if (anyFailed && passedLegs.length) {
    plan.deploy.rollback_plan = passedLegs.slice().reverse();
    plan.runStatus = 'PARTIAL_FAILURE';
    plan.outcome = 'PARTIAL_FAILURE';
    plan.exit = 1;
    plan.events.push({ event: 'partial_failure', stage: result.stage, verdict: 'PARTIAL_FAILURE', detail: { passed: passedLegs, failed: legs.filter((l) => l.state === 'FAILED').map((l) => l.leg) } });
  } else if (anyFailed) {
    plan.runStatus = 'FAILED';
    plan.outcome = 'DEPLOY_FAILED';
    plan.exit = 1;
    plan.events.push({ event: 'deploy_failed', stage: result.stage, verdict: 'FAILED', detail: { failed: legs.map((l) => l.leg) } });
  } else if (needsHuman) {
    plan.runStatus = 'NEEDS_HUMAN';
    plan.outcome = 'RECORDED';
    plan.exit = 2;
  } else if (passedLegs.length === legs.length) {
    plan.runStatus = 'PROVING';
    plan.outcome = 'RECORDED';
    plan.exit = EXIT_FOR_STATUS[result.status];
    plan.events.push({ event: 'deploy_verified', stage: result.stage, verdict: 'PROVING', detail: { legs: passedLegs } });
  } else {
    plan.runStatus = 'DEPLOYING';
    plan.outcome = 'RECORDED';
    plan.exit = EXIT_FOR_STATUS[result.status];
  }
  return plan;
}

// ROLLED_BACK -> DEPLOYING demands evidence written after the rollback event.
function staleLegsAfterRollback(state, legs, resolveLeg) {
  const ts = state.deploy && state.deploy.rollback_event_ts;
  if (!ts) return [];
  const cutoff = Date.parse(ts);
  const stale = [];
  for (const leg of legs) {
    const r = resolveLeg(leg);
    if (!r || r.mtime_ms < cutoff) stale.push(leg.leg);
  }
  return stale;
}

// ---- meter.mjs ----
function meterPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'token-meter.jsonl');
}

// meter --append --row '<json>' (or the individual flags). A row without a
// source is refused and never appended (ruling D17, G-6).
function cmdMeter(ctx, args) {
  const f = args.flags;
  if (!f.append) throw fail('USAGE', 1, { message: 'meter requires --append' });
  const runId = selectRunId(ctx, f);
  loadState(ctx, runId);
  let input = {};
  if (f.row !== undefined) {
    try { input = JSON.parse(f.row); } catch (e) { throw fail('METER_ROW_INVALID', 1, { message: 'row is not JSON: ' + e.message }); }
  } else {
    for (const [flag, key] of [['tokens-in', 'tokens_in'], ['tokens-out', 'tokens_out'], ['cache-read', 'cache_read'], ['cache-write', 'cache_write']]) {
      if (f[flag] !== undefined) input[key] = Number(f[flag]);
    }
    if (f.source !== undefined) input.source = f.source;
    if (f.estimated !== undefined) input.estimated = f.estimated === true || f.estimated === 'true';
    for (const [flag, key] of [['slice-id', 'slice_id'], ['stage', 'stage'], ['persona', 'persona'], ['tier', 'tier'], ['model', 'model'], ['host', 'host'], ['event', 'event'], ['parent-id', 'parent_id']]) {
      if (f[flag] !== undefined) input[key] = f[flag];
    }
  }
  if (input.source === undefined || input.source === null || input.source === '') {
    throw fail('METER_SOURCE_REQUIRED', 1, { message: 'a meter row needs source: provider, estimate or unknown' });
  }
  const row = buildEventRow(ctx, runId, { ...input, event: input.event || 'meter' });
  for (const k of ['tokens_in', 'tokens_out', 'cache_read', 'cache_write']) row[k] = input[k] === undefined ? 0 : input[k];
  row.estimated = input.estimated === undefined ? false : input.estimated;
  row.source = input.source;
  if (input.extra !== undefined) row.extra = input.extra;
  const errors = validateSchema(loadSchemaFile('token-meter.schema.json'), row);
  if (errors.length) throw fail('METER_ROW_INVALID', 1, { errors });
  appendJsonLine(meterPath(ctx, runId), row);
  return { outcome: 'METER_APPENDED', exit: 0, run_id: runId, row };
}

// ---- migrate.mjs ----
// Legacy folder -> destination folder under .do-it/ (copy only, ruling D12).
const MIGRATION_MAP = [
  { legacy: '.build-it-reports', dest: 'build/build-it-reports' },
  { legacy: '.fable-it-reports', dest: 'build/fable-it-reports' },
  { legacy: '.plan-it', dest: 'plan/plan-it' },
];
const TERMINAL_RUN_STATUSES = ['DONE', 'ESCALATED', 'FAILED'];

function migrateWalk(dir, rel, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) migrateWalk(abs, r, out);
    else if (e.isFile()) out.push({ abs, rel: r });
  }
  return out;
}

function cmdMigrate(ctx) {
  const inFlight = listRunIds(ctx).filter((id) => !TERMINAL_RUN_STATUSES.includes(peekRunStatus(ctx, id)));
  if (inFlight.length) {
    throw fail('MIGRATE_REFUSED', 1, { run_id: inFlight[0], runs: inFlight, message: 'a run is in flight; finish or close it first' });
  }
  const manifestFile = path.join(ctx.home, 'migration.json');
  let manifest = { schema: 'do-it-migration/1', files: [] };
  try { manifest = JSON.parse(readText(manifestFile)); } catch { /* first migration */ }
  const known = new Map(manifest.files.map((x) => [x.source, x]));
  const copied = [];
  for (const m of MIGRATION_MAP) {
    const base = path.join(ctx.repo, m.legacy);
    if (!fs.existsSync(base)) continue;
    for (const file of migrateWalk(base, '', [])) {
      const source = m.legacy + '/' + file.rel;
      const dest = '.do-it/' + m.dest + '/' + file.rel;
      const bytes = readRegularFile(file.abs, BULK_READ_CAP);
      const sha = sha256Bytes(bytes);
      const prior = known.get(source);
      const destAbs = path.join(ctx.home, m.dest, file.rel);
      if (prior && prior.sha256 === sha && fs.existsSync(destAbs) && sha256File(destAbs) === sha) continue;
      atomicWrite(destAbs, bytes);
      const row = { source, dest, sha256: sha };
      known.set(source, row);
      copied.push(row);
    }
  }
  if (!copied.length) return { outcome: 'MIGRATE_NOOP', exit: 0, copied: [] };
  manifest.files = Array.from(known.values()).sort((a, b) => (a.source < b.source ? -1 : 1));
  atomicWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { outcome: 'MIGRATED', exit: 0, copied, manifest: manifestFile };
}

// ---- next.mjs ----
const SLICE_TERMINAL = ['DONE', 'BLOCKED', 'ESCALATED'];
const STEP_CLASS = { code: 'deterministic', checkpoint: 'gather', decision: 'gather', persona: 'implementation' };
const STEP_ACTION = { code: 'RUN_CODE', checkpoint: 'CHECKPOINT', decision: 'CHECKPOINT', persona: 'SPAWN' };

function none(runId, reason, extra) {
  return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'NONE', reason, ...(extra || {}) };
}

function sliceRunnable(state, s) {
  if (s.status !== 'READY' && s.status !== 'PENDING' && s.status !== undefined) return false;
  const deps = Array.isArray(s.depends_on) ? s.depends_on : [];
  return deps.every((d) => {
    const dep = state.slices.find((x) => x.id === d);
    return dep && dep.status === 'DONE';
  });
}

function nextSlice(ctx, state, runId) {
  const retried = ladderRetry(state);
  if (retried.length) {
    writeState(ctx, state);
    for (const c of retried) {
      appendEvent(ctx, runId, { event: 'tier_escalated', slice_id: c.slice_id, stage: state.stage, host: state.host, tier: c.to, verdict: 'RETRY', detail: { from: c.from, to: c.to, reason: c.reason } });
    }
  }
  const s = state.slices.find((x) => sliceRunnable(state, x));
  if (!s) return null;
  const klass = s.class || 'implementation';
  const out = {
    outcome: 'NEXT', exit: 0, run_id: runId, action: 'SPAWN', slice_id: s.id, lane: s.lane === undefined ? null : s.lane,
    tier: s.tier || CLASS_TIER[klass] || 'T2', class: klass, attempts: s.attempts || 0, escalations: s.escalations || 0,
  };
  if (out.escalations > 0) out.reason = RETRY_REASON;
  return out;
}

function nextWave(ctx, state, runId, fl) {
  const pipe = loadPipeline(ctx, state.preset);
  if (!pipe || !pipe.steps.length) return { pipe: null };
  // a 1.1 run seeds and reads only its own rows; a 1.0.x board's rows with the same step ids are not its own
  const adopt = adoptsUnattributed(state);
  let seeded = false;
  for (const st of pipe.steps) {
    if (!hasRow(fl, st.id, runId, adopt)) { finishLineUpsert(fl, st.id, { kind: 'wave' }, runId, adopt); seeded = true; }
  }
  if (seeded) writeFinishLine(ctx, fl);
  const rowOf = (id) => findRow(fl, id, runId, adopt);
  for (const st of pipe.steps) {
    const row = rowOf(st.id);
    if (row.state !== 'OPEN') continue;
    if (!st.needs.every((n) => { const r = rowOf(n); return !!r && rowClosed(r); })) continue;
    const type = st.type || 'persona';
    const klass = st.class || STEP_CLASS[type] || 'implementation';
    return {
      pipe,
      out: {
        outcome: 'NEXT', exit: 0, run_id: runId, action: STEP_ACTION[type] || 'SPAWN', wave: st.id, step: st,
        tier: st.tier || CLASS_TIER[klass] || 'T2', class: klass,
      },
    };
  }
  return { pipe, out: null };
}

// `next` is a function of what is on disk. It advances only the deterministic
// bookkeeping the disk already implies: a FAILED slice is requeued one tier up.
function cmdNext(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);

  const blocked = ceilingBlock(ctx, state);
  if (blocked) return blocked;

  if (state.status === 'ESCALATED') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'escalated' };
  if (state.status === 'PARTIAL_FAILURE') {
    const deploy = state.deploy || { legs: [], rollback_plan: [] };
    const actions = (deploy.rollback_plan || []).map((name) => {
      const leg = deploy.legs.find((l) => l.leg === name) || {};
      return { action: 'ROLLBACK', leg: name, compensate: leg.compensate === undefined ? null : leg.compensate };
    });
    return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROLLBACK', legs: actions.map((a) => a.leg), actions };
  }
  if (state.status === 'DONE') return none(runId, 'done');
  if (state.status === 'PARKED') return { outcome: 'NEXT', exit: 3, run_id: runId, action: 'NONE', reason: 'parked' };
  if (state.status === 'NEEDS_HUMAN') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'needs_human' };
  if (state.status === 'BLOCKED') {
    const fl = rowsForRun(readFinishLine(ctx), runId, adoptsUnattributed(state));
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, action: 'NONE', reason: 'blocked', board: renderBoard(fl) };
  }

  const revoked = rereadReadiness(ctx, state);
  if (revoked) throw revoked;

  if (!state.preset) {
    return {
      outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROUTE_MODEL', class: 'gather', tier: 'T3',
      request: state.request, presets: PRESET_NAMES,
      instruction: 'Pick exactly one preset for the request, then run: do-it gate route --preset <name> --reason "<why>"',
    };
  }

  const board = readFinishLine(ctx);
  // this run's rows only: another run's rows never decide it, and an unattributed row of an older board counts
  // only for a legacy run, the one run that may adopt it (CP-03 R3-S1-M6, the same rule as seeding)
  const adopt = adoptsUnattributed(state);
  const fl = rowsForRun(board, runId, adopt);
  if (state.slices.length) {
    const out = nextSlice(ctx, state, runId);
    if (out) return out;
    if (state.slices.some((s) => s.status === 'READY' || s.status === 'RUNNING' || s.status === 'NEEDS_HUMAN')) {
      return none(runId, 'waiting', { slices: state.slices.filter((s) => !SLICE_TERMINAL.includes(s.status)).map((s) => s.id) });
    }
    if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'awaiting_verification', { board: renderBoard(fl) });
  }

  const wave = nextWave(ctx, state, runId, board);
  if (wave.out) return wave.out;
  fl.rows = rowsForRun(board, runId, adopt).rows;
  if (wave.pipe) {
    if (!openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'waiting', { board: renderBoard(fl) });
  }
  if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
  return none(runId, 'no_runnable_work');
}

function gateRoute(ctx, args) {
  const f = args.flags;
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (typeof f.preset !== 'string' || !PRESET_NAMES.includes(f.preset)) throw fail('USAGE', 1, { message: 'gate route requires --preset <name>', presets: PRESET_NAMES });
  if (typeof f.reason !== 'string' || !f.reason.trim()) throw fail('ROUTE_REASON_REQUIRED', 1, { message: 'a model route answer needs --reason' });
  if (state.preset) throw fail('ROUTE_ALREADY_SET', 1, { run_id: runId, preset: state.preset });
  state.preset = f.preset;
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'route_model', stage: state.stage, host: state.host, tier: 'T3', verdict: f.preset, detail: { preset: f.preset, reason: f.reason.trim(), model_call: true } });
  return { outcome: 'ROUTED', exit: 0, run_id: runId, preset: f.preset };
}

// ---- pack.mjs ----
function packPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'owner-pack.json');
}

function packIdOf(questions) {
  return sha256Bytes(canonicalJson(questions));
}

// Stages only append questions; numbering is stable and duplicates by text are ignored (ruling D7).
// CP-03 R9-S1-M16: the pack is stored redacted, so a text is compared both as given and as it is stored.
// opts.stopGate (the gate's own park question only): nothing is added while the run already has an open
// question the gate wrote (stopGateMarks), so a park that is retried never asks the owner twice.
function packAppend(ctx, runId, questions, opts) {
  const file = packPath(ctx, runId);
  const pack = readJsonIfExists(file) || { pack_id: null, run_id: runId, questions: [], created_at: ctx.now() };
  const added = [];
  // CP-03 R10-S1-M17: the gate's own question is deduped only against OPEN questions (not withdrawn, not
  // answered): once the owner answered a park, the next park with the same rows asks again.
  const stop = !!(opts && opts.stopGate);
  const open = stop ? openOf(ctx, runId, pack, opts.onAnswersError) : null;
  const held = stop ? openStopGateQuestion(ctx, runId, pack, open) : null;
  if (held) {
    // CP-03 R10 L-d: the park reuses the gate's open question; its text is brought up to the current rows.
    // Only a row that is still the gate's own sentence is rewritten (an event can be forged, a text cannot).
    const q = questions[0];
    const row = pack.questions.find((x) => x.n === held.n);
    if (row && q && typeof q.text === 'string' && STOP_GATE_TEXT.test(q.text) && STOP_GATE_TEXT.test(row.text) && row.text !== q.text && row.text !== redactJsonValues(q.text)) {
      row.text = q.text;
      pack.pack_id = packIdOf(pack.questions);
      atomicWriteJson(file, pack);
    }
    return added;
  }
  for (const q of questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) continue;
    const stored = redactJsonValues(q.text);
    const same = (x) => x.text === q.text || x.text === stored;
    if (stop ? open.some(same) : pack.questions.some((x) => same(x) && x.status !== 'withdrawn')) continue;
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
// onAnswersError (the stop gate only, CP-03 R10 L-g): an answers.json that cannot be read counts as no
// answers and the error is handed to it, so a garbled file never blocks a park. Without it the read throws.
function openPackQuestions(ctx, runId, onAnswersError) {
  return openOf(ctx, runId, readJsonIfExists(packPath(ctx, runId)), onAnswersError);
}

function openOf(ctx, runId, pack, onAnswersError) {
  if (!pack || !Array.isArray(pack.questions)) return [];
  let doc = null;
  try { doc = readJsonIfExists(path.join(ctx.home, 'runs', runId, 'answers.json')); } catch (e) {
    if (typeof onAnswersError !== 'function') throw e;
    onAnswersError(e);
  }
  const answered = new Set((doc && Array.isArray(doc.answers) ? doc.answers : []).map((a) => a.n));
  return pack.questions.filter((q) => q.status !== 'withdrawn' && !answered.has(q.n));
}

// The sentence the stop gate writes when it parks a run at patience. `record` refuses a result question that
// starts with it (STOP_GATE_TEXT_RESERVED), so only the gate writes it.
const STOP_GATE_TEXT = /^The run stopped with \d+ open row\(s\) after \d+ refusals: /;
const STOP_GATE_IDS = /^The run stopped with \d+ open row\(s\) after \d+ refusals: (.*)\. Resume the run or close it with the open rows as residuals\?$/;

// CP-03 R5-S1-H10: which questions did the stop gate itself write? Only the gate writes `stop_parked` events:
// since 1.1 the event names the question's number; a 1.0.x (or pre-release 1.1) event names the open rows,
// which the question's text repeats. A `source` field proves nothing: a result file could set one.
function stopGateMarks(ctx, runId) {
  const numbers = new Set();
  const openLists = new Set();
  let lines = [];
  try { lines = readText(eventsPath(ctx, runId), BULK_READ_CAP).split('\n'); } catch { /* no events */ }
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

// The run's open (not withdrawn, not answered) question that the stop gate itself wrote, or null.
// `open` (optional): the run's open questions, already read; `onAnswersError` as in openPackQuestions.
function openStopGateQuestion(ctx, runId, pack, open, onAnswersError) {
  const marks = stopGateMarks(ctx, runId);
  if (!marks.numbers.size && !marks.openLists.size) return null;
  if (!open) open = pack ? openOf(ctx, runId, pack, onAnswersError) : openPackQuestions(ctx, runId, onAnswersError);
  return open.find((q) => isStopGateQuestion(q, marks)) || null;
}

function isStopGateQuestion(q, marks) {
  if (!q || !marks) return false;
  if (marks.numbers.has(q.n)) return true;
  if (q.kind !== 'default' || typeof q.text !== 'string') return false;
  const m = STOP_GATE_IDS.exec(q.text);
  return !!m && marks.openLists.has(m[1]);
}

const WITHDRAW_REASON = 'withdrawn: the stop gate raised this for a run it should not have gated';

// pack withdraw --by stop-gate [--run <id>] [--reason <text>] (D10): unanswered stop-gate questions
// become `withdrawn` and stay in the pack with the date and the reason. Answered questions and stage
// questions are untouched. Without --run every run's pack is considered. A second call changes nothing.
function cmdPack(ctx, args) {
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

// ---- park.mjs ----
const PARK_NO_FROM = ['DONE', 'ESCALATED'];

function parkPath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'park.json');
}

// park --reason usage_limit --reset-at ISO: PARKED, park.json, then the wake hook.
function cmdPark(ctx, args) {
  const f = args.flags;
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (PARK_NO_FROM.includes(state.status)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'PARKED' });
  const reason = typeof f.reason === 'string' && f.reason ? f.reason : 'usage_limit';
  let resetAt = null;
  if (f['reset-at'] !== undefined) {
    if (typeof f['reset-at'] !== 'string' || Number.isNaN(Date.parse(f['reset-at']))) throw fail('USAGE', 1, { message: '--reset-at must be an ISO timestamp' });
    resetAt = f['reset-at'];
  }
  const { files } = collectStateFiles(ctx, runId, state);
  const from = state.status;
  const park = {
    run_id: runId,
    reason,
    reset_at: resetAt,
    parked_at: ctx.now(),
    from_status: from,
    resume: { state_files: files, next_action: nextActionOf(state) },
  };
  atomicWriteJson(parkPath(ctx, runId), park);
  state.status = 'PARKED';
  state.park = { reason, reset_at: resetAt };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'run_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, reason, reset_at: resetAt } });
  const wake = scheduleWake(ctx, runId, resetAt, resumeCommand(runId));
  appendEvent(ctx, runId, { event: 'wake_' + wake.status, stage: state.stage, host: state.host, verdict: wake.status, detail: { id: wake.id, at: resetAt } });
  const out = { outcome: 'PARKED', exit: 3, run_id: runId, status: 'PARKED', reason, reset_at: resetAt, wake: wake.status, wake_id: wake.id };
  if (wake.status !== 'scheduled') out.say = [NO_WAKE_TEXT];
  return out;
}

// ---- pipeline.mjs ----
function pipelineDirs(ctx) {
  const dirs = [];
  if (ctx.env.DO_IT_PIPELINES) dirs.push(path.resolve(ctx.cwd, ctx.env.DO_IT_PIPELINES));
  const here = path.dirname(fileURLToPath(import.meta.url));
  dirs.push(path.join(here, '..', 'pipelines'), path.join(here, '..', '..', 'pipelines'));
  return dirs;
}

function pipelineFile(ctx, preset) {
  for (const dir of pipelineDirs(ctx)) {
    for (const ext of ['.yaml', '.yml']) {
      const file = path.join(dir, preset + ext);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

// Preset steps in declaration order: { id, type, persona, tier, class, needs, ... }.
// Returns null when no preset file exists (the host may not ship pipelines).
function loadPipeline(ctx, preset) {
  if (!preset) return null;
  const file = pipelineFile(ctx, preset);
  if (!file) return null;
  const doc = parseYamlLite(readText(file));
  const raw = doc && Array.isArray(doc.steps) ? doc.steps : null;
  if (!raw) throw fail('PIPELINE_INVALID', 1, { file, message: 'a preset needs a steps list' });
  const ids = new Set();
  const steps = raw.map((s, i) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + i + ' has no id' });
    if (ids.has(s.id)) throw fail('PIPELINE_INVALID', 1, { file, message: 'duplicate step id ' + s.id });
    ids.add(s.id);
    const needs = s.needs === undefined || s.needs === null ? [] : (Array.isArray(s.needs) ? s.needs.map(String) : [String(s.needs)]);
    return { ...s, needs };
  });
  for (const s of steps) {
    for (const n of s.needs) if (!ids.has(n)) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + s.id + ' needs unknown step ' + n });
  }
  return { file, name: doc.name || preset, steps };
}

// ---- readiness.mjs ----
const CLASS_TIER = { deterministic: 'T3', gather: 'T3', implementation: 'T2', hard: 'T1' };
const GATE_BUILD_FROM = ['INTAKE', 'PLANNING', 'AWAIT_RATIFY', 'BLOCKED', 'NEEDS_HUMAN'];
const CRED_ROW_ID = 'readiness:credentials';

function readinessPath(ctx) {
  return path.join(ctx.home, 'plan', 'READINESS.json');
}

function decisionList(decisions) {
  if (Array.isArray(decisions)) {
    return decisions.map((d) => ({ id: d && d.id !== undefined ? String(d.id) : '?', state: d ? (d.state !== undefined ? d.state : d.status) : undefined }));
  }
  return Object.keys(decisions || {}).map((id) => {
    const v = decisions[id];
    return { id, state: v && typeof v === 'object' ? (v.state !== undefined ? v.state : v.status) : v };
  });
}

// G-8: the verdict is judged from disk each time it is asked. Returns
// { ok, outcome, extra, data, sha256 }; never throws for a bad verdict.
function checkReadiness(ctx) {
  const file = readinessPath(ctx);
  let bytes;
  try { bytes = readRegularFile(file, STATE_READ_CAP); } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, outcome: 'READINESS_MISSING', extra: { file } };
    // CP-03 R6-S1-M13: a FIFO, a device or an oversized file is an invalid verdict, never a hang
    if (e.code === 'ENOTREG' || e.code === 'EFBIG') return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: [{ pointer: '', message: e.message }] } };
    throw e;
  }
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch (e) {
    return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: [{ pointer: '', message: 'not JSON: ' + e.message }] } };
  }
  const errors = validateSchema(loadSchemaFile('readiness.schema.json'), data);
  if (errors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors } };
  const graphErrors = sliceCycleErrors(data.slices);
  if (graphErrors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: graphErrors } };
  const cpErrors = checkpointErrors(data.review_checkpoints);
  if (cpErrors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: cpErrors } };
  const unresolved = decisionList(data.decisions).filter((d) => d.state !== 'RESOLVED' && d.state !== 'DEFAULTED').map((d) => d.id);
  if (unresolved.length) return { ok: false, outcome: 'READINESS_UNRESOLVED', extra: { decisions: unresolved } };
  if (data.preflight.passed !== true) return { ok: false, outcome: 'READINESS_PREFLIGHT_FAILED', extra: {} };
  const dependent = (data.slices || []).filter((s) => s.depends_on_owner_answer === true).map((s) => s.id);
  if (dependent.length || (data.owner_dependent_slices || 0) > 0) {
    return { ok: false, outcome: 'READINESS_OWNER_DEPENDENT', extra: { slices: dependent, owner_dependent_slices: data.owner_dependent_slices || dependent.length } };
  }
  return { ok: true, outcome: 'READINESS_OK', extra: {}, data, sha256: sha256Bytes(bytes) };
}

// A cycle in depends_on would leave its slices never runnable, so the run would
// idle without saying why. It is a plan error, printed as the cycle.
function sliceCycleErrors(slices) {
  if (!Array.isArray(slices)) return [];
  const byId = new Map(slices.map((s) => [s.id, s]));
  const done = new Set();
  const errors = [];
  const visit = (id, trail) => {
    const at = trail.indexOf(id);
    if (at >= 0) return [...trail.slice(at), id];
    if (done.has(id) || !byId.has(id)) return null;
    trail.push(id);
    for (const d of byId.get(id).depends_on || []) {
      const c = visit(d, trail);
      if (c) return c;
    }
    trail.pop();
    done.add(id);
    return null;
  };
  for (const s of slices) {
    const c = visit(s.id, []);
    if (c) { errors.push({ pointer: '/slices', message: 'depends_on has a cycle: ' + c.join(' -> ') }); break; }
  }
  return errors;
}

// `next` calls this for a run whose build gate was approved: an edit after the
// gate cannot slip through. The run status is never advanced here.
function rereadReadiness(ctx, state) {
  const gate = state.gates && state.gates.build;
  if (!gate || gate.approved !== true) return null;
  const v = checkReadiness(ctx);
  if (v.ok) return null;
  appendEvent(ctx, state.run_id, { event: 'readiness_revoked', stage: state.stage, host: state.host, verdict: v.outcome, detail: { outcome: v.outcome, ...v.extra } });
  return fail(v.outcome, 1, { run_id: state.run_id, revoked: true, ...v.extra });
}

// review_checkpoints (CHECKPOINT-POLICY v1) is decided by plan-it; the spine
// only checks it is self-consistent and turns each checkpoint into a
// finish-line row, so a run cannot close without its review-it verdicts.
const CHECKPOINT_ROW_PREFIX = 'checkpoint:';

function checkpointErrors(block) {
  if (block === undefined) return [];
  const errors = [];
  const list = Array.isArray(block.checkpoints) ? block.checkpoints : [];
  if (block.count !== list.length) errors.push({ pointer: '/review_checkpoints/count', message: 'count ' + block.count + ' does not match ' + list.length + ' checkpoint(s)' });
  list.forEach((c, i) => {
    const want = 'CP-' + String(i + 1).padStart(2, '0');
    if (c.id !== want) errors.push({ pointer: '/review_checkpoints/checkpoints/' + i + '/id', message: 'must be ' + want });
  });
  return errors;
}

// What a checkpoint holds until PASS. It holds the start of slices outside the covered work that
// depend on it, the promotion of covered work, the merge or the release. It never holds independent work
// (finding H-10), nor the start of the work it covers (finding H-21). Plans written before `gates`
// existed get the same corrected meaning, read from the kind.
function checkpointGates(c) {
  if (Array.isArray(c.gates)) return c.gates;
  if (c.kind === 'wave' || c.kind === 'phase') return ['dependents', 'promotion'];
  if (c.kind === 'adversarial') return /^\s*start of\b/i.test(String(c.blocks || '')) ? ['dependents'] : ['merge'];
  if (c.kind === 'pre-merge') return ['merge'];
  return ['release'];
}

function seedCheckpoints(state, fl, data) {
  const block = data.review_checkpoints;
  if (!block) return 0;
  state.review_checkpoints = {
    count: block.count,
    level: block.level || null,
    checkpoints: block.checkpoints.map((c) => ({
      id: c.id,
      kind: c.kind,
      at: c.at || null,
      gates: checkpointGates(c),
      covers: Array.isArray(c.covers) ? c.covers : null,
      blocks: c.blocks || null,
      evidence: c.evidence,
    })),
  };
  for (const c of block.checkpoints) {
    const id = CHECKPOINT_ROW_PREFIX + c.id;
    if (!hasRow(fl, id, state.run_id, adoptsUnattributed(state))) finishLineUpsert(fl, id, { kind: 'package' }, state.run_id, adoptsUnattributed(state));
  }
  return block.count;
}

// CP-03 R8-S1-M15: measured exactly as atomicWrite will write it (jsonBytes = after redaction), and accepted
// only up to the read cap minus the headroom the run's own bookkeeping needs.
function planTooLarge(state, fl) {
  const limit = 'the ' + STATE_ACCEPT_CAP + '-byte limit (the ' + STATE_READ_CAP + '-byte state cap less ' + STATE_HEADROOM + ' bytes of headroom)';
  const stateBytes = jsonBytes(state).length;
  if (stateBytes > STATE_ACCEPT_CAP) return { pointer: '/slices', message: 'the plan seeds a state of ' + stateBytes + ' bytes, above ' + limit + ' (' + state.slices.length + ' slices); split the plan' };
  const flBytes = jsonBytes(fl).length;
  if (flBytes > STATE_ACCEPT_CAP) return { pointer: '/slices', message: 'the plan seeds a finish line of ' + flBytes + ' bytes, above ' + limit + '; split the plan' };
  return null;
}

function seedSlices(state, data) {
  if (state.slices.length || !Array.isArray(data.slices)) return;
  for (const s of data.slices) {
    const klass = s.class || 'implementation';
    state.slices.push({
      id: s.id,
      lane: s.lane === undefined ? null : s.lane,
      tier: s.tier || CLASS_TIER[klass] || 'T2',
      class: klass,
      depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
      wave: typeof s.wave === 'string' ? s.wave : null,
      status: 'READY',
      attempts: 0,
      escalations: 0,
    });
  }
}

function gateBuild(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const v = checkReadiness(ctx);
  if (!v.ok) {
    appendEvent(ctx, runId, { event: 'build_refused', stage: state.stage, host: state.host, verdict: v.outcome, detail: v.extra });
    throw fail(v.outcome, 1, { run_id: runId, status: state.status, ...v.extra });
  }
  if (state.status !== 'BUILDING' && !GATE_BUILD_FROM.includes(state.status)) {
    throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'BUILDING', allowed: GATE_BUILD_FROM });
  }
  const names = v.data.credentials || [];
  const settings = loadSettings(ctx, []);
  const missing = names.length ? resolveCredentials(ctx, runId, names, settings.values.secrets).filter((r) => !r.ok) : [];
  const fl = readFinishLine(ctx);
  const now = ctx.now();
  if (missing.length) {
    const provider = settings.values.secrets.provider;
    const reason = 'missing credential ' + missing.map((m) => m.name).join(', ') + ' via provider ' + provider;
    const from = state.status;
    // CP-03 R5-S1-H9: BLOCKED goes through the one status-entry guard, and the reason is kept in state
    const stored = guardStatusEntry(from, 'BLOCKED', { reason });
    state.status = 'BLOCKED';
    if (stored) state.status_reason = { status: 'BLOCKED', reason: stored, stage: state.stage, at: now };
    writeState(ctx, state);
    finishLineUpsert(fl, CRED_ROW_ID, { kind: 'package', state: 'BLOCKED', reason, evidence: null }, runId, adoptsUnattributed(state));
    writeFinishLine(ctx, fl);
    appendEvent(ctx, runId, { event: 'build_blocked', stage: state.stage, host: state.host, verdict: 'CREDENTIAL_MISSING', detail: { from, credentials: missing.map((m) => m.name), provider } });
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, status: 'BLOCKED', reason, missing: missing.map((m) => m.name), provider };
  }
  const from = state.status;
  const adopt = adoptsUnattributed(state);
  seedSlices(state, v.data);
  const checkpoints = seedCheckpoints(state, fl, v.data);
  state.gates.build = { approved: true, owner: 'readiness', date: now, readiness_sha256: v.sha256 };
  state.status = 'BUILDING';
  for (const s of state.slices) {
    if (!hasRow(fl, s.id, runId, adopt)) finishLineUpsert(fl, s.id, { kind: 'package' }, runId, adopt);
  }
  const credRow = findRow(fl, CRED_ROW_ID, runId, adopt);
  if (credRow && credRow.state === 'BLOCKED') {
    finishLineUpsert(fl, CRED_ROW_ID, { state: 'DONE', reason: null, evidence: path.relative(ctx.repo, readinessPath(ctx)) }, runId, adopt);
  }
  // CP-03 R7-S1-M14: a plan whose seeded state or board would pass the spine's own read cap is refused
  // before anything is written, so the run stays where it was (gated) and the error names the plan.
  const tooBig = planTooLarge(state, fl);
  if (tooBig) {
    appendEvent(ctx, runId, { event: 'build_refused', stage: state.stage, host: state.host, verdict: 'READINESS_INVALID', detail: { errors: [tooBig] } });
    throw fail('READINESS_INVALID', 1, { run_id: runId, status: from, file: readinessPath(ctx), errors: [tooBig] });
  }
  writeState(ctx, state);
  writeFinishLine(ctx, fl);
  appendEvent(ctx, runId, { event: 'build_approved', stage: state.stage, host: state.host, verdict: 'READINESS_OK', detail: { from, readiness_sha256: v.sha256, slices: state.slices.length, review_checkpoints: checkpoints } });
  return { outcome: 'READINESS_OK', exit: 0, run_id: runId, status: 'BUILDING', slices: state.slices.map((s) => s.id), review_checkpoints: checkpoints };
}

// ---- record.mjs ----
const EXIT_FOR_STATUS = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };

// Workers write the natural words for success. A strict list of aliases is
// recorded as `ok`; any other word is still RESULT_INVALID.
const STATUS_ALIASES = { done: 'ok', pass: 'ok', success: 'ok' };

// Rewrites result.status in place; returns the original word when it was an alias, else null.
function normalizeStatus(result) {
  if (!result || typeof result !== 'object' || typeof result.status !== 'string') return null;
  const to = STATUS_ALIASES[result.status.trim().toLowerCase()];
  if (!to) return null;
  const from = result.status;
  result.status = to;
  return from;
}

function journalPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'record.journal.json');
}

function recordFault(ctx, name) {
  if (ctx.env.DO_IT_FAULT === name) throw fail('FAULT_INJECTED', 1, { fault: name });
}

// record --result <file>: validate it-result/1, apply G-2/G-3, then persist in two
// phases (journal, ledger, then state) so a crash in between replays to one result.
function cmdRecord(ctx, args) {
  const f = args.flags;
  if (typeof f.result !== 'string') throw fail('USAGE', 1, { message: 'record requires --result <file>' });
  const runId = selectRunId(ctx, f);
  let state = loadState(ctx, runId);

  const resultFile = path.resolve(ctx.cwd, f.result);
  let bytes;
  // CP-03 R7-S1-M14: a result is copied into the journal and the state, which are read back capped at
  // STATE_READ_CAP, so a larger result is refused before anything is written (R8-S1-M15: accepted only up to
  // STATE_ACCEPT_CAP, the cap less the run's bookkeeping headroom).
  try { bytes = readRegularFile(resultFile, STATE_ACCEPT_CAP); } catch (e) {
    throw fail('RESULT_UNREADABLE', 1, { file: f.result, message: e.message });
  }
  const resultSha = sha256Bytes(bytes);

  const pending = readJsonIfExists(journalPath(ctx, runId));
  if (pending) {
    const response = applyJournal(ctx, pending, false);
    if (pending.result_sha256 === resultSha) return { ...response, replayed: true };
    state = loadState(ctx, runId);
  }
  if (state.status === 'DONE') throw fail('RUN_CLOSED', 1, { run_id: runId, message: 'run is already concluded' });

  let result;
  try { result = JSON.parse(bytes.toString('utf8')); } catch (e) {
    throw fail('RESULT_INVALID', 1, { errors: [{ pointer: '', message: 'not JSON: ' + e.message }] });
  }
  const aliased = normalizeStatus(result);
  const schemaErrors = validateSchema(loadSchemaFile('it-result.1.schema.json'), result);
  if (schemaErrors.length) throw fail('RESULT_INVALID', 1, { errors: schemaErrors });
  if (result.run_id !== runId) throw fail('RUN_ID_MISMATCH', 1, { expected: runId, got: result.run_id });
  const expectedExit = EXIT_FOR_STATUS[result.status];
  if (result.exit_code !== expectedExit) {
    throw fail('EXIT_CODE_MISMATCH', 1, { status: result.status, expected: expectedExit, got: result.exit_code });
  }

  const plan = planRecord(ctx, runId, state, result);
  const journal = {
    id: crypto.randomBytes(8).toString('hex'),
    run_id: runId,
    result_sha256: resultSha,
    result_name: 'record-' + resultSha.slice(0, 12) + '.json',
    result_text: aliased ? JSON.stringify(result, null, 2) + '\n' : bytes.toString('utf8'),
    ledger_rows: plan.ledgerRows,
    fl_ops: plan.flOps,
    questions: plan.questions,
    next_state: plan.nextState,
    events: plan.events,
    response: { outcome: plan.outcome, exit: plan.exit, run_id: runId, status: plan.nextState.status, ...plan.extra },
  };
  atomicWriteJson(journalPath(ctx, runId), journal);
  return applyJournal(ctx, journal, true);
}

function applyJournal(ctx, j, allowFault) {
  const runId = j.run_id;
  if (j.ledger_rows.length) {
    const ledger = readLedger(ctx, runId);
    for (const row of j.ledger_rows) ledgerUpsert(ledger, row);
    writeLedger(ctx, ledger);
  }
  if (allowFault) recordFault(ctx, 'after_ledger');

  const resultsDir = path.join(ctx.home, 'runs', runId, 'results');
  const copy = path.join(resultsDir, j.result_name);
  if (!fs.existsSync(copy)) atomicWrite(copy, j.result_text);
  if (j.fl_ops.length) {
    const fl = readFinishLine(ctx);
    const adopt = adoptsUnattributed(j.next_state);
    for (const op of j.fl_ops) finishLineUpsert(fl, op.id, op.patch, runId, adopt);
    autoClosePackages(fl, adopt ? runId : null);
    writeFinishLine(ctx, fl);
  }
  if (j.questions.length) packAppend(ctx, runId, j.questions);

  const current = loadState(ctx, runId);
  const alreadyApplied = current.last_journal === j.id;
  if (!alreadyApplied) {
    const next = { ...j.next_state, last_journal: j.id };
    writeState(ctx, next);
    for (const ev of j.events) appendEvent(ctx, runId, { ...ev, host: next.host });
  }
  try { fs.unlinkSync(journalPath(ctx, runId)); } catch { /* already gone */ }
  return j.response;
}

// A `checkpoint:CP-NN` row closes only on that checkpoint's own verdict file
// saying PASS by the reader rule (verdict-file.mjs), not on any file that
// exists. Returns null when it may close, else the reason it may not.
// The checkpoint's evidence path may be written relative to the repo or to the
// do-it home (where plan/ lives); either names the same file.
function checkpointVerdictProblem(ctx, state, row, r) {
  const id = row.slice(CHECKPOINT_ROW_PREFIX.length);
  const cps = state.review_checkpoints && Array.isArray(state.review_checkpoints.checkpoints) ? state.review_checkpoints.checkpoints : [];
  const cp = cps.find((c) => c.id === id);
  if (cp) {
    const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
    const want = [path.resolve(ctx.repo, cp.evidence), path.resolve(ctx.home, cp.evidence)].map(real).filter(Boolean);
    if (!want.includes(r.abs)) return 'evidence must be the checkpoint verdict file ' + cp.evidence + ', got ' + r.path;
  }
  let text;
  try { text = readText(r.abs, BULK_READ_CAP); } catch (e) { return 'cannot read ' + r.path + ': ' + (e.code || e.message); }
  const v = parseVerdict(text, id);
  return v.state === 'pass' ? null : v.state + ': ' + v.reason;
}

function isMockKind(kind) {
  return kind === 'mock' || kind === 'fixture';
}

// Pure planning: refuses (throws) before anything is written.
function planRecord(ctx, runId, state, result) {
  const now = ctx.now();
  const verdicts = result.verdicts || [];
  const artifacts = result.artifacts || [];
  const isDeploy = Array.isArray(result.legs) && result.legs.length > 0;

  const needsEvidence = [];
  for (const v of verdicts) if (v.verdict === 'VERIFIED' && !(typeof v.evidence === 'string' && v.evidence.trim())) needsEvidence.push(v.row);
  const legClaims = isDeploy ? result.legs.filter((l) => l.state === 'DEPLOYED_VERIFIED' || l.state === 'ROLLED_BACK') : [];
  for (const l of legClaims) if (!(typeof l.evidence === 'string' && l.evidence.trim())) needsEvidence.push('leg:' + l.leg);
  if (needsEvidence.length) throw fail('EVIDENCE_REQUIRED', 1, { rows: needsEvidence });

  const resolved = new Map();
  const unresolved = [];
  for (const v of verdicts) {
    if (v.verdict === 'VERIFIED') {
      const r = resolveEvidence(ctx, runId, v.evidence, artifacts);
      if (r.ok) resolved.set(v.row, r); else unresolved.push({ row: v.row, evidence: v.evidence, reason: r.reason });
    } else if (typeof v.evidence === 'string' && v.evidence.trim()) {
      const r = resolveEvidence(ctx, runId, v.evidence, artifacts);
      if (r.ok) resolved.set(v.row, r);
    }
  }
  const legResolved = new Map();
  for (const l of legClaims) {
    const r = resolveEvidence(ctx, runId, l.evidence, artifacts);
    if (r.ok) legResolved.set(l.leg, r); else unresolved.push({ row: 'leg:' + l.leg, evidence: l.evidence, reason: r.reason });
  }
  if (isDeploy) {
    for (const l of result.legs) {
      if (legResolved.has(l.leg) || !l.evidence) continue;
      const r = resolveEvidence(ctx, runId, l.evidence, artifacts);
      if (r.ok) legResolved.set(l.leg, r);
    }
  }
  if (unresolved.length) throw fail('EVIDENCE_UNRESOLVED', 1, { rows: unresolved.map((u) => u.row), details: unresolved });

  const next = JSON.parse(JSON.stringify(state));
  const plan = { ledgerRows: [], flOps: [], questions: [], events: [], extra: {} };
  let outcome = 'RECORDED';
  let exit = EXIT_FOR_STATUS[result.status];
  const mockRows = [];
  const checkpointRows = [];

  for (const v of verdicts) {
    const r = resolved.get(v.row) || null;
    const real = v.real === true;
    let verdict = v.verdict;
    let reason = null;
    if (verdict === 'VERIFIED' && real && r && isMockKind(r.kind)) {
      verdict = 'IMPLEMENTED-NOT-VERIFIED';
      reason = 'real_on_mock';
      mockRows.push(v.row);
    }
    if (verdict === 'VERIFIED' && r && String(v.row).startsWith(CHECKPOINT_ROW_PREFIX)) {
      const why = checkpointVerdictProblem(ctx, state, v.row, r);
      if (why) {
        verdict = 'IMPLEMENTED-NOT-VERIFIED';
        reason = 'checkpoint_not_pass: ' + why;
        checkpointRows.push({ row: v.row, reason: why });
      }
    }
    plan.ledgerRows.push({
      row: v.row,
      verdict,
      evidence: typeof v.evidence === 'string' && v.evidence.trim() ? v.evidence : null,
      evidence_path: r ? r.path : null,
      evidence_sha256: r ? r.sha256 : null,
      real,
      reason,
      recorded_at: now,
      updated_at: now,
    });
    if (verdict === 'VERIFIED') {
      plan.flOps.push({ id: v.row, patch: { state: 'DONE', evidence: v.evidence, reason: null } });
    } else if (verdict === 'BLOCKED') {
      plan.flOps.push({ id: v.row, patch: { state: 'BLOCKED', reason: (typeof v.evidence === 'string' && v.evidence.trim()) || 'blocked' } });
    } else {
      plan.flOps.push({ id: v.row, patch: { state: 'OPEN', evidence: null, reason: reason || 'implemented_not_verified' } });
    }
  }
  if (mockRows.length) {
    outcome = 'REAL_ON_MOCK';
    exit = 1;
    plan.extra.rows = mockRows;
  }
  if (checkpointRows.length) {
    outcome = 'CHECKPOINT_NOT_PASS';
    exit = 1;
    plan.extra.checkpoints = checkpointRows;
  }

  const recordedEvent = { event: 'result_recorded', slice_id: result.slice_id || null, stage: result.stage, verdict: result.status };
  if (result.next && typeof result.next.launch_prompt === 'string' && result.next.launch_prompt) {
    recordedEvent.detail = { next_stage: result.next.stage || null, launch_prompt: result.next.launch_prompt.slice(0, 300) };
  }
  plan.events.push(recordedEvent);
  if (result.resume && ((Array.isArray(result.resume.state_files) && result.resume.state_files.length) || result.resume.next_action)) {
    next.handoff_state = {
      ...(typeof state.handoff_state === 'object' && state.handoff_state ? state.handoff_state : {}),
      state_files: Array.isArray(result.resume.state_files) ? result.resume.state_files : [],
      next_action: result.resume.next_action || '',
    };
  }

  // CP-03 R5-S1-H9: the cause a status entry needs (guardStatusEntry, below) is collected on every path.
  let causeReason = null;
  if (isDeploy) {
    // deploy legs belong to a run that is deploying: from any other status a leg result could take the run
    // straight to FAILED (non-gating) without ever passing through DEPLOYING
    if (!DEPLOY_STATUSES.includes(state.status)) {
      throw fail('DEPLOY_OUT_OF_ORDER', 1, { status: state.status, allowed_from: DEPLOY_STATUSES, message: 'a deploy-legs result is recorded only while the run is ' + DEPLOY_STATUSES.join(', ') + ' (gate advance --to DEPLOYING first)' });
    }
    // a leg that did not make it says why: its evidence, or the result's reason
    const silent = result.legs.filter((l) => (l.state === 'FAILED' || l.state === 'NEEDS_HUMAN' || l.state === 'ROLLBACK_FAILED') && !cleanReason(l.evidence) && !cleanReason(result.reason));
    if (silent.length) {
      throw fail('FAIL_REASON_REQUIRED', 1, { legs: silent.map((l) => l.leg), message: 'a FAILED or NEEDS_HUMAN leg needs evidence or the result needs a reason' });
    }
    causeReason = cleanReason(result.reason) || result.legs.filter((l) => l.state !== LEG_PASSED && cleanReason(l.evidence)).map((l) => 'leg ' + l.leg + ' ' + l.state + ': ' + cleanReason(l.evidence)).join('; ') || null;
    const resolveLeg = (leg) => legResolved.get(leg.leg) || null;
    if (state.status === 'ROLLED_BACK' && !legsLookRolledBack(state, result) && result.legs.every((l) => l.state === 'DEPLOYED_VERIFIED')) {
      const stale = staleLegsAfterRollback(state, result.legs, resolveLeg);
      if (stale.length) throw fail('REVERIFY_REQUIRED', 1, { legs: stale, message: 'evidence must be newer than the rollback event', rollback_event_ts: state.deploy.rollback_event_ts });
    }
    const d = planDeploy(ctx, runId, state, result, resolveLeg);
    plan.ledgerRows.push(...d.ledgerRows);
    plan.questions.push(...d.questions);
    plan.events.push(...d.events);
    next.deploy = d.deploy;
    next.status = d.runStatus;
    next.stage = result.stage;
    if (d.outcome !== 'RECORDED' || outcome === 'RECORDED') { outcome = d.outcome; exit = d.exit; }
    if (d.questions.length) plan.extra.question = d.questions[0].text;
  } else {
    const slice = result.slice_id ? next.slices.find((x) => x.id === result.slice_id) : null;
    let reason = null;
    if (slice && result.status === 'blocked') {
      reason = blockReason(result);
      if (!reason) throw fail('BLOCK_REASON_REQUIRED', 1, { slice_id: slice.id, message: 'a BLOCKED slice needs a reason' });
    }
    // CP-03 R4-S1-H8: a run-level result that takes the run to BLOCKED or FAILED switches the stop gate off
    // (both are non-gating, CONTRACT 3.1), so it must say why (checked by guardStatusEntry below).
    if (!slice && (result.status === 'blocked' || result.status === 'failed')) {
      causeReason = result.status === 'blocked' ? blockReason(result) : failReason(result);
    }
    applyStatusToState(next, result);
    next.stage = result.stage;
    if (slice && outcome === 'RECORDED') {
      const sl = planSliceOutcome(plan, next, result, slice, reason);
      if (sl) { outcome = sl.outcome; exit = sl.exit; }
      // the run settled to BLOCKED because only blocked slices are left: their own reasons are the cause
      if (next.status === 'BLOCKED') causeReason = 'every remaining slice is blocked: ' + next.slices.filter((x) => x.status === 'BLOCKED').map((x) => x.id).join(', ') + (reason ? ' (' + reason + ')' : '');
    }
  }

  // A BLOCKED slice (owner-gate) also routes its question into the owner pack (R4 T-R4-19, B10).
  if ((result.status === 'needs_human' || result.status === 'blocked') && result.pending_human && result.pending_human.questions_path) {
    // a question with no text is no question: the pack would drop it (packAppend), so it decides nothing
    // CP-03 R5-S1-H10: only the spine says where a question came from, so a result's own `source` is dropped,
    // and the stop gate's sentence is reserved (pack withdraw must never mistake a result question for it)
    const qs = readQuestionsFile(ctx, result.pending_human.questions_path)
      .filter((q) => q && typeof q.text === 'string' && q.text.trim())
      .map((q) => { const { source, ...rest } = q; return rest; });
    const reserved = qs.filter((q) => STOP_GATE_TEXT.test(q.text.trim()));
    if (reserved.length) throw fail('STOP_GATE_TEXT_RESERVED', 1, { texts: reserved.map((q) => q.text.slice(0, 120)), message: 'a result question may not use the stop gate\'s own sentence; word the question in your own terms' });
    const midrun = result.status === 'needs_human' && !isDeploy && state.status === 'BUILDING' ? qs.filter((q) => q && q.kind !== 'owner-gate') : [];
    if (midrun.length) {
      // G-8: no question to the owner mid-run; the recommendation decides and the end report shows it.
      for (const q of midrun) {
        const answer = q.recommendation !== undefined && q.recommendation !== null ? q.recommendation : (q.default === undefined ? null : q.default);
        plan.events.push({ event: 'default_applied', slice_id: result.slice_id || null, stage: result.stage, verdict: 'MIDRUN_QUESTION_REFUSED', detail: { answer, text: q.text, kind: q.kind || null } });
        plan.questions.push({ ...q, kind: 'default', recommendation: answer, default: answer });
      }
      plan.questions.push(...qs.filter((q) => !midrun.includes(q)));
      next.status = state.status;
      next.slices = JSON.parse(JSON.stringify(state.slices));
      outcome = 'MIDRUN_QUESTION_REFUSED';
      exit = 1;
    } else {
      plan.questions.push(...qs);
    }
  }
  // CP-03 R4-S1-H8 / R5-S1-H9: one guard for every way this result moves the run into FAILED, BLOCKED or
  // NEEDS_HUMAN (run-level, slice settle, deploy legs). NEEDS_HUMAN needs a question that lands open in the
  // owner pack; FAILED and BLOCKED need a reason, kept as status_reason. G-8 keeps autonomy: from BUILDING a
  // mid-run question becomes a default and the status does not change, so the guard is not reached.
  const stored = guardStatusEntry(state.status, next.status, {
    reason: causeReason,
    openQuestion: next.status === 'NEEDS_HUMAN' ? questionsLandOpen(ctx, runId, plan.questions) : false,
  }, { slice_id: result.slice_id || null, status: result.status });
  if (stored) {
    next.status_reason = { status: next.status, reason: stored, stage: result.stage, at: now };
    if (!isDeploy && !result.slice_id) plan.events.push({ event: result.status === 'blocked' ? 'run_blocked' : 'run_failed', stage: result.stage, verdict: next.status, detail: { reason: stored } });
    plan.extra.reason = stored;
  }
  if (result.run_verdict !== undefined && result.run_verdict !== null) plan.extra.reported_run_verdict = result.run_verdict;
  plan.outcome = outcome;
  plan.exit = exit;
  plan.nextState = next;
  return plan;
}

// The statuses that have deploy legs (D17): only then may a result carry them.
const DEPLOY_STATUSES = ['DEPLOYING', 'PROVING', 'PARTIAL_FAILURE', 'ROLLED_BACK'];

// CP-03 R6-S1-L1: a slice reason obeys the same rule as a run reason (cleanReason: no placeholder, no
// invisible-only text); the sentence the spine builds around it would otherwise always pass the guard.
function blockReason(result) {
  const r = cleanReason(result.reason);
  if (r) return r;
  const v = (result.verdicts || []).find((x) => x.verdict === 'BLOCKED' && cleanReason(x.evidence));
  return v ? cleanReason(v.evidence) : null;
}

// A run-level failure names its cause: the result's reason, else the evidence of a verdict that did not verify.
function failReason(result) {
  const r = cleanReason(result.reason);
  if (r) return r;
  const v = (result.verdicts || []).find((x) => x.verdict !== 'VERIFIED' && cleanReason(x.evidence));
  return v ? cleanReason(v.evidence) : null;
}

// True when at least one of `questions` will be open in the run's owner pack once appended: a new text
// (packAppend adds it), or a text already there that is neither withdrawn nor answered.
function questionsLandOpen(ctx, runId, questions) {
  const valid = (questions || []).filter((q) => q && typeof q.text === 'string' && q.text.trim());
  if (!valid.length) return false;
  const pack = readJsonIfExists(packPath(ctx, runId));
  const have = pack && Array.isArray(pack.questions) ? pack.questions.filter((x) => x.status !== 'withdrawn') : [];
  const open = new Set(openPackQuestions(ctx, runId).map((x) => x.text));
  return valid.some((q) => !have.some((x) => x.text === q.text) || open.has(q.text));
}

// Slice-attached results (D14, CONTRACT M1): FAILED, ESCALATED, BLOCKED and the
// run settling to BLOCKED once only blocked slices are left.
function planSliceOutcome(plan, next, result, slice, reason) {
  let out = null;
  if (result.status === 'failed') {
    if (ladderEscalated(slice)) {
      slice.status = 'ESCALATED';
      next.status = 'ESCALATED';
      plan.questions.push(escalationQuestion(slice));
      plan.events.push({ event: 'escalated', slice_id: slice.id, stage: result.stage, tier: slice.tier || null, verdict: 'ESCALATED', detail: { attempts: slice.attempts } });
      out = { outcome: 'ESCALATED', exit: 2 };
    } else {
      plan.events.push({ event: 'slice_failed', slice_id: slice.id, stage: result.stage, tier: slice.tier || null, verdict: 'FAILED', detail: { attempts: slice.attempts } });
      out = { outcome: 'FAILED', exit: 1 };
    }
  } else if (result.status === 'blocked') {
    plan.flOps.push({ id: slice.id, patch: { state: 'BLOCKED', reason } });
    plan.events.push({ event: 'slice_blocked', slice_id: slice.id, stage: result.stage, verdict: 'BLOCKED', detail: { reason } });
    out = { outcome: 'BLOCKED', exit: 3 };
  }
  const terminal = ['DONE', 'BLOCKED', 'ESCALATED'];
  if (next.status === 'BUILDING' && next.slices.length && next.slices.every((x) => terminal.includes(x.status)) && next.slices.some((x) => x.status === 'BLOCKED')) {
    next.status = 'BLOCKED';
    plan.events.push({ event: 'run_blocked', stage: result.stage, verdict: 'BLOCKED', detail: { slices: next.slices.filter((x) => x.status === 'BLOCKED').map((x) => x.id) } });
    out = { outcome: 'BLOCKED', exit: 3 };
  }
  return out;
}

function readQuestionsFile(ctx, file) {
  try {
    const j = JSON.parse(readText(path.resolve(ctx.repo, file)));
    const list = Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : []);
    return list;
  } catch {
    return [];
  }
}

// Slice and run status per M1 for a result that is not a deploy cascade.
function applyStatusToState(st, result) {
  const slice = result.slice_id ? st.slices.find((s) => s.id === result.slice_id) : null;
  switch (result.status) {
    case 'ok':
      if (slice) slice.status = 'DONE';
      break;
    case 'failed':
      if (slice) { slice.status = 'FAILED'; slice.attempts = (slice.attempts || 0) + 1; } else st.status = 'FAILED';
      break;
    case 'needs_human':
      if (slice) slice.status = 'NEEDS_HUMAN';
      st.status = 'NEEDS_HUMAN';
      break;
    case 'blocked':
      if (slice) slice.status = 'BLOCKED'; else st.status = 'BLOCKED';
      break;
    case 'usage_limit':
      st.status = 'PARKED';
      break;
    default:
      break;
  }
}

// ---- redact.mjs ----
// G-7: values the process knows are secrets never reach a file or an output.
// The set lives for the process; every spine write and the final stdout pass through redactText.
const REDACT_MIN_LENGTH = 6;
const REDACT_VALUES = new Map();
const REDACT_HITS = new Set();

// CP-03 R4-L4: words of the spine's own protocol are never secrets. A planted secret file whose value is a
// run status or a gate outcome would otherwise rewrite state.json ("status":"[REDACTED:x]", which then
// fails its checks) or a gate answer, and switch the stop gate off. Run statuses are the state schema's
// enum (a drift test keeps this list equal to it); the outcomes are the ones a host maps.
const PROTOCOL_WORDS = new Set([
  'INTAKE', 'PLANNING', 'AWAIT_RATIFY', 'BUILDING', 'VERIFYING', 'REVIEWING', 'FIXING', 'DEPLOYING', 'PROVING', 'CONCLUDING', 'DONE',
  'NEEDS_HUMAN', 'PARKED', 'BLOCKED', 'FAILED', 'PARTIAL_FAILURE', 'ROLLED_BACK', 'ESCALATED',
  'STOP_REFUSED', 'STOP_ALLOWED',
]);

function redactAdd(name, value) {
  if (typeof value !== 'string' || value.length < REDACT_MIN_LENGTH) return;
  if (PROTOCOL_WORDS.has(value.trim())) return;
  const forms = [value];
  const escaped = JSON.stringify(value).slice(1, -1);
  if (escaped !== value) forms.push(escaped);
  for (const form of forms) REDACT_VALUES.set(form, name);
}

function redactReset() {
  REDACT_VALUES.clear();
  REDACT_HITS.clear();
}

function redactText(text) {
  if (!REDACT_VALUES.size || typeof text !== 'string') return text;
  let out = text;
  const forms = Array.from(REDACT_VALUES.keys()).sort((a, b) => b.length - a.length);
  for (const form of forms) {
    if (!out.includes(form)) continue;
    const name = REDACT_VALUES.get(form);
    REDACT_HITS.add(name);
    out = out.split(form).join('[REDACTED:' + name + ']');
  }
  return out;
}

// Redacts every string of a JSON value (keys too), leaving the structure as it is.
function redactValue(v) {
  if (typeof v === 'string') return redactText(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[redactText(k)] = redactValue(x);
    return out;
  }
  return v;
}

// CP-03 R5-S1-L3: the spine's own JSON files (state.json, finish-line.json, events, packs, the registry) are
// redacted value by value; keys are the spine's vocabulary and are never rewritten, so a planted secret equal
// to "session_id" or "evidence" cannot break the file's shape.
function redactJsonValues(v) {
  if (typeof v === 'string') return redactText(v);
  if (Array.isArray(v)) return v.map(redactJsonValues);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = redactJsonValues(x);
    return out;
  }
  return v;
}

// Names the project declares: READINESS credentials and .env.example NAME= lines.
function redactDeclaredNames(ctx) {
  const names = new Set();
  try {
    const r = JSON.parse(readText(path.join(ctx.home, 'plan', 'READINESS.json')));
    for (const n of Array.isArray(r.credentials) ? r.credentials : []) if (typeof n === 'string' && n) names.add(n);
  } catch { /* no readiness yet */ }
  try {
    for (const line of readText(path.join(ctx.home, '.env.example'), REGISTRY_READ_CAP).split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (m) names.add(m[1]);
    }
  } catch { /* no example */ }
  return Array.from(names).sort();
}

// Cheap, side-effect free sources only: the file directory and the environment.
// Credentials behind a user CLI join the set in the process that resolves them.
function redactInit(ctx) {
  redactReset();
  try {
    const dir = path.resolve(ctx.repo, '.secrets');
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      const st = fs.statSync(f);
      if (st.isFile() && st.size <= 65536) redactAdd(n, readText(f, 65536).replace(/\r?\n$/, ''));
    }
  } catch { /* no .secrets */ }
  for (const n of redactDeclaredNames(ctx)) redactAdd(n, ctx.env[n]);
}

// ---- reply.mjs ----
// G-16: deterministic owner-reply parser. No locale-dependent calls: only
// toLowerCase (never toLocaleLowerCase), NFKC and fixed regexes, so the same
// text yields the same answers on every host, locale and time zone.
function normalizeReply(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[  -​  　﻿]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function replyMatchOption(rest, options) {
  const lowRest = rest.toLowerCase();
  const sameLen = lowRest.length === rest.length;
  const sorted = options.slice().sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    if (!opt) continue;
    let hit = rest.startsWith(opt);
    if (!hit && sameLen) hit = lowRest.startsWith(opt.toLowerCase()) && opt.toLowerCase().length === opt.length;
    if (hit && (rest.length === opt.length || rest[opt.length] === ' ')) return { option: opt, length: opt.length };
  }
  return null;
}

// Returns { items:[{n,answer,free_text}], except:null|{all:true,numbers:[]}, errors:[{kind,n?,...}] }.
function parseReply(text, questions) {
  const byN = new Map(questions.map((q) => [q.n, q]));
  const out = { items: [], except: null, errors: [] };
  const segments = normalizeReply(text).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    let rest = seg;
    while (rest) {
      let m;
      if ((m = /^(?:(?:approve|accept)\s+)?all(?:\s+except\b)?\s*/i.exec(rest))) {
        const isExcept = /except/i.test(m[0]);
        rest = rest.slice(m[0].length);
        const numbers = [];
        if (isExcept) {
          let nm;
          while ((nm = /^(\d+)\s*(?:,\s*|and\b\s*|&\s*)?/i.exec(rest))) {
            numbers.push(Number(nm[1]));
            rest = rest.slice(nm[0].length);
          }
        }
        out.except = { numbers: ((out.except && out.except.numbers) || []).concat(numbers) };
        continue;
      }
      if ((m = /^(\d+)\s*:\s*(.*)$/.exec(rest))) {
        out.items.push({ n: Number(m[1]), answer: m[2].trim(), free_text: true });
        rest = '';
        continue;
      }
      if ((m = /^(\d+)\s+(.+)$/.exec(rest))) {
        const n = Number(m[1]);
        const body = m[2];
        const q = byN.get(n);
        if (!q) {
          const tok = /^\S+/.exec(body)[0];
          out.items.push({ n, answer: tok, free_text: false });
          rest = body.slice(tok.length).trim();
          continue;
        }
        const hit = q.options.length ? replyMatchOption(body, q.options) : null;
        if (hit) {
          out.items.push({ n, answer: hit.option, free_text: false });
          rest = body.slice(hit.length).trim();
          continue;
        }
        const tok = /^\S+/.exec(body)[0];
        out.items.push({ n, answer: tok, free_text: false });
        rest = body.slice(tok.length).trim();
        continue;
      }
      out.errors.push({ kind: 'unparseable', token: rest.split(' ')[0] });
      rest = '';
    }
  }
  return out;
}

// ---- resume.mjs ----
// Statuses a run never leaves (FAILED can go back to BUILDING): re-binding one hands over nothing that gates.
const TERMINAL = ['DONE', 'ESCALATED'];

// Which run does `resume` with no --run mean? Never "the newest run in the repo" (CP-03 S1-H2): the
// caller's own runs first (a parked one before the rest), then a run with no session inside the caller's
// cwd. Only when the caller owns nothing does it look at the newest run, and the ownership check below
// refuses that one when another session owns it. A caller with no session id never re-binds anything.
function pickRun(ctx, flags, session) {
  if (flags.run || !session) return selectRunId(ctx, flags);
  const mine = selectScopedRunId(ctx, { session, cwd: ctx.cwd }).ranked;
  if (mine.length) return (mine.find((r) => r.status === 'PARKED') || mine[0]).id;
  const unowned = selectScopedRunId(ctx, { session: null, cwd: ctx.cwd }).ranked;
  if (unowned.length) return (unowned.find((r) => r.status === 'PARKED') || unowned[0]).id;
  return selectRunId(ctx, flags);
}

// resume works from a fresh process using state alone. It clears a ceiling block
// (after a handoff exists) or un-parks a parked run, re-queues RUNNING slices
// without counting an attempt, and re-reads every VERIFIED row by hash.
//
// Ownership (CP-03 S1-H2, CONTRACT 3.1 / S1-00): the session that resumes owns the run from then on.
// A run whose recorded session is another, non-null id is re-bound only with an explicit
// `--run <id> --take-over` (the takeover is kept in owner.history and logged as `owner_taken_over`);
// without it resume refuses with OWNED_BY_OTHER_SESSION and names the owner. Nothing on disk tells a
// session that ended (/clear) from one that is still running, so the caller must say so. A run with no
// session, a legacy run, or a terminal one re-binds without --take-over: no live session loses a gate.
function cmdResume(ctx, args) {
  const f = args.flags;
  const session = resolveSessionId(ctx, f);
  const takeOver = !!f['take-over'];
  if (takeOver && typeof f.run !== 'string') throw fail('USAGE', 1, { message: 'resume --take-over needs --run <id>: a takeover names the run it takes' });
  const runId = pickRun(ctx, f, session);
  const state = loadState(ctx, runId);
  const force = !!f.force;
  const ceilingHeld = state.ceiling === 'BLOCKED';
  const was = state.owner && typeof state.owner === 'object' ? state.owner : null;
  const foreign = !!(session && was && was.session_id && was.session_id !== session);
  if (foreign && !takeOver && !TERMINAL.includes(state.status)) {
    throw fail('OWNED_BY_OTHER_SESSION', 1, {
      run_id: runId, status: state.status, owner_session: was.session_id, session,
      message: 'run ' + runId + ' is owned by session ' + was.session_id + '. If that session has ended (after /clear), take the run over with: resume --run ' + runId + ' --take-over',
    });
  }
  const rebind = () => {
    // a legacy run (no owner object) keeps adopting its 1.0.x rows after it is bound to a session, or it would
    // re-seed its pipeline and start again at intake (CP-03 R3-L7)
    const prev = was || { session_id: null, cwd: ctx.cwd, adopted_legacy: true };
    if (!session || prev.session_id === session) return null;
    const reason = foreign ? 'take_over' : 'resume';
    state.owner = { ...prev, session_id: session, history: [...(Array.isArray(prev.history) ? prev.history : []), { session_id: prev.session_id || null, until: ctx.now(), reason }] };
    return { from: prev.session_id || null, to: session, taken_over: foreign };
  };
  const logRebind = (moved) => appendEvent(ctx, runId, {
    event: moved.taken_over ? 'owner_taken_over' : 'owner_rebound', stage: state.stage, host: state.host,
    verdict: moved.taken_over ? 'TAKEN_OVER' : 'REBOUND', detail: moved,
  });
  if (state.status !== 'PARKED' && !ceilingHeld) {
    const moved = rebind();
    if (!moved) throw fail('NOT_PARKED', 1, { run_id: runId, status: state.status });
    writeState(ctx, state);
    logRebind(moved);
    const regErr = registerSessionRun(ctx, session, runId);
    return { outcome: moved.taken_over ? 'TAKEN_OVER' : 'REBOUND', exit: 0, run_id: runId, status: state.status, owner: state.owner, previous_owner: moved.from, ...(regErr ? { session_registry_error: regErr } : {}) };
  }

  if (state.status === 'PARKED') {
    const park = readJsonIfExists(parkPath(ctx, runId));
    if (park && park.reset_at && !force && Date.parse(park.reset_at) > Date.parse(ctx.now())) {
      throw fail('STILL_PARKED', 3, { run_id: runId, reset_at: park.reset_at, message: 'before reset_at ' + park.reset_at + '; use --force to resume anyway' });
    }
  } else if (!handoffWritten(state) && !force) {
    throw fail('CEILING_BLOCKED', 3, { run_id: runId, reason: 'no_handoff', message: 'the ceiling block clears only after a handoff exists' });
  }

  const requeued = [];
  for (const s of state.slices) {
    if (s.status === 'RUNNING') { s.status = 'READY'; requeued.push(s.id); }
  }
  const changed = verifyEvidence(ctx, runId, state);
  const reopened = [];
  for (const c of changed) {
    const s = state.slices.find((x) => x.id === c.row);
    if (s && s.status === 'DONE') { s.status = 'READY'; reopened.push(s.id); }
  }
  const from = state.status;
  if (state.status === 'PARKED') state.status = 'BUILDING';
  if (ceilingHeld) state.ceiling = 'OK';
  state.park = null;
  const rebound = rebind();
  writeState(ctx, state);
  if (rebound) logRebind(rebound);
  // the resuming session owns the run now (or still does): record its home for the stop gate (R3-S1-H7)
  const owner = state.owner && typeof state.owner === 'object' ? state.owner.session_id : null;
  const regErr = owner ? registerSessionRun(ctx, owner, runId) : null;
  const wake = consumeWake(ctx, runId);
  appendEvent(ctx, runId, { event: 'run_resumed', stage: state.stage, host: state.host, verdict: 'RESUMED', detail: { from, requeued, reopened, warnings: changed.length, forced: force, ceiling_cleared: ceilingHeld } });
  return {
    outcome: 'RESUMED', exit: 0, run_id: runId, status: state.status, requeued, reopened, warnings: changed.length,
    changed: changed.map((c) => c.row), wake: wake ? wake.status : null, ceiling: state.ceiling || null, owner: state.owner || null,
    previous_owner: rebound ? rebound.from : undefined, taken_over: rebound ? rebound.taken_over : undefined,
    ...(regErr ? { session_registry_error: regErr } : {}),
  };
}

// ---- router.mjs ----
// Deterministic-first routing (D9): an ordered rule table. A request that
// matches no rule, or ties between presets at the best priority, goes to the
// single logged model fallback (ROUTE_MODEL) which `next` requests once.
const PRESET_NAMES = ['feature', 'investigate-fix', 'drain', 'review-loop', 'reconcile'];

function routeWords(list) {
  return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + list.join('|') + ')(?![\\p{L}\\p{N}_])', 'iu');
}

const ROUTE_RULES = [
  { id: 'R-DRAIN', preset: 'drain', priority: 1, re: routeWords(['drain', 'backlog', 'burn ?down', 'work through the (?:cards|tickets|issues)']) },
  { id: 'R-RECONCILE', preset: 'reconcile', priority: 1, re: routeWords(['reconcile', 'stray branches', 'worktrees?', 'clean ?up (?:the )?branches', 'branch(?:es)? inventory']) },
  { id: 'R-REVIEW', preset: 'review-loop', priority: 2, re: routeWords(['review', 'roteiro', 'audit', 'walk ?through', 'attended gate']) },
  {
    id: 'R-BUG',
    preset: 'investigate-fix',
    priority: 3,
    re: routeWords([
      'bugs?', 'fix(?:es|ed)?', 'broken', 'crash(?:es|ed|ing)?', 'fail(?:s|ed|ing|ure)?', 'regress(?:ion)?', 'exception', 'stack ?trace',
      'not working', "doesn'?t work", 'does not work', "can'?t", 'cannot', 'incomplete', 'wrong',
      'n[aã]o (?:recebe|funciona|abre|carrega|envia|salva|chega|aparece|responde)', 'erro', 'falha', 'quebrad[oa]', 'travou', 'incompleta?s?',
    ]),
  },
  { id: 'R-FEATURE', preset: 'feature', priority: 3, re: routeWords(['ship', 'build', 'add', 'implement', 'create', 'features?', 'w\\d+(?:\\s*(?:-|to|a)\\s*w?\\d+)?', 'waves?', 'epics?', 'prds?', 'release', 'launch', 'integrate', 'support']) },
];

// First integer in the request: the size hint for drain-shaped work.
function routeSizeHint(text) {
  const m = /(?<![\p{L}\p{N}_.])(\d{1,6})(?![\p{L}\p{N}_.])/u.exec(text);
  return m ? Number(m[1]) : null;
}

function route(text) {
  const request = String(text || '');
  const hits = ROUTE_RULES.filter((r) => r.re.test(request));
  if (!hits.length) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'no_rule_matched' };
  const best = Math.min(...hits.map((h) => h.priority));
  const top = hits.filter((h) => h.priority === best);
  const presets = Array.from(new Set(top.map((h) => h.preset)));
  if (presets.length > 1) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'tie:' + presets.join(',') };
  const out = { preset: top[0].preset, rule: top[0].id, model_call: false, ambiguous: false, size: null };
  if (out.preset === 'drain') out.size = routeSizeHint(request);
  return out;
}

// ---- schema.mjs ----
// JSON Schema subset: type, enum, const, required, properties, items,
// additionalProperties, pattern, minLength, minimum, maximum, minItems, oneOf.
function schemaTypeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function schemaTypeMatches(want, v) {
  const t = schemaTypeOf(v);
  if (want === t) return true;
  if (want === 'number' && t === 'integer') return true;
  return false;
}

function schemaDeepEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

function validateSchema(schema, data, pointer) {
  const errors = [];
  schemaWalk(schema, data, pointer || '', errors);
  return errors;
}

function schemaWalk(schema, data, ptr, errors) {
  if (!schema || schema === true) return;
  if (schema.oneOf) {
    let passing = 0;
    for (const sub of schema.oneOf) {
      const e = [];
      schemaWalk(sub, data, ptr, e);
      if (e.length === 0) passing++;
    }
    if (passing !== 1) errors.push({ pointer: ptr, message: 'must match exactly one of oneOf (matched ' + passing + ')' });
    return;
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => schemaTypeMatches(t, data))) {
      errors.push({ pointer: ptr, message: 'expected type ' + types.join('|') + ' but got ' + schemaTypeOf(data) });
      return;
    }
  }
  if (schema.const !== undefined && !schemaDeepEqual(schema.const, data)) {
    errors.push({ pointer: ptr, message: 'must equal ' + JSON.stringify(schema.const) });
  }
  if (schema.enum !== undefined && !schema.enum.some((v) => schemaDeepEqual(v, data))) {
    errors.push({ pointer: ptr, message: 'must be one of ' + schema.enum.map((v) => JSON.stringify(v)).join(', ') });
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ pointer: ptr, message: 'must be at least ' + schema.minLength + ' characters' });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
      errors.push({ pointer: ptr, message: 'must match pattern ' + schema.pattern });
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ pointer: ptr, message: 'must be at least ' + schema.minimum });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ pointer: ptr, message: 'must be at most ' + schema.maximum });
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ pointer: ptr, message: 'must have at least ' + schema.minItems + ' items' });
    }
    if (schema.items) data.forEach((item, i) => schemaWalk(schema.items, item, ptr + '/' + i, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push({ pointer: ptr + '/' + schemaEscape(key), message: 'is required' });
      }
    }
    for (const key of Object.keys(data)) {
      const child = ptr + '/' + schemaEscape(key);
      if (props[key] !== undefined) schemaWalk(props[key], data[key], child, errors);
      else if (schema.additionalProperties === false) errors.push({ pointer: child, message: 'is not an allowed property' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        schemaWalk(schema.additionalProperties, data[key], child, errors);
      }
    }
  }
}

function schemaEscape(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

// The built file embeds every schema (EMBEDDED_SCHEMAS); in source mode they are
// read from core/schemas.
function loadSchemaFile(name) {
  if (typeof EMBEDDED_SCHEMAS !== 'undefined' && EMBEDDED_SCHEMAS[name]) return EMBEDDED_SCHEMAS[name];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, '..', '..', 'schemas', name);
  if (!fs.existsSync(file)) throw fail('SCHEMA_NOT_FOUND', 1, { schema: name });
  return JSON.parse(readText(file));
}

// ---- secrets.mjs ----
const SECRET_DRIVERS = {
  file: secretsFileResolve,
  env: secretsEnvResolve,
  'aws-secrets-manager': secretsAwsResolve,
  '1password': secretsOnepasswordResolve,
};

// Resolve every named credential through the provider driver. The value goes
// into the redaction set and no further: results carry name, ok and length only.
function resolveCredentials(ctx, _runId, names, secrets) {
  const provider = secrets && secrets.provider ? secrets.provider : 'file';
  const driver = SECRET_DRIVERS[provider];
  return names.map((name) => {
    if (!driver) return { name, ok: false, length: 0, detail: 'unknown_provider' };
    const r = driver(name, secrets.ref, ctx);
    if (r.ok) redactAdd(name, r.value);
    return { name, ok: r.ok, length: r.ok ? r.length : 0, detail: r.ok ? null : r.detail };
  });
}

// doctor --secrets [--name A,B]: names from the flag, READINESS and .env.example.
// Prints names, status and lengths only.
function doctorSecrets(ctx, args) {
  const settings = loadSettings(ctx, args.sets);
  const flagNames = typeof args.flags.name === 'string' ? args.flags.name.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const names = Array.from(new Set([...flagNames, ...redactDeclaredNames(ctx)])).sort();
  const provider = settings.values.secrets.provider;
  if (!SECRET_DRIVERS[provider]) throw fail('CREDENTIAL_PROVIDER_UNKNOWN', 1, { provider, providers: Object.keys(SECRET_DRIVERS) });
  const results = resolveCredentials(ctx, null, names, settings.values.secrets);
  const secrets = results.map((r) => ({ name: r.name, status: r.ok ? 'ok' : 'missing', length: r.length, ...(r.ok ? {} : { detail: r.detail }) }));
  const missing = secrets.filter((s) => s.status !== 'ok');
  let runId = null;
  try { runId = selectRunId(ctx, {}); } catch { /* no run yet */ }
  if (runId) {
    try {
      appendEvent(ctx, runId, { event: 'secrets_checked', verdict: missing.length ? 'CREDENTIAL_MISSING' : 'SECRETS_OK', detail: { provider, names, missing: missing.map((m) => m.name) } });
    } catch { /* the check result matters more than the trace */ }
  }
  const out = { provider, ref: settings.values.secrets.ref, secrets };
  if (missing.length) return { outcome: 'CREDENTIAL_MISSING', exit: 3, ...out, missing: missing.map((m) => m.name) };
  return { outcome: 'SECRETS_OK', exit: 0, ...out };
}

// Names redacted during this command go to the run's events, names only.
function redactFlushEvents(ctx, result) {
  if (!REDACT_HITS.size) return;
  const names = Array.from(REDACT_HITS).sort();
  REDACT_HITS.clear();
  try {
    const runId = result && typeof result.run_id === 'string' ? result.run_id : null;
    if (!runId) return;
    for (const name of names) appendEvent(ctx, runId, { event: 'secret_redacted', verdict: 'REDACTED', detail: { name } });
  } catch { /* redaction must never fail a command */ }
}

// ---- session.mjs ----
// Which session is calling? Core names no host (R3): the host layer says which environment
// variables carry its session id by exporting DO_IT_SESSION_ENV (comma-separated names).
// Precedence (CONTRACT 2.1, unchanged): --session, then DO_IT_SESSION_ID, then the first named host
// variable that is set. An explicit id therefore outranks the host's live id, so a stale
// DO_IT_SESSION_ID export would bind the run to a session no hook ever reports; `start` says so in
// `session_conflict` (CP-03 S1-L1). A blank or whitespace-only value counts as absent and is never
// recorded (CP-03 S1-L2).
function cleanSessionId(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function resolveSession(ctx, flags) {
  const env = ctx.env || {};
  let host = null;
  for (const name of String(env.DO_IT_SESSION_ENV || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    host = cleanSessionId(env[name]);
    if (host) break;
  }
  const id = cleanSessionId(flags && flags.session) || cleanSessionId(env.DO_IT_SESSION_ID) || host;
  return { id, host, conflict: id && host && id !== host ? { recorded: id, host } : null };
}

function resolveSessionId(ctx, flags) {
  return resolveSession(ctx, flags).id;
}

// ---- sessions.mjs ----
// Session registry (CP-03 R3-S1-H7). A session can start a run in one repo and stop while its cwd is in
// another repo, or in a folder that is no repo at all. The stop gate keys on the session owning the run
// (CONTRACT 3.1 row 1), not on the cwd, so `start`, `resume` and a take-over record where each run lives:
//   <user do-it home>/sessions/h-<sha256(session id), 32 hex>/<run id>.json  ->  { session_id, run_id, home, root }
// One file per run (CP-03 R4-S1-M8): a write never rewrites another run's entry, so starts that run at the
// same time cannot lose each other, and pruning deletes only the stale run's own file. Each file is written
// atomically (temp file, then rename). The 1.1 pre-release layout, one `<session id>.json` holding
// { session_id, runs: [...] }, is still read, and is migrated to per-run files on the next write or read.
// The user do-it home is DO_IT_USER_HOME when set (tests), else <HOME>/.do-it. `gate stop --session` looks in
// every home on that list as well as the cwd's. An entry whose home or run is gone, whose run is over
// (DONE, ESCALATED) or now belongs to another session is pruned when the list is read; an entry whose own
// session_id is not the reader's exact id is never read or pruned (R5-S1-M12).
const OVER = ['DONE', 'ESCALATED'];

function userDoItHome(ctx) {
  const env = ctx.env || {};
  return env.DO_IT_USER_HOME ? path.resolve(ctx.cwd, env.DO_IT_USER_HOME) : path.join(ctx.userHome, '.do-it');
}

// An id becomes a file name as is when it is a plain name, else by digest (never a path). Used for run ids,
// and for the session folders of the round-4 layout (read and migrated only).
function safeName(id) {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && !/^\.+$/.test(id) ? id : 'h-' + sha256Bytes(id).slice(0, 32);
}

// CP-03 R5-S1-M12: a session folder is always named by the digest of the exact session id (lowercase hex), so
// two ids that differ only in letter case never share a folder on a case-insensitive disk. Each entry keeps a
// readable copy of the id (session_id), and only entries whose copy equals the reader's id exactly are used.
function sessionFolderName(sessionId) {
  return 'h-' + sha256Bytes(sessionId).slice(0, 32);
}

// The folder holding one file per run of `sessionId`.
function sessionDir(ctx, sessionId) {
  return path.join(userDoItHome(ctx), 'sessions', sessionFolderName(sessionId));
}

// The round-4 folder (plain ids kept their own name): read and migrated, never written.
function oldSessionDir(ctx, sessionId) {
  return path.join(userDoItHome(ctx), 'sessions', safeName(sessionId));
}

// The pre-release single-file layout (read and migrated, never written).
function legacySessionFile(ctx, sessionId) {
  return oldSessionDir(ctx, sessionId) + '.json';
}

function runFile(ctx, sessionId, runId) {
  return path.join(sessionDir(ctx, sessionId), safeName(runId) + '.json');
}

const isEntry = (e) => e && typeof e.run_id === 'string' && typeof e.home === 'string';

// CP-03 R5-S1-M10: registry files are read with lstat first: only a regular file (never a symlink, FIFO or
// device), at most 64 KiB. Anything else is reported, never followed or read.
const readRegistryJson = (file) => readJsonRegular(file, REGISTRY_READ_CAP, { noFollow: true });

function readLegacy(file, sessionId) {
  const doc = readRegistryJson(file);
  // the file of a case twin (same folder name on a case-insensitive disk) is not this session's
  if (!doc || doc.session_id !== sessionId) return [];
  return Array.isArray(doc.runs) ? doc.runs.filter(isEntry) : [];
}

// Moves a legacy single file into per-run files: every entry is written first (an existing per-run file
// wins), then the old file is removed, so a crash in between loses nothing.
function migrateLegacy(ctx, sessionId, skip) {
  const file = legacySessionFile(ctx, sessionId);
  if (!fs.existsSync(file)) return;
  for (const e of readLegacy(file, sessionId)) {
    if (skip && skip.has(e.run_id + '\0' + e.home)) continue;
    const f = runFile(ctx, sessionId, e.run_id);
    if (!fs.existsSync(f)) atomicWriteJson(f, { session_id: sessionId, run_id: e.run_id, home: e.home, root: typeof e.root === 'string' ? e.root : path.dirname(e.home) }, { cap: REGISTRY_READ_CAP });
  }
  const doc = readRegistryJson(file);
  if (doc && doc.session_id === sessionId) fs.rmSync(file, { force: true });
}

// Moves this session's entries out of the round-4 folder (named by the plain id) into the digest folder. Only
// entries whose session_id equals this id exactly move; a case twin's entries stay where they are.
function migrateOldDir(ctx, sessionId, skip) {
  const old = oldSessionDir(ctx, sessionId);
  if (old === sessionDir(ctx, sessionId)) return;
  let names;
  try {
    if (!fs.lstatSync(old).isDirectory()) return;
    names = fs.readdirSync(old);
  } catch { return; }
  for (const n of names) {
    if (n.startsWith('.') || !n.endsWith('.json')) continue;
    const from = path.join(old, n);
    let doc;
    try { doc = readRegistryJson(from); } catch { continue; }
    if (!isEntry(doc) || doc.session_id !== sessionId) continue;
    if (!(skip && skip.has(doc.run_id + '\0' + doc.home))) {
      const to = runFile(ctx, sessionId, doc.run_id);
      if (!fs.existsSync(to)) atomicWriteJson(to, { session_id: sessionId, run_id: doc.run_id, home: doc.home, root: typeof doc.root === 'string' ? doc.root : path.dirname(doc.home) }, { cap: REGISTRY_READ_CAP });
    }
    fs.rmSync(from, { force: true });
  }
  try { fs.rmdirSync(old); } catch { /* not empty: a case twin's entries are still there */ }
}

// Every entry of the session: { entries: [{ run_id, home, root, file }], errors: [{ file, error }] }.
// CP-03 R4-S1-M7: a registry file that cannot be read or parsed is reported, never thrown, so one bad file
// cannot take the gate down for the session's other runs (or for the cwd's own run).
function readEntries(ctx, sessionId) {
  const out = [];
  const errors = [];
  // the error names the file and the cause, never the file's content (R5-L5)
  const note = (file, e) => errors.push({ file, error: String(e && e.code ? e.code + ': ' + e.message : (e && e.message) || e) });
  const legacy = legacySessionFile(ctx, sessionId);
  try { for (const e of readLegacy(legacy, sessionId)) out.push({ ...e, file: null, legacy: 'file' }); } catch (e) { note(legacy, e); }
  const readDir = (dir, kind) => {
    let names = [];
    try {
      const st = fs.lstatSync(dir);
      if (!st.isDirectory()) note(dir, Object.assign(new Error('not a directory' + (st.isSymbolicLink() ? ' (symlink, not followed)' : '')), { code: 'ENOTDIR' }));
      else names = fs.readdirSync(dir);
    } catch (e) { if (e.code !== 'ENOENT') note(dir, e); }
    for (const n of names.sort()) {
      if (n.startsWith('.') || !n.endsWith('.json')) continue; // temp files of a write in flight
      const file = path.join(dir, n);
      try {
        const doc = readRegistryJson(file);
        if (!isEntry(doc)) { if (doc !== null) note(file, new Error('not a registry entry')); continue; }
        // R5-S1-M12: an entry is this session's only when its own copy of the id is this exact id
        if (doc.session_id !== sessionId) continue;
        out.push({ run_id: doc.run_id, home: doc.home, root: doc.root, file, ...(kind ? { legacy: kind } : {}) });
      } catch (e) { note(file, e); }
    }
  };
  readDir(sessionDir(ctx, sessionId), null);
  if (oldSessionDir(ctx, sessionId) !== sessionDir(ctx, sessionId)) readDir(oldSessionDir(ctx, sessionId), 'dir');
  return { entries: out, errors };
}

// Records that `runId`, in ctx's home, is owned by `sessionId`. Returns null, or the error text when the
// registry could not be written (the caller reports it: the run then gates only from its own repo).
function registerSessionRun(ctx, sessionId, runId) {
  if (!sessionId) return null;
  try {
    atomicWriteJson(runFile(ctx, sessionId, runId), { session_id: sessionId, run_id: runId, home: realpathSafe(ctx.home), root: realpathSafe(ctx.root) }, { cap: REGISTRY_READ_CAP });
    try { migrateLegacy(ctx, sessionId); } catch { /* the legacy file is still read */ }
    try { migrateOldDir(ctx, sessionId); } catch { /* the old folder is still read */ }
    return null;
  } catch (e) {
    return String(e && e.message ? e.message : e);
  }
}

function liveEntry(e, sessionId) {
  // a forged run id never walks out of the home's runs folder
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(e.run_id) || /^\.+$/.test(e.run_id)) return false;
  const file = path.join(e.home, 'runs', e.run_id, 'state.json');
  try {
    const st = readJsonRegular(file, STATE_READ_CAP);
    if (!st || OVER.includes(st.status)) return false;
    const o = st.owner;
    return !!(o && typeof o === 'object' && o.session_id === sessionId);
  } catch (err) {
    // a FIFO, device or oversized file is no run state (R5-S1-M10): never read it, drop the entry
    if (err && (err.code === 'ENOTREG' || err.code === 'EFBIG')) return false;
    // a run that is there but unreadable stays listed: the gate reports it, it does not forget it
    return fs.existsSync(file);
  }
}

// Every home that holds a live run of `sessionId`, pruning stale entries.
// Returns { homes: [{ home, root }], errors: [{ file, error }] }; it never throws (R4-S1-M7).
function sessionHomes(ctx, sessionId) {
  if (!sessionId) return { homes: [], errors: [] };
  let all;
  let errors;
  try {
    ({ entries: all, errors } = readEntries(ctx, sessionId));
  } catch (e) {
    return { homes: [], errors: [{ file: sessionDir(ctx, sessionId), error: String(e && e.message ? e.message : e) }] };
  }
  if (!all.length) return { homes: [], errors };
  const keep = all.filter((e) => liveEntry(e, sessionId));
  const stale = all.filter((e) => !keep.includes(e));
  // pruning is best effort and touches only the stale run's own file; the live entries are still used
  for (const e of stale) if (e.file && !e.legacy) { try { fs.rmSync(e.file, { force: true }); } catch { /* best effort */ } }
  // older layouts move to the digest folder; a stale entry is simply not carried over
  const skip = new Set(stale.filter((e) => e.legacy).map((e) => e.run_id + '\0' + e.home));
  if (all.some((e) => e.legacy === 'file')) { try { migrateLegacy(ctx, sessionId, skip); } catch { /* still read next time */ } }
  if (all.some((e) => e.legacy === 'dir')) { try { migrateOldDir(ctx, sessionId, skip); } catch { /* still read next time */ } }
  // each home also names the session's run ids in it (CP-03 R9-L-b: the gate's fallback when the home's runs
  // folder exists but cannot be listed)
  const byHome = new Map();
  const homes = [];
  for (const e of keep) {
    const home = realpathSafe(e.home);
    if (byHome.has(home)) { if (!byHome.get(home).runs.includes(e.run_id)) byHome.get(home).runs.push(e.run_id); continue; }
    const h = { home, root: typeof e.root === 'string' ? e.root : path.dirname(home), runs: [e.run_id] };
    byHome.set(home, h);
    homes.push(h);
  }
  return { homes, errors };
}

// ---- settings.mjs ----
const SETTINGS_DEFAULTS = {
  version: 1,
  interaction: { owner_pack: 'auto', fallback: ['native', 'html', 'markdown'] },
  host: { driver: 'auto', alias: null },
  isolation: { driver: 'worktree' },
  state: { backend: 'local' },
  secrets: { provider: 'file', ref: '.secrets/' },
  handoff: { mode: 'auto', max_per_run: 5 },
  review: { max_rounds: 3, cost_cap_tokens: 600000 },
  tiers: { T1: '', T2: '', T3: '' },
  ceilings: { warn_tokens: 150000, warn_pct: 40, block_tokens: 250000, block_pct: 60 },
  stop_gate: { patience: 3 },
  observability: { provider: 'none' },
};

// Host-owned settings: `state.<backend>` is one object keyed by the backend name. Core does not know its
// shape; the host that provides the backend declares it in the `state_store.settings_schema` entry of
// hosts/<name>/adapter.manifest.json. Returns { schema } | { absent: true } (no hosts folder reachable at all:
// a lone copy of the bundle, accepted unchecked) | { error } (host or schema missing).
function settingsHostsDirs(ctx) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Source tree (../../hosts), a bundle one level deeper, and the installed plugin, which ships the host
  // manifests and settings schemas next to its scripts folder (../hosts). An explicit override is tried first.
  const cands = [ctx.env.DO_IT_HOSTS_DIR, path.join(here, '..', '..', 'hosts'), path.join(here, '..', '..', '..', 'hosts'), path.join(here, '..', 'hosts')];
  return cands
    .filter(Boolean).map((d) => path.resolve(d)).filter((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());
}

function settingsHostSchema(ctx, name) {
  const dirs = settingsHostsDirs(ctx);
  if (!dirs.length) return { absent: true };
  const dir = dirs.find((d) => fs.existsSync(path.join(d, name, 'adapter.manifest.json')));
  if (!dir) return { error: 'no host "' + name + '" is installed to validate state.' + name };
  let entry;
  try {
    entry = JSON.parse(readText(path.join(dir, name, 'adapter.manifest.json'))).state_store;
  } catch (e) {
    return { error: 'host "' + name + '" manifest is unreadable: ' + e.message };
  }
  if (!entry || !entry.settings_schema) return { error: 'host "' + name + '" declares no state_store.settings_schema for state.' + name };
  const file = path.join(dir, name, entry.settings_schema);
  try {
    return { schema: JSON.parse(readText(file)) };
  } catch (e) {
    return { error: 'host "' + name + '" settings schema is unreadable: ' + e.message };
  }
}

// Errors for the host-owned part of `state`, with pointers under /state/<name>.
function settingsHostErrors(ctx, data) {
  const state = data && data.state;
  if (!isPlainObject(state)) return [];
  const errors = [];
  const names = Object.keys(state).filter((k) => k !== 'backend' && isPlainObject(state[k]));
  // Any installed host may hold its object here, active backend or not (a dormant block is valid, as in 1.0.5).
  for (const name of names) {
    const h = settingsHostSchema(ctx, name);
    if (h.absent) continue;
    if (h.error) { errors.push({ pointer: '/state/' + schemaEscape(name), message: h.error }); continue; }
    for (const e of validateSchema(h.schema, state[name], '/state/' + schemaEscape(name))) errors.push(e);
  }
  return errors;
}

const SECRET_KEY_NAMES = /^(value|token|password|passwd|secret|api_?key|apikey|private_?key|access_?key)$/i;
const SECRET_SHAPES = [
  /^AKIA[0-9A-Z]{16}$/,
  /^ASIA[0-9A-Z]{16}$/,
  /^(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}$/,
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}$/,
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*$/,
  /^[A-Fa-f0-9]{40,}$/,
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function settingsLooksSecret(keyName, value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (SECRET_KEY_NAMES.test(keyName)) return true;
  if (SECRET_SHAPES.some((re) => re.test(value))) return true;
  // long unbroken mixed token (no path separators, dots or spaces)
  if (value.length >= 32 && /^[A-Za-z0-9+_=-]+$/.test(value) && /[0-9]/.test(value) && /[A-Za-z]/.test(value)) return true;
  return false;
}

// Returns key paths only; the value never leaves this function.
function settingsScanSecrets(obj, prefix, out) {
  if (!isPlainObject(obj)) return out;
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) settingsScanSecrets(v, keyPath, out);
    else if (Array.isArray(v)) v.forEach((item, i) => { if (settingsLooksSecret(key, item)) out.push(keyPath + '.' + i); });
    else if (settingsLooksSecret(key, v)) out.push(keyPath);
  }
  return out;
}

function flattenSettings(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) flattenSettings(v, keyPath, out);
    else out[keyPath] = v;
  }
  return out;
}

function settingsClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function settingsMerge(base, over) {
  for (const key of Object.keys(over)) {
    if (isPlainObject(over[key]) && isPlainObject(base[key])) settingsMerge(base[key], over[key]);
    else base[key] = settingsClone(over[key]);
  }
  return base;
}

function settingsSetPath(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function settingsPaths(ctx) {
  return {
    global: path.join(ctx.userHome, '.do-it', 'settings.json'),
    workspace: path.join(ctx.home, 'settings.json'),
  };
}

function parseSetValue(raw, defaultValue) {
  try {
    return JSON.parse(raw);
  } catch {
    if (Array.isArray(defaultValue)) return raw === '' ? [] : raw.split(',').map((s) => s.trim());
    return raw;
  }
}

// Layers: defaults, global, workspace, run flag. Every leaf keeps its source.
function loadSettings(ctx, setFlags) {
  const schema = loadSchemaFile('settings.schema.json');
  const paths = settingsPaths(ctx);
  const layers = [];
  const parseErrors = [];
  const files = [];
  const seen = new Set();
  for (const name of ['global', 'workspace']) {
    const file = paths[name];
    const real = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (seen.has(real)) {
      files.push({ layer: name, path: file, exists: fs.existsSync(file), shadowed: true });
      continue;
    }
    seen.add(real);
    const exists = fs.existsSync(file);
    files.push({ layer: name, path: file, exists });
    if (!exists) continue;
    let parsed;
    try {
      parsed = JSON.parse(readRegularFile(file, REGISTRY_READ_CAP).toString('utf8'));
    } catch (e) {
      parseErrors.push({ file, pointer: '', message: 'JSON parse error: ' + e.message });
      continue;
    }
    layers.push({ name, file, data: parsed });
  }
  const secretHits = [];
  for (const layer of layers) {
    for (const keyPath of settingsScanSecrets(layer.data, '', [])) secretHits.push({ file: layer.file, key: keyPath });
  }
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, {
      errors: secretHits.map((h) => ({ file: h.file, key: h.key, pointer: '/' + h.key.split('.').join('/'), message: 'looks like a credential value; settings hold references only' })),
    });
  }
  const errors = parseErrors.slice();
  for (const layer of layers) {
    for (const e of validateSchema(schema, layer.data)) errors.push({ file: layer.file, pointer: e.pointer, message: e.message });
    for (const e of settingsHostErrors(ctx, layer.data)) errors.push({ file: layer.file, pointer: e.pointer, message: e.message });
  }
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors });

  const defaultLeaves = flattenSettings(SETTINGS_DEFAULTS, '', {});
  const merged = settingsClone(SETTINGS_DEFAULTS);
  const sources = {};
  for (const k of Object.keys(defaultLeaves)) sources[k] = 'default';
  for (const layer of layers) {
    settingsMerge(merged, layer.data);
    for (const k of Object.keys(flattenSettings(layer.data, '', {}))) sources[k] = layer.name;
  }
  for (const pair of setFlags || []) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const hostKey = /^state\.[^.]+\.[^.]+/.test(key) && key.split('.')[1] !== 'backend' && !settingsHostSchema(ctx, key.split('.')[1]).error;
    if (eq === -1 || !(Object.prototype.hasOwnProperty.call(defaultLeaves, key) || hostKey)) {
      throw fail('SETTINGS_UNKNOWN_KEY', 1, { key });
    }
    settingsSetPath(merged, key, parseSetValue(pair.slice(eq + 1), defaultLeaves[key]));
    sources[key] = 'run-flag';
  }
  if (setFlags && setFlags.length) {
    const flagErrors = validateSchema(schema, merged).concat(settingsHostErrors(ctx, merged)).map((e) => ({ file: 'run-flag', pointer: e.pointer, message: e.message }));
    if (flagErrors.length) throw fail('SETTINGS_INVALID', 1, { errors: flagErrors });
  }
  const leaves = flattenSettings(merged, '', {});
  const entries = Object.keys(leaves).sort().map((key) => ({ key, value: leaves[key], source: sources[key] || 'default' }));
  return { values: merged, entries, files };
}

// ---- state.mjs ----
// The only module that writes run state (G-1): state.json and its sidecar digest.
function runDir(ctx, runId) {
  return path.join(ctx.home, 'runs', runId);
}

function newRunId(ctx) {
  const stamp = ctx.now().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return 'r-' + stamp + '-' + crypto.randomBytes(2).toString('hex');
}

function newState(ctx, runId, fields) {
  const now = ctx.now();
  return {
    schema: 'do-it-state/1',
    run_id: runId,
    preset: fields.preset === undefined ? null : fields.preset,
    request: fields.request,
    status: 'INTAKE',
    size: fields.size === undefined ? null : fields.size,
    host: fields.host === undefined ? null : fields.host,
    owner: fields.owner === undefined ? null : fields.owner,
    stage: 'intake',
    slices: [],
    gates: {},
    handoffs: 0,
    stop_refusals: 0,
    review: { round: 0, exit: null },
    created_at: now,
    updated_at: now,
  };
}

// The bytes writeState would write, after the same checks (schema, then the read cap measured as written,
// after redaction). Nothing touches disk. CP-03 R9-S1-M16: the stop gate test-serialises a park with it
// before it adds the park question to the owner pack.
function stateBytes(ctx, state) {
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw fail('STATE_INVALID', 1, { errors });
  const bytes = jsonBytes(state);
  assertWithinCap(path.join(runDir(ctx, state.run_id), 'state.json'), bytes.length, STATE_READ_CAP);
  return bytes;
}

// Validate, then temp-fsync-rename state.json and its .state.sha256 sidecar.
function writeState(ctx, state) {
  state.updated_at = ctx.now();
  const bytes = stateBytes(ctx, state);
  const dir = runDir(ctx, state.run_id);
  const fault = ctx.env.DO_IT_FAULT === 'after_tmp';
  atomicWrite(path.join(dir, 'state.json'), bytes, { faultAfterTmp: fault, cap: STATE_READ_CAP });
  atomicWrite(path.join(dir, '.state.sha256'), sha256Bytes(bytes) + '\n');
  return state;
}

function tamperFail(ctx, runId, reason) {
  try {
    appendEvent(ctx, runId, { event: 'state_tamper_detected', stage: null, detail: { reason } });
  } catch {
    // the refusal must still be reported when the event log is unwritable
  }
  return fail('STATE_TAMPERED', 1, { run_id: runId, reason });
}

// Every command re-reads state and compares it with the sidecar. A mismatch is
// reported and never repaired.
function loadState(ctx, runId) {
  const dir = runDir(ctx, runId);
  let bytes;
  try {
    bytes = readRegularFile(path.join(dir, 'state.json'), STATE_READ_CAP);
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('RUN_NOT_FOUND', 1, { run_id: runId });
    throw e;
  }
  let sidecar = null;
  try { sidecar = readRegularFile(path.join(dir, '.state.sha256'), REGISTRY_READ_CAP).toString('utf8').trim(); } catch { /* missing, or not a regular file */ }
  if (sidecar === null) throw tamperFail(ctx, runId, 'sidecar_missing');
  if (sidecar !== sha256Bytes(bytes)) throw tamperFail(ctx, runId, 'digest_mismatch');
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { throw tamperFail(ctx, runId, 'unparseable'); }
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw tamperFail(ctx, runId, 'schema_invalid');
  // a run folder holds only its own run: a copied runs/<id>z with the same run_id is not that run (CP-03 R2-L10)
  if (state.run_id !== runId) throw tamperFail(ctx, runId, 'run_id_mismatch');
  return state;
}

function listRunIds(ctx) {
  return listRunIdsChecked(ctx).ids;
}

// { ids, error }: error is set when the runs folder exists but cannot be listed (EACCES on a 0311 folder, ...).
function listRunIdsChecked(ctx) {
  const base = path.join(ctx.home, 'runs');
  let names = [];
  try { names = fs.readdirSync(base); } catch (e) {
    return { ids: [], error: e && e.code === 'ENOENT' ? null : String(e && e.code ? e.code : (e && e.message) || e) };
  }
  return { ids: names.filter((n) => fs.existsSync(path.join(base, n, 'state.json'))).sort(), error: null };
}

// Newest run by created_at (ties by id); --run picks one explicitly.
function selectRunId(ctx, flags) {
  if (flags && flags.run) {
    if (!fs.existsSync(path.join(runDir(ctx, flags.run), 'state.json'))) throw fail('RUN_NOT_FOUND', 1, { run_id: flags.run });
    return flags.run;
  }
  const ids = listRunIds(ctx);
  if (!ids.length) throw fail('NO_RUN', 1, { home: ctx.home });
  let best = null;
  for (const id of ids) {
    let created = '';
    try { created = JSON.parse(readText(path.join(runDir(ctx, id), 'state.json'))).created_at || ''; } catch { /* tampered: still selectable */ }
    if (!best || created > best.created || (created === best.created && id > best.id)) best = { id, created };
  }
  return best.id;
}

// Statuses that never gate a stop (CONTRACT 3.1): the run is waiting on a human, parked, or over.
// Every other status gates.
const NON_GATING_STATUSES = ['PARKED', 'NEEDS_HUMAN', 'BLOCKED', 'AWAIT_RATIFY', 'DONE', 'ESCALATED', 'FAILED'];

function cwdInside(ownerCwd, cwd) {
  const rel = path.relative(realpathSafe(ownerCwd), realpathSafe(cwd));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Which run does the hook's session own? Ownership is recorded once, at `start`, in
// owner.session_id. A hook that names a session matches on that id only. The cwd is a fallback
// only for a host that gave no session and a run that has none (a run whose session is null).
// A run with no owner object (state written before ownership existed) is never owned.
// Returns { run, owned, status, legacy, unreadable, ranked }: the newest owned run that still gates (else the
// newest owned run), the count of legacy runs, the ids whose state.json cannot be parsed, and every owned
// run ranked the same way ({ id, created, status }).
// CP-03 R9-L-b: when the runs folder exists but cannot be listed, the run ids the session registry names for
// this home (scope.knownIds) are looked up by path instead, and `unlistable` carries the error.
function selectScopedRunId(ctx, scope) {
  const owned = [];
  const unreadable = [];
  let legacy = 0;
  const listing = listRunIdsChecked(ctx);
  let ids = listing.ids;
  if (listing.error && Array.isArray(scope.knownIds)) {
    ids = scope.knownIds.filter((id) => /^[A-Za-z0-9._-]{1,128}$/.test(id) && !/^\.+$/.test(id) && fs.existsSync(path.join(runDir(ctx, id), 'state.json'))).sort();
  }
  for (const id of ids) {
    let st;
    try { st = JSON.parse(readRegularFile(path.join(runDir(ctx, id), 'state.json'), STATE_READ_CAP).toString('utf8')); } catch { unreadable.push(id); continue; }
    const o = st && st.owner;
    if (!o || typeof o !== 'object') { legacy += 1; continue; }
    let mine = false;
    if (scope.session) mine = !!o.session_id && o.session_id === scope.session;
    else if (!o.session_id && o.cwd && scope.cwd) mine = cwdInside(o.cwd, scope.cwd);
    if (mine) owned.push({ id, created: st.created_at || '', status: st.status });
  }
  owned.sort((a, b) => (a.created === b.created ? (a.id < b.id ? 1 : -1) : (a.created < b.created ? 1 : -1)));
  const gating = owned.filter((r) => !NON_GATING_STATUSES.includes(r.status));
  // ranked: every owned run, the gating ones first, each group newest first
  const ranked = [...gating, ...owned.filter((r) => NON_GATING_STATUSES.includes(r.status))];
  const pick = ranked[0] || null;
  return { run: pick ? pick.id : null, owned: !!pick, status: pick ? pick.status : null, legacy, unreadable, ranked, unlistable: listing.error };
}

// Runs whose state.json fails the same checks loadState makes, reported without side effects.
function unreadableRuns(ctx) {
  const bad = [];
  for (const id of listRunIds(ctx)) {
    const dir = runDir(ctx, id);
    try {
      const bytes = readRegularFile(path.join(dir, 'state.json'), STATE_READ_CAP);
      const sidecar = readText(path.join(dir, '.state.sha256'), REGISTRY_READ_CAP).trim();
      if (sidecar !== sha256Bytes(bytes)) throw new Error('digest');
      const st = JSON.parse(bytes.toString('utf8'));
      if (validateSchema(loadSchemaFile('do-it-state.1.schema.json'), st).length) throw new Error('schema');
      if (st.run_id !== id) throw new Error('run_id');
    } catch { bad.push(id); }
  }
  return bad;
}

// Every explicit take-over of the run (resume --run <id> --take-over), oldest first: { from, to, at }.
// owner.history records the session that was replaced and when; the next entry (or the current owner)
// is the session that took over. `status` shows the last one and `conclude` lists them (CP-03 R2-L1).
function takeOvers(state) {
  const o = state && state.owner && typeof state.owner === 'object' ? state.owner : null;
  const h = o && Array.isArray(o.history) ? o.history : [];
  const out = [];
  h.forEach((e, i) => {
    if (!e || e.reason !== 'take_over') return;
    const next = h[i + 1];
    out.push({ from: e.session_id || null, to: next ? (next.session_id || null) : (o.session_id || null), at: e.until || null });
  });
  return out;
}

// Raw read for callers that only need to know whether a run is in flight.
function peekRunStatus(ctx, runId) {
  try {
    return JSON.parse(readText(path.join(runDir(ctx, runId), 'state.json'))).status;
  } catch {
    return 'UNREADABLE';
  }
}

const RUN_TRANSITIONS = {
  INTAKE: ['PLANNING', 'BUILDING'],
  PLANNING: ['AWAIT_RATIFY', 'BUILDING'],
  AWAIT_RATIFY: ['BUILDING', 'NEEDS_HUMAN'],
  BUILDING: ['VERIFYING', 'FAILED', 'PARKED', 'BLOCKED', 'NEEDS_HUMAN', 'ESCALATED'],
  VERIFYING: ['REVIEWING', 'DEPLOYING', 'CONCLUDING', 'BUILDING'],
  REVIEWING: ['FIXING', 'DEPLOYING', 'CONCLUDING'],
  FIXING: ['VERIFYING'],
  DEPLOYING: ['PROVING', 'PARTIAL_FAILURE', 'FAILED'],
  PROVING: ['CONCLUDING', 'DONE'],
  CONCLUDING: ['DONE'],
  FAILED: ['BUILDING', 'ESCALATED'],
  PARTIAL_FAILURE: ['ROLLED_BACK', 'ESCALATED'],
  ROLLED_BACK: ['DEPLOYING', 'ESCALATED'],
  PARKED: ['BUILDING'],
  NEEDS_HUMAN: ['BUILDING', 'ESCALATED'],
  BLOCKED: ['BUILDING'],
  ESCALATED: [],
  DONE: [],
};

// The command that owns each non-gating status (CP-03 R3-S1-H6). A run enters a status that does not gate a
// stop only through the command that checks what that status claims: DONE through `gate conclude` (G-13:
// every row accounted, no live worker, no pending wake, deploy legs re-verified), PARKED through `park` or
// the stop gate at patience, NEEDS_HUMAN / AWAIT_RATIFY through an owner-pack question, BLOCKED / FAILED /
// ESCALATED through `record` with a reason. `gate advance` never reaches one, or the agent the gate holds
// could switch the gate off with two commands.
const NON_GATING_OWNERS = {
  DONE: 'gate conclude',
  PARKED: 'park (or the stop gate at patience)',
  NEEDS_HUMAN: 'record (a needs_human result with at least one owner-pack question)',
  AWAIT_RATIFY: 'the owner pack / readiness (gate build)',
  BLOCKED: 'record (a blocked result with a reason) or gate build on a blocked readiness',
  FAILED: 'record (a failed result with a reason, or a deploy-legs result while deploying whose failed legs carry evidence)',
  ESCALATED: 'record (ladder or rollback), handoff at its cap, or gate escalate --reason from NEEDS_HUMAN or FAILED',
};

// CP-03 R5-S1-H9: the one guard on every path into FAILED, BLOCKED or NEEDS_HUMAN. All three switch the stop
// gate off (CONTRACT 3.1), so the run must say why: FAILED and BLOCKED need a reason (kept as
// state.status_reason), NEEDS_HUMAN needs a question that lands open in the owner pack. `record` (run-level,
// slice settle and deploy legs alike) and `gate build` (missing credential) call it before they write.
const CAUSE_REQUIRED = { FAILED: 'FAIL_REASON_REQUIRED', BLOCKED: 'BLOCK_REASON_REQUIRED', NEEDS_HUMAN: 'NEEDS_HUMAN_WITHOUT_QUESTION' };

// A reason is text with something in it: invisible and space characters are stripped first, and a
// placeholder (".", "x", "n/a", "TODO", "-", ...) or text with fewer than 3 letters or digits is no reason
// (CP-03 R5-S1-L1). A code such as STALE_HEAD or NO_CHANNEL_REACHED is a reason.
const PLACEHOLDER_REASONS = new Set(['n/a', 'na', 'none', 'null', 'nil', 'todo', 'tbd', 'tba', 'fixme', 'wip', 'unknown', 'reason', 'no reason', 'xxx', 'xx', 'x', '?', '...', '-', '--', '.']);
function cleanReason(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/[\p{White_Space}\u200B-\u200D\u2060\uFEFF\u00AD]+/gu, ' ').trim();
  if (!t) return null;
  if (PLACEHOLDER_REASONS.has(t.toLowerCase())) return null;
  if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 3) return null;
  return t;
}

// Returns the reason to store (FAILED, BLOCKED) or null; throws the status's refusal code when the cause is missing.
// cause: { reason?: string, openQuestion?: boolean }; extra goes into the refusal.
function guardStatusEntry(from, to, cause, extra) {
  if (!Object.prototype.hasOwnProperty.call(CAUSE_REQUIRED, to) || from === to) return null;
  const c = cause || {};
  if (to === 'NEEDS_HUMAN') {
    if (c.openQuestion) return null;
    throw fail(CAUSE_REQUIRED.NEEDS_HUMAN, 1, {
      from, to, ...(extra || {}),
      message: 'a needs_human result must bring at least one owner-pack question (pending_human.questions_path); with none, nothing waits on the owner and the run would leave the stop gate',
    });
  }
  const reason = cleanReason(c.reason);
  if (reason) return reason;
  throw fail(CAUSE_REQUIRED[to], 1, {
    from, to, ...(extra || {}),
    message: 'entering ' + to + ' needs a non-empty reason: it ends the stop gate for this run',
  });
}

// gate advance --to STATUS: a move along the M1 lifecycle between statuses that gate, nothing else.
function advanceRunStatus(ctx, state, to) {
  if (NON_GATING_STATUSES.includes(to)) {
    throw fail('TRANSITION_REFUSED', 1, {
      from: state.status, to, owner: NON_GATING_OWNERS[to],
      message: to + ' does not gate a stop, so gate advance never enters it; only ' + NON_GATING_OWNERS[to] + ' does',
    });
  }
  const allowed = (RUN_TRANSITIONS[state.status] || []).filter((s) => !NON_GATING_STATUSES.includes(s));
  if (!allowed.includes(to)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to, allowed });
  const from = state.status;
  state.status = to;
  writeState(ctx, state);
  appendEvent(ctx, state.run_id, { event: 'status_changed', stage: state.stage, host: state.host, verdict: to, detail: { from, to } });
  return { from, to };
}

// ---- stopgate.mjs ----
function allowed(extra) {
  return { outcome: 'STOP_ALLOWED', exit: 0, ...extra };
}

function logQuiet(ctx, runId, row) {
  try { appendEvent(ctx, runId, row); } catch { /* the hook still fails open */ }
}

// An unreadable run is logged once, not on every stop of every session: skip when the run's last event is
// already this one (a run we do not own must not grow an events file just because we looked at it).
function lastEventIs(ctx, runId, name) {
  try {
    const lines = readRegularFile(eventsPath(ctx, runId), STATE_READ_CAP).toString('utf8').split('\n').filter(Boolean);
    return JSON.parse(lines[lines.length - 1]).event === name;
  } catch { return false; }
}

function logUnreadableOnce(ctx, runId, detail) {
  if (lastEventIs(ctx, runId, 'stop_gate_state_unreadable')) return;
  logQuiet(ctx, runId, { event: 'stop_gate_state_unreadable', stage: null, verdict: 'STATE_ERROR', detail });
}

const DEFAULT_PATIENCE = 3;

// a Node error's message already starts with its code ("EACCES: permission denied, ..."): do not repeat it
const errText = (e) => String(e && e.code && !String(e.message || '').startsWith(e.code) ? e.code + ': ' + e.message : (e && e.message) || e);

// CP-03 R8-S1-M15 (supersedes the R5-S1-M9 fail-open): CONTRACT 3.1 fails open ONLY when state.json cannot
// be read. Once a run's state was read and it gates with open rows, a refusal whose bookkeeping (count,
// signature, park, events) cannot be written is STILL a refusal: it is reported in `unwritable` and marked
// `refusal_uncounted`. Patience cannot advance without a write, so such a run is never parked by the gate;
// it is refused on every stop until the write error is fixed or its rows close.
function eachRefusal(ctx, runs, fn, unwritable) {
  const refused = [];
  const parked = [];
  for (const w of runs) {
    let r;
    try { r = fn(w); } catch (e) {
      // anything refuseOrPark did not catch itself: still a refusal, uncounted
      r = { parked: false, ids: (w.open || [{ id: 'finish-line.json unreadable' }]).map((x) => x.id), refusals: w.state.stop_refusals, uncounted: errText(e) };
    }
    if (r.uncounted) unwritable.push({ run_id: w.id, error: r.uncounted, refused: true, refusal_uncounted: true });
    if (r.logError) unwritable.push({ run_id: w.id, error: r.logError, refused: true });
    (r.parked ? parked : refused).push({ id: w.id, refusals: r.refusals, ids: r.ids, uncounted: r.uncounted || null });
  }
  // a counted refusal is the one shown first; an uncounted one never hides it
  refused.sort((a, b) => (a.uncounted ? 1 : 0) - (b.uncounted ? 1 : 0));
  return { refused, parked };
}

// The fields every STOP_REFUSED answer carries when a refusal could not be counted.
function uncountedNote(refused) {
  const lost = refused.filter((r) => r.uncounted);
  if (!lost.length) return { note: '', extra: {} };
  const note = '; the refusal of ' + lost.map((r) => r.id + ' (' + r.uncounted + ')').join(', ') + ' could not be written, so it is not counted: patience cannot advance and the run will not park on its own until the write error is fixed';
  return { note, extra: { refusal_uncounted: true, uncounted_runs: lost.map((r) => r.id) } };
}

function refuseUnreadableBoard(ctx, gating, patience, error, extra, unwritable) {
  const id = 'finish-line.json unreadable';
  const { refused, parked } = eachRefusal(ctx, gating, (g) => refuseOrPark(ctx, g.id, g.state, { rows: [] }, [{ id }], patience), unwritable);
  const more = unwritable.length ? { unwritable } : {};
  const lost = uncountedNote(refused);
  extra = { ...extra, ...more, ...lost.extra };
  const board = 'FINISH LINE: unreadable (' + error + ')';
  if (!refused.length) return { outcome: 'PARKED', exit: 2, owned: true, run_id: parked[0].id, status: 'PARKED', open: [id], board, board_error: error, ...extra };
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: refused[0].id, reason: 'finish-line.json cannot be read, so the open rows are unknown: ' + error + lost.note, stop_refusals: refused[0].refusals, patience, open: [id], board, board_error: error, ...(gating.length > 1 ? { runs: gating.map((g) => g.id) } : {}), ...extra });
}

// One run's refusal bookkeeping: the patience counter resets when its rows changed since the last stop;
// at patience the run is parked with one owner-pack question. Returns { parked, ids, refusals }.
function refuseOrPark(ctx, runId, state, fl, open, patience) {
  const ids = open.map((r) => r.id);
  const sig = rowsSignature(fl);
  const stored = state.stop_refusals;
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  // CP-03 R7-S1-L5: once the state write holds the refusal, a log line or a park that cannot be written
  // never turns it into an allow. A park that fails is a plain refusal; a lost event is reported in log_error.
  let logError = null;
  const logEvent = (row) => { try { appendEvent(ctx, runId, row); } catch (e) { logError = errText(e); } };
  let parkError = null;
  // CP-03 R10 L-g: an unreadable answers.json counts as no answers for the park and is reported on its event
  let answersError = null;
  const onAnswersError = (e) => { answersError = errText(e); };
  // CP-03 R8-S1-M15: the state write itself failed (STATE_TOO_LARGE, EACCES, ...): refuse anyway, uncounted
  const uncounted = (e) => {
    const err = errText(e);
    logEvent({ event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: stored, open: ids, refusal_uncounted: true, write_error: err, ...(parkError ? { park_error: parkError } : {}) } });
    return { parked: false, ids, refusals: stored, uncounted: err, logError: logError || parkError };
  };
  const text = 'The run stopped with ' + ids.length + ' open row(s) after ' + patience + ' refusals: ' + ids.join(', ') + '. Resume the run or close it with the open rows as residuals?';
  if (state.stop_refusals >= patience) {
    // CP-03 R9-S1-M16: the park is test-serialised (schema, cap as written) before its question reaches the
    // pack. A park that could not be written adds nothing and stays a plain refusal, uncounted.
    const would = { ...state, stop_refusals: 0, gates: { ...state.gates, stop_gate: { sig } }, status: 'PARKED', updated_at: ctx.now() };
    try { stateBytes(ctx, would); } catch (e) { return uncounted(e); }
    try {
      packAppend(ctx, runId, [{
        kind: 'default',
        source: 'stop-gate',
        text,
        options: ['resume run', 'close with residuals'],
        recommendation: 'resume run',
        default: 'resume run',
        reversible: true,
      }], { stopGate: true, onAnswersError });
    } catch (e) { parkError = errText(e); }
  }
  if (state.stop_refusals >= patience && !parkError) {
    state.stop_refusals = 0;
    state.gates.stop_gate = { sig };
    const from = state.status;
    state.status = 'PARKED';
    try { writeState(ctx, state); } catch (e) { return uncounted(e); }
    // CP-03 R5-S1-H10: the event is the gate's own mark on the question (pack withdraw trusts nothing else)
    let q = null;
    try {
      const stored = redactJsonValues(text);
      q = openPackQuestions(ctx, runId, onAnswersError).find((x) => x.text === text || x.text === stored) || openStopGateQuestion(ctx, runId, null, null, onAnswersError);
    } catch { /* the park stands */ }
    logEvent({ event: 'stop_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, open: ids, ...(q ? { question: q.n } : {}), ...(answersError ? { answers_error: answersError } : {}) } });
    return { parked: true, ids, refusals: 0, logError };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  try { writeState(ctx, state); } catch (e) { return uncounted(e); }
  logEvent({ event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: ids, ...(parkError ? { park_error: parkError } : {}) } });
  return { parked: false, ids, refusals: state.stop_refusals, logError: logError || parkError };
}

// An explicit `gate stop --run <id>` (or no session and no cwd): gates the run it names, as before.
function explicitStop(ctx, f) {
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (NON_GATING_STATUSES.includes(state.status)) {
    return allowed({ owned: true, run_id: runId, status: state.status, reason: 'run is ' + state.status + ', it does not gate', stop_refusals: state.stop_refusals });
  }
  const fl = rowsForRun(readFinishLine(ctx, { strict: true }), runId, adoptsUnattributed(state));
  const open = openRows(fl);
  const board = renderBoard(fl);
  if (!open.length) return allowed({ owned: true, run_id: runId, reason: 'no open rows for this run', stop_refusals: state.stop_refusals, board });
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const r = refuseOrPark(ctx, runId, state, fl, open, patience);
  if (r.parked) return { outcome: 'PARKED', exit: 2, owned: true, run_id: runId, status: 'PARKED', open: r.ids, board };
  const lost = uncountedNote([{ id: runId, uncounted: r.uncounted }]);
  const unwritable = [
    ...(r.uncounted ? [{ run_id: runId, error: r.uncounted, refused: true, refusal_uncounted: true }] : []),
    ...(r.logError ? [{ run_id: runId, error: r.logError, refused: true }] : []),
  ];
  throw fail('STOP_REFUSED', 1, { owned: true, run_id: runId, reason: 'finish-line rows are still open' + lost.note, stop_refusals: r.refusals, patience, open: r.ids, board, ...(unwritable.length ? { unwritable } : {}), ...lost.extra });
}

// G-1 (1.1): a hook stop is gated by EVERY active run owned by the hook's session (CONTRACT 3.1 row 1
// applies to each owned active run; CP-03 R2-S1-H4: a second, newer run with no open rows must not hide
// an older one that has some). Everyone else is allowed, and the answer says whether a run was theirs
// (`owned`) and why they may stop (`reason`). An unreadable run is logged and skipped; the hook fails open
// only when no owned run is readable (S1-M1). Each gated run counts its own patience and is parked alone.
function gateStop(ctx, args) {
  const f = args.flags;
  const scope = { session: cleanSessionId(f.session), cwd: typeof f.cwd === 'string' ? f.cwd : null };
  const hook = !f.run && !!(scope.session || scope.cwd);
  if (!hook) return explicitStop(ctx, f);

  // CP-03 R3-S1-H7: the session's runs may live in other repos than the cwd's. Every home the session
  // registered a run in is gated as well as the cwd's, with the same rule; any refusal refuses the stop.
  // CP-03 R4-S1-M7: a registry that cannot be read is reported (registry_unreadable) and leaves the cwd-only
  // rule; another home that cannot be evaluated is reported (unreadable_homes) and fails open for that home
  // alone. The cwd's own home is always evaluated, and its answer (a refusal above all) stands.
  const here = realpathSafe(ctx.home);
  const reg = sessionHomes(ctx, scope.session);
  const notes = reg.errors.length ? { registry_unreadable: reg.errors } : {};
  const known = (home) => { const h = reg.homes.find((x) => x.home === home); return h && Array.isArray(h.runs) ? h.runs : []; };
  const homes = [{ ctx, home: here, own: true, scope: { ...scope, knownIds: known(here) } }];
  for (const h of reg.homes) {
    if (h.home !== here) homes.push({ ctx: { ...ctx, home: h.home, root: h.root }, home: h.home, own: false, scope: { ...scope, knownIds: known(h.home) } });
  }
  if (homes.length === 1) return withNotes(() => hookStopIn(ctx, homes[0].scope), notes);
  const answers = [];
  const unreadableHomes = [];
  let firstError = null;
  for (const h of homes) {
    try {
      answers.push({ home: h.home, out: hookStopIn(h.ctx, h.scope) });
    } catch (e) {
      if (e instanceof CliError && e.outcome === 'STOP_REFUSED') { answers.push({ home: h.home, refused: e }); continue; }
      // CP-03 R5-S1-M9: the cwd's home is reported like any other; it never hides the other homes' answers
      if (!firstError) firstError = e;
      unreadableHomes.push({ home: h.home, error: String(e && e.message ? e.message : e), ...(h.own ? { cwd_home: true } : {}) });
    }
  }
  if (unreadableHomes.length) notes.unreadable_homes = unreadableHomes;
  if (!answers.length) throw addNotes(firstError, notes);
  // every home's write errors are reported, whichever home's answer is shown
  const unwritable = answers.flatMap((a) => ((a.out || (a.refused && a.refused.extra) || {}).unwritable || []).map((u) => ({ ...u, home: a.home })));
  if (unwritable.length) notes.unwritable = unwritable;
  if (unwritable.some((u) => u.refusal_uncounted)) notes.refusal_uncounted = true;
  const unlistable = answers.flatMap((a) => ((a.out || (a.refused && a.refused.extra) || {}).runs_unlistable || []).map((u) => ({ ...u, home: a.home })));
  if (unlistable.length) notes.runs_unlistable = unlistable;
  const searched = homes.map((h) => h.home);
  const refused = answers.filter((a) => a.refused);
  if (refused.length) {
    const first = refused[0];
    const boards = refused.map((a) => (refused.length > 1 ? 'home ' + a.home + '\n' : '') + (a.refused.extra.board || ''));
    throw fail('STOP_REFUSED', 1, { ...first.refused.extra, run_home: first.home, board: boards.join('\n\n'), refused_homes: refused.map((a) => a.home), homes: searched, ...notes });
  }
  const parked = answers.find((a) => a.out.outcome === 'PARKED');
  if (parked) return { ...parked.out, run_home: parked.home, homes: searched, ...notes };
  const pick = answers.find((a) => a.out.owned) || answers[0];
  return { ...pick.out, run_home: pick.home, homes: searched, ...notes };
}

function addNotes(e, notes) {
  if (e instanceof CliError && Object.keys(notes).length) e.extra = { ...e.extra, ...notes };
  return e;
}

function withNotes(fn, notes) {
  try { return { ...fn(), ...notes }; } catch (e) { throw addNotes(e, notes); }
}

// The hook-path rule inside one home (CONTRACT 3.1). CP-03 R9-L-b: a runs folder that exists but cannot be
// listed is reported (runs_unlistable) on every answer; the registry's runs for this home are still gated.
function hookStopIn(ctx, scope) {
  const scoped = selectScopedRunId(ctx, scope);
  if (!scoped.unlistable) return hookStopScoped(ctx, scope, scoped);
  const note = { runs_unlistable: [{ home: ctx.home, error: scoped.unlistable, registry_runs: scope.knownIds || [] }] };
  return withNotes(() => hookStopScoped(ctx, scope, scoped), note);
}

function hookStopScoped(ctx, scope, scoped) {
  if (!scoped.run) {
    if (scoped.unreadable.length) {
      for (const id of scoped.unreadable) logUnreadableOnce(ctx, id, { fail_open: true });
      return allowed({ owned: false, reason: 'state unreadable', unreadable: scoped.unreadable });
    }
    return allowed({ owned: false, reason: scoped.legacy ? 'legacy run has no owner' : 'no run is owned by this session or cwd' });
  }
  const readable = [];
  const skipped = [];
  const unwritable = [];
  for (const c of scoped.ranked) {
    try {
      readable.push({ id: c.id, state: loadState(ctx, c.id) });
    } catch (e) {
      // CP-03 R5-S1-M9: any read error (EACCES, EISDIR, ...) skips this run alone, like a tampered state
      const cause = e instanceof CliError ? e.outcome : (e && e.code) || 'STATE_ERROR';
      logUnreadableOnce(ctx, c.id, { fail_open: true, cause });
      skipped.push({ run_id: c.id, state_error: cause });
    }
  }
  if (!readable.length) {
    return allowed({ owned: true, run_id: skipped[0].run_id, reason: 'state unreadable', state_error: skipped[0].state_error, unreadable: skipped.map((x) => x.run_id) });
  }
  const extra = skipped.length ? { unreadable: skipped.map((x) => x.run_id) } : {};
  const gating = readable.filter((r) => !NON_GATING_STATUSES.includes(r.state.status));
  if (!gating.length) {
    const top = readable[0];
    return allowed({ owned: true, run_id: top.id, status: top.state.status, reason: 'run is ' + top.state.status + ', it does not gate', stop_refusals: top.state.stop_refusals, ...extra });
  }
  // CP-03 R4-S1-M7 (and R4-L9): a board that cannot be read is no proof the rows are closed, so every
  // gating run here is refused with that reason (fail closed), counting patience like any refusal.
  let patience;
  try { patience = loadSettings(ctx, []).values.stop_gate.patience; } catch { patience = DEFAULT_PATIENCE; }
  let board;
  try { board = readFinishLine(ctx, { strict: true }); } catch (e) {
    const why = e instanceof CliError && e.extra && e.extra.error ? e.extra.error : String(e && e.message ? e.message : e);
    return refuseUnreadableBoard(ctx, gating, patience, why, extra, unwritable);
  }
  // the same row rule as every view: an owned (1.1) run answers only for rows tagged with its id
  const withOpen = [];
  for (const g of gating) {
    const fl = rowsForRun(board, g.id, adoptsUnattributed(g.state));
    const open = openRows(fl);
    if (open.length) withOpen.push({ ...g, fl, open });
  }
  if (!withOpen.length) {
    const top = gating[0];
    const ids = gating.map((g) => g.id);
    return allowed({ owned: true, run_id: top.id, runs: ids, reason: 'no open rows for ' + (ids.length > 1 ? 'any owned run' : 'this run'), stop_refusals: top.state.stop_refusals, board: renderBoard(rowsForRun(board, top.id, adoptsUnattributed(top.state))), ...extra });
  }
  const openByRun = {};
  const boards = [];
  const { refused, parked } = eachRefusal(ctx, withOpen, (w) => refuseOrPark(ctx, w.id, w.state, w.fl, w.open, patience), unwritable);
  for (const w of withOpen) {
    const r = refused.find((x) => x.id === w.id) || parked.find((x) => x.id === w.id);
    if (!r) continue;
    openByRun[w.id] = r.ids;
    boards.push((withOpen.length > 1 ? 'run ' + w.id + '\n' : '') + renderBoard(w.fl));
  }
  if (unwritable.length) extra.unwritable = unwritable;
  const many = withOpen.length > 1 ? { runs: withOpen.map((w) => w.id), open_by_run: openByRun } : {};
  const text = boards.join('\n\n');
  if (!refused.length) {
    const first = parked[0].id;
    return { outcome: 'PARKED', exit: 2, owned: true, run_id: first, status: 'PARKED', open: openByRun[first], board: text, ...many, ...(withOpen.length > 1 ? { parked: parked.map((p) => p.id) } : {}), ...extra };
  }
  const first = refused[0];
  const lost = uncountedNote(refused);
  throw fail('STOP_REFUSED', 1, {
    ...lost.extra,
    owned: true, run_id: first.id, reason: 'finish-line rows are still open' + lost.note, stop_refusals: first.refusals, patience,
    open: openByRun[first.id], board: text, ...many, ...(parked.length ? { parked: parked.map((p) => p.id) } : {}), ...extra,
  });
}

// ---- verdict-file.mjs ----
// A review-it checkpoint verdict file, judged the way build-it's checkpoints
// reader and review-it's status-sync judge it: only report prose counts
// (fenced ``` and ~~~ code, indented code and HTML comments are ignored), one
// checkpoint id, and every overall `verdict:` line says the same value,
// exactly PASS or FAIL. Anything ambiguous is not a pass.

function proseLines(text) {
  const out = [];
  let fence = null;
  let comment = false;
  for (const raw of text.split(/\r?\n/)) {
    if (fence) {
      const close = raw.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      out.push('');
      continue;
    }
    if (comment) { if (raw.includes('-->')) comment = false; out.push(''); continue; }
    const open = raw.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fence = open[1]; out.push(''); continue; }
    if (/^\s*<!--/.test(raw)) { if (!raw.includes('-->')) comment = true; out.push(''); continue; }
    if (/^( {4,}|\t)/.test(raw)) { out.push(''); continue; }
    out.push(raw.trim());
  }
  return out;
}

// Review rounds: a heading that opens a re-review or a numbered round starts a new
// round, and the last round that says anything about the verdict supersedes the rest.
const ROUND_HEADING = /^#{1,6}\s+.*(re-?review|round\s*\d+|\br\d+\b)/i;
const clean = (v) => v.trim().split(/\s+/)[0].replace(/^[`*]+|[`*.,;]+$/g, '');

// Returns { state: pass|fail|invalid|contradictory, reason }.
function parseVerdict(text, id) {
  if (!text.trim()) return { state: 'invalid', reason: 'the file is empty' };
  const cps = new Set();
  const rounds = [{ overall: [], tasks: [], finals: [] }];
  let inTask = false;
  for (const line of proseLines(text)) {
    if (line === '') { inTask = false; continue; }
    if (ROUND_HEADING.test(line)) { rounds.push({ overall: [], tasks: [], finals: [] }); inTask = false; continue; }
    const cur = rounds[rounds.length - 1];
    let m = /^checkpoint\s*:\s*(.*)$/i.exec(line);
    if (m) { cps.add(m[1].trim()); continue; }
    if (/^task\s*:/i.test(line)) { inTask = true; continue; }
    m = /^[*_]*final\s+verdict\s*[:*]+\s*(.*)$/i.exec(line);
    if (m) { cur.finals.push(clean(m[1])); continue; }
    m = /^verdict\s*:\s*(.*)$/i.exec(line);
    if (m) (inTask ? cur.tasks : cur.overall).push(clean(m[1]));
  }
  if (cps.size === 0) return { state: 'invalid', reason: 'no "checkpoint: ' + id + '" line outside code and comments' };
  if (cps.size > 1) return { state: 'invalid', reason: 'names more than one checkpoint (' + [...cps].join(', ') + ')' };
  if (!cps.has(id)) return { state: 'invalid', reason: 'does not name checkpoint ' + id + ' (names ' + [...cps][0] + ')' };
  // An explicit "Final verdict:" line decides across the whole file; else the last round with a verdict.
  const finals = rounds.flatMap((r) => r.finals);
  const deciding = finals.length ? { overall: finals, tasks: [] } : [...rounds].reverse().find((r) => r.overall.length) || rounds[0];
  const { overall, tasks } = deciding;
  if (!overall.length) return { state: 'invalid', reason: 'no "verdict: PASS|FAIL" line outside code and comments' };
  const odd = [...new Set([...overall, ...tasks])].filter((v) => v !== 'PASS' && v !== 'FAIL');
  if (odd.length) return { state: 'invalid', reason: 'verdict value ' + odd.map((v) => JSON.stringify(v)).join(', ') + ' is not PASS or FAIL' };
  if (new Set(overall).size > 1) return { state: 'contradictory', reason: 'the overall verdict lines say both PASS and FAIL' };
  const v = overall[0];
  if (v === 'PASS' && tasks.some((t) => t !== 'PASS')) return { state: 'contradictory', reason: 'overall PASS but a task block is not PASS' };
  return { state: v === 'PASS' ? 'pass' : 'fail', reason: v === 'PASS' ? null : 'review-it verdict is FAIL' };
}

// ---- verify.mjs ----
// Re-read the world: recompute every VERIFIED row's evidence hash (never mtime).
// A changed or missing file downgrades the row and reopens its finish-line row.
function verifyEvidence(ctx, runId, state) {
  const ledger = readLedger(ctx, runId);
  const changed = [];
  const now = ctx.now();
  for (const row of ledger.rows) {
    if (row.verdict !== 'VERIFIED' || !row.evidence_sha256) continue;
    const target = row.evidence_path || row.evidence;
    const r = resolveEvidence(ctx, runId, target, []);
    if (r.ok && r.sha256 === row.evidence_sha256) continue;
    changed.push({ row: row.row, reason: r.ok ? 'hash_changed' : 'evidence_' + r.reason, was: row.evidence_sha256, now: r.ok ? r.sha256 : null });
    row.verdict = 'IMPLEMENTED-NOT-VERIFIED';
    row.reason = 'evidence_changed';
    row.updated_at = now;
  }
  if (changed.length) {
    writeLedger(ctx, ledger);
    const fl = readFinishLine(ctx);
    const adopt = adoptsUnattributed(state || loadState(ctx, runId));
    for (const c of changed) {
      if (hasRow(fl, c.row, runId, adopt)) finishLineUpsert(fl, c.row, { state: 'OPEN', evidence: null, reason: 'evidence_changed' }, runId, adopt);
      appendEvent(ctx, runId, { event: 'evidence_changed', verdict: 'IMPLEMENTED-NOT-VERIFIED', detail: { row: c.row, reason: c.reason } });
    }
    writeFinishLine(ctx, fl);
  }
  return changed;
}

function gateVerify(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const changed = verifyEvidence(ctx, runId, state);
  if (changed.length) throw fail('EVIDENCE_CHANGED', 1, { run_id: runId, rows: changed.map((c) => c.row), changed });
  const ledger = readLedger(ctx, runId);
  return { outcome: 'VERIFY_OK', exit: 0, run_id: runId, checked: ledger.rows.filter((r) => r.verdict === 'VERIFIED').length };
}

// ---- version.mjs ----
const DO_IT_VERSION = '1.1.0';

// ---- wake.mjs ----
const NO_WAKE_TEXT = 'no wake: parked; run do-it resume after the reset';

function wakePath(ctx, runId) {
  return path.join(runDir(ctx, runId), 'wake.json');
}

function readWake(ctx, runId) {
  return readJsonIfExists(wakePath(ctx, runId));
}

// Hook contract: executable in env DO_IT_HOST_WAKE, args `at` and a prompt file
// path; exit 0 with the wake id on stdout means a wake is scheduled.
function scheduleWake(ctx, runId, at, resumeLine) {
  const promptFile = path.join(runDir(ctx, runId), 'wake-prompt.md');
  atomicWrite(promptFile, 'Resume do-it run ' + runId + ' from state: run `' + resumeLine + '`, then `do-it next`.\n');
  const hook = ctx.env.DO_IT_HOST_WAKE;
  let wake;
  if (!hook) {
    wake = { status: 'unavailable', run_id: runId, at, prompt_file: promptFile, id: null, reason: 'no_hook' };
  } else {
    const r = cp.spawnSync(hook, [at || '', promptFile], { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
    const id = r.error ? '' : String(r.stdout || '').trim().split('\n')[0].trim();
    if (!r.error && r.status === 0 && id) {
      wake = { status: 'scheduled', run_id: runId, at, prompt_file: promptFile, id, scheduled_at: ctx.now() };
    } else {
      wake = { status: 'failed', run_id: runId, at, prompt_file: promptFile, id: null, reason: r.error ? r.error.code || 'spawn_error' : 'hook_exit_' + r.status };
    }
  }
  atomicWriteJson(wakePath(ctx, runId), wake);
  return wake;
}

function consumeWake(ctx, runId) {
  const wake = readWake(ctx, runId);
  if (!wake || wake.status === 'consumed') return wake;
  const next = { ...wake, status: 'consumed', consumed_at: ctx.now() };
  atomicWriteJson(wakePath(ctx, runId), next);
  return next;
}

// ---- yaml-lite.mjs ----
// YAML subset for pipeline presets (D10): block maps, block lists, scalars,
// flow lists of scalars, comments. Anything else is PIPELINE_UNSUPPORTED_YAML.
function yamlUnsupported(line, reason) {
  return fail('PIPELINE_UNSUPPORTED_YAML', 1, { line, reason });
}

function yamlStripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:\[,-]/.test(raw[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function yamlLines(text) {
  const out = [];
  const raw = String(text).split(/\r?\n/);
  let docs = 0;
  for (let i = 0; i < raw.length; i++) {
    const line = yamlStripComment(raw[i]).replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^ *\t/.test(line)) throw yamlUnsupported(i + 1, 'tab indentation');
    if (line.trim() === '---') {
      docs++;
      if (docs > 1 || out.length) throw yamlUnsupported(i + 1, 'multiple documents');
      continue;
    }
    if (line.trim() === '...') throw yamlUnsupported(i + 1, 'document end marker');
    out.push({ indent: line.match(/^ */)[0].length, text: line.trim(), n: i + 1 });
  }
  return out;
}

function yamlSplitFlow(inner, n) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += inner[++i] || ''; } else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") { quote = c; cur += c; }
    else if (c === ',') { parts.push(cur); cur = ''; }
    else if (c === '[' || c === '{') throw yamlUnsupported(n, 'nested flow collection');
    else cur += c;
  }
  if (quote) throw yamlUnsupported(n, 'unterminated quote');
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => yamlScalar(p.trim(), n));
}

function yamlScalar(s, n) {
  if (s === '') return null;
  const first = s[0];
  if (first === '&' || first === '*') throw yamlUnsupported(n, 'anchors and aliases');
  if (first === '!') throw yamlUnsupported(n, 'tags');
  if (first === '|' || first === '>') throw yamlUnsupported(n, 'block scalars');
  if (first === '{') {
    if (s === '{}') return {};
    throw yamlUnsupported(n, 'flow map');
  }
  if (first === '[') {
    if (s[s.length - 1] !== ']') throw yamlUnsupported(n, 'multi-line flow list');
    return yamlSplitFlow(s.slice(1, -1), n);
  }
  if (first === '"') {
    if (s.length < 2 || s[s.length - 1] !== '"') throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  if (first === "'") {
    if (s.length < 2 || s[s.length - 1] !== "'") throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}

function yamlKeyOf(text) {
  const m = /^("[^"]*"|'[^']*'|[^\s:"'\[\]{},#&*!|>-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!m) return null;
  let key = m[1];
  if (key[0] === '"' || key[0] === "'") key = key.slice(1, -1);
  return { key, rest: m[2] === undefined ? '' : m[2].trim() };
}

function yamlIsItem(text) {
  return text === '-' || text.startsWith('- ');
}

function yamlParseNode(lines, pos, indent) {
  return yamlIsItem(lines[pos.i].text) ? yamlParseList(lines, pos, indent) : yamlParseMap(lines, pos, indent);
}

function yamlChild(lines, pos, indent, allowSameIndentList) {
  const nxt = lines[pos.i];
  if (!nxt) return null;
  if (nxt.indent > indent) return yamlParseNode(lines, pos, nxt.indent);
  if (allowSameIndentList && nxt.indent === indent && yamlIsItem(nxt.text)) return yamlParseList(lines, pos, indent);
  return null;
}

function yamlParseMap(lines, pos, indent) {
  const out = {};
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (yamlIsItem(line.text)) break;
    const kv = yamlKeyOf(line.text);
    if (!kv) throw yamlUnsupported(line.n, 'not a key: value line');
    if (Object.prototype.hasOwnProperty.call(out, kv.key)) throw yamlUnsupported(line.n, 'duplicate key ' + kv.key);
    pos.i++;
    out[kv.key] = kv.rest === '' ? yamlChild(lines, pos, indent, true) : yamlScalar(kv.rest, line.n);
  }
  return out;
}

function yamlParseList(lines, pos, indent) {
  const out = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (!yamlIsItem(line.text)) break;
    const body = line.text === '-' ? '' : line.text.slice(2).trim();
    if (body === '') {
      pos.i++;
      out.push(yamlChild(lines, pos, indent, false));
    } else if (yamlIsItem(body)) {
      throw yamlUnsupported(line.n, 'nested inline list');
    } else if (yamlKeyOf(body) && body[0] !== '[' && body[0] !== '"' && body[0] !== "'") {
      const offset = line.text.length - body.length;
      lines[pos.i] = { indent: indent + offset, text: body, n: line.n };
      out.push(yamlParseMap(lines, pos, indent + offset));
    } else {
      pos.i++;
      out.push(yamlScalar(body, line.n));
    }
  }
  return out;
}

function parseYamlLite(text) {
  const lines = yamlLines(text);
  if (!lines.length) return {};
  const pos = { i: 0 };
  const value = yamlParseNode(lines, pos, lines[0].indent);
  if (pos.i < lines.length) throw yamlUnsupported(lines[pos.i].n, 'unexpected content');
  return value;
}

// ---- renderers/html.mjs ----
// Pure renderer: owner pack -> one self-contained HTML string. No script, no
// external resource; every dynamic value is escaped.
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replyExample(questions) {
  const parts = [];
  for (const q of questions) {
    if (q.recommendation === null || q.recommendation === undefined || q.recommendation === '') continue;
    parts.push(q.options.includes(q.recommendation) ? q.n + ' ' + q.recommendation : q.n + ': ' + q.recommendation);
  }
  return parts.join(' ');
}

function renderHtml(pack) {
  const out = [];
  out.push('<!doctype html>');
  out.push('<html lang="en">');
  out.push('<head>');
  out.push('<meta charset="utf-8" />');
  out.push('<meta name="pack-id" content="' + escapeHtml(pack.pack_id) + '" />');
  out.push('<title>do-it owner pack</title>');
  out.push('<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5}li{margin:1rem 0}code{background:#eee;padding:0 .25rem}.meta{color:#555}</style>');
  out.push('</head>');
  out.push('<body>');
  out.push('<h1>Owner pack</h1>');
  out.push('<p class="meta">Run ' + escapeHtml(pack.run_id) + ' / pack ' + escapeHtml(String(pack.pack_id).slice(0, 12)) + '</p>');
  out.push('<ol>');
  for (const q of pack.questions) {
    const rec = q.recommendation === null || q.recommendation === undefined ? 'none' : q.recommendation;
    const def = q.default === null || q.default === undefined ? 'none' : q.default;
    out.push('<li id="q' + q.n + '" value="' + q.n + '">');
    out.push('<p><strong>' + escapeHtml(q.text) + '</strong> <span class="meta">(' + escapeHtml(q.kind) + (q.reversible ? '' : ', irreversible') + ')</span></p>');
    out.push('<p>Options: ' + (q.options.length ? q.options.map((o) => '<code>' + escapeHtml(o) + '</code>').join(' ') : 'free text') + '</p>');
    out.push('<p>Recommendation: ' + escapeHtml(rec) + '</p>');
    out.push('<p>Default: ' + escapeHtml(def) + '</p>');
    out.push('</li>');
  }
  out.push('</ol>');
  const ex = replyExample(pack.questions);
  out.push('<p>Reply tersely, for example <code>' + escapeHtml(ex || '1 yes') + '</code>. Use <code>all except N N</code> to accept every recommendation but the named ones, or <code>N: free text</code>.</p>');
  out.push('</body>');
  out.push('</html>');
  return out.join('\n') + '\n';
}

// ---- renderers/markdown.mjs ----
// Pure renderer: owner pack -> markdown. Last line is an example reply.


function renderMarkdown(pack) {
  const out = [];
  out.push('<!-- pack-id: ' + pack.pack_id + ' -->');
  out.push('# Owner pack');
  out.push('');
  for (const q of pack.questions) {
    const rec = q.recommendation === null || q.recommendation === undefined ? 'none' : q.recommendation;
    const def = q.default === null || q.default === undefined ? 'none' : q.default;
    out.push(q.n + '. ' + q.text);
    out.push('   Options: ' + (q.options.length ? q.options.join(' | ') : 'free text'));
    out.push('   Recommendation: ' + rec);
    out.push('   Default: ' + def);
    out.push('');
  }
  out.push('Example reply: `' + (replyExample(pack.questions) || '1 yes') + '`');
  return out.join('\n') + '\n';
}

// ---- renderers/native.mjs ----
// Pure renderer: owner pack -> payload for a host's native question tool.
function nativeEligible(pack, max) {
  const qs = pack.questions;
  if (!(max > 0) || !qs.length || qs.length > max) return false;
  return qs.every((q) => q.options.length >= 2 && q.options.length <= 4);
}

function renderNative(pack) {
  return {
    pack_id: pack.pack_id,
    questions: pack.questions.map((q) => ({
      n: q.n,
      header: 'Q' + q.n,
      question: q.text,
      multiSelect: false,
      options: q.options.map((o) => ({ label: o, description: o === q.recommendation ? 'Recommended' : '' })),
    })),
  };
}

// ---- drivers/secrets/aws-secrets-manager.mjs ----
// Secrets driver `aws-secrets-manager` (D16): runs the user's own `aws` CLI.
// Its stderr is never surfaced. No SDK is bundled.
function secretsAwsResolve(name, ref, ctx) {
  const base = String(ref || '').replace(/\/+$/, '');
  const id = base ? base + '/' + name : name;
  const argv = ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'];
  const r = cp.spawnSync('aws', argv, { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
  if (r.error) return { ok: false, detail: r.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_error' };
  if (r.status !== 0) return { ok: false, detail: 'cli_failed' };
  const value = String(r.stdout || '').replace(/\r?\n$/, '');
  if (!value || value === 'None') return { ok: false, detail: 'secret_empty' };
  return { ok: true, value, length: value.length };
}

// ---- drivers/secrets/env.mjs ----
// Secrets driver `env` (D16): the credential is an environment variable. A ref
// made of capitals, digits and underscores is a name prefix; any other ref is ignored.
function secretsEnvResolve(name, ref, ctx) {
  const prefix = typeof ref === 'string' && /^[A-Z0-9_]+$/.test(ref) ? ref : '';
  const value = ctx.env[prefix + name];
  if (typeof value !== 'string' || value === '') return { ok: false, detail: 'env_missing' };
  return { ok: true, value, length: value.length };
}

// ---- drivers/secrets/file.mjs ----
// Secrets driver `file` (D16): one file per credential under the ref directory
// (default `.secrets/`). Returns { ok, value, length } or { ok: false, detail }.
// The value is for the in-memory redaction set only and is never written.
function secretsFileResolve(name, ref, ctx) {
  const dir = path.resolve(ctx.repo, typeof ref === 'string' && ref ? ref : '.secrets/');
  const file = path.resolve(dir, name);
  const rel = path.relative(dir, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, detail: 'name_outside_ref' };
  let text;
  // CP-03 R7-S1-L6: a FIFO or a device at .secrets/<name> is refused at once, never read (a raw read hung)
  try { text = readRegularFile(file, REGISTRY_READ_CAP).toString('utf8'); } catch (e) {
    return { ok: false, detail: e && e.code && e.code !== 'ENOENT' ? 'file_unreadable' : 'file_missing' };
  }
  const value = text.replace(/\r?\n$/, '');
  if (!value) return { ok: false, detail: 'file_empty' };
  return { ok: true, value, length: value.length };
}

// ---- drivers/secrets/onepassword.mjs ----
// Secrets driver `1password` (D16): runs the user's own `op read <ref>/<name>`.
// Its stderr is never surfaced. No SDK is bundled.
function secretsOnepasswordResolve(name, ref, ctx) {
  const base = String(ref || '').replace(/\/+$/, '');
  if (!base.startsWith('op://')) return { ok: false, detail: 'bad_reference' };
  const r = cp.spawnSync('op', ['read', base + '/' + name], { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
  if (r.error) return { ok: false, detail: r.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_error' };
  if (r.status !== 0) return { ok: false, detail: 'cli_failed' };
  const value = String(r.stdout || '').replace(/\r?\n$/, '');
  if (!value) return { ok: false, detail: 'secret_empty' };
  return { ok: true, value, length: value.length };
}

const doItResult = cliMain(process.argv.slice(2), { cwd: process.cwd(), env: process.env });
process.stdout.write(doItResult.stdout);
process.exitCode = doItResult.exit;
