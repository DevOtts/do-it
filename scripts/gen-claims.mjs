#!/usr/bin/env node
// Generates tests/claims.json: one entry per measured statement the README may cite.
// A claim is `measured` only when it is derived from a fixture's own content; anything that needs a real
// host run stays `unmeasured` until T-R4-02 is VERIFIED (G-3, G-6): a real run writes
// tests/measurements/feature-overnight.claude-code.json and only that file turns the two run.* claims to `measured`.
// Deterministic: no timestamps.
// usage: node scripts/gen-claims.mjs [--write | --check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureFixture } from './measure-fixture.mjs';

const MEASUREMENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'measurements', 'feature-overnight.claude-code.json');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'tests', 'claims.json');

export async function buildClaims() {
  const [feat, inv, drain, rev, rec, dep] = await Promise.all(['feature-overnight', 'investigate-fix', 'weekly-drain', 'review-loop', 'reconcile', 'deploy'].map((n) => measureFixture(n)));
  const m = (id, statement, value, fixture) => ({ id, statement, value, status: 'measured', host: 'none', source: 'node scripts/measure-fixture.mjs ' + fixture, fixture });
  const u = (id, statement, needs) => ({ id, statement, value: null, status: 'unmeasured', host: 'claude-code', source: 'node tests/e2e/run.mjs --fixture feature-overnight --host claude-code', needs });
  const real = fs.existsSync(MEASUREMENT) ? JSON.parse(fs.readFileSync(MEASUREMENT, 'utf8')) : null;
  const run = (id, statement, value, needs) => (real && value !== undefined
    ? { id, statement, value, status: 'measured', host: real.host, source: real.source, fixture: real.fixture, model_tier: real.model_tier, estimated: real.estimated }
    : u(id, statement, needs));
  const claims = [
    m('fixture.feature.dod_rows', 'The overnight feature fixture has ' + feat.dod_count + ' DoD rows', feat.dod_count, 'feature-overnight'),
    m('fixture.investigate.failing_checks', 'The investigate-fix fixture starts with ' + inv.failing_checks + ' failing check', inv.failing_checks, 'investigate-fix'),
    m('fixture.drain.cards', 'The weekly drain fixture holds ' + drain.card_count + ' backlog cards', drain.card_count, 'weekly-drain'),
    m('fixture.drain.needs_build', drain.needs_build_count + ' of ' + drain.card_count + ' drain cards need a build sandbox', drain.needs_build_count, 'weekly-drain'),
    m('fixture.drain.dispositions', 'The drain fixture resolves to ' + Object.entries(drain.dispositions).map(([k, v]) => v + ' ' + k).join(', '), drain.dispositions, 'weekly-drain'),
    m('fixture.review.converge_rounds', 'The converge review variant ends in round ' + rev.variants.converge.rounds_used + ' with ' + rev.variants.converge.minors_written + ' minors', rev.variants.converge.rounds_used, 'review-loop'),
    m('fixture.reconcile.shape', 'The reconcile fixture has ' + rec.repos + ' repos, ' + rec.branches + ' branches and ' + rec.worktrees + ' worktrees', { repos: rec.repos, branches: rec.branches, worktrees: rec.worktrees }, 'reconcile'),
    m('fixture.deploy.legs', 'The deploy fixture has ' + dep.leg_count + ' legs', dep.leg_count, 'deploy'),
    run('run.feature.tokens_per_verified_row', 'Input plus output tokens per VERIFIED row on the overnight feature fixture, real Claude Code host (cache tokens excluded)', real && real.tokens_per_verified_row, 'T-R4-02 VERIFIED (DOIT_REAL_CALLS=1)'),
    run('run.feature.rows_verified', 'DoD rows VERIFIED with evidence on the overnight feature fixture, real Claude Code host', real && real.rows_verified, 'T-R4-02 VERIFIED'),
  ];
  return JSON.stringify({ schema: 'do-it-claims/1', claims }, null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = await buildClaims();
  if (process.argv.includes('--write')) { fs.writeFileSync(OUT, text); console.log('wrote ' + OUT); }
  else if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (cur === text) console.log('claims.json is current'); else { console.error('claims.json is stale or missing'); process.exitCode = 1; }
  } else process.stdout.write(text);
}
