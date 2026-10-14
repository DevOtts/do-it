import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, unit, readJson, readJsonl, runDirOf, sha, startRun, writeJson } from '../helpers.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { loadState, writeState } from '../../src/state.mjs';

const EXIT = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };

function put(repo, rel, content) {
  const f = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

function result(runId, o) {
  const status = (o && o.status) || 'ok';
  return {
    schema: 'it-result/1',
    stage: 'build-it',
    run_id: runId,
    slice_id: null,
    version: '0.1.0',
    head_sha: null,
    status,
    exit_code: EXIT[status],
    verdicts: [],
    run_verdict: null,
    next: null,
    pending_human: null,
    artifacts: [],
    resume: { state_files: [], next_action: '' },
    tokens: { meter: '', peak_ctx: 0, tier_mix: { T1: 0, T2: 0, T3: 0 }, estimated: false },
    ...(o || {}),
  };
}

function record(runner, repo, rel, obj, env) {
  writeJson(path.join(repo.dir, rel), obj);
  return runner(repo, ['record', '--result', rel], env);
}

function ledgerOf(repo, runId) {
  const f = path.join(runDirOf(repo, runId), 'ledger.json');
  return fs.existsSync(f) ? readJson(f) : { rows: [] };
}

function flOf(repo) {
  const f = path.join(repo.doIt, 'finish-line.json');
  return fs.existsSync(f) ? readJson(f) : { rows: [] };
}

function stateOf(repo, runId) {
  return readJson(path.join(runDirOf(repo, runId), 'state.json'));
}

function row(ledger, id) {
  return ledger.rows.find((r) => r.row === id);
}

function verdictRow(r, o) {
  return { row: r, verdict: 'VERIFIED', evidence: 'proof/out.txt', real: false, ...(o || {}) };
}

test('T-S3-01 G-2 VERIFIED with resolvable evidence is accepted [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  const f = put(repo, 'proof/out.txt', 'ok');
  const r = record(real, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1')] }));
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'RECORDED');
  const lr = row(ledgerOf(repo, runId), 'DOD-1');
  assert.equal(lr.verdict, 'VERIFIED');
  assert.equal(lr.evidence_sha256, sha(f));
  const fl = flOf(repo).rows.find((x) => x.id === 'DOD-1');
  assert.equal(fl.state, 'DONE');
  assert.equal(fl.evidence, 'proof/out.txt');
});

test('T-S3-02 G-2 VERIFIED with empty evidence is refused', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  writeJson(path.join(repo.doIt, 'finish-line.json'), { rows: [{ id: 'DOD-1', kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null }] });
  const r = record(unit, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1', { evidence: '' })] }));
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'EVIDENCE_REQUIRED');
  assert.deepEqual(r.out.rows, ['DOD-1']);
  assert.equal(row(ledgerOf(repo, runId), 'DOD-1'), undefined);
  assert.equal(flOf(repo).rows.find((x) => x.id === 'DOD-1').state, 'OPEN');
});

test('T-S3-03 G-2 VERIFIED with unresolvable evidence is refused', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const r = record(unit, repo, 'results/r1.json', result(runId, {
    verdicts: [verdictRow('DOD-1', { evidence: 'proof/missing.txt' }), verdictRow('DOD-2', { evidence: 'sha256:' + '0'.repeat(64) })],
  }));
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'EVIDENCE_UNRESOLVED');
  assert.deepEqual(r.out.rows.sort(), ['DOD-1', 'DOD-2']);
  assert.deepEqual(ledgerOf(repo, runId).rows, []);
});

test('T-S3-04 G-3 real row on a mock artifact is refused', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  put(repo, 'proof/mock.txt', 'canned response');
  const r = record(unit, repo, 'results/r1.json', result(runId, {
    verdicts: [verdictRow('DOD-1', { real: true, evidence: 'proof/mock.txt' })],
    artifacts: [{ path: 'proof/mock.txt', kind: 'mock', sha256: '' }],
  }));
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'REAL_ON_MOCK');
  assert.equal(row(ledgerOf(repo, runId), 'DOD-1').verdict, 'IMPLEMENTED-NOT-VERIFIED');
  const c = unit(repo, ['gate', 'conclude']);
  assert.equal(c.code, 0);
  assert.notEqual(c.out.run_verdict, 'DONE_ALL_VERIFIED');
});

