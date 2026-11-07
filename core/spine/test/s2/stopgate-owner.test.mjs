// S1 (do-it 1.1): the stop gate binds only the session that owns the run (G-1, G-8).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, readJsonl, runDirOf, sha, tmp, unit, writeJson } from '../helpers.mjs';
import { loadSchemaFile } from '../../src/schema.mjs';

const START = ['start', '--preset', 'feature'];

function start(repo, session, extraEnv) {
  const argv = [...START, '--request', 'ship ' + (session || 'none')];
  if (session) argv.push('--session', session);
  const r = real(repo, argv, extraEnv);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}

function row(id, runId, state = 'OPEN') {
  return { id, kind: 'dod', state, evidence: null, owner_question: null, reason: null, archived_to: null, ...(runId ? { run_id: runId } : {}) };
}

function board(repo, rows) {
  writeJson(path.join(repo.doIt, 'finish-line.json'), { rows });
}

// Rewrite state.json the way the spine would, keeping its sidecar digest valid.
function editState(repo, runId, fn) {
  const file = path.join(runDirOf(repo, runId), 'state.json');
  const st = readJson(file);
  fn(st);
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(runDirOf(repo, runId), '.state.sha256'), sha(file) + '\n');
}

function dirDigest(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out[path.relative(dir, p)] = sha(p);
    }
  };
  walk(dir);
  return out;
}

const hookStop = (repo, session) => real(repo, ['gate', 'stop', ...(session ? ['--session', session] : []), '--cwd', repo.dir]);

test('T-S1-01 a session that does not own the run is allowed, owned:false; the owner is refused', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  board(repo, [row('R1', a)]);
  const before = dirDigest(runDirOf(repo, a));
  const b = hookStop(repo, 'sess-B');
  assert.equal(b.code, 0, b.stdout);
  assert.equal(b.out.outcome, 'STOP_ALLOWED');
  assert.equal(b.out.owned, false);
  assert.ok(b.out.reason);
  assert.deepEqual(dirDigest(runDirOf(repo, a)), before, 'a foreign stop writes nothing into the run');
  const own = hookStop(repo, 'sess-A');
  assert.equal(own.out.outcome, 'STOP_REFUSED', own.stdout);
  assert.equal(own.out.owned, true);
  assert.deepEqual(own.out.open, ['R1']);
});

test('T-S1-02 a run with session_id null is not gated for a session; the cwd fallback is only for a host that gives none', () => {
  const repo = mkRepo();
  const id = start(repo, null);
  assert.equal(readJson(path.join(runDirOf(repo, id), 'state.json')).owner.session_id, null);
  board(repo, [row('R1', id)]);
  const hook = hookStop(repo, 'sess-B');
  assert.equal(hook.out.outcome, 'STOP_ALLOWED', hook.stdout);
  assert.equal(hook.out.owned, false);
  const noSession = hookStop(repo, null);
  assert.equal(noSession.out.outcome, 'STOP_REFUSED', 'host gave no session, run has none, cwd inside the run cwd');
  const elsewhere = real(repo, ['gate', 'stop', '--cwd', tmp('dit-else-')]);
  assert.equal(elsewhere.out.outcome, 'STOP_ALLOWED');
});

test('T-S1-03 a run with no owner object is never gated from a hook; an explicit --run still gates', () => {
  const repo = mkRepo();
  const id = start(repo, 'sess-A');
  editState(repo, id, (st) => { delete st.owner; });
  board(repo, [row('R1', id)]);
  for (const session of ['sess-A', 'sess-B', null]) {
    const r = hookStop(repo, session);
    assert.equal(r.out.outcome, 'STOP_ALLOWED', r.stdout);
    assert.equal(r.out.reason, 'legacy run has no owner');
    assert.equal(r.out.owned, false);
  }
  const explicit = real(repo, ['gate', 'stop', '--run', id]);
  assert.equal(explicit.out.outcome, 'STOP_REFUSED', explicit.stdout);
  assert.equal(explicit.code, 1);
});

test('T-S1-04 allow by exclusion: PARKED, NEEDS_HUMAN, AWAIT_RATIFY and the rest never gate; VERIFYING does', () => {
  const repo = mkRepo();
  const id = start(repo, 'sess-A');
  board(repo, [row('R1', id)]);
  for (const status of ['PARKED', 'NEEDS_HUMAN', 'AWAIT_RATIFY', 'BLOCKED', 'DONE', 'ESCALATED', 'FAILED']) {
    editState(repo, id, (st) => { st.status = status; });
    const r = hookStop(repo, 'sess-A');
    assert.equal(r.out.outcome, 'STOP_ALLOWED', status + ' ' + r.stdout);
    assert.equal(r.out.owned, true);
    assert.match(r.out.reason, new RegExp(status));
  }
  for (const status of ['VERIFYING', 'BUILDING', 'REVIEWING', 'DEPLOYING', 'ROLLED_BACK']) {
    editState(repo, id, (st) => { st.status = status; st.stop_refusals = 0; });
    const r = hookStop(repo, 'sess-A');
    assert.equal(r.out.outcome, 'STOP_REFUSED', status + ' ' + r.stdout);
    assert.equal(r.code, 1);
  }
});

