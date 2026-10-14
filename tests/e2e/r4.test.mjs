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
import { MEASUREMENTS } from './lib/realhost.mjs';
import { backlogCards, reviewEvents } from './lib/reviewloop.mjs';
import { buildSlice, hookScript, nextOf, sliceOf, startSliceRun } from './lib/slices.mjs';
import { accountForPending, deployEvents, fileSha } from './lib/roteiros.mjs';
import { REPO_ROOT, doItDir, git, ledgerOf, readJson, readJsonl, record, runDirOf, spine, stateOf, writeJson } from './lib/spine.mjs';
import { sampleWorktrees, sandboxMismatch, worktreeCount } from './lib/worktrees.mjs';
import { EXIT_NOT_AVAILABLE, runFixture } from './run.mjs';
import { checkState as checkReconcileState } from '../catalog/reconcile-reference.mjs';
import { BRANCH_LABELS, buildReconcileWorkspace } from '../fixtures/reconcile/build.mjs';
import { startRound } from '../../core/pipelines/review-loop/controller.mjs';

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

// ------------------------------------------------------------------ W4: cases that waited on other epics

const RECONCILE = path.join(REPO_ROOT, 'scripts', 'reconcile.mjs');
const realOn = process.env.DOIT_REAL_CALLS === '1';

test('T-R4-02 feature fixture on the real Claude Code host (G-3) [REAL]', { skip: realOn ? false : 'IMPLEMENTED-NOT-VERIFIED: set DOIT_REAL_CALLS=1 to allow one tiny paid `claude -p` call (cheapest tier, alias anm)', timeout: 400000 }, (t) => {
  const r = runFixture({ fixture: 'feature-overnight', host: 'claude-code', realCalls: true, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'dit-e2e-real-')) });
  if (r.exit === EXIT_NOT_AVAILABLE) { t.skip('IMPLEMENTED-NOT-VERIFIED: ' + r.reason); return; }
  assert.equal(r.exit, 0);
  assert.equal(stateOf(r.ctx).status, 'DONE');
  const meter = readJsonl(path.join(runDirOf(r.ctx), 'token-meter.jsonl'));
  assert.ok(meter.length > 0 && meter.every((x) => x.source === 'provider' && x.estimated === false), 'meter rows come from the provider');
  const ledger = ledgerOf(r.ctx);
  assert.equal(ledger.rows.length, 4);
  for (const row of ledger.rows) {
    assert.equal(row.verdict, 'VERIFIED');
    assert.ok(fs.existsSync(path.join(r.ctx.workdir, row.evidence_path)));
  }
  // The measurement the README may cite. Written only from a run that passed the assertions above.
  const tpr = JSON.parse(cp.execFileSync(process.execPath, [TOKENS, '--run-dir', runDirOf(r.ctx)], { encoding: 'utf8' }));
  fs.mkdirSync(MEASUREMENTS, { recursive: true });
  fs.writeFileSync(path.join(MEASUREMENTS, 'feature-overnight.claude-code.json'), JSON.stringify({
    schema: 'do-it-measurement/1', fixture: 'feature-overnight', host: 'claude-code', model_tier: 'T3', rows_verified: tpr.verified_rows,
    tokens_per_verified_row: tpr.tokens_per_verified_row, tokens_total: tpr.tokens_total, estimated: tpr.estimated, provider_rows: tpr.provider_rows,
    cost_usd: r.summary.cost_usd, source: 'node tests/e2e/run.mjs --fixture feature-overnight --host claude-code (DOIT_REAL_CALLS=1)',
  }, null, 2) + '\n');
});