test('T-S3-05 G-3 unreachable target is IMPLEMENTED-NOT-VERIFIED', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  fs.writeFileSync(path.join(runDirOf(repo, runId), 'results', 'unreachable.txt'), 'connection refused');
  put(repo, 'proof/out.txt', 'ok');
  const r = record(unit, repo, 'results/r1.json', result(runId, {
    verdicts: [
      verdictRow('DOD-1', { verdict: 'IMPLEMENTED-NOT-VERIFIED', real: true, evidence: 'result:unreachable.txt' }),
      verdictRow('DOD-2'),
    ],
  }));
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'RECORDED');
  const c = unit(repo, ['gate', 'conclude']);
  assert.equal(c.code, 0);
  assert.equal(c.out.run_verdict, 'DONE_WITH_RESIDUALS');
  assert.deepEqual(c.out.residuals, ['DOD-1']);
});

test('T-S3-06 it-result/1 schema violations are named', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  put(repo, 'proof/out.txt', 'ok');
  const base = result(runId, { verdicts: [verdictRow('DOD-1')] });
  const noStage = { ...base };
  delete noStage.stage;
  const cases = [
    [noStage, '/stage'],
    [{ ...base, status: 'weird' }, '/status'],
    [{ ...base, verdicts: [verdictRow('DOD-1', { verdict: 'PASS' })] }, '/verdicts/0/verdict'],
  ];
  for (const [obj, pointer] of cases) {
    const r = record(unit, repo, 'results/bad.json', obj);
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'RESULT_INVALID');
    assert.ok(r.out.errors.some((e) => e.pointer === pointer), pointer + ' in ' + JSON.stringify(r.out.errors));
  }
  assert.deepEqual(ledgerOf(repo, runId).rows, []);
  assert.equal(stateOf(repo, runId).status, 'INTAKE');
});

test('T-S3-07 exit_code must mirror status', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  for (const [status, got, expected] of [['ok', 1, 0], ['needs_human', 0, 2]]) {
    const r = record(unit, repo, 'results/bad.json', { ...result(runId, { status }), exit_code: got });
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'EXIT_CODE_MISMATCH');
    assert.equal(r.out.expected, expected);
  }
  assert.equal(stateOf(repo, runId).status, 'INTAKE');
  assert.deepEqual(fs.readdirSync(path.join(runDirOf(repo, runId), 'results')), []);
});

test('T-S3-08 all six statuses record with the mirrored code', () => {
  const expectRun = { ok: 'INTAKE', failed: 'FAILED', needs_human: 'NEEDS_HUMAN', blocked: 'BLOCKED', usage_limit: 'PARKED', context_reset: 'INTAKE' };
  for (const status of Object.keys(EXIT)) {
    const repo = mkRepo();
    const runId = startRun(repo, unit);
    const r = record(unit, repo, 'results/r.json', result(runId, { status }));
    assert.equal(r.out.outcome, 'RECORDED', status);
    assert.equal(r.code, EXIT[status], status);
    assert.equal(stateOf(repo, runId).status, expectRun[status], status);
  }
  // a matched slice moves on its own, the run stays BUILDING for failed and blocked
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const ctx = makeCtx({ cwd: repo.dir, env: repo.env });
  const st = loadState(ctx, runId);
  st.status = 'BUILDING';
  st.slices.push({ id: 's1', lane: 'L1', tier: 'T2', status: 'RUNNING', attempts: 0, escalations: 0 });
  writeState(ctx, st);
  record(unit, repo, 'results/r.json', result(runId, { status: 'failed', slice_id: 's1' }));
  const after = stateOf(repo, runId);
  assert.equal(after.status, 'BUILDING');
  assert.deepEqual([after.slices[0].status, after.slices[0].attempts], ['FAILED', 1]);
});

test('T-S3-09 result for another run is refused', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const r = record(unit, repo, 'results/r.json', result('other-run', {}));
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'RUN_ID_MISMATCH');
  assert.deepEqual(fs.readdirSync(path.join(runDirOf(repo, runId), 'results')), []);
});

test('T-S3-10 adversarial: evidence tampered between record and gate [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  const f = put(repo, 'proof/out.txt', 'AAAAAAAA');
  const rec = record(real, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1')] }));
  assert.equal(rec.code, 0);
  const st = fs.statSync(f);
  fs.writeFileSync(f, 'BBBBBBBB');
  fs.utimesSync(f, st.atimeMs / 1000, st.mtimeMs / 1000);
  assert.ok(Math.abs(fs.statSync(f).mtimeMs - st.mtimeMs) < 1, 'mtime restored: only the hash can reveal the change');
  const g = real(repo, ['gate', 'verify']);
  assert.equal(g.code, 1);
  assert.equal(g.out.outcome, 'EVIDENCE_CHANGED');
  assert.deepEqual(g.out.rows, ['DOD-1']);
  assert.equal(row(ledgerOf(repo, runId), 'DOD-1').verdict, 'IMPLEMENTED-NOT-VERIFIED');
  assert.equal(flOf(repo).rows.find((x) => x.id === 'DOD-1').state, 'OPEN');
  assert.ok(readJsonl(path.join(runDirOf(repo, runId), 'events.jsonl')).some((e) => e.event === 'evidence_changed'));
});

