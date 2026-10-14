import { EXIT_FOR_STATUS } from './record.mjs';
// Deploy legs (D17): the multi-leg cascade PARTIAL_FAILURE -> ROLLED_BACK -> re-verify,
// or ESCALATED when a compensation fails. Pure planning; record.mjs persists it.
export const LEG_PASSED = 'DEPLOYED_VERIFIED';

export function legsLookRolledBack(state, result) {
  if (result.rollback === true) return true;
  const legs = result.legs || [];
  if (legs.some((l) => l.state === 'ROLLED_BACK' || l.state === 'ROLLBACK_FAILED')) return true;
  const plan = state.deploy && state.deploy.rollback_plan;
  if (state.status === 'PARTIAL_FAILURE' && Array.isArray(plan) && plan.length) {
    return legs.length > 0 && legs.every((l) => plan.includes(l.leg) && !String(l.state).startsWith('DEPLOYED'));
  }
  return false;
}

export function legRow(leg, resolved, now, extra) {
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
export function planDeploy(ctx, runId, state, result, resolveLeg) {
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
export function staleLegsAfterRollback(state, legs, resolveLeg) {
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
