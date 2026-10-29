// BCL r11 frictions: status aliases, multi-round checkpoint files, package auto-close,
// and the stop gate's run scope.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, unit, readJson, runDirOf, startRun, writeJson } from '../helpers.mjs';
import { parseVerdict } from '../../src/verdict-file.mjs';

function result(repo, name, over) {
  writeJson(path.join(repo.dir, 'results', name), {
    schema: 'it-result/1', stage: 'build-it', run_id: repo.runId, slice_id: null, version: '0.1.0', head_sha: null,
    status: 'ok', exit_code: 0, verdicts: [], run_verdict: null, next: null, pending_human: null, artifacts: [], ...over,
  });
  return unit(repo, ['record', '--result', 'results/' + name]);
}
const flRows = (repo) => readJson(path.join(repo.doIt, 'finish-line.json')).rows;

test('T-FR-01 status done, pass and success are recorded as ok; other words stay RESULT_INVALID', () => {
  for (const alias of ['done', 'pass', 'success', 'DONE']) {
    const repo = mkRepo();
    repo.runId = startRun(repo, unit);
    const r = result(repo, 'a.json', { status: alias });
    assert.equal(r.code, 0, alias + ': ' + r.stdout);
    const stored = fs.readdirSync(path.join(runDirOf(repo, repo.runId), 'results')).map((f) => readJson(path.join(runDirOf(repo, repo.runId), 'results', f)));
    assert.deepEqual(stored.map((s) => s.status), ['ok'], alias);
  }
  for (const bad of ['complete', 'passed', 'OK?', '']) {
    const repo = mkRepo();
    repo.runId = startRun(repo, unit);
    const r = result(repo, 'a.json', { status: bad });
    assert.equal(r.out.outcome, 'RESULT_INVALID', bad);
  }
});

test('T-FR-02 an alias keeps its exit-code contract (done with exit 1 is still refused)', () => {
  const repo = mkRepo();
  repo.runId = startRun(repo, unit);
  const r = result(repo, 'a.json', { status: 'done', exit_code: 1 });
  assert.equal(r.out.outcome, 'EXIT_CODE_MISMATCH');
});

const R1 = '## Round 1\ncheckpoint: CP-04\nverdict: PASS\n\n## Re-review r8\nverdict: FAIL\n\n## Re-review r11\nverdict: PASS\n';
test('T-FR-03 superseded rounds: the last Re-review section decides; flat contradictions stay contradictory', () => {
  assert.equal(parseVerdict(R1, 'CP-04').state, 'pass');
  assert.equal(parseVerdict(R1.replace(/verdict: PASS\n$/, 'verdict: FAIL\n'), 'CP-04').state, 'fail');
  assert.equal(parseVerdict('checkpoint: CP-04\nverdict: PASS\nverdict: FAIL\n', 'CP-04').state, 'contradictory');
  assert.equal(parseVerdict('checkpoint: CP-04\nverdict: PASS\n\n## Re-review\nverdict: PASS\nverdict: FAIL\n', 'CP-04').state, 'contradictory');
});

test('T-FR-04 an explicit "Final verdict:" line wins over earlier verdict lines', () => {
  assert.equal(parseVerdict('checkpoint: CP-04\nverdict: FAIL\nverdict: PASS\nFinal verdict: PASS\n', 'CP-04').state, 'pass');
  assert.equal(parseVerdict('checkpoint: CP-04\nverdict: PASS\nFinal verdict: FAIL\n', 'CP-04').state, 'fail');
  assert.equal(parseVerdict('checkpoint: CP-04\nverdict: PASS\nFinal verdict: MAYBE\n', 'CP-04').state, 'invalid');
  assert.equal(parseVerdict('checkpoint: CP-04\nFinal verdict: PASS\nFinal verdict: FAIL\n', 'CP-04').state, 'contradictory');
});

function seedBoard(repo, rows) {
  writeJson(path.join(repo.doIt, 'finish-line.json'), {
    rows: rows.map(([id, kind, state, extra]) => ({ id, kind, state, evidence: null, owner_question: null, reason: null, archived_to: null, ...(extra || {}) })),
  });
}
function evFile(repo) {
  fs.mkdirSync(path.join(repo.dir, 'ev'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, 'ev', 'e.txt'), 'proof\n');
  return 'ev/e.txt';
}

