// CP-03 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's attack and asserts the gate now refuses it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';
import { autoClosePackages, finishLineUpsert, hasRow, rowsForRun } from '../../src/finish-line.mjs';

function start(repo, session, extra) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session, ...(extra || [])]);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}

const flFile = (repo) => path.join(repo.doIt, 'finish-line.json');
const hookStop = (repo, session) => real(repo, ['gate', 'stop', '--session', session, '--cwd', repo.dir]);

test('CP03 S1-H1 two runs of one preset share step ids: each owner is refused on its own rows, B starts at intake', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  assert.equal(real(repo, ['next', '--run', a]).out.wave, 'intake');
  const b = start(repo, 'sess-B');
  const nb = real(repo, ['next', '--run', b]);
  assert.equal(nb.out.wave, 'intake', 'B gets its own pipeline rows and starts at intake');
  const rows = readJson(flFile(repo)).rows;
  const ofB = rows.filter((r) => r.run_id === b).map((r) => r.id);
  const ofA = rows.filter((r) => r.run_id === a).map((r) => r.id);
  assert.ok(ofB.includes('intake') && ofB.length === ofA.length, 'row ids are namespaced per run: ' + JSON.stringify(ofB));

  // the attack: sess-B, owner of an active run, tries to stop
  const sb = hookStop(repo, 'sess-B');
  assert.equal(sb.out.outcome, 'STOP_REFUSED', sb.stdout);
  assert.equal(sb.out.owned, true);
  assert.equal(sb.out.run_id, b);
  assert.ok(sb.out.open.includes('intake'));
  const sa = hookStop(repo, 'sess-A');
  assert.equal(sa.out.outcome, 'STOP_REFUSED', sa.stdout);
  assert.equal(sa.out.run_id, a);

  // A closes its intake row: B's waves do not follow A's row states
  const fl = readJson(flFile(repo));
  const ev = path.join(repo.dir, 'ev.txt');
  fs.writeFileSync(ev, 'x\n');
  for (const r of fl.rows) if (r.run_id === a && r.id === 'intake') { r.state = 'DONE'; r.evidence = 'ev.txt'; }
  writeJson(flFile(repo), fl);
  assert.equal(real(repo, ['next', '--run', a]).out.wave, 'prompt');
  assert.equal(real(repo, ['next', '--run', b]).out.wave, 'intake', 'a wave A closed is not skipped for B');
  const sb2 = hookStop(repo, 'sess-B');
  assert.equal(sb2.out.outcome, 'STOP_REFUSED');
  assert.ok(sb2.out.open.includes('intake'));
  assert.ok(!real(repo, ['gate', 'stop', '--session', 'sess-A', '--cwd', repo.dir]).out.open.includes('intake'));
});

test('CP03 S1-H1 two plans with the same slice ids: rows, lookups and package auto-close are per run', () => {
  const fl = { rows: [] };
  finishLineUpsert(fl, 'S1', { kind: 'package' }, 'run-A');
  assert.equal(hasRow(fl, 'S1', 'run-B'), false, 'A\'s S1 is not B\'s S1');
  finishLineUpsert(fl, 'S1', { kind: 'package' }, 'run-B');
  finishLineUpsert(fl, 'T-S1-01', { kind: 'dod', state: 'DONE', evidence: 'e' }, 'run-A');
  finishLineUpsert(fl, 'T-S1-01', { kind: 'dod' }, 'run-B');
  assert.equal(fl.rows.length, 4);
  autoClosePackages(fl);
  const pkg = (run) => fl.rows.find((r) => r.id === 'S1' && r.run_id === run);
  assert.equal(pkg('run-A').state, 'DONE', 'A\'s package closes on A\'s case row');
  assert.equal(pkg('run-B').state, 'OPEN', 'B\'s package stays open: its own case row is open');
  assert.deepEqual(rowsForRun(fl, 'run-B', false).rows.map((r) => r.state), ['OPEN', 'OPEN']);
  // an older board's unattributed row is adopted by the first run that touches it, then belongs to it
  const old = { rows: [{ id: 'R1', kind: 'dod', state: 'OPEN', evidence: null }] };
  finishLineUpsert(old, 'R1', { state: 'OPEN' }, 'run-A');
  assert.equal(old.rows[0].run_id, 'run-A');
  finishLineUpsert(old, 'R1', {}, 'run-B');
  assert.equal(old.rows.length, 2);
});