test('T-S1-05 two runs, each with open rows: the owner sees and parks only its own run', () => {
  const repo = mkRepo();
  const one = start(repo, 'sess-1');
  const two = start(repo, 'sess-2');
  board(repo, [row('R1', one), row('R2', two), row('R3', two)]);
  const twoBefore = dirDigest(runDirOf(repo, two));
  const first = hookStop(repo, 'sess-1');
  assert.equal(first.out.outcome, 'STOP_REFUSED', first.stdout);
  assert.deepEqual(first.out.open, ['R1']);
  assert.match(first.out.board, /0 of 1 closed/);
  assert.match(first.out.board, /R1/);
  assert.doesNotMatch(first.out.board, /R2|R3/);
  hookStop(repo, 'sess-1');
  hookStop(repo, 'sess-1');
  const parked = hookStop(repo, 'sess-1');
  assert.equal(parked.out.outcome, 'PARKED', parked.stdout);
  assert.equal(parked.out.run_id, one);
  assert.equal(readJson(path.join(runDirOf(repo, one), 'state.json')).status, 'PARKED');
  assert.deepEqual(dirDigest(runDirOf(repo, two)), twoBefore, 'run 2 is byte-identical');
  assert.ok(!fs.existsSync(path.join(runDirOf(repo, two), 'owner-pack.json')));
  const pack = readJson(path.join(runDirOf(repo, one), 'owner-pack.json'));
  assert.equal(pack.questions.length, 1);
  assert.equal(pack.questions[0].source, 'stop-gate');
  assert.match(pack.questions[0].text, /R1/);
  assert.doesNotMatch(pack.questions[0].text, /R2|R3/);
});

test('T-S1-05b rows without a run_id never gate a hook stop; an explicit stop still counts them', () => {
  const repo = mkRepo();
  const id = start(repo, 'sess-A');
  board(repo, [row('OLD-1', null)]);
  const hook = hookStop(repo, 'sess-A');
  assert.equal(hook.out.outcome, 'STOP_ALLOWED', hook.stdout);
  assert.equal(hook.out.owned, true);
  const explicit = real(repo, ['gate', 'stop', '--run', id]);
  assert.equal(explicit.out.outcome, 'STOP_REFUSED');
});

test('T-S1-05c rows seeded by the spine carry the run_id', () => {
  const repo = mkRepo();
  const id = start(repo, 'sess-A');
  const n = real(repo, ['next']);
  assert.equal(n.code, 0, n.stdout);
  const rows = readJson(path.join(repo.doIt, 'finish-line.json')).rows;
  assert.ok(rows.length > 0);
  for (const r of rows) assert.equal(r.run_id, id, r.id);
});

test('T-S1-07 start records the host session and adds no settings key (G-8)', () => {
  const repo = mkRepo();
  const idFlag = start(repo, 'X-flag');
  const get = (id) => readJson(path.join(runDirOf(repo, id), 'state.json')).owner.session_id;
  assert.equal(get(idFlag), 'X-flag');
  const idEnv = start(repo, null, { DO_IT_SESSION_ID: 'X-env' });
  assert.equal(get(idEnv), 'X-env');
  // the host names the variable that carries its session id; the id itself is read live
  const viaHost = real(repo, [...START, '--request', 'via host var'], { DO_IT_SESSION_ENV: 'HOST_SESSION_X, OTHER', HOST_SESSION_X: 'X-host' });
  assert.equal(get(viaHost.out.run_id), 'X-host');
  // precedence: --session, then DO_IT_SESSION_ID, then the host variable
  const both = real(repo, [...START, '--request', 'p', '--session', 'X-flag2'], { DO_IT_SESSION_ID: 'X-env2', DO_IT_SESSION_ENV: 'HOST_SESSION_X', HOST_SESSION_X: 'X-host2' });
  assert.equal(get(both.out.run_id), 'X-flag2');
  const envOverHost = real(repo, [...START, '--request', 'p2'], { DO_IT_SESSION_ID: 'X-env3', DO_IT_SESSION_ENV: 'HOST_SESSION_X', HOST_SESSION_X: 'X-host3' });
  assert.equal(get(envOverHost.out.run_id), 'X-env3');
  const none = start(repo, null);
  assert.equal(get(none), null, 'no host session: null, the only case where it is null');
  // G-8: the settings schema keeps exactly its 1.0.x top-level keys
  const keys = Object.keys(loadSchemaFile('settings.schema.json').properties).sort();
  assert.deepEqual(keys, ['ceilings', 'handoff', 'host', 'interaction', 'isolation', 'observability', 'review', 'secrets', 'state', 'stop_gate', 'tiers', 'version']);
});

