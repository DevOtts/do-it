// CP-03 round 6 regressions for the stop gate (G-1, CONTRACT 3.1): the reviewer's LOW findings, replayed
// through the built bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';

const made = [];
const mk = (o) => { const r = mkRepo(o); made.push(r.dir, r.home); return r; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function start(repo, session) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(real(repo, ['next', '--run', r.out.run_id]).code, 0);
  return r.out.run_id;
}
const hookStop = (repo, session) => real(repo, ['gate', 'stop', '--session', session, '--cwd', repo.dir]);
const stateOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json'));
const res = (a, o) => ({ schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, verdicts: [], ...o });
const patient = (repo) => writeJson(path.join(repo.doIt, 'settings.json'), { stop_gate: { patience: 50 } });

test('CP03 R6-S1-L1 a placeholder or invisible slice reason is no reason: the slice is not blocked and the run keeps gating', () => {
  const repo = mk();
  patient(repo);
  const a = start(repo, 'r6l1-s');
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), { decisions: [], preflight: { passed: true }, credentials: [], slices: [{ id: 's1' }] });
  const b = real(repo, ['gate', 'build', '--run', a]);
  assert.equal(stateOf(repo, a).status, 'BUILDING', b.stdout);
  const r = path.join(repo.dir, 'results', 'r.json');
  for (const reason of ['.', '​', 'n/a', ' ​​ ', 'x']) {
    writeJson(r, res(a, { slice_id: 's1', status: 'blocked', exit_code: 3, reason }));
    const out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
    assert.equal(out.out.outcome, 'BLOCK_REASON_REQUIRED', JSON.stringify(reason) + ' ' + out.stdout);
    assert.equal(stateOf(repo, a).status, 'BUILDING');
  }
  assert.equal(hookStop(repo, 'r6l1-s').out.outcome, 'STOP_REFUSED');
  // a real reason still blocks the slice, and the settle cause carries the cleaned reason
  writeJson(r, res(a, { slice_id: 's1', status: 'blocked', exit_code: 3, reason: ' STALE_HEAD​ ' }));
  const ok = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
  assert.notEqual(ok.out.outcome, 'BLOCK_REASON_REQUIRED', ok.stdout);
  const st = stateOf(repo, a);
  if (st.status === 'BLOCKED') assert.match(st.status_reason.reason, /\(STALE_HEAD\)$/);
});
test('CP03 R6-S1-L3 a board whose rows are not rows refuses the stop as unreadable, never INTERNAL_ERROR or allowed', () => {
  const repo = mk();
  patient(repo);
  start(repo, 'r6l3-s');
  const fl = path.join(repo.doIt, 'finish-line.json');
  for (const rows of [[null], [1, 2], ['T-1'], [[]], [{ id: 'T-1' }], [{ state: 'OPEN' }], [{ id: 7, state: 'OPEN' }]]) {
    fs.writeFileSync(fl, JSON.stringify({ rows }));
    const g = hookStop(repo, 'r6l3-s');
    assert.equal(g.out.outcome, 'STOP_REFUSED', JSON.stringify(rows) + ' ' + g.stdout);
    assert.match(g.out.board_error, /^EBOARD: row 0 /);
  }
});

