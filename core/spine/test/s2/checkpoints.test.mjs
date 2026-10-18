// review_checkpoints in READINESS.json (CHECKPOINT-POLICY v1): plan-it decides
// the count; the spine checks it, stores it on the run and makes each
// checkpoint a finish-line row that only a review-it verdict can close.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, unit, readJson, runDirOf, startRun, writeJson } from '../helpers.mjs';

const EXAMPLES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', 'docs', 'implementation', 'do-it-next', 'checkpoint-examples');

function readiness(repo, block) {
  const doc = {
    schema: 'do-it-readiness/1',
    decisions: [{ id: 'D1', state: 'RESOLVED' }],
    preflight: { passed: true },
    credentials: [],
    owner_dependent_slices: 0,
    slices: [{ id: 's1', lane: 'L1', tier: 'T3', class: 'implementation' }],
  };
  if (block !== undefined) doc.review_checkpoints = block;
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), doc);
}

const hstBlock = () => JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'harness-status-tracking.checkpoints.json'), 'utf8'));
const rows = (repo) => readJson(path.join(repo.doIt, 'finish-line.json')).rows;

test('T-CP-01 gate build seeds one finish-line row per checkpoint and stores the plan on the run [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  readiness(repo, hstBlock());
  const g = real(repo, ['gate', 'build']);
  assert.equal(g.code, 0, g.stdout);
  assert.equal(g.out.review_checkpoints, 5);
  const st = readJson(path.join(runDirOf(repo, id), 'state.json'));
  assert.equal(st.review_checkpoints.count, 5);
  assert.deepEqual(st.review_checkpoints.checkpoints.map((c) => c.kind), ['wave', 'wave', 'adversarial', 'pre-merge', 'pre-release']);
  const cp = rows(repo).filter((r) => r.id.startsWith('checkpoint:'));
  assert.deepEqual(cp.map((r) => r.id), ['checkpoint:CP-01', 'checkpoint:CP-02', 'checkpoint:CP-03', 'checkpoint:CP-04', 'checkpoint:CP-05']);
  assert.ok(cp.every((r) => r.state === 'OPEN'));
});

test('T-CP-02 a plan with no block keeps the old behaviour (no checkpoint rows)', () => {
  const repo = mkRepo();
  startRun(repo, unit);
  readiness(repo);
  const g = unit(repo, ['gate', 'build']);
  assert.equal(g.code, 0, g.stdout);
  assert.equal(g.out.review_checkpoints, 0);
  assert.equal(rows(repo).filter((r) => r.id.startsWith('checkpoint:')).length, 0);
});

test('T-CP-03 a tampered count or id sequence is READINESS_INVALID and the build does not start', () => {
  const cases = [
    (b) => ({ ...b, count: 2 }),
    (b) => ({ ...b, checkpoints: b.checkpoints.map((c, i) => (i === 0 ? { ...c, id: 'CP-07' } : c)) }),
    (b) => ({ ...b, schema: 'review-checkpoints/9' }),
    (b) => ({ ...b, checkpoints: b.checkpoints.map((c, i) => (i === 0 ? { ...c, kind: 'vibe' } : c)) }),
  ];
  for (const mutate of cases) {
    const repo = mkRepo();
    startRun(repo, unit);
    readiness(repo, mutate(hstBlock()));
    const g = unit(repo, ['gate', 'build']);
    assert.equal(g.code, 1, g.stdout);
    assert.equal(g.out.outcome, 'READINESS_INVALID');
  }
});

test('T-CP-04 zero-task plan: count 0 is valid and seeds no rows', () => {
  const repo = mkRepo();
  startRun(repo, unit);
  readiness(repo, { schema: 'review-checkpoints/1', level: 'none', count: 0, checkpoints: [] });
  const g = unit(repo, ['gate', 'build']);
  assert.equal(g.code, 0, g.stdout);
  assert.equal(g.out.review_checkpoints, 0);
});

// H-10: a checkpoint carries `gates` (what it holds) and `covers` (what it
// reviews); the spine accepts them, keeps old blocks valid, and still makes
// every checkpoint a finish-line row the run cannot close without.
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fixtures');
const threeWaves = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'three-waves.READINESS.json'), 'utf8'));