test('T-R4-05 sandboxes equal slices needing a build (D16) [REAL]', async (t) => {
  // Sandboxes are created by the Engine. With no reachable Engine the case cannot be VERIFIED; the stub never plays it.
  const { probeEngine } = await import('../../hosts/engine/live/probe.mjs');
  const rec = await probeEngine({});
  if (!rec.reachable) { t.skip('IMPLEMENTED-NOT-VERIFIED: no live Engine (' + rec.error + ')'); return; }
  t.skip('IMPLEMENTED-NOT-VERIFIED: Engine reachable at ' + rec.baseUrl + ' but this harness has no drain-on-Engine driver yet; sampler and check are ready (tests/e2e/lib/worktrees.mjs)');
});

test('T-R4-07 review loop converges', () => {
  const exp = expected('review-loop').variants;
  const r = run('review-loop', 'converge');
  const d = r.ctx.review.decisions;
  assert.equal(r.exit, 0);
  assert.equal(d[d.length - 1].exit, 'CONVERGED_WITH_MINORS');
  assert.equal(d.length, 3, 'rounds used');
  assert.equal(d.length, exp.converge.rounds_used);
  assert.deepEqual(d.map((x) => x.loop_count), exp.converge.blocking_per_round);
  assert.ok(d[1].loop_count < d[0].loop_count && d[2].loop_count < d[1].loop_count, 'blockers plus majors fall each round');
  assert.equal(backlogCards(r.ctx).length, 2);
  assert.equal(backlogCards(r.ctx).length, exp.converge.minors_written);
  assert.equal(stateOf(r.ctx).status, 'DONE');
  const clean = run('review-loop', 'converge-clean');
  assert.equal(clean.ctx.review.last.exit, 'CONVERGED'); // G-10: no minors, no minor exit
  assert.equal(backlogCards(clean.ctx).length, 0);
});

test('T-R4-08 review loop stalls', () => {
  const r = run('review-loop', 'stall');
  const ctx = r.ctx;
  const d = ctx.review.decisions;
  assert.deepEqual(d.map((x) => x.decision), ['FIXING', 'RAISE_TIER', 'STALLED']);
  assert.equal(d.filter((x) => x.decision === 'RAISE_TIER').length, 1, 'tier raised once');
  assert.deepEqual([d[1].builder_tier, d[2].builder_tier], ['T1', 'T1']);
  const logged = readJson(path.join(ctx.review.dir, 'review-state.json')).decisions;
  assert.equal(logged[3].exit, 'STALLED'); // the raise and the stall are both on disk
  assert.equal(logged[3].raise_used, true);
  const pack = readJson(path.join(runDirOf(ctx), 'owner-pack.json'));
  assert.deepEqual(pack.questions.map((q) => q.kind), ['review-cap']);
  assert.equal(stateOf(ctx).status, 'ESCALATED'); // the scripted owner reply is absent
  assert.equal(r.exit, 0);
  assert.throws(() => startRound(ctx.review.dir, 4, { reviewer: 'a', runner: 'b', builder: 'c' }), (e) => e.outcome === 'ROUND_AFTER_EXIT');
  assert.equal(reviewEvents(ctx).filter((e) => e.event === 'round_result').length, 3, 'no round after STALLED');
  assert.equal(spine(ctx, ['next']).out.reason, 'escalated');
});

test('T-R4-09 review loop exceeds budget', () => {
  const r = run('review-loop', 'over-budget');
  const ctx = r.ctx;
  const exp = expected('review-loop').variants['over-budget'];
  const d = ctx.review.decisions;
  assert.equal(d[d.length - 1].exit, 'OVER_BUDGET');
  assert.equal(d.length, exp.rounds_used);
  assert.equal(r.exit, 3);
  assert.equal(stateOf(ctx).status, 'PARKED');
  const park = readJson(path.join(runDirOf(ctx), 'park.json'));
  assert.match(park.resume.next_action, /round 2/);
  assert.ok(park.resume.state_files.some((f) => f.endsWith(path.join('review', 'review-state.json'))), 'park lists the review state file');
  const st = readJson(path.join(ctx.review.dir, 'review-state.json'));
  assert.equal(st.decisions[2].exit, 'OVER_BUDGET');
  assert.equal(st.decisions[3], undefined);
  assert.throws(() => startRound(ctx.review.dir, 3, { reviewer: 'a', runner: 'b', builder: 'c' }), (e) => e.outcome === 'ROUND_AFTER_EXIT');
  // events.jsonl: nothing recorded after the breach but the park itself
  const ev = spineEvents(ctx);
  const parkAt = ev.findIndex((e) => e.event === 'run_parked');
  assert.ok(parkAt > 0);
  assert.deepEqual(ev.slice(parkAt + 1).filter((e) => /spawn|result_recorded|round/.test(e.event)), []);
  assert.equal(reviewEvents(ctx).filter((e) => e.event === 'round_result').length, 2);
  // resume works from the parked state with a fresh process
  assert.equal(spine(ctx, ['resume']).code, 0);
});

function reconcileWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dit-rc-'));
  const env = { HOME: root, GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null' };
  const ws = buildReconcileWorkspace(path.join(root, 'ws'), env);
  const genv = { ...process.env, ...env };
  const g = (repo, args) => cp.execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: genv });
  const rc = (cmd, extra) => {
    const r = cp.spawnSync(process.execPath, [RECONCILE, cmd, '--root', ws.root, ...(extra || [])], { encoding: 'utf8', env: genv });
    return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr };
  };
  const snapshot = () => Object.values(ws.repos).map((repo) => g(repo, ['branch', '--list']) + '|' + g(repo, ['worktree', 'list']));
  return { ws, g, rc, snapshot, stateFile: path.join(ws.root, '.do-it', 'reconcile', 'state.json') };
}

test('T-R4-10 reconcile refuses to delete without approval [REAL]', () => {
  const w = reconcileWorkspace();
  const exp = expected('reconcile');
  const scan = w.rc('scan');
  assert.equal(scan.code, 0);
  assert.equal(scan.out.inventory.filter((x) => x.kind === 'branch').length, exp.branches);
  assert.equal(scan.out.inventory.filter((x) => x.kind === 'worktree').length, exp.worktrees);
  const plan = w.rc('plan');
  assert.equal(plan.code, 0);
  assert.equal(plan.out.dispositions.length, exp.branches);
  // independent ground truth: the fixture builder's own labels
  const want = { landed: 'delete-landed', superseded: 'archive-superseded', 'in-flight': 'keep-in-flight', dirty: 'rescue-wip' };
  for (const [repoName, labels] of Object.entries(BRANCH_LABELS)) {
    for (const [branch, label] of Object.entries(labels)) {
      assert.equal(plan.out.dispositions.find((d) => d.ref === repoName + ':' + branch).action, want[label], branch);
    }
  }
  const before = w.snapshot();
  const apply = w.rc('apply');
  assert.equal(apply.code, 2);
  assert.equal(apply.out.outcome, 'APPROVAL_REQUIRED');
  assert.deepEqual(w.snapshot(), before, 'branches and worktrees unchanged');
  const state = readJson(w.stateFile);
  assert.equal(state.phase, 'plan');
  assert.deepEqual(checkReconcileState(state), []);
});

