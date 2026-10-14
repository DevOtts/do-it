import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { resolveEvidence } from './evidence.mjs';
import { finishLineUpsert, readFinishLine, writeFinishLine } from './finish-line.mjs';
import { atomicWrite, atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';
import { ledgerUpsert, readLedger, writeLedger } from './ledger.mjs';
import { legsLookRolledBack, planDeploy, staleLegsAfterRollback } from './legs.mjs';
import { packAppend } from './pack.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { loadState, selectRunId, writeState } from './state.mjs';

export const EXIT_FOR_STATUS = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };

export function journalPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'record.journal.json');
}

export function recordFault(ctx, name) {
  if (ctx.env.DO_IT_FAULT === name) throw fail('FAULT_INJECTED', 1, { fault: name });
}

// record --result <file>: validate it-result/1, apply G-2/G-3, then persist in two
// phases (journal, ledger, then state) so a crash in between replays to one result.
export function cmdRecord(ctx, args) {
  const f = args.flags;
  if (typeof f.result !== 'string') throw fail('USAGE', 1, { message: 'record requires --result <file>' });
  const runId = selectRunId(ctx, f);
  let state = loadState(ctx, runId);

  const resultFile = path.resolve(ctx.cwd, f.result);
  let bytes;
  try { bytes = fs.readFileSync(resultFile); } catch (e) {
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
    result_text: bytes.toString('utf8'),
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

export function applyJournal(ctx, j, allowFault) {
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
    for (const op of j.fl_ops) finishLineUpsert(fl, op.id, op.patch);
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

export function isMockKind(kind) {
  return kind === 'mock' || kind === 'fixture';
}

// Pure planning: refuses (throws) before anything is written.
export function planRecord(ctx, runId, state, result) {
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

  plan.events.push({ event: 'result_recorded', slice_id: result.slice_id || null, stage: result.stage, verdict: result.status });

  if (isDeploy) {
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
    applyStatusToState(next, result);
    next.stage = result.stage;
  }

  if (result.status === 'needs_human' && result.pending_human && result.pending_human.questions_path) {
    const qs = readQuestionsFile(ctx, result.pending_human.questions_path);
    plan.questions.push(...qs);
  }
  if (result.run_verdict !== undefined && result.run_verdict !== null) plan.extra.reported_run_verdict = result.run_verdict;
  plan.outcome = outcome;
  plan.exit = exit;
  plan.nextState = next;
  return plan;
}

export function readQuestionsFile(ctx, file) {
  try {
    const j = JSON.parse(fs.readFileSync(path.resolve(ctx.repo, file), 'utf8'));
    const list = Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : []);
    return list;
  } catch {
    return [];
  }
}

// Slice and run status per M1 for a result that is not a deploy cascade.
export function applyStatusToState(st, result) {
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
