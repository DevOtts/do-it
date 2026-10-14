// R4 skeleton (wave W1). Test names carry the case ID. Cases that need unbuilt epics are skipped with a
// reason and are NOT counted as verified; they activate in W4. Tests prefixed R4-FIX / R4-LIB check the
// fixtures and the harness themselves and are not Test Contract cases.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { materialize, meterStub, seedFinishLine, startRun } from './lib/fixture.mjs';
import { accountForPending, deployEvents, fileSha } from './lib/roteiros.mjs';
import { REPO_ROOT, doItDir, ledgerOf, readJson, readJsonl, record, runDirOf, spine, stateOf } from './lib/spine.mjs';
import { worktreeCount } from './lib/worktrees.mjs';
import { EXIT_NOT_AVAILABLE, runFixture } from './run.mjs';
import { buildReconcileWorkspace } from '../fixtures/reconcile/build.mjs';

const MEASURE = path.join(REPO_ROOT, 'scripts', 'measure-fixture.mjs');
const TOKENS = path.join(REPO_ROOT, 'scripts', 'tokens-per-row.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures');
const expected = (name) => readJson(path.join(FIXTURES, name, 'expected.json'));

function run(fixture, variant) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dit-e2e-out-'));
  return runFixture({ fixture, host: 'stub', variant, outDir: out });
}
function measureCheck(name) {
  return cp.spawnSync(process.execPath, [MEASURE, name, '--check'], { encoding: 'utf8' });
}
const flRows = (ctx) => readJson(path.join(doItDir(ctx), 'finish-line.json')).rows;
const spineEvents = (ctx) => readJsonl(path.join(runDirOf(ctx), 'events.jsonl'));

// ------------------------------------------------------------------ cases that run now (stub host)

test('T-R4-01 feature fixture reaches the final status on the stub host', () => {
  const r = run('feature-overnight');
  assert.equal(r.exit, 0);
  const st = stateOf(r.ctx);
  assert.equal(st.status, 'DONE');
  const fl = flRows(r.ctx);
  assert.equal(fl.length, 4);
  assert.ok(fl.every((x) => x.state === 'DONE'), 'every finish-line row DONE');
  const ledger = ledgerOf(r.ctx);
  assert.equal(ledger.rows.length, 4);
  for (const row of ledger.rows) {
    assert.equal(row.verdict, 'VERIFIED');
    assert.ok(row.evidence_path && fs.existsSync(path.join(r.ctx.workdir, row.evidence_path)), 'evidence exists for ' + row.row);
    assert.match(row.evidence_sha256, /^[0-9a-f]{64}$/);
  }
  const m = measureCheck('feature-overnight');
  assert.equal(m.status, 0, m.stderr);
  // byte-identical recompute
  const again = cp.spawnSync(process.execPath, [MEASURE, 'feature-overnight'], { encoding: 'utf8' }).stdout;
  assert.equal(again, fs.readFileSync(path.join(FIXTURES, 'feature-overnight', 'expected.json'), 'utf8'));
});

test('T-R4-03 investigate-fix closes red to green', () => {
  const r = run('investigate-fix');
  assert.equal(r.exit, 0);
  const red = fs.readFileSync(path.join(r.ctx.workdir, 'evidence', 'red.log'), 'utf8');
  const green = fs.readFileSync(path.join(r.ctx.workdir, 'evidence', 'green.log'), 'utf8');
  assert.doesNotMatch(red, /exit: 0\n$/);
  assert.match(green, /exit: 0\n$/);
  const exp = expected('investigate-fix');
  const n = cp.execFileSync('git', ['log', '--oneline', 'fixture-base..HEAD', '--', exp.defect_file], { cwd: r.ctx.workdir, encoding: 'utf8' }).split('\n').filter(Boolean).length;
  assert.equal(n, 1, 'exactly one commit touches the defect file');
  const reg = ledgerOf(r.ctx).rows.find((x) => x.row === exp.regression_row);
  assert.equal(reg.verdict, 'VERIFIED');
  assert.equal(reg.evidence_path, 'evidence/green.log');
  assert.equal(measureCheck('investigate-fix').status, 0);
});