test('T-S3-11 G-13 conclude refuses an unaccounted row [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  put(repo, 'proof/out.txt', 'ok');
  const open = (id) => ({ id, kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null });
  writeJson(path.join(repo.doIt, 'finish-line.json'), { rows: [open('DOD-1'), open('DOD-2')] });
  assert.equal(record(real, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1')] })).code, 0);
  const c = real(repo, ['gate', 'conclude']);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'CONCLUDE_REFUSED');
  assert.equal(c.out.reason, 'unaccounted_row');
  assert.deepEqual(c.out.ids, ['DOD-2']);
  assert.equal(stateOf(repo, runId).status, 'INTAKE');
});

test('T-S3-12 G-13 conclude refuses a live worker', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  put(repo, 'proof/out.txt', 'ok');
  record(unit, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1')] }));
  const ctx = makeCtx({ cwd: repo.dir, env: repo.env });
  const st = loadState(ctx, runId);
  st.slices.push({ id: 's7', lane: 'L1', tier: 'T2', status: 'RUNNING', attempts: 0, escalations: 0 });
  writeState(ctx, st);
  const c = unit(repo, ['gate', 'conclude']);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'CONCLUDE_REFUSED');
  assert.equal(c.out.reason, 'live_worker');
  assert.deepEqual(c.out.ids, ['s7']);
});

test('T-S3-13 G-13 conclude refuses a pending wake', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  put(repo, 'proof/out.txt', 'ok');
  record(unit, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1')] }));
  const wake = path.join(runDirOf(repo, runId), 'wake.json');
  writeJson(wake, { status: 'scheduled', id: 'wake-1' });
  const c = unit(repo, ['gate', 'conclude']);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'CONCLUDE_REFUSED');
  assert.equal(c.out.reason, 'pending_wake');
  writeJson(wake, { status: 'consumed', id: 'wake-1' });
  assert.equal(unit(repo, ['gate', 'conclude']).code, 0);
});

test('T-S3-14 conclude closes when everything is accounted [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  put(repo, 'proof/a.txt', 'a');
  put(repo, 'proof/b.txt', 'b');
  assert.equal(record(real, repo, 'results/r1.json', result(runId, { verdicts: [verdictRow('DOD-1', { evidence: 'proof/a.txt' }), verdictRow('DOD-2', { evidence: 'proof/b.txt' })] })).code, 0);
  const c = real(repo, ['gate', 'conclude']);
  assert.equal(c.code, 0);
  assert.equal(c.out.outcome, 'CONCLUDED');
  assert.equal(c.out.run_verdict, 'DONE_ALL_VERIFIED');
  const st = stateOf(repo, runId);
  assert.equal(st.status, 'DONE');
  assert.equal(st.run_verdict, 'DONE_ALL_VERIFIED');
  const l = ledgerOf(repo, runId);
  assert.deepEqual(l.rows.map((r) => r.verdict), ['VERIFIED', 'VERIFIED']);
  assert.ok(l.rows.every((r) => /^[0-9a-f]{64}$/.test(r.evidence_sha256)));
});

function deployFixture(repo, runId, runner) {
  put(repo, 'proof/api.txt', 'api deployed');
  put(repo, 'proof/worker.txt', 'worker deployed');
  put(repo, 'proof/web.txt', 'web failed');
  return record(runner, repo, 'results/deploy.json', result(runId, {
    stage: 'deploy-it',
    status: 'failed',
    legs: [
      { leg: 'api', state: 'DEPLOYED_VERIFIED', evidence: 'proof/api.txt', compensate: 'rollback api' },
      { leg: 'worker', state: 'DEPLOYED_VERIFIED', evidence: 'proof/worker.txt', compensate: 'rollback worker' },
      { leg: 'web', state: 'FAILED', evidence: 'proof/web.txt' },
    ],
  }));
}

function rollback(runner, repo, runId, leg, o) {
  const ev = 'proof/rollback-' + leg + '.txt';
  put(repo, ev, 'rolled back ' + leg);
  const status = (o && o.status) || 'ok';
  return record(runner, repo, 'results/rollback-' + leg + '.json', result(runId, {
    stage: 'deploy-it',
    status,
    legs: [{ leg, state: status === 'ok' ? 'ROLLED_BACK' : 'FAILED', evidence: ev }],
  }));
}