test('T-S1-08 a corrupt state.json fails open with an event, and status reports the unreadable run', () => {
  const repo = mkRepo();
  const bad = start(repo, 'sess-A');
  board(repo, [row('R1', bad)]);
  fs.writeFileSync(path.join(runDirOf(repo, bad), 'state.json'), '{ not json');
  const r = hookStop(repo, 'sess-A');
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.out.outcome, 'STOP_ALLOWED');
  assert.equal(r.out.reason, 'state unreadable');
  const events = readJsonl(path.join(runDirOf(repo, bad), 'events.jsonl'));
  assert.ok(events.some((e) => e.event === 'stop_gate_state_unreadable'), 'an event is logged');
  // the unreadable run is not the newest: status works and names it
  const good = start(repo, 'sess-B');
  const st = real(repo, ['status']);
  assert.equal(st.code, 0, st.stdout);
  assert.equal(st.out.run_id, good);
  assert.deepEqual(st.out.unreadable_runs, [bad]);
  // it is the newest: status refuses and names the run
  const only = mkRepo();
  const o = start(only, 'sess-A');
  fs.writeFileSync(path.join(runDirOf(only, o), 'state.json'), '{ not json');
  const s2 = real(only, ['status']);
  assert.equal(s2.code, 1);
  assert.equal(s2.out.run_id, o);
  assert.match(s2.out.outcome, /^STATE_/);
  // a tampered (parseable) state of the owner also fails open, as owned
  const t = mkRepo();
  const tid = start(t, 'sess-A');
  board(t, [row('R1', tid)]);
  const sf = path.join(runDirOf(t, tid), 'state.json');
  const doc = readJson(sf);
  doc.status = 'VERIFYING';
  fs.writeFileSync(sf, JSON.stringify(doc, null, 2) + '\n');
  const tr = hookStop(t, 'sess-A');
  assert.equal(tr.out.outcome, 'STOP_ALLOWED', tr.stdout);
  assert.equal(tr.out.reason, 'state unreadable');
  assert.equal(tr.out.owned, true);
  // an explicit stop on the same state still reports the error
  assert.equal(real(t, ['gate', 'stop', '--run', tid]).out.outcome, 'STATE_TAMPERED');
});

test('T-S1-10 a non-owner hits the hook 5 times: no park, no pack question, the owner run is byte-identical', () => {
  const repo = mkRepo();
  const a = start(repo, 'sess-A');
  board(repo, [row('R1', a), row('R2', a)]);
  const before = dirDigest(runDirOf(repo, a));
  for (let i = 0; i < 5; i++) {
    const r = unit(repo, ['gate', 'stop', '--session', 'sess-B', '--cwd', repo.dir]);
    assert.equal(r.out.outcome, 'STOP_ALLOWED', r.stdout);
    assert.equal(r.out.owned, false);
  }
  assert.deepEqual(dirDigest(runDirOf(repo, a)), before);
  assert.ok(!fs.existsSync(path.join(runDirOf(repo, a), 'owner-pack.json')));
  const events = readJsonl(path.join(runDirOf(repo, a), 'events.jsonl'));
  assert.ok(!events.some((e) => /park|refus/.test(e.event)));
  assert.equal(readJson(path.join(runDirOf(repo, a), 'state.json')).status, 'INTAKE');
});

test('T-S1-12 resume re-binds the run to the new session with a history entry', () => {
  const repo = mkRepo();
  const id = start(repo, 'sess-old');
  const r = real(repo, ['resume'], { DO_IT_SESSION_ID: 'sess-new' });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.out.outcome, 'REBOUND');
  const owner = readJson(path.join(runDirOf(repo, id), 'state.json')).owner;
  assert.equal(owner.session_id, 'sess-new');
  assert.equal(owner.history.length, 1);
  assert.equal(owner.history[0].session_id, 'sess-old');
  assert.ok(owner.history[0].until);
  // the same session again is not a rebind
  assert.equal(real(repo, ['resume'], { DO_IT_SESSION_ID: 'sess-new' }).out.outcome, 'NOT_PARKED');
  // a parked run is un-parked and re-bound in one call
  editState(repo, id, (st) => { st.status = 'PARKED'; });
  const p = real(repo, ['resume', '--force'], { DO_IT_SESSION_ID: 'sess-third' });
  assert.equal(p.out.outcome, 'RESUMED', p.stdout);
  const o2 = readJson(path.join(runDirOf(repo, id), 'state.json')).owner;
  assert.equal(o2.session_id, 'sess-third');
  assert.equal(o2.history.length, 2);
});
