// CP-03 round 3 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, sha256Bytes, writeJson } from '../helpers.mjs';

// temp repos, their user homes and sibling folders are removed when the file is done
const made = [];
const mk = (o) => { const r = mkRepo(o); made.push(r.dir, r.home); return r; };
after(() => { for (const d of made) for (const x of [d, d + '-Y', d + '-plain']) fs.rmSync(x, { recursive: true, force: true }); });

function start(repo, session, cwd) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session], null, cwd);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}
const hookStop = (repo, session, cwd) => real(repo, ['gate', 'stop', '--session', session, '--cwd', cwd || repo.dir], null, cwd);
const statusOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json')).status;

test('CP03 R3-S1-H6 gate advance never reaches DONE: the run stays gated with its rows open', () => {
  const repo = mk();
  const a = start(repo, 'sess-A');
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  for (const s of ['BUILDING', 'VERIFYING', 'CONCLUDING']) {
    const r = real(repo, ['gate', 'advance', '--run', a, '--to', s]);
    assert.equal(r.out.outcome, 'ADVANCED', r.stdout);
  }
  const done = real(repo, ['gate', 'advance', '--run', a, '--to', 'DONE']);
  assert.equal(done.code, 1, done.stdout);
  assert.equal(done.out.outcome, 'TRANSITION_REFUSED');
  assert.equal(done.out.owner, 'gate conclude', 'the refusal names the command that owns DONE');
  assert.equal(statusOf(repo, a), 'CONCLUDING');
  const hook = hookStop(repo, 'sess-A');
  assert.equal(hook.out.outcome, 'STOP_REFUSED', hook.stdout);
  assert.equal(real(repo, ['gate', 'stop', '--run', a]).out.outcome, 'STOP_REFUSED');
  assert.equal(real(repo, ['gate', 'conclude', '--run', a]).out.outcome, 'CONCLUDE_REFUSED', 'the owning command still checks the rows');
  assert.equal(real(repo, ['status', '--run', a]).out.status, 'CONCLUDING');
});

test('CP03 R3-S1-H6 gate advance refuses every non-gating status, naming its owning command', () => {
  const repo = mk();
  const a = start(repo, 'sess-A');
  real(repo, ['next', '--run', a]);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
  const owners = { DONE: /gate conclude/, PARKED: /park/, NEEDS_HUMAN: /record|pack/, AWAIT_RATIFY: /pack|readiness/, BLOCKED: /record/, FAILED: /record/, ESCALATED: /record|escalate/ };
  for (const [to, re] of Object.entries(owners)) {
    const r = real(repo, ['gate', 'advance', '--run', a, '--to', to]);
    assert.equal(r.code, 1, to + ': ' + r.stdout);
    assert.equal(r.out.outcome, 'TRANSITION_REFUSED', to);
    assert.match(r.out.owner, re, to);
    assert.equal(statusOf(repo, a), 'BUILDING', to + ' was not entered');
  }
  assert.equal(hookStop(repo, 'sess-A').out.outcome, 'STOP_REFUSED', 'still gated after every refused advance');
  // PROVING -> DONE is refused too
  for (const s of ['VERIFYING', 'DEPLOYING', 'PROVING']) assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', s]).out.outcome, 'ADVANCED', s);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'DONE']).out.outcome, 'TRANSITION_REFUSED');
});