test('T-FR-05 a package row closes DONE when its last case row is verified', () => {
  const repo = mkRepo();
  repo.runId = startRun(repo, unit);
  const ev = evFile(repo);
  seedBoard(repo, [['F4', 'package', 'OPEN'], ['F40', 'package', 'OPEN'], ['T-F4-01', 'dod', 'DONE', { evidence: ev }], ['T-F4-02', 'dod', 'OPEN'], ['T-F40-01', 'dod', 'OPEN']]);
  let r = result(repo, 'a.json', { verdicts: [{ row: 'T-F4-02', verdict: 'VERIFIED', evidence: ev }] });
  assert.equal(r.code, 0, r.stdout);
  const byId = Object.fromEntries(flRows(repo).map((x) => [x.id, x]));
  assert.equal(byId.F4.state, 'DONE');
  assert.match(byId.F4.evidence, /T-F4-01/);
  assert.equal(byId.F40.state, 'OPEN', 'T-F4-* must not match T-F40-*');
});

test('T-FR-06 a package with a blocked case row closes BLOCKED and names it; an open case row keeps it OPEN', () => {
  const repo = mkRepo();
  repo.runId = startRun(repo, unit);
  const ev = evFile(repo);
  seedBoard(repo, [['M1', 'package', 'OPEN'], ['T-M1-01', 'dod', 'DONE', { evidence: ev }], ['T-M1-02', 'dod', 'OPEN'], ['L0', 'package', 'OPEN'], ['T-L0-01', 'dod', 'OPEN'], ['T-L0-02', 'dod', 'OPEN']]);
  const r = result(repo, 'a.json', { verdicts: [{ row: 'T-M1-02', verdict: 'BLOCKED', evidence: 'needs owner' }, { row: 'T-L0-01', verdict: 'VERIFIED', evidence: ev }] });
  assert.equal(r.code, 0, r.stdout);
  const byId = Object.fromEntries(flRows(repo).map((x) => [x.id, x]));
  assert.equal(byId.M1.state, 'BLOCKED');
  assert.match(byId.M1.reason, /T-M1-02/);
  assert.equal(byId.L0.state, 'OPEN');
});

test('T-FR-07 a package with no case rows is left alone', () => {
  const repo = mkRepo();
  repo.runId = startRun(repo, unit);
  const ev = evFile(repo);
  seedBoard(repo, [['H9', 'package', 'OPEN'], ['other', 'dod', 'OPEN']]);
  const r = result(repo, 'a.json', { verdicts: [{ row: 'other', verdict: 'VERIFIED', evidence: ev }] });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(flRows(repo).find((x) => x.id === 'H9').state, 'OPEN');
});

function twoRuns(repo) {
  const a = real(repo, ['start', '--preset', 'feature', '--request', 'A', '--session', 'sess-A']);
  const b = real(repo, ['start', '--preset', 'feature', '--request', 'B', '--session', 'sess-B']);
  assert.equal(a.code, 0, a.stdout);
  assert.equal(b.code, 0, b.stdout);
  seedBoard(repo, [['T-1', 'dod', 'OPEN']]);
  return { a: a.out.run_id, b: b.out.run_id };
}

test('T-FR-08 the stop gate gates only the run its session owns [REAL]', () => {
  const repo = mkRepo();
  const { a } = twoRuns(repo);
  const own = real(repo, ['gate', 'stop', '--session', 'sess-A', '--cwd', repo.dir]);
  assert.equal(own.out.outcome, 'STOP_REFUSED', own.stdout);
  assert.equal(own.out.run_id, a, 'newest run is B, but A is the session\'s own');
  const other = real(repo, ['gate', 'stop', '--session', 'sess-C', '--cwd', repo.dir]);
  assert.equal(other.out.outcome, 'STOP_ALLOWED', other.stdout);
  assert.equal(other.code, 0);
  assert.equal(other.out.owned, false);
  const st = readJson(path.join(runDirOf(repo, a), 'state.json'));
  assert.equal(st.stop_refusals, 1, 'the foreign session did not touch run state');
});

test('T-FR-09 runs without an owner (older state files) still gate every session', () => {
  const repo = mkRepo();
  startRun(repo, real);
  seedBoard(repo, [['T-1', 'dod', 'OPEN']]);
  const r = real(repo, ['gate', 'stop', '--session', 'any', '--cwd', repo.dir]);
  assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
  const noSession = real(repo, ['gate', 'stop']);
  assert.equal(noSession.out.outcome, 'STOP_REFUSED', noSession.stdout);
});

test('T-FR-10 a run started without --session is owned by its cwd; another cwd is not gated', () => {
  const repo = mkRepo();
  const s = real(repo, ['start', '--preset', 'feature', '--request', 'A']);
  assert.equal(s.code, 0, s.stdout);
  seedBoard(repo, [['T-1', 'dod', 'OPEN']]);
  assert.equal(real(repo, ['gate', 'stop', '--session', 'x', '--cwd', repo.dir]).out.outcome, 'STOP_REFUSED');
  const elsewhere = path.join(repo.dir, 'sub');
  fs.mkdirSync(elsewhere);
  assert.equal(real(repo, ['gate', 'stop', '--session', 'x', '--cwd', '/tmp']).out.outcome, 'STOP_ALLOWED');
});