test('T-CP-05 gates, covers and slice waves are accepted and carried onto the run; every checkpoint is still a row [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), threeWaves());
  const g = real(repo, ['gate', 'build']);
  assert.equal(g.code, 0, g.stdout);
  assert.equal(g.out.review_checkpoints, 4);
  const st = readJson(path.join(runDirOf(repo, id), 'state.json'));
  const [cp1, , cp3, cp4] = st.review_checkpoints.checkpoints;
  assert.deepEqual(cp1.gates, ['dependents', 'promotion']);
  assert.deepEqual(cp1.covers, ['W0']);
  assert.equal(cp1.blocks, 'slices that depend on W0 work, and promotion of W0 work');
  assert.deepEqual(cp3.gates, ['merge']);
  assert.deepEqual(cp4.gates, ['release']);
  assert.deepEqual(st.slices.map((s) => [s.id, s.wave]), [['A0', 'W0'], ['B0', 'W0'], ['A1', 'W1'], ['B1', 'W1'], ['A2', 'W2'], ['B2', 'W2']]);
  assert.deepEqual(rows(repo).filter((r) => r.id.startsWith('checkpoint:')).map((r) => r.id), ['checkpoint:CP-01', 'checkpoint:CP-02', 'checkpoint:CP-03', 'checkpoint:CP-04']);
  // The run cannot close while a checkpoint row is open.
  const stop = real(repo, ['gate', 'stop']);
  assert.equal(stop.code, 1, stop.stdout);
  assert.equal(stop.out.outcome, 'STOP_REFUSED');
  assert.ok(stop.out.open.includes('checkpoint:CP-01'));
});

test('T-CP-06 an old block (no gates/covers, blocks "start of W2") stays valid and gets the corrected gates', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  // plan-it 5.1.0 output, before gates/covers existed.
  const old = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'legacy-5.1.0.checkpoints.json'), 'utf8'));
  assert.equal(old.checkpoints[0].blocks, 'start of W2');
  assert.ok(old.checkpoints.every((c) => c.gates === undefined && c.covers === undefined));
  readiness(repo, old);
  assert.equal(unit(repo, ['gate', 'build']).code, 0);
  const cps = readJson(path.join(runDirOf(repo, id), 'state.json')).review_checkpoints.checkpoints;
  assert.deepEqual(cps.map((c) => c.gates), [['dependents', 'promotion'], ['dependents', 'promotion'], ['merge'], ['merge'], ['release']]);
  assert.ok(cps.every((c) => c.covers === null));
  assert.equal(readJson(path.join(runDirOf(repo, id), 'state.json')).slices[0].wave, null);
});

test('T-CP-07 an unknown gate or a malformed covers is READINESS_INVALID', () => {
  const cases = [
    (d) => { d.review_checkpoints.checkpoints[0].gates = ['next-wave']; },
    (d) => { d.review_checkpoints.checkpoints[0].gates = []; },
    (d) => { d.review_checkpoints.checkpoints[0].covers = 'W0'; },
    (d) => { d.slices[0].wave = 3; },
  ];
  for (const mutate of cases) {
    const repo = mkRepo();
    startRun(repo, unit);
    const doc = threeWaves();
    mutate(doc);
    writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), doc);
    const g = unit(repo, ['gate', 'build']);
    assert.equal(g.code, 1, g.stdout);
    assert.equal(g.out.outcome, 'READINESS_INVALID');
  }
});

// Audit (verdict-reader loophole): a checkpoint row used to close on any
// VERIFIED verdict whose evidence file merely existed. It now closes only on
// the checkpoint's own verdict file passing the reader rule.
function recordCheckpoint(repo, row, evidence) {
  writeJson(path.join(repo.dir, 'results', 'cp.json'), {
    schema: 'it-result/1', stage: 'review-it', run_id: repo.runId, slice_id: null, version: '0.1.0', head_sha: null,
    status: 'ok', exit_code: 0, verdicts: [{ row, verdict: 'VERIFIED', evidence }], run_verdict: null, next: null, pending_human: null, artifacts: [],
  });
  return unit(repo, ['record', '--result', 'results/cp.json']);
}