test('CP03 R3-S1-H6 gate escalate starts only from a run that already waits on the owner, and needs an open question', () => {
  const repo = mk();
  const a = start(repo, 'sess-A');
  real(repo, ['next', '--run', a]);
  real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']);
  const fromBuilding = real(repo, ['gate', 'escalate', '--run', a, '--reason', 'give up']);
  assert.equal(fromBuilding.out.outcome, 'TRANSITION_REFUSED', 'a gating run cannot escalate itself out of the gate');
  assert.equal(real(repo, ['gate', 'escalate', '--run', a]).out.outcome, 'USAGE', 'a reason is required');
  for (const s of ['VERIFYING', 'REVIEWING']) real(repo, ['gate', 'advance', '--run', a, '--to', s]);
  // NEEDS_HUMAN through its owning command: a needs_human result with its questions
  const q = path.join(repo.dir, 'results', 'q.json');
  writeJson(q, { questions: [{ kind: 'review-cap', text: 'Raise the cap?', options: ['yes', 'no'], recommendation: 'no', default: 'no', reversible: true }] });
  const res = path.join(repo.dir, 'results', 'r.json');
  writeJson(res, { schema: 'it-result/1', stage: 'review-it', run_id: a, slice_id: null, status: 'needs_human', exit_code: 2, verdicts: [], pending_human: { questions_path: 'results/q.json' } });
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r.json']).code, 2);
  assert.equal(statusOf(repo, a), 'NEEDS_HUMAN');
  const esc = real(repo, ['gate', 'escalate', '--run', a, '--reason', 'review loop stalled at the cap and the owner gave no reply']);
  assert.equal(esc.out.outcome, 'ESCALATED', esc.stdout);
  assert.equal(statusOf(repo, a), 'ESCALATED');
  const ev = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8');
  assert.match(ev, /"event":"escalated".*review loop stalled/);
  // NEEDS_HUMAN with every question answered: nothing hands the run to the owner
  const b = start(repo, 'sess-B');
  for (const s of ['BUILDING', 'VERIFYING', 'REVIEWING']) real(repo, ['gate', 'advance', '--run', b, '--to', s]);
  writeJson(path.join(repo.dir, 'results', 'rb.json'), { schema: 'it-result/1', stage: 'review-it', run_id: b, slice_id: null, status: 'needs_human', exit_code: 2, verdicts: [], pending_human: { questions_path: 'results/q.json' } });
  assert.equal(real(repo, ['record', '--run', b, '--result', 'results/rb.json']).code, 2);
  writeJson(path.join(runDirOf(repo, b), 'answers.json'), { answers: [{ n: 1, answer: 'no' }] });
  assert.equal(real(repo, ['gate', 'escalate', '--run', b, '--reason', 'no reply at all']).out.outcome, 'TRANSITION_REFUSED');
});

// R3-S1-H7: a run started in repo X is found by a stop made from repo Y or from a folder that is no repo.
function sibling(repo, name) {
  const dir = path.join(path.dirname(repo.dir), path.basename(repo.dir) + '-' + name);
  fs.mkdirSync(dir);
  if (name !== 'plain') {
    cp.execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  }
  return fs.realpathSync(dir);
}

test('CP03 R3-S1-H7 a stop from a sibling repo or a non-git folder still finds the session\'s run', () => {
  const repo = mk({ commit: true });
  const a = start(repo, 'sess-A');
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  const y = sibling(repo, 'Y');
  const plain = sibling(repo, 'plain');
  assert.equal(hookStop(repo, 'sess-A').out.outcome, 'STOP_REFUSED');
  for (const cwd of [y, plain]) {
    const r = hookStop(repo, 'sess-A', cwd);
    assert.equal(r.code, 1, cwd + ': ' + r.stdout);
    assert.equal(r.out.outcome, 'STOP_REFUSED');
    assert.equal(r.out.run_id, a);
    assert.equal(r.out.run_home, fs.realpathSync(repo.doIt), 'the refusal names the home of the run');
    assert.ok(r.out.homes.length === 2);
  }
  assert.equal(statusOf(repo, a), 'INTAKE');
  assert.ok(!fs.existsSync(path.join(y, '.do-it', 'runs')), 'nothing is started in the sibling');
  // another session from the sibling is not gated by sess-A's run
  assert.equal(hookStop(repo, 'sess-B', y).out.outcome, 'STOP_ALLOWED');
});