test('T-R4-04 weekly drain ends with zero unaccounted rows', () => {
  const r = run('weekly-drain');
  assert.equal(r.exit, 0);
  const exp = expected('weekly-drain');
  const table = readJson(path.join(r.ctx.workdir, 'drain-table.json')).rows;
  assert.equal(table.length, 10);
  const counts = {};
  for (const t of table) counts[t.disposition] = (counts[t.disposition] || 0) + 1;
  assert.deepEqual(counts, exp.dispositions);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 10);
  assert.equal(flRows(r.ctx).filter((x) => x.state === 'OPEN').length, 0);
  const archive = fs.readdirSync(path.join(r.ctx.workdir, 'archive')).filter((f) => f.endsWith('.md'));
  assert.equal(archive.length, 10 - exp.dispositions.PARKED);
  for (const f of archive) {
    const id = f.replace('.md', '');
    assert.match(fs.readFileSync(path.join(r.ctx.workdir, 'archive', f), 'utf8'), new RegExp('Disposition: ' + exp.per_card[id] + '\\n$'));
  }
  assert.equal(stateOf(r.ctx).run_verdict, 'DONE_WITH_RESIDUALS'); // parked cards are residuals, not verified
});

test('T-R4-06 conclude refuses an unaccounted row (G-13)', () => {
  const r = run('weekly-drain', 'leave-open:c07');
  assert.equal(r.exit, 1);
  assert.equal(r.last.out.outcome, 'CONCLUDE_REFUSED');
  assert.equal(r.last.out.reason, 'unaccounted_row');
  assert.deepEqual(r.last.out.ids, ['c07']);
  assert.notEqual(stateOf(r.ctx).status, 'DONE');
  accountForPending(r.ctx);
  const c = spine(r.ctx, ['gate', 'conclude']);
  assert.equal(c.code, 0);
  assert.equal(stateOf(r.ctx).status, 'DONE');
});

test('T-R4-12 tokens per VERIFIED row', () => {
  const ctx = materialize('feature-overnight');
  startRun(ctx, 'feature', 'meter fixture');
  const dir = runDirOf(ctx);
  const mk = (source, estimated, tin, tout) => spine(ctx, ['meter', '--append', '--source', source, '--estimated', String(estimated), '--tokens-in', String(tin), '--tokens-out', String(tout), '--stage', 'build-it', '--host', 'stub']);
  for (const [i, o] of [[1, 100], [2, 200], [3, 300], [4, 400]].entries()) assert.equal(mk('provider', false, o[1], i * 10).code, 0);
  assert.equal(mk('estimate', true, 50, 5).code, 0);
  assert.equal(mk('estimate', true, 60, 6).code, 0);
  assert.equal(readJsonl(path.join(dir, 'token-meter.jsonl')).length, 6);
  fs.mkdirSync(path.join(ctx.workdir, 'proof'), { recursive: true });
  for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(ctx.workdir, 'proof', n + '.txt'), n);
  const rec = record(ctx, { verdicts: ['a', 'b', 'c'].map((n) => ({ row: 'R-' + n, verdict: 'VERIFIED', evidence: 'proof/' + n + '.txt', real: false })) });
  assert.equal(rec.code, 0);
  const rows = readJsonl(path.join(dir, 'token-meter.jsonl'));
  const total = rows.reduce((s, x) => s + x.tokens_in + x.tokens_out, 0);
  const out = JSON.parse(cp.execFileSync(process.execPath, [TOKENS, '--run-dir', dir], { encoding: 'utf8' }));
  assert.equal(out.tokens_per_verified_row, total / 3);
  assert.equal(out.estimated, true);
  assert.equal(out.provider_rows, 4);
  // zero VERIFIED rows: the string n/a, exit 0, no division error
  const zeroLedger = path.join(ctx.workdir, 'zero-ledger.json');
  fs.writeFileSync(zeroLedger, JSON.stringify({ rows: [{ row: 'X', verdict: 'IMPLEMENTED-NOT-VERIFIED' }] }));
  const z = cp.spawnSync(process.execPath, [TOKENS, '--meter', path.join(dir, 'token-meter.jsonl'), '--ledger', zeroLedger], { encoding: 'utf8' });
  assert.equal(z.status, 0);
  assert.equal(JSON.parse(z.stdout).tokens_per_verified_row, 'n/a');
});

function resultWithLegs(ctx, n) {
  const dir = path.join(runDirOf(ctx), 'results');
  for (const f of fs.readdirSync(dir)) {
    const j = readJson(path.join(dir, f));
    if (Array.isArray(j.legs) && j.legs.length === n) return j;
  }
  return null;
}