test('T-R4-11 reconcile re-verifies at execution time [REAL]', () => {
  const w = reconcileWorkspace();
  w.rc('scan');
  w.rc('plan');
  const repoA = w.ws.repos['repo-a'];
  const repoB = w.ws.repos['repo-b'];
  // after plan: one landed branch moves forward with a new commit
  w.g(repoA, ['checkout', '-q', 'feat/landed-a']);
  fs.writeFileSync(path.join(repoA, 'late.txt'), 'late work\n');
  w.g(repoA, ['add', '-A']);
  w.g(repoA, ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '-m', 'late commit']);
  w.g(repoA, ['checkout', '-q', 'main']);
  const apply = w.rc('apply', ['--approved']);
  assert.equal(apply.code, 0);
  const skipped = apply.out.rows.filter((r) => r.result === 'SKIPPED_CHANGED_SINCE_PLAN');
  assert.deepEqual(skipped.map((r) => r.ref), ['repo-a:feat/landed-a']);
  assert.ok(w.g(repoA, ['branch', '--list', 'feat/landed-a']).includes('feat/landed-a'), 'the moved branch still exists');
  assert.equal(w.g(repoB, ['branch', '--list', 'feat/landed-b']).trim(), '', 'the other landed branch is deleted');
  assert.equal(apply.out.rows.find((r) => r.ref === 'repo-b:feat/landed-b').result, 'DELETED');
  // the dirty worktree stays and its WIP is rescued to a named branch
  assert.ok(fs.existsSync(w.ws.worktrees[1]), 'dirty worktree directory still exists');
  assert.ok(w.g(repoB, ['worktree', 'list']).includes('wt-dirty'));
  const rescued = apply.out.rows.find((r) => r.ref === 'repo-b:feat/dirty');
  assert.equal(rescued.result, 'RESCUED');
  assert.equal(w.g(repoB, ['show', rescued.rescue_branch + ':uncommitted.txt']), 'wip not committed\n');
  assert.equal(apply.out.rows.find((r) => r.ref === 'repo-a:feat/in-flight').result, 'KEPT');
  assert.equal(apply.out.rows.find((r) => r.ref === 'repo-a:feat/superseded').result, 'ARCHIVED');
  assert.equal(readJson(w.stateFile).phase, 'done');
});

function sliceRun(ids, o) {
  const ctx = materialize('feature-overnight');
  startSliceRun(ctx, ids, o);
  return ctx;
}

test('T-R4-17 usage limit parks and resume skips finished slices', () => {
  const ctx = sliceRun(['s1', 's2', 's3']);
  const wake = hookScript(ctx, 'wake-hook', { print: 'wake-7' });
  assert.equal(nextOf(ctx).out.slice_id, 's1');
  assert.equal(buildSlice(ctx, 's1', 'node -e "process.exit(0)"').code, 0);
  assert.equal(nextOf(ctx).out.slice_id, 's2');
  const lim = record(ctx, { slice_id: 's2', status: 'usage_limit' });
  assert.equal(lim.code, 3);
  assert.equal(stateOf(ctx).status, 'PARKED');
  const attemptsBefore = sliceOf(ctx, 's1').attempts;
  const resetAt = new Date(Date.now() - 1000).toISOString();
  const park = spine(ctx, ['park', '--reason', 'usage_limit', '--reset-at', resetAt], { DO_IT_HOST_WAKE: wake.file });
  assert.equal(park.code, 3);
  assert.equal(park.out.wake, 'scheduled');
  assert.equal(wake.calls(), 1, 'a wake-up request was made');
  // without a wake hook the park says so instead of pretending
  const bare = sliceRun(['s1', 's2', 's3']);
  assert.equal(record(bare, { slice_id: 's1', status: 'usage_limit' }).code, 3);
  const noWake = spine(bare, ['park', '--reason', 'usage_limit']);
  assert.equal(noWake.out.wake, 'unavailable');
  assert.match(noWake.out.say.join(' '), /no wake/);
  // resume from state alone: slices 2 and 3 only
  const res = spine(ctx, ['resume']);
  assert.equal(res.code, 0);
  assert.equal(stateOf(ctx).status, 'BUILDING');
  const ran = [];
  for (let i = 0; i < 6; i++) {
    const n = nextOf(ctx).out;
    if (n.action !== 'SPAWN') break;
    ran.push(n.slice_id);
    assert.equal(buildSlice(ctx, n.slice_id, 'node -e "process.exit(0)"').code, 0);
  }
  assert.deepEqual(ran, ['s2', 's3']);
  assert.equal(sliceOf(ctx, 's1').attempts, attemptsBefore, 'slice 1 was not run again');
  assert.equal(nextOf(ctx).out.outcome, 'FINISH_LINE_REACHED');
});

