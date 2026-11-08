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
function editState(repo, runId, fn) {
  const file = path.join(runDirOf(repo, runId), 'state.json');
  const st = readJson(file);
  fn(st);
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(runDirOf(repo, runId), '.state.sha256'), sha(file) + '\n');
}
const editStatus = (repo, runId, status) => editState(repo, runId, (st) => { st.status = status; });

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
  // an older board's unattributed row is adopted only by a legacy run (adopt=true), then belongs to it
  const old = { rows: [{ id: 'R1', kind: 'dod', state: 'OPEN', evidence: null }] };
  finishLineUpsert(old, 'R1', { state: 'OPEN' }, 'run-A', true);
  assert.equal(old.rows[0].run_id, 'run-A');
  finishLineUpsert(old, 'R1', {}, 'run-B', true);
  assert.equal(old.rows.length, 2);
});

// The board a 1.0.x run leaves behind: every step id of the preset, no run_id, all DONE except `verify`.
function legacyFeatureBoard(repo, allDone) {
  const probe = start(repo, 'probe');
  assert.equal(real(repo, ['next', '--run', probe]).out.wave, 'intake');
  const ids = readJson(flFile(repo)).rows.map((r) => r.id);
  assert.equal(ids.length, 10, 'the feature preset has 10 steps: ' + ids.join(','));
  fs.rmSync(runDirOf(repo, probe), { recursive: true, force: true }); // the 1.0.x run is gone; its rows stay
  writeJson(flFile(repo), { rows: ids.map((id) => ({ id, kind: 'wave', state: allDone || id !== 'verify' ? 'DONE' : 'OPEN', evidence: 'legacy', owner_question: null, reason: null, archived_to: null })) });
  return ids;
}

test('CP03 R2-S1-H3 a 1.1 run on a 1.0.x board seeds its own rows, starts at intake, and its owner is refused', () => {
  const repo = mkRepo();
  const ids = legacyFeatureBoard(repo, false);
  // the reviewer's replay: start, next, hook stop
  const b = start(repo, 'sess-B');
  const n = real(repo, ['next', '--run', b]);
  assert.equal(n.out.wave, 'intake', 'the new run does not follow the old run\'s row states: ' + n.stdout);
  const rows = readJson(flFile(repo)).rows;
  assert.deepEqual(rows.filter((r) => r.run_id === b).map((r) => r.id), ids, 'B seeded its own 10 rows');
  assert.equal(rows.filter((r) => !r.run_id).length, 10, 'the legacy rows are left as they were, unadopted');
  assert.ok(rows.filter((r) => !r.run_id).every((r) => r.id === 'verify' ? r.state === 'OPEN' : r.state === 'DONE'));
  const stop = hookStop(repo, 'sess-B');
  assert.equal(stop.code, 1, stop.stdout);
  assert.equal(stop.out.outcome, 'STOP_REFUSED');
  assert.equal(stop.out.owned, true);
  assert.equal(stop.out.run_id, b);
  assert.deepEqual(stop.out.open, ids);
  assert.match(stop.out.board, /0 of 10 closed/);
});

test('CP03 R2-S1-H3 a 1.0.x board with every row DONE does not make a new run\'s finish line reached', () => {
  const repo = mkRepo();
  legacyFeatureBoard(repo, true);
  const b = start(repo, 'sess-B');
  const n = real(repo, ['next', '--run', b]);
  assert.notEqual(n.out.outcome, 'FINISH_LINE_REACHED', n.stdout);
  assert.equal(n.out.wave, 'intake');
  assert.equal(hookStop(repo, 'sess-B').out.outcome, 'STOP_REFUSED');
});

test('CP03 R2-S1-H3 a legacy run (no owner object) still adopts its own 1.0.x rows, as before', () => {
  const repo = mkRepo();
  const ids = legacyFeatureBoard(repo, false);
  const l = start(repo, 'sess-L');
  editState(repo, l, (st) => { delete st.owner; });
  const n = real(repo, ['next', '--run', l]);
  assert.equal(n.out.wave, 'verify', 'the 1.0.x run carries on where it was: ' + n.stdout);
  const rows = readJson(flFile(repo)).rows;
  assert.deepEqual(rows.map((r) => r.id), ids, 'nothing seeded: the legacy run reads the 1.0.x rows as its own');
});