function builtRepo() {
  const repo = mkRepo();
  repo.runId = startRun(repo, unit);
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), threeWaves());
  assert.equal(unit(repo, ['gate', 'build']).code, 0);
  return repo;
}
const cpRow = (repo, id) => rows(repo).find((r) => r.id === 'checkpoint:' + id);
const FENCE = '`'.repeat(3);

test('T-CP-08 a checkpoint row closes only on its own verdict file saying PASS by the reader rule', () => {
  const bad = [
    ['PASS then FAIL', 'checkpoint: CP-01\nverdict: PASS\nverdict: FAIL\n', /contradictory/],
    ['FAIL then PASS', 'checkpoint: CP-01\nverdict: FAIL\nverdict: PASS\n', /contradictory/],
    ['PASS in a fence, FAIL outside', 'checkpoint: CP-01\n' + FENCE + '\nverdict: PASS\n' + FENCE + '\nverdict: FAIL\n', /fail/],
    ['PASS in an HTML comment', 'checkpoint: CP-01\n<!-- verdict: PASS -->\n', /invalid/],
    ['lowercase pass', 'checkpoint: CP-01\nverdict: pass\n', /invalid/],
    ['value GO', 'checkpoint: CP-01\nverdict: GO\n', /invalid/],
    ['names another checkpoint', 'checkpoint: CP-02\nverdict: PASS\n', /does not name checkpoint CP-01/],
  ];
  for (const [name, body, re] of bad) {
    const repo = builtRepo();
    const ev = 'plan/reviews/CP-01-wave-w0.md';
    fs.mkdirSync(path.join(repo.doIt, 'plan', 'reviews'), { recursive: true });
    fs.writeFileSync(path.join(repo.doIt, ev), body);
    const r = recordCheckpoint(repo, 'checkpoint:CP-01', '.do-it/' + ev);
    assert.equal(r.code, 1, name + ': ' + r.stdout);
    assert.equal(r.out.outcome, 'CHECKPOINT_NOT_PASS', name);
    assert.match(r.out.checkpoints[0].reason, re, name);
    assert.equal(cpRow(repo, 'CP-01').state, 'OPEN', name);
  }
});

test('T-CP-09 two identical PASS lines close the row; any other file than the checkpoint verdict file does not', () => {
  const repo = builtRepo();
  fs.mkdirSync(path.join(repo.doIt, 'plan', 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(repo.doIt, 'plan', 'reviews', 'other.md'), 'checkpoint: CP-01\nverdict: PASS\n');
  let r = recordCheckpoint(repo, 'checkpoint:CP-01', '.do-it/plan/reviews/other.md');
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.out.checkpoints[0].reason, /must be the checkpoint verdict file/);
  assert.equal(cpRow(repo, 'CP-01').state, 'OPEN');
  fs.writeFileSync(path.join(repo.doIt, 'plan', 'reviews', 'CP-01-wave-w0.md'), 'checkpoint: CP-01\nverdict: PASS\n\nverdict: PASS\n');
  r = recordCheckpoint(repo, 'checkpoint:CP-01', '.do-it/plan/reviews/CP-01-wave-w0.md');
  assert.equal(r.code, 0, r.stdout);
  assert.equal(cpRow(repo, 'CP-01').state, 'DONE');
});

test('T-CP-10 a depends_on that is not a list of strings, or a cycle, is READINESS_INVALID', () => {
  const cases = [
    [(d) => { d.slices[3].depends_on = 'A0'; }, null],
    [(d) => { d.slices[3].depends_on = 7; }, null],
    [(d) => { d.slices[3].depends_on = ['A0', null]; }, null],
    [(d) => { d.slices[0].depends_on = ['B1']; }, /cycle: A0 -> B1 -> A0/],
    [(d) => { d.slices[0].depends_on = ['A2']; }, /cycle: A0 -> A2 -> B1 -> A0/],
  ];
  for (const [mutate, re] of cases) {
    const repo = mkRepo();
    startRun(repo, unit);
    const doc = threeWaves();
    mutate(doc);
    writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), doc);
    const g = unit(repo, ['gate', 'build']);
    assert.equal(g.code, 1, g.stdout);
    assert.equal(g.out.outcome, 'READINESS_INVALID');
    if (re) assert.match(JSON.stringify(g.out.errors), re);
  }
});