test('T-R4-18 failed slice retries one tier up then escalates', () => {
  const ctx = sliceRun(['s1']);
  const first = nextOf(ctx).out;
  assert.deepEqual([first.slice_id, first.tier], ['s1', 'T2']);
  const f1 = buildSlice(ctx, 's1', 'node -e "process.exit(1)"'); // the stub builder fails its contract
  assert.equal(f1.out.outcome, 'FAILED');
  assert.equal(sliceOf(ctx, 's1').attempts, 1);
  const retry = nextOf(ctx).out;
  assert.deepEqual([retry.slice_id, retry.tier, retry.reason], ['s1', 'T1', 'retry after FAILED']);
  const up = spineEvents(ctx).find((e) => e.event === 'tier_escalated');
  assert.deepEqual([up.detail.from, up.detail.to, up.detail.reason], ['T2', 'T1', 'retry after FAILED']);
  assert.ok(spineEvents(ctx).some((e) => e.event === 'slice_failed' && e.verdict === 'FAILED'), 'first failure recorded as FAILED');
  const f2 = buildSlice(ctx, 's1', 'node -e "process.exit(1)"');
  assert.equal(f2.out.outcome, 'ESCALATED');
  assert.equal(f2.code, 2);
  assert.equal(stateOf(ctx).status, 'ESCALATED');
  assert.equal(sliceOf(ctx, 's1').attempts, 2); // G-4
  const pack = readJson(path.join(runDirOf(ctx), 'owner-pack.json'));
  assert.equal(pack.questions.length, 1);
  assert.match(pack.questions[0].text, /s1/);
  assert.equal(spine(ctx, ['next']).out.action, 'NONE');
});

test('T-R4-19 owner gate blocks only its slice', () => {
  const ctx = sliceRun(['s1', 's2', 's3']);
  assert.equal(buildSlice(ctx, 's1', 'node -e "process.exit(0)"').code, 0);
  assert.equal(nextOf(ctx).out.slice_id, 's2');
  const reason = 'enabling the production flag needs the owner';
  writeJson(path.join(ctx.workdir, 'results', 'owner-gate-q.json'), { questions: [{ kind: 'owner-gate', text: 'Enable the production flag for s2?', options: ['yes', 'no'], recommendation: 'no', default: null, reversible: false }] });
  const blocked = record(ctx, { slice_id: 's2', status: 'blocked', reason, verdicts: [{ row: 's2', verdict: 'BLOCKED', evidence: reason }], pending_human: { questions_path: 'results/owner-gate-q.json' } });
  assert.equal(blocked.out.outcome, 'BLOCKED');
  assert.equal(sliceOf(ctx, 's2').status, 'BLOCKED');
  const fl = flRows(ctx);
  assert.equal(fl.find((r) => r.id === 's2').state, 'BLOCKED');
  assert.equal(fl.find((r) => r.id === 's2').reason, reason);
  // the other slices still finish
  const n = nextOf(ctx).out;
  assert.equal(n.slice_id, 's3');
  const s3 = buildSlice(ctx, 's3', 'node -e "process.exit(0)"');
  assert.equal(s3.out.outcome, 'BLOCKED'); // the last slice done, only the blocked one is left: the run settles to BLOCKED
  assert.equal(stateOf(ctx).status, 'BLOCKED');
  const fl2 = flRows(ctx);
  assert.deepEqual(['s1', 's3'].map((id) => fl2.find((r) => r.id === id).state), ['DONE', 'DONE']);
  const pack = readJson(path.join(runDirOf(ctx), 'owner-pack.json'));
  assert.equal(pack.questions.length, 1);
  assert.equal(pack.questions[0].kind, 'owner-gate');
  const c = spine(ctx, ['gate', 'conclude']);
  assert.equal(c.code, 0, c.stdout);
  assert.equal(stateOf(ctx).run_verdict, 'DONE_WITH_RESIDUALS');
  assert.notEqual(stateOf(ctx).run_verdict, 'DONE_ALL_VERIFIED');
});

