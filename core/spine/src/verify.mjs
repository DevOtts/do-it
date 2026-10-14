import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { resolveEvidence } from './evidence.mjs';
import { finishLineUpsert, readFinishLine, writeFinishLine } from './finish-line.mjs';
import { readLedger, writeLedger } from './ledger.mjs';
import { loadState, selectRunId } from './state.mjs';
// Re-read the world: recompute every VERIFIED row's evidence hash (never mtime).
// A changed or missing file downgrades the row and reopens its finish-line row.
export function verifyEvidence(ctx, runId) {
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
    for (const c of changed) {
      if (fl.rows.some((r) => r.id === c.row)) finishLineUpsert(fl, c.row, { state: 'OPEN', evidence: null, reason: 'evidence_changed' });
      appendEvent(ctx, runId, { event: 'evidence_changed', verdict: 'IMPLEMENTED-NOT-VERIFIED', detail: { row: c.row, reason: c.reason } });
    }
    writeFinishLine(ctx, fl);
  }
  return changed;
}

export function gateVerify(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  loadState(ctx, runId);
  const changed = verifyEvidence(ctx, runId);
  if (changed.length) throw fail('EVIDENCE_CHANGED', 1, { run_id: runId, rows: changed.map((c) => c.row), changed });
  const ledger = readLedger(ctx, runId);
  return { outcome: 'VERIFY_OK', exit: 0, run_id: runId, checked: ledger.rows.filter((r) => r.verdict === 'VERIFIED').length };
}