test('CP03 R2-S1-H3 a 1.1 package never auto-closes on a 1.0.x case row; a legacy run\'s package still does', () => {
  const fl = { rows: [
    { id: 'S1', kind: 'package', state: 'OPEN', evidence: null, run_id: 'run-new' },
    { id: 'T-S1-01', kind: 'dod', state: 'DONE', evidence: 'legacy' },
  ] };
  assert.equal(hasRow(fl, 'T-S1-01', 'run-new'), false, 'strict by default');
  autoClosePackages(fl, null);
  assert.equal(fl.rows[0].state, 'OPEN', 'the unattributed case row is not run-new\'s');
  autoClosePackages(fl, 'run-new');
  assert.equal(fl.rows[0].state, 'DONE', 'a legacy run may pair with its own unattributed case rows');
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

test('CP03 S1-M1 a tampered newer run does not hide an older, valid active run of the same owner', () => {
  const repo = mkRepo();
  const a1 = startNoPreset(repo, 'sess-A');
  const a2 = startNoPreset(repo, 'sess-A');
  editState(repo, a2, (st) => { st.created_at = '2999-01-01T00:00:00.000Z'; }); // a2 is certainly the newer run
  writeJson(flFile(repo), { rows: [{ id: 'R1', kind: 'dod', state: 'OPEN', evidence: null, run_id: a1 }] });
  // the attack: one byte appended to the newer run's state.json (still parses, digest no longer matches)
  fs.appendFileSync(path.join(runDirOf(repo, a2), 'state.json'), ' ');
  const r = hookStop(repo, 'sess-A');
  assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
  assert.equal(r.out.owned, true);
  assert.equal(r.out.run_id, a1, 'the readable active run gates');
  assert.deepEqual(r.out.open, ['R1']);
  assert.deepEqual(r.out.unreadable, [a2], 'the unreadable run is named');
  const events = fs.readFileSync(path.join(runDirOf(repo, a2), 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.event === 'stop_gate_state_unreadable'), 'the unreadable run is logged');
  // once the readable run no longer gates, the stop is allowed; the fail-open applies to the bad run alone
  editStatus(repo, a1, 'PARKED');
  const ok = hookStop(repo, 'sess-A');
  assert.equal(ok.out.outcome, 'STOP_ALLOWED', ok.stdout);
  // every owned run unreadable: fail open, as CONTRACT 3.1 says
  fs.appendFileSync(path.join(runDirOf(repo, a1), 'state.json'), ' ');
  const open = hookStop(repo, 'sess-A');
  assert.equal(open.out.outcome, 'STOP_ALLOWED', open.stdout);
  assert.equal(open.out.reason, 'state unreadable');
  assert.deepEqual([...open.out.unreadable].sort(), [a1, a2].sort());
});

test('CP03 S1-L2 a blank or whitespace session id is absent: never recorded, never matched', () => {
  const repo = mkRepo();
  const owner = (id) => readJson(path.join(runDirOf(repo, id), 'state.json')).owner.session_id;
  const flag = real(repo, ['start', '--request', 'x', '--session', '  ']);
  assert.equal(owner(flag.out.run_id), null, '--session "  " records nothing');
  const env = real(repo, ['start', '--request', 'y'], { DO_IT_SESSION_ID: ' ', DO_IT_SESSION_ENV: 'HOST_SID', HOST_SID: 'host-1' });
  assert.equal(owner(env.out.run_id), 'host-1', 'a blank export falls through to the host variable');
  const hostBlank = real(repo, ['start', '--request', 'z'], { DO_IT_SESSION_ENV: 'HOST_SID', HOST_SID: '   ' });
  assert.equal(owner(hostBlank.out.run_id), null);
  // a hook stop with a blank session is a hook with no session: the cwd fallback gates the session-less run
  const r2 = mkRepo();
  const id = real(r2, ['start', '--request', 'x', '--session', ' ']).out.run_id;
  writeJson(flFile(r2), { rows: [{ id: 'R1', kind: 'dod', state: 'OPEN', evidence: null, run_id: id }] });
  const stop = real(r2, ['gate', 'stop', '--session', '   ', '--cwd', r2.dir]);
  assert.equal(stop.out.outcome, 'STOP_REFUSED', stop.stdout);
  assert.equal(stop.out.run_id, id);
});

test('CP03 S1-L1 precedence stays --session, DO_IT_SESSION_ID, host variable; start reports the conflict', () => {
  const repo = mkRepo();
  const r = real(repo, ['start', '--request', 'x'], { DO_IT_SESSION_ID: 'stale-old', DO_IT_SESSION_ENV: 'HOST_SID', HOST_SID: 'real-A' });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(readJson(path.join(runDirOf(repo, r.out.run_id), 'state.json')).owner.session_id, 'stale-old');
  assert.deepEqual(r.out.session_conflict, { recorded: 'stale-old', host: 'real-A' }, 'the stale export is reported');
  const same = real(repo, ['start', '--request', 'y'], { DO_IT_SESSION_ID: 'real-A', DO_IT_SESSION_ENV: 'HOST_SID', HOST_SID: 'real-A' });
  assert.equal(same.out.session_conflict, undefined);
});