test('T-R4-13 deploy partial failure then rollback', () => {
  const r = run('deploy', 'fail-publish');
  const ctx = r.ctx;
  assert.equal(stateOf(ctx).status, 'ROLLED_BACK');
  const ev = spineEvents(ctx).map((e) => e.event);
  assert.ok(ev.indexOf('partial_failure') !== -1 && ev.indexOf('partial_failure') < ev.indexOf('rolled_back'), 'PARTIAL_FAILURE before ROLLED_BACK');
  const rb = deployEvents(ctx).filter((e) => e.kind === 'rollback').map((e) => e.leg);
  assert.deepEqual(rb, ['verify-digest', 'write'], 'rollback of legs 2 then 1');
  const exp = expected('deploy');
  assert.equal(fileSha(path.join(ctx.workdir, 'target', 'app.txt')), exp.pre_deploy_sha256);
  const res = resultWithLegs(ctx, 3);
  assert.deepEqual(res.legs.map((l) => l.state), ['DEPLOYED_VERIFIED', 'DEPLOYED_VERIFIED', 'FAILED']);
});

test('T-R4-14 rollback fails and the run escalates', () => {
  const r = run('deploy', 'fail-publish,rollback-fail:write');
  const ctx = r.ctx;
  assert.equal(r.exit, 2);
  assert.equal(stateOf(ctx).status, 'ESCALATED');
  const pack = readJson(path.join(runDirOf(ctx), 'owner-pack.json'));
  assert.equal(pack.questions.length, 1);
  assert.match(pack.questions[0].text, /leg write/);
  assert.match(pack.questions[0].text, /digest-mismatch/);
  const evs = deployEvents(ctx);
  assert.equal(evs[evs.length - 1].kind, 'stop', 'no deploy command after the failed rollback');
  assert.equal(spine(ctx, ['next']).out.action, 'NONE');
});

test('T-R4-15 recovery by re-verify', () => {
  const r = run('deploy', 'recover');
  const ctx = r.ctx;
  assert.equal(r.exit, 0);
  const changes = spineEvents(ctx).filter((e) => e.event === 'status_changed').map((e) => e.detail.from + '>' + e.detail.to);
  assert.ok(changes.includes('ROLLED_BACK>DEPLOYING'));
  const rec = deployEvents(ctx).filter((e) => e.phase === 'recovery');
  assert.deepEqual(rec.filter((e) => e.kind === 'verify').map((e) => e.leg), ['write', 'verify-digest', 'publish'], 'three fresh verify executions');
  assert.ok(rec.every((e) => e.exit === 0));
  const st = stateOf(ctx);
  assert.deepEqual(st.deploy.legs.map((l) => l.state), ['DEPLOYED_VERIFIED', 'DEPLOYED_VERIFIED', 'DEPLOYED_VERIFIED']);
  assert.equal(st.status, 'DONE');
});

test('T-R4-16 adversarial verify: tamper between write and verify', () => {
  const r = run('deploy', 'tamper:verify-digest');
  const ctx = r.ctx;
  const evs = deployEvents(ctx);
  const i = evs.findIndex((e) => e.kind === 'tamper');
  assert.ok(i > 0 && evs[i - 1].kind === 'run' && evs[i - 1].leg === 'verify-digest' && evs[i + 1].kind === 'verify' && evs[i + 1].exit !== 0);
  assert.match(fs.readFileSync(path.join(ctx.workdir, 'evidence', 'deploy', 'verify-digest.txt'), 'utf8'), /digest mismatch: claimed [0-9a-f]{64} re-read [0-9a-f]{64}/);
  const st = stateOf(ctx);
  assert.equal(st.status, 'PARTIAL_FAILURE');
  assert.equal(st.deploy.legs.find((l) => l.leg === 'verify-digest').state, 'FAILED');
  const row = ledgerOf(ctx).rows.find((x) => x.row === 'DEPLOY:verify-digest');
  assert.notEqual(row.verdict, 'VERIFIED');
  assert.ok(['IMPLEMENTED-NOT-VERIFIED', 'BLOCKED'].includes(row.verdict));
});

// ------------------------------------------------------------------ deferred to W4 (not verified)

