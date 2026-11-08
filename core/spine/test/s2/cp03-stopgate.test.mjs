// CP-03 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's attack and asserts the gate now refuses it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, sha, writeJson } from '../helpers.mjs';
import { autoClosePackages, finishLineUpsert, hasRow, rowsForRun } from '../../src/finish-line.mjs';

function start(repo, session, extra) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session, ...(extra || [])]);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}

// Rewrite state.json the way the spine would, keeping its sidecar digest valid.
function editStatus(repo, runId, status) {
  const file = path.join(runDirOf(repo, runId), 'state.json');
  const st = readJson(file);
  st.status = status;
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(runDirOf(repo, runId), '.state.sha256'), sha(file) + '\n');
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

function startNoPreset(repo, session) {
  const r = real(repo, ['start', '--request', 'req ' + session, '--session', session]);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}

test('CP03 S1-H2 resume with no --run never takes another session\'s newer active run', () => {
  const repo = mkRepo();
  const b = startNoPreset(repo, 'sess-B');
  editStatus(repo, b, 'PARKED');
  const a = startNoPreset(repo, 'sess-A'); // newest, active
  writeJson(flFile(repo), { rows: [{ id: 'R1', kind: 'dod', state: 'OPEN', evidence: null, run_id: a }] });
  // the attack: B resumes with no --run
  const r = real(repo, ['resume', '--session', 'sess-B', '--force']);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.out.run_id, b, 'B is told its own run, not A\'s newer one');
  assert.equal(r.out.outcome, 'RESUMED');
  const ownerA = readJson(path.join(runDirOf(repo, a), 'state.json')).owner;
  assert.equal(ownerA.session_id, 'sess-A', 'A stays owner');
  assert.ok(!ownerA.history, 'no history entry on A\'s run');
  const ha = hookStop(repo, 'sess-A');
  assert.equal(ha.out.outcome, 'STOP_REFUSED', ha.stdout);
  assert.equal(ha.out.owned, true);
  assert.equal(ha.out.run_id, a);
  const hb = hookStop(repo, 'sess-B');
  assert.notEqual(hb.out.run_id, a, 'B is never gated by A\'s rows');
});

test('CP03 S1-H2 a session that owns nothing gets OWNED_BY_OTHER_SESSION naming the owner; --take-over is explicit and logged', () => {
  const repo = mkRepo();
  const a = startNoPreset(repo, 'sess-A');
  const before = fs.readFileSync(path.join(runDirOf(repo, a), 'state.json'), 'utf8');
  const r = real(repo, ['resume', '--session', 'sess-B']);
  assert.equal(r.code, 1, r.stdout);
  assert.equal(r.out.outcome, 'OWNED_BY_OTHER_SESSION');
  assert.equal(r.out.run_id, a);
  assert.equal(r.out.owner_session, 'sess-A');
  assert.match(r.out.message, /--take-over/);
  assert.equal(fs.readFileSync(path.join(runDirOf(repo, a), 'state.json'), 'utf8'), before, 'nothing written');
  // an explicit --run is not enough either
  assert.equal(real(repo, ['resume', '--session', 'sess-B', '--run', a]).out.outcome, 'OWNED_BY_OTHER_SESSION');
  // --take-over must name the run
  assert.equal(real(repo, ['resume', '--session', 'sess-B', '--take-over']).out.outcome, 'USAGE');
  const t = real(repo, ['resume', '--session', 'sess-B', '--run', a, '--take-over']);
  assert.equal(t.code, 0, t.stdout);
  assert.equal(t.out.outcome, 'TAKEN_OVER');
  assert.equal(t.out.previous_owner, 'sess-A');
  const owner = readJson(path.join(runDirOf(repo, a), 'state.json')).owner;
  assert.equal(owner.session_id, 'sess-B');
  assert.deepEqual(owner.history.map((h) => [h.session_id, h.reason]), [['sess-A', 'take_over']]);
  const events = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const ev = events.find((e) => e.event === 'owner_taken_over');
  assert.ok(ev, 'the takeover is an event');
  assert.equal(ev.detail.from, 'sess-A');
  assert.equal(ev.detail.to, 'sess-B');
});
