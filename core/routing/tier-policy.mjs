import fs from 'node:fs';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';

export const POLICY = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./tiers.json', import.meta.url)), 'utf8'));
const ORDER = POLICY.escalation_order; // lowest first: T3, T2, T1
const TIERS = new Set([...ORDER, 'code']);

function hasReason(r) {
  return typeof r === 'string' && r.trim().length > 0;
}

// Every spawn names a tier (explicitly, by task class, or by the conductor default) or is rejected (G-4).
// T1 needs a written reason, else it resolves to T2 and the downgrade is logged.
export function resolveTier(req, settings) {
  const r = req || {};
  const tiersSetting = (settings && settings.tiers) || {};
  const log = [];
  let tier = r.tier;
  let cls = r.class;
  if (tier === undefined || tier === null) {
    if (cls !== undefined && cls !== null) {
      const c = POLICY.classes[cls];
      if (!c) throw fail('TASK_CLASS_UNKNOWN', 1, { class: cls });
      tier = c.tier;
    } else if (r.role === 'conductor') {
      tier = tiersSetting.conductor || POLICY.conductor_default;
    } else {
      throw fail('TIER_MISSING', 1, { role: r.role || null, message: 'every spawn must name a tier' });
    }
  }
  if (!TIERS.has(tier)) throw fail('TIER_UNKNOWN', 1, { tier });
  if (tier === 'code') {
    return { tier: 'code', downgraded: false, model_tokens_budget: 0, log };
  }
  let downgraded = false;
  if (tier === 'T1' && !hasReason(r.reason)) {
    tier = 'T2';
    downgraded = true;
    log.push({ code: 'T1_REASON_MISSING', downgraded: true, role: r.role || null, from: 'T1', to: 'T2' });
  } else if (tier === 'T1') {
    log.push({ code: 'T1_REASON_GIVEN', downgraded: false, reason: r.reason.trim() });
  }
  return { tier, downgraded, log };
}

function ownerQuestion(slice, why) {
  return {
    kind: 'default',
    text: 'Slice ' + (slice || '?') + ' failed its contract twice or has no tier above it (' + why + '). How should it proceed?',
    options: ['retry with a revised brief', 'drop the slice', 'park the run'],
    recommendation: 'retry with a revised brief',
    default: 'park the run',
    reversible: true
  };
}

// failures = how many times this slice has failed its contract so far (1 = first failure).
// The spine records the outcome; this is a pure function (G-1).
export function escalate({ tier, failures, slice_id }) {
  const n = failures === undefined ? 1 : failures;
  const idx = ORDER.indexOf(tier);
  if (idx === -1) throw fail('TIER_UNKNOWN', 1, { tier });
  if (n >= 2) {
    return { status: 'ESCALATED', retry_tier: null, reason: 'escalate: second failure', owner_question: ownerQuestion(slice_id, 'second failure') };
  }
  if (idx === ORDER.length - 1) {
    return { status: 'ESCALATED', retry_tier: null, reason: 'escalate: none_above', owner_question: ownerQuestion(slice_id, 'none_above') };
  }
  return { status: 'FAILED', retry_tier: ORDER[idx + 1], reason: 'escalation: first failure', owner_question: null };
}

// events: rows {class, outcome: 'pass'|'fail', first_try: bool} in order. Only the trailing streak of
// first-try passes for the class counts; a retry-pass or a failure resets it.
export function maybeDowngrade({ class: cls, tier, events }) {
  if (cls === 'deterministic' || tier === 'code') return { tier, downgraded: false, streak: 0 };
  let streak = 0;
  const rows = (events || []).filter((e) => e.class === cls);
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i];
    if (e.outcome === 'pass' && e.first_try === true) streak++;
    else break;
  }
  const steps = Math.floor(streak / POLICY.downgrade_after_first_try_passes);
  const idx = ORDER.indexOf(tier);
  const next = Math.max(0, idx - steps);
  return { tier: ORDER[next], downgraded: next !== idx, streak };
}

// Tier changes happen at a spawn or stage boundary, never inside a live session (TR-5).
export function checkTierChange(change) {
  const c = change || {};
  if (c.session_id) {
    throw fail('TIER_CHANGE_MIDSESSION', 1, { session_id: c.session_id, message: 'change the tier of the next spawn instead' });
  }
  return { accepted: true, applies_to: 'next_spawn', tier: c.tier || null };
}

// Generic CLI flag probe: runs `command ...args` and searches the output. A host whose output lacks the
// flag is recorded per_spawn_model "unknown", never true (G-3 spirit). Core names no harness; callers pass the command.
export function probeFlag({ command, args, flag }) {
  const r = cp.spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  if (r.error) return { command, flag, found: false, per_spawn_model: 'unknown', reason: 'could not run: ' + r.error.code };
  const found = out.includes(flag);
  return { command, flag, found, per_spawn_model: found ? true : 'unknown', output_bytes: out.length };
}