test('T-S3-15 multi-leg deploy ends in PARTIAL_FAILURE', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const r = deployFixture(repo, runId, unit);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'PARTIAL_FAILURE');
  const st = stateOf(repo, runId);
  assert.equal(st.status, 'PARTIAL_FAILURE');
  assert.equal(st.run_verdict === undefined ? null : st.run_verdict, null);
  const n = unit(repo, ['next']);
  assert.equal(n.out.action, 'ROLLBACK');
  assert.deepEqual(n.out.legs, ['worker', 'api']);
  assert.ok(!n.out.legs.includes('web'));
});

test('T-S3-16 compensation ends in ROLLED_BACK', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  deployFixture(repo, runId, unit);
  const a = rollback(unit, repo, runId, 'worker');
  assert.equal(a.code, 0);
  assert.equal(stateOf(repo, runId).status, 'PARTIAL_FAILURE');
  const b = rollback(unit, repo, runId, 'api');
  assert.equal(b.out.outcome, 'ROLLED_BACK');
  assert.equal(stateOf(repo, runId).status, 'ROLLED_BACK');
  const ledger = ledgerOf(repo, runId);
  for (const leg of ['worker', 'api']) assert.match(row(ledger, 'ROLLBACK:' + leg).evidence_sha256, /^[0-9a-f]{64}$/);
  const c = unit(repo, ['gate', 'conclude']);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'CONCLUDE_REFUSED');
  assert.equal(c.out.reason, 'deploy_not_reverified');
});

test('T-S3-17 failed rollback ends in ESCALATED', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  deployFixture(repo, runId, unit);
  const r = rollback(unit, repo, runId, 'api', { status: 'failed' });
  assert.equal(r.code, 2);
  assert.equal(r.out.outcome, 'ESCALATED');
  assert.equal(stateOf(repo, runId).status, 'ESCALATED');
  const pack = readJson(path.join(runDirOf(repo, runId), 'owner-pack.json'));
  assert.equal(pack.questions.length, 1);
  assert.match(pack.questions[0].text, /leg api/);
  assert.match(pack.questions[0].text, /proof\/rollback-api\.txt/);
  const n = unit(repo, ['next']);
  assert.equal(n.out.action, 'NONE');
  assert.equal(n.out.reason, 'escalated');
});

test('T-S3-18 recovery: re-verify after ROLLED_BACK', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  deployFixture(repo, runId, unit);
  rollback(unit, repo, runId, 'worker');
  rollback(unit, repo, runId, 'api');
  const past = new Date(Date.now() - 60000);
  for (const n of ['api', 'worker']) fs.utimesSync(path.join(repo.dir, 'proof', n + '.txt'), past, past);
  const redeploy = (api, worker) => record(unit, repo, 'results/redeploy.json', result(runId, {
    stage: 'deploy-it',
    legs: [
      { leg: 'api', state: 'DEPLOYED_VERIFIED', evidence: api },
      { leg: 'worker', state: 'DEPLOYED_VERIFIED', evidence: worker },
    ],
  }));
  const stale = redeploy('proof/api.txt', 'proof/worker.txt');
  assert.equal(stale.code, 1);
  assert.equal(stale.out.outcome, 'REVERIFY_REQUIRED');
  assert.equal(stateOf(repo, runId).status, 'ROLLED_BACK');
  put(repo, 'proof/api-2.txt', 'api redeployed');
  put(repo, 'proof/worker-2.txt', 'worker redeployed');
  const fresh = redeploy('proof/api-2.txt', 'proof/worker-2.txt');
  assert.equal(fresh.code, 0);
  assert.equal(stateOf(repo, runId).status, 'PROVING');
});

test('T-S3-19 recovery: crash between ledger and state, replay converges [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  put(repo, 'proof/out.txt', 'ok');
  const res = result(runId, { verdicts: [verdictRow('DOD-1')] });
  const first = record(real, repo, 'results/r1.json', res, { DO_IT_FAULT: 'after_ledger' });
  assert.equal(first.code, 1);
  assert.equal(first.out.outcome, 'FAULT_INJECTED');
  const journal = path.join(runDirOf(repo, runId), 'record.journal.json');
  assert.ok(fs.existsSync(journal));
  const second = real(repo, ['record', '--result', 'results/r1.json']);
  assert.equal(second.code, 0);
  assert.equal(second.out.outcome, 'RECORDED');
  assert.equal(ledgerOf(repo, runId).rows.filter((r) => r.row === 'DOD-1').length, 1);
  assert.equal(real(repo, ['status']).code, 0);
  assert.ok(!fs.existsSync(journal));
  assert.equal(flOf(repo).rows.find((x) => x.id === 'DOD-1').state, 'DONE');
});