test('CP03 R3-S1-H7 the registry records start, resume and take-over; stale entries are pruned', () => {
  const repo = mk({ commit: true });
  // one file per run (R4-S1-M8): sessions/<session>/<run>.json
  const regDir = (s, root) => path.join(root || path.join(repo.home, '.do-it'), 'sessions', s);
  const entries = (s, root) => { try { return fs.readdirSync(regDir(s, root)).filter((n) => n.endsWith('.json')).map((n) => readJson(path.join(regDir(s, root), n))); } catch { return []; } };
  const a = start(repo, 'sess-A');
  real(repo, ['next', '--run', a]);
  assert.deepEqual(entries('sess-A').map((e) => [e.run_id, e.home]), [[a, fs.realpathSync(repo.doIt)]]);
  // DO_IT_USER_HOME moves the registry (tests and sandboxes)
  const alt = path.join(repo.home, 'alt');
  const b = real(repo, ['start', '--preset', 'feature', '--request', 'alt', '--session', 'sess-ALT'], { DO_IT_USER_HOME: alt });
  assert.equal(entries('sess-ALT', alt).length, 1);
  assert.equal(entries('sess-ALT').length, 0);
  // a take-over moves the run to the new session's list; the old entry is pruned on the next read
  const y = sibling(repo, 'Y');
  const t = real(repo, ['resume', '--session', 'sess-C', '--run', a, '--take-over']);
  assert.equal(t.out.outcome, 'TAKEN_OVER', t.stdout);
  assert.deepEqual(entries('sess-C').map((e) => e.run_id), [a]);
  assert.equal(hookStop(repo, 'sess-C', y).out.outcome, 'STOP_REFUSED', 'the new owner is gated from the sibling');
  assert.equal(hookStop(repo, 'sess-A', y).out.outcome, 'STOP_ALLOWED', 'the old owner is not');
  assert.equal(entries('sess-A').length, 0, 'the entry of a run sess-A no longer owns is pruned');
  // a run folder that is gone is pruned too
  fs.rmSync(path.join(repo.doIt, 'runs', a), { recursive: true });
  assert.equal(hookStop(repo, 'sess-C', y).out.outcome, 'STOP_ALLOWED');
  assert.equal(entries('sess-C').length, 0);
  // an odd session id never becomes a path
  real(repo, ['start', '--preset', 'feature', '--request', 'odd', '--session', '../../x y']);
  const names = fs.readdirSync(path.join(repo.home, '.do-it', 'sessions'));
  assert.ok(names.every((n) => /^[A-Za-z0-9._-]+$/.test(n) && !/^\.+$/.test(n)), names.join(','));
  assert.equal(b.code, 0);
});

// R3-S1-M6: one unattributed OPEN row of a 1.0.x board; B's own 10 rows set DONE.
function closeAllOf(repo, runId) {
  const f = path.join(repo.doIt, 'finish-line.json');
  const fl = readJson(f);
  fs.writeFileSync(path.join(repo.dir, 'ev.txt'), 'x\n');
  for (const r of fl.rows) if (r.run_id === runId) { r.state = 'DONE'; r.evidence = 'ev.txt'; }
  writeJson(f, fl);
}
const legacyRow = { id: 'old-slice-T-9', kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null };