test('T-R4-20 handoff failure retries then escalates (G-5)', () => {
  const ctx = sliceRun(['s1']);
  const hook = hookScript(ctx, 'continue-hook', { code: 1 }); // the handoff writer fails every attempt
  const env = { DO_IT_HOST_CONTINUE: hook.file };
  const ceil = spine(ctx, ['gate', 'ceiling', '--ctx-tokens', '190000', '--window', '200000']);
  assert.equal(ceil.out.outcome, 'CEILING_BLOCKED');
  const n0 = nextOf(ctx);
  assert.equal(n0.out.outcome, 'CEILING_BLOCKED');
  assert.equal(n0.out.handoff_written, false);
  assert.equal(spine(ctx, ['resume']).out.outcome, 'CEILING_BLOCKED', 'resume refuses without a handoff file');
  const outs = [];
  for (let i = 0; i < 5; i++) outs.push(spine(ctx, ['handoff'], env));
  assert.deepEqual(outs.slice(0, 4).map((x) => x.out.outcome), Array(4).fill('HANDOFF_FAILED'));
  assert.equal(outs[4].out.outcome, 'ESCALATED');
  assert.equal(outs[4].code, 2);
  assert.equal(spineEvents(ctx).filter((e) => e.event === 'handoff_failed').length, 5, 'HANDOFF_FAILED recorded on each failure');
  assert.equal(stateOf(ctx).status, 'ESCALATED');
  assert.equal(stateOf(ctx).handoffs, 5);
  const sixth = spine(ctx, ['handoff'], env);
  assert.equal(sixth.out.outcome, 'ESCALATED');
  assert.equal(hook.calls(), 5, 'attempts stop at 5: no sixth process');
  const after = nextOf(ctx);
  assert.equal(after.out.outcome, 'CEILING_BLOCKED'); // still blocked until a fresh conductor resumes from the handoff
  assert.equal(after.out.handoff_written, true);
});

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
    const r = runFixture({ fixture: 'feature-overnight', host, realCalls: false });
    assert.equal(r.exit, EXIT_NOT_AVAILABLE);
    assert.equal(r.outcome, 'IMPLEMENTED-NOT-VERIFIED');
    assert.equal(r.ctx, undefined, 'nothing ran');
  }
  assert.equal(runFixture({ fixture: 'reconcile', host: 'stub' }).exit, EXIT_NOT_AVAILABLE); // no stub roteiro: nothing is invented
});

test('R4-LIB stub meter rows are never labelled provider (G-6)', () => {
  const r = run('feature-overnight');
  const rows = readJsonl(path.join(runDirOf(r.ctx), 'token-meter.jsonl'));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((x) => x.source === 'estimate' && x.estimated === true));
});

test('R4-LIB sandbox sampler sees real git worktrees come and go (T-R4-05 machinery, not the case)', async () => {
  const ctx = materialize('weekly-drain');
  const wt = (n) => path.join(ctx.userHome, 'wt-' + n);
  const sample = await sampleWorktrees(ctx.workdir, async () => {
    for (const n of [1, 2]) git(ctx, ['worktree', 'add', '-q', '-b', 'sandbox-' + n, wt(n)]);
    await new Promise((r) => setTimeout(r, 120));
    for (const n of [1, 2]) git(ctx, ['worktree', 'remove', '--force', wt(n)]);
  }, { env: { ...process.env, HOME: ctx.userHome, GIT_CONFIG_GLOBAL: path.join(ctx.userHome, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null' } });
  assert.deepEqual([sample.before, sample.peak, sample.after], [1, 3, 1]);
  assert.equal(sandboxMismatch(sample, 2), null);
  assert.match(sandboxMismatch(sample, 4), /not 4/);
  assert.match(sandboxMismatch({ before: 1, peak: 3, after: 2 }, 2), /not reaped/);
});