const DEFER = {
  'T-R4-02 feature fixture on the real Claude Code host (G-3) [REAL]': 'needs H1 host driver, the build-it pipeline and a live `claude -p` run; IMPLEMENTED-NOT-VERIFIED until S and H1 ship',
  'T-R4-05 sandboxes equal slices needing a build (D16) [REAL]': 'sandbox creation belongs to the engine and the drain preset (S2 scheduler, P pipelines); the stub must not play the engine for a [REAL] case. Sampler is ready: tests/e2e/lib/worktrees.mjs',
  'T-R4-07 review loop converges': 'needs the review-it pipeline (P4) and its round driver; fixture sequences ready in tests/fixtures/review-loop',
  'T-R4-08 review loop stalls': 'needs the review-it pipeline (P4), tier raise logging and gate ceiling (S2/S5)',
  'T-R4-09 review loop exceeds budget': 'needs gate ceiling and park/resume (S5) and the review-it pipeline (P4)',
  'T-R4-10 reconcile refuses to delete without approval [REAL]': 'needs the reconcile-it pipeline (scan/plan/apply); workspace builder ready in tests/fixtures/reconcile/build.mjs',
  'T-R4-11 reconcile re-verifies at execution time [REAL]': 'needs the reconcile-it pipeline (apply --approved)',
  'T-R4-17 usage limit parks and resume skips finished slices': 'spine resume and park are NOT_IMPLEMENTED (S5); slices come from the S2 scheduler',
  'T-R4-18 failed slice retries one tier up then escalates': 'needs the S2 scheduler (tier-up retry, attempts cap) and a builder stub driven by it',
  'T-R4-19 owner gate blocks only its slice': 'spine record adds owner-pack questions only for needs_human; the BLOCKED owner-gate question path is S2/S4',
  'T-R4-20 handoff failure retries then escalates (G-5)': 'spine handoff and gate ceiling are NOT_IMPLEMENTED (S5)',
};
for (const [name, reason] of Object.entries(DEFER)) test(name, { skip: 'DEFERRED to W4: ' + reason }, () => {});

// ------------------------------------------------------------------ fixture and harness self-checks

test('R4-FIX expected.json is current for every fixture', () => {
  for (const name of fs.readdirSync(FIXTURES)) {
    if (!fs.existsSync(path.join(FIXTURES, name, 'expected.json'))) continue;
    const m = measureCheck(name);
    assert.equal(m.status, 0, name + ': ' + m.stderr);
  }
});

test('R4-FIX claims.json is current and marks host-dependent claims unmeasured', () => {
  const c = cp.spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'gen-claims.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr);
  const claims = readJson(path.join(REPO_ROOT, 'tests', 'claims.json')).claims;
  assert.ok(claims.filter((x) => x.status === 'unmeasured').every((x) => x.value === null));
});

test('R4-FIX review-loop variants measure to the Test Contract numbers', () => {
  const v = expected('review-loop').variants;
  assert.deepEqual(v.converge.blocking_per_round, [3, 1, 0]);
  assert.equal(v.converge.exit, 'CONVERGED_WITH_MINORS');
  assert.equal(v.converge.minors_written, 2);
  assert.equal(v['converge-clean'].exit, 'CONVERGED');
  assert.equal(v.stall.exit, 'STALLED');
  assert.equal(v['over-budget'].exit, 'OVER_BUDGET');
  assert.equal(v['over-budget'].rounds_used, 2);
});

test('R4-FIX reconcile builder makes 2 repos, 5 branches, 2 worktrees with real git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dit-rc-'));
  const env = { HOME: root, GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null' };
  const ws = buildReconcileWorkspace(path.join(root, 'ws'), env);
  const exp = expected('reconcile');
  assert.equal(Object.keys(ws.repos).length, exp.repos);
  let branches = 0;
  let wts = 0;
  for (const repo of Object.values(ws.repos)) {
    branches += cp.execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...env } }).split('\n').filter((b) => b && b !== 'main').length;
    wts += worktreeCount(repo, { ...process.env, ...env }) - 1;
  }
  assert.equal(branches, exp.branches);
  assert.equal(wts, exp.worktrees);
  assert.ok(fs.existsSync(path.join(ws.worktrees[1], 'uncommitted.txt')), 'dirty worktree has uncommitted work');
});

test('R4-LIB a real host is never replaced by the stub (T-R4-02 honesty rule)', () => {
  for (const host of ['claude-code', 'codex', 'opencode']) {
    const r = runFixture({ fixture: 'feature-overnight', host });
    assert.equal(r.exit, EXIT_NOT_AVAILABLE);
    assert.equal(r.outcome, 'IMPLEMENTED-NOT-VERIFIED');
    assert.equal(r.ctx, undefined, 'nothing ran');
  }
  assert.equal(runFixture({ fixture: 'review-loop', host: 'stub' }).exit, EXIT_NOT_AVAILABLE);
});

test('R4-LIB stub meter rows are never labelled provider (G-6)', () => {
  const r = run('feature-overnight');
  const rows = readJsonl(path.join(runDirOf(r.ctx), 'token-meter.jsonl'));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((x) => x.source === 'estimate' && x.estimated === true));
});