test('CP03 R3-S1-M6 on a 1.0.x board with an open legacy row a 1.1 run reaches FINISH_LINE_REACHED and CONCLUDED', () => {
  const repo = mk();
  writeJson(path.join(repo.doIt, 'finish-line.json'), { rows: [legacyRow] });
  const b = start(repo, 'sess-B');
  assert.equal(real(repo, ['next', '--run', b]).code, 0);
  closeAllOf(repo, b);
  const hook = hookStop(repo, 'sess-B');
  assert.equal(hook.out.outcome, 'STOP_ALLOWED', hook.stdout);
  const n = real(repo, ['next', '--run', b]);
  assert.equal(n.out.outcome, 'FINISH_LINE_REACHED', n.stdout);
  const ex = real(repo, ['gate', 'stop', '--run', b]);
  assert.equal(ex.out.outcome, 'STOP_ALLOWED', 'views and gate agree: ' + ex.stdout);
  const st = real(repo, ['status', '--run', b]);
  assert.match(st.out.board, /FINISH LINE: 10 of 10 closed/);
  assert.doesNotMatch(st.out.board, /old-slice-T-9/);
  const h = real(repo, ['handoff', '--run', b]);
  assert.doesNotMatch(fs.readFileSync(path.join(runDirOf(repo, b), 'handoff.md'), 'utf8'), /old-slice-T-9/, h.stdout);
  for (const s of ['BUILDING', 'VERIFYING', 'CONCLUDING']) real(repo, ['gate', 'advance', '--run', b, '--to', s]);
  const c = real(repo, ['gate', 'conclude', '--run', b]);
  assert.equal(c.out.outcome, 'CONCLUDED', c.stdout);
  // the legacy row is untouched
  assert.deepEqual(readJson(path.join(repo.doIt, 'finish-line.json')).rows.find((r) => r.id === 'old-slice-T-9'), legacyRow);
});

test('CP03 R3-S1-M6 a legacy run (no owner) still counts the old row in next, explicit stop and conclude', () => {
  const repo = mk();
  writeJson(path.join(repo.doIt, 'finish-line.json'), { rows: [legacyRow] });
  const l = start(repo, 'sess-L');
  const file = path.join(runDirOf(repo, l), 'state.json');
  const st = readJson(file);
  delete st.owner;
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(runDirOf(repo, l), '.state.sha256'), sha256Bytes(fs.readFileSync(file)) + '\n');
  real(repo, ['next', '--run', l]);
  closeAllOf(repo, l);
  assert.notEqual(real(repo, ['next', '--run', l]).out.outcome, 'FINISH_LINE_REACHED');
  const ex = real(repo, ['gate', 'stop', '--run', l]);
  assert.equal(ex.out.outcome, 'STOP_REFUSED');
  assert.ok(ex.out.open.includes('old-slice-T-9'));
  assert.match(real(repo, ['status', '--run', l]).out.board, /old-slice-T-9/);
  const c = real(repo, ['gate', 'conclude', '--run', l]);
  assert.equal(c.out.outcome, 'CONCLUDE_REFUSED');
  assert.deepEqual(c.out.ids, ['old-slice-T-9']);
});

test('CP03 R3-L7 a legacy run re-bound by resume keeps adopting its 1.0.x rows and does not restart at intake', () => {
  const repo = mk();
  const flFile = path.join(repo.doIt, 'finish-line.json');
  const probe = start(repo, 'probe');
  real(repo, ['next', '--run', probe]);
  const ids = readJson(flFile).rows.map((r) => r.id);
  fs.rmSync(runDirOf(repo, probe), { recursive: true, force: true });
  writeJson(flFile, { rows: ids.map((id) => ({ id, kind: 'wave', state: id !== 'verify' ? 'DONE' : 'OPEN', evidence: 'legacy', owner_question: null, reason: null, archived_to: null })) });
  const l = start(repo, 'sess-L');
  const file = path.join(runDirOf(repo, l), 'state.json');
  const st = readJson(file);
  delete st.owner;
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(runDirOf(repo, l), '.state.sha256'), sha256Bytes(fs.readFileSync(file)) + '\n');
  const r = real(repo, ['resume', '--session', 'sess-N', '--run', l]);
  assert.equal(r.out.outcome, 'REBOUND', r.stdout);
  assert.equal(r.out.owner.adopted_legacy, true);
  const n = real(repo, ['next', '--run', l]);
  assert.equal(n.out.wave, 'verify', 'carries on where the 1.0.x run was: ' + n.stdout);
  assert.equal(readJson(flFile).rows.length, ids.length, 'nothing re-seeded');
  // its new owner is gated by the open legacy row, on the hook path too (fails closed)
  const h = hookStop(repo, 'sess-N');
  assert.equal(h.out.outcome, 'STOP_REFUSED', h.stdout);
  assert.deepEqual(h.out.open, ['verify']);
});
