// Reference LEG checker for the deploy-it catalog section. Not the deploy-it implementation:
// it pins the protocol so the catalog text can be tested.
//   leg   = {name, command, verify?, rollback?, risk, lock?, needs?: [ENV], target?}
//   line  = {leg, state, evidence, sha256}   (one JSON line per leg)
// A command may print one JSON line {target, sha256} as its claim. If a claim exists, verify runs in a NEW
// process (no cached handle), prints the observed digest, and a mismatch turns the leg FAILED
// ("expected A found B"), never VERIFIED. Exit codes: 0 verified/unverified, 1 FAILED, 2 NEEDS_HUMAN, 3 HELD.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const STATES = ['DEPLOYED_VERIFIED', 'DEPLOYED_UNVERIFIED', 'HELD', 'FAILED', 'NEEDS_HUMAN'];
export const EXIT = { DEPLOYED_VERIFIED: 0, DEPLOYED_UNVERIFIED: 0, HELD: 3, FAILED: 1, NEEDS_HUMAN: 2 };

export const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const sh = (cmd, env) => spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, ...env } });
const done = (leg, state, evidence, sha256 = null) => ({ line: { leg: leg.name, state, evidence, sha256 }, exit: EXIT[state] });

function lastJson(text) {
  for (const l of text.trim().split('\n').reverse()) { try { return JSON.parse(l); } catch { /* next */ } }
  return null;
}

export function runLeg(leg, env = {}) {
  if (leg.lock && existsSync(leg.lock)) return done(leg, 'HELD', `router lock held: ${leg.lock}`);
  const missing = (leg.needs ?? []).filter((n) => !(n in env) && !process.env[n]);
  if (missing.length) return done(leg, 'NEEDS_HUMAN', `credential missing: ${missing.join(', ')}`);
  const run = sh(leg.command, env);
  if (run.status !== 0) return done(leg, 'FAILED', `command exit ${run.status}: ${(run.stderr || '').trim().slice(0, 200)}`);
  const claim = lastJson(run.stdout);
  if (!leg.verify) return done(leg, 'DEPLOYED_UNVERIFIED', 'no verify command declared', claim?.sha256 ?? null);
  // adversarial verify: re-read after the claim, in a fresh process
  const v = sh(leg.verify, { ...env, LEG_TARGET: claim?.target ?? leg.target ?? '', LEG_CLAIM_SHA256: claim?.sha256 ?? '' });
  if (v.status !== 0) return done(leg, 'FAILED', `verify exit ${v.status}`, claim?.sha256 ?? null);
  const found = v.stdout.trim();
  if (claim?.sha256 && found !== claim.sha256) return done(leg, 'FAILED', `expected ${claim.sha256} found ${found}`, found);
  return done(leg, 'DEPLOYED_VERIFIED', claim ? `re-read ${claim.target} matches claim` : 'verify passed', claim?.sha256 ?? null);
}

// Whole deploy: legs in order. Some pass + some fail => PARTIAL_FAILURE; compensation runs passed legs' rollback
// in reverse order => ROLLED_BACK; a failing rollback => ESCALATED.
export function runDeploy(legs, env = {}) {
  const results = [];
  for (const leg of legs) {
    const r = runLeg(leg, env);
    results.push({ leg, ...r });
    if (r.line.state !== 'DEPLOYED_VERIFIED' && r.line.state !== 'DEPLOYED_UNVERIFIED') break;
  }
  const ok = results.filter((r) => r.exit === 0);
  const bad = results.filter((r) => r.exit !== 0);
  if (!bad.length) return { status: 'DEPLOYING', results, trail: [] };
  if (!ok.length) return { status: 'FAILED', results, trail: [] };
  const trail = ['DEPLOYING', 'PARTIAL_FAILURE'];
  for (const r of [...ok].reverse()) {
    if (!r.leg.rollback) continue;
    if (sh(r.leg.rollback, env).status !== 0) return { status: 'ESCALATED', results, trail: [...trail, 'ROLLED_BACK', 'ESCALATED'] };
  }
  return { status: 'ROLLED_BACK', results, trail: [...trail, 'ROLLED_BACK'] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--digest') { console.log(digestOf(a[1])); process.exit(0); }
  const legs = JSON.parse(readFileSync(a[0], 'utf8'));
  let worst = 0;
  for (const leg of legs) { const r = runLeg(leg); console.log(JSON.stringify(r.line)); worst = Math.max(worst, r.exit); }
  process.exit(worst);
}
