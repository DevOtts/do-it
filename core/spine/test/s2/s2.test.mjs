import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, unit, readJson, readJsonl, runDirOf, sha, startRun, writeJson, SPINE_DIR } from '../helpers.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { loadState, writeState } from '../../src/state.mjs';
import { route } from '../../src/router.mjs';
import { parseYamlLite } from '../../src/yaml-lite.mjs';
import { renderBoard } from '../../src/finish-line.mjs';

const EXIT = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };
const PIPES = path.join(SPINE_DIR, 'test', 'fixtures', 'pipelines');

function put(repo, rel, content) {
  const f = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

function result(runId, o) {
  const status = (o && o.status) || 'ok';
  return {
    schema: 'it-result/1', stage: 'build-it', run_id: runId, slice_id: null, version: '0.1.0', head_sha: null,
    status, exit_code: EXIT[status], verdicts: [], run_verdict: null, next: null, pending_human: null, artifacts: [],
    resume: { state_files: [], next_action: '' }, tokens: { meter: '', peak_ctx: 0, tier_mix: { T1: 0, T2: 0, T3: 0 }, estimated: false },
    ...(o || {}),
  };
}

function record(runner, repo, obj, name) {
  const rel = 'results/' + (name || 'r') + '.json';
  writeJson(path.join(repo.dir, rel), obj);
  return runner(repo, ['record', '--result', rel]);
}

const ctxOf = (repo) => makeCtx({ cwd: repo.dir, env: repo.env });
const stateOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json'));
const flFile = (repo) => path.join(repo.doIt, 'finish-line.json');
const eventsOf = (repo, id) => readJsonl(path.join(runDirOf(repo, id), 'events.jsonl'));
const packOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'owner-pack.json'));

function flRow(id, state, o) {
  return { id, kind: 'package', state: state || 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null, ...(o || {}) };
}

function setState(repo, id, fn) {
  const ctx = ctxOf(repo);
  const st = loadState(ctx, id);
  fn(st);
  writeState(ctx, st);
}

function slice(id, o) {
  return { id, lane: 'L1', tier: 'T2', class: 'implementation', status: 'READY', attempts: 0, escalations: 0, ...(o || {}) };
}

function readiness(repo, o) {
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), {
    schema: 'do-it-readiness/1',
    decisions: [{ id: 'D1', state: 'RESOLVED' }, { id: 'D2', state: 'DEFAULTED' }],
    preflight: { passed: true },
    credentials: [],
    owner_dependent_slices: 0,
    slices: [{ id: 's1', lane: 'L1', tier: 'T3', class: 'implementation' }, { id: 's2', depends_on: ['s1'] }],
    ...(o || {}),
  });
}

function verifiedResult(runId, id, rel) {
  return result(runId, { slice_id: id, verdicts: [{ row: id, verdict: 'VERIFIED', evidence: rel, real: false }] });
}

test('T-S2-01 route ship request to feature, no model call [REAL]', () => {
  const repo = mkRepo();
  const r = real(repo, ['start', '--request', 'ship W0-W2']);
  assert.equal(r.code, 0);
  const st = stateOf(repo, r.out.run_id);
  assert.equal(st.preset, 'feature');
  const ev = eventsOf(repo, r.out.run_id);
  const routes = ev.filter((e) => e.event === 'route');
  assert.equal(routes.length, 1);
  assert.ok(routes[0].detail.rule);
  assert.equal(routes[0].detail.model_call, false);
  assert.equal(ev.filter((e) => e.event === 'route_model').length, 0);
});

test('T-S2-02 route Portuguese bug report to investigate-fix', () => {
  const r = route('O Secretário não recebe mensagens completas');
  assert.equal(r.preset, 'investigate-fix');
  assert.ok(r.rule);
  assert.equal(r.model_call, false);
});

test('T-S2-03 route backlog request to drain with size hint', () => {
  const r = route('drain the 107 backlog cards');
  assert.equal(r.preset, 'drain');
  assert.equal(r.size, 107);
  const repo = mkRepo();
  const s = unit(repo, ['start', '--request', 'drain the 107 backlog cards']);
  assert.equal(stateOf(repo, s.out.run_id).size, 107);
  assert.equal(typeof stateOf(repo, s.out.run_id).size, 'number');
});

test('T-S2-04 ambiguous request asks the model once, logged', () => {
  const repo = mkRepo();
  const s = unit(repo, ['start', '--request', 'make it better']);
  const id = s.out.run_id;
  assert.equal(stateOf(repo, id).preset, null);
  const n1 = unit(repo, ['next']);
  assert.equal(n1.code, 0);
  assert.equal(n1.out.action, 'ROUTE_MODEL');
  assert.equal(n1.out.class, 'gather');
  assert.equal(n1.out.tier, 'T3');
  const ans = unit(repo, ['gate', 'route', '--preset', 'feature', '--reason', 'request asks for an improvement, treat as a feature']);
  assert.equal(ans.code, 0);
  const n2 = unit(repo, ['next'], { DO_IT_PIPELINES: PIPES });
  assert.notEqual(n2.out.action, 'ROUTE_MODEL');
  const rm = eventsOf(repo, id).filter((e) => e.event === 'route_model');
  assert.equal(rm.length, 1);
  assert.match(rm[0].detail.reason, /improvement/);
  unit(repo, ['next']);
  assert.equal(eventsOf(repo, id).filter((e) => e.event === 'route_model').length, 1);
});

test('T-S2-05 G-8 build refused without READINESS.json', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  setState(repo, id, (st) => { st.status = 'AWAIT_RATIFY'; });
  const r = unit(repo, ['gate', 'build']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'READINESS_MISSING');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'AWAIT_RATIFY');
  assert.ok(!st.slices.some((s) => s.status === 'RUNNING'));
});

test('T-S2-06 G-8 build refused with an unresolved decision', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  setState(repo, id, (st) => { st.status = 'AWAIT_RATIFY'; });
  readiness(repo, { decisions: [{ id: 'D1', state: 'RESOLVED' }, { id: 'D2', state: 'OPEN' }] });
  const r = unit(repo, ['gate', 'build']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'READINESS_UNRESOLVED');
  assert.deepEqual(r.out.decisions, ['D2']);
  assert.equal(stateOf(repo, id).status, 'AWAIT_RATIFY');
});

test('T-S2-07 G-8 build starts when the verdict is clean [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  readiness(repo);
  const g = real(repo, ['gate', 'build']);
  assert.equal(g.code, 0);
  assert.equal(g.out.outcome, 'READINESS_OK');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'BUILDING');
  assert.equal(st.gates.build.approved, true);
  const n = real(repo, ['next']);
  assert.equal(n.code, 0);
  assert.equal(n.out.action, 'SPAWN');
  assert.equal(n.out.slice_id, 's1');
  assert.equal(n.out.tier, 'T3');
  assert.equal(n.out.class, 'implementation');
});

test('T-S2-08 mid-run question is decided by recommendation (G-8)', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  setState(repo, id, (st) => { st.status = 'BUILDING'; st.slices.push(slice('s1', { status: 'RUNNING' })); });
  writeJson(path.join(repo.dir, 'q/questions.json'), [{ kind: 'attended', text: 'Keep the legacy flag?', options: ['keep', 'drop'], recommendation: 'keep', default: 'keep', reversible: true }]);
  const r = record(unit, repo, result(id, { status: 'needs_human', slice_id: 's1', pending_human: { gate: 'attended', questions_path: 'q/questions.json', twin_html: '' } }));
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'MIDRUN_QUESTION_REFUSED');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'BUILDING');
  assert.equal(st.slices[0].status, 'RUNNING');
  const ev = eventsOf(repo, id).find((e) => e.event === 'default_applied');
  assert.equal(ev.detail.answer, 'keep');
  const q = packOf(repo, id).questions.find((x) => x.text === 'Keep the legacy flag?');
  assert.equal(q.kind, 'default');
});

test('T-S2-09 next returns waves in dependency order', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit, ['--preset', 'waves']);
  const env = { DO_IT_PIPELINES: PIPES };
  writeJson(flFile(repo), { rows: [flRow('w1', 'OPEN', { kind: 'wave' }), flRow('w2', 'OPEN', { kind: 'wave' }), flRow('w3', 'OPEN', { kind: 'wave' })] });
  let n = unit(repo, ['next'], env);
  assert.equal(n.out.wave, 'w1');
  assert.equal(n.out.tier, 'T2');
  const order = [];
  put(repo, 'proof/w.txt', 'ok');
  const close = (w) => {
    const fl = readJson(flFile(repo));
    Object.assign(fl.rows.find((r) => r.id === w), { state: 'DONE', evidence: 'proof/w.txt' });
    writeJson(flFile(repo), fl);
  };
  close('w1');
  n = unit(repo, ['next'], env);
  order.push(n.out.wave);
  close(n.out.wave);
  n = unit(repo, ['next'], env);
  order.push(n.out.wave);
  close(n.out.wave);
  assert.deepEqual(order, ['w2', 'w3']);
  n = unit(repo, ['next'], env);
  assert.equal(n.code, 0);
  assert.equal(n.out.outcome, 'FINISH_LINE_REACHED');
  assert.equal(n.out.action, 'NONE');
  assert.ok(id);
});

test('T-S2-10 board stays small and deterministic', () => {
  const repo = mkRepo();
  startRun(repo, unit);
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push(flRow('closed-' + i, 'DONE', { evidence: 'proof/' + i + '.txt' }));
  for (let i = 0; i < 6; i++) rows.push(flRow('open-' + i));
  for (let i = 0; i < 2; i++) rows.push(flRow('parked-' + i, 'PARKED', { owner_question: 'Question number ' + i + ' that is rather long and wordy, to push the size up a lot more' }));
  for (let i = 0; i < 2; i++) rows.push(flRow('blocked-' + i, 'BLOCKED', { reason: 'owner gate: prod flag number ' + i + ' needs the owner to decide something long' }));
  writeJson(flFile(repo), { rows });
  const a = unit(repo, ['status']);
  const b = unit(repo, ['status']);
  assert.ok(a.out.board.length <= 1200);
  assert.equal(a.out.board, b.out.board);
  for (const id of ['open-0', 'open-5', 'parked-0', 'parked-1', 'blocked-0', 'blocked-1']) assert.ok(a.out.board.includes(id), id);
  assert.ok(!a.out.board.includes('closed-3'));
  assert.match(a.out.board, /50 of 60 closed/);
  const huge = { rows: Array.from({ length: 400 }, (_, i) => flRow('row-number-' + i)) };
  assert.ok(renderBoard(huge).length <= 1200);
});

test('T-S2-11 G-9 stop-gate refuses with the board, three times', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  writeJson(flFile(repo), { rows: [flRow('r1')] });
  for (const n of [1, 2, 3]) {
    const r = unit(repo, ['gate', 'stop']);
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'STOP_REFUSED');
    assert.match(r.out.board, /r1/);
    assert.equal(stateOf(repo, id).stop_refusals, n);
  }
});

test('T-S2-12 G-9 fourth refusal parks and asks [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  writeJson(flFile(repo), { rows: [flRow('r1')] });
  for (let i = 0; i < 3; i++) {
    const r = real(repo, ['gate', 'stop']);
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'STOP_REFUSED');
  }
  const r4 = real(repo, ['gate', 'stop']);
  assert.equal(r4.code, 2);
  assert.equal(r4.out.outcome, 'PARKED');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'PARKED');
  assert.equal(st.stop_refusals, 0);
  const q = packOf(repo, id).questions[0];
  assert.equal(q.kind, 'default');
  assert.ok(q.recommendation);
  assert.match(q.text, /r1/);
});

test('T-S2-13 progress resets the stop-gate counter', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  writeJson(flFile(repo), { rows: [flRow('r1'), flRow('r2')] });
  unit(repo, ['gate', 'stop']);
  unit(repo, ['gate', 'stop']);
  assert.equal(stateOf(repo, id).stop_refusals, 2);
  put(repo, 'proof/r1.txt', 'ok');
  writeJson(flFile(repo), { rows: [flRow('r1', 'DONE', { evidence: 'proof/r1.txt' }), flRow('r2')] });
  const r = unit(repo, ['gate', 'stop']);
  assert.equal(r.out.outcome, 'STOP_REFUSED');
  assert.equal(r.out.stop_refusals, 1);
  assert.equal(stateOf(repo, id).stop_refusals, 1);
});

test('T-S2-14 stop is allowed when every row is terminal', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  writeJson(flFile(repo), { rows: [
    flRow('r1', 'DONE', { evidence: 'proof/r1.txt' }),
    flRow('r2', 'PARKED', { owner_question: 'Which tenant?' }),
    flRow('r3', 'BLOCKED', { reason: 'owner gate' }),
  ] });
  setState(repo, id, (st) => { st.stop_refusals = 2; });
  const r = unit(repo, ['gate', 'stop']);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'STOP_ALLOWED');
  assert.equal(stateOf(repo, id).stop_refusals, 2);
  // a DONE row without evidence is not closed
  writeJson(flFile(repo), { rows: [flRow('r1', 'DONE')] });
  assert.equal(unit(repo, ['gate', 'stop']).out.outcome, 'STOP_REFUSED');
});

test('T-S2-15 BLOCKED outcome parks only its own slice', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  setState(repo, id, (st) => { st.status = 'BUILDING'; st.slices.push(slice('a'), slice('b')); });
  writeJson(flFile(repo), { rows: [flRow('a'), flRow('b')] });
  const empty = record(unit, repo, result(id, { status: 'blocked', slice_id: 'a', reason: '  ' }), 'e');
  assert.equal(empty.code, 1);
  assert.equal(empty.out.outcome, 'BLOCK_REASON_REQUIRED');
  const r = record(unit, repo, result(id, { status: 'blocked', slice_id: 'a', reason: 'owner gate: prod flag' }), 'a');
  assert.equal(r.out.outcome, 'BLOCKED');
  let st = stateOf(repo, id);
  assert.equal(st.slices[0].status, 'BLOCKED');
  assert.equal(st.status, 'BUILDING');
  const row = readJson(flFile(repo)).rows.find((x) => x.id === 'a');
  assert.equal(row.state, 'BLOCKED');
  assert.equal(row.reason, 'owner gate: prod flag');
  const n = unit(repo, ['next']);
  assert.equal(n.out.slice_id, 'b');
  put(repo, 'proof/b.txt', 'ok');
  const rb = record(unit, repo, verifiedResult(id, 'b', 'proof/b.txt'), 'b');
  assert.equal(rb.code, 3);
  st = stateOf(repo, id);
  assert.equal(st.status, 'BLOCKED');
  assert.equal(unit(repo, ['next']).code, 3);
});

test('T-S2-16 FAILED then retry one tier up (CONTRACT M1)', () => {
  for (const [from, to] of [['T3', 'T2'], ['T2', 'T1'], ['T1', 'T1']]) {
    const repo = mkRepo();
    const id = startRun(repo, unit);
    setState(repo, id, (st) => { st.status = 'BUILDING'; st.slices.push(slice('s1', { tier: from })); });
    const r = record(unit, repo, result(id, { status: 'failed', slice_id: 's1' }));
    assert.equal(r.out.outcome, 'FAILED');
    assert.equal(r.code, 1);
    let st = stateOf(repo, id);
    assert.deepEqual([st.slices[0].status, st.slices[0].attempts], ['FAILED', 1]);
    const n = unit(repo, ['next']);
    assert.equal(n.out.slice_id, 's1');
    assert.equal(n.out.tier, to);
    assert.equal(n.out.reason, 'retry after FAILED');
    assert.equal(n.out.escalations, 1);
    st = stateOf(repo, id);
    assert.equal(st.slices[0].escalations, 1);
    // asking again does not escalate a second time
    assert.equal(unit(repo, ['next']).out.escalations, 1);
  }
});

test('T-S2-17 second failure ends in ESCALATED [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  setState(repo, id, (st) => { st.status = 'BUILDING'; st.slices.push(slice('s1', { tier: 'T3' })); });
  assert.equal(record(real, repo, result(id, { status: 'failed', slice_id: 's1' }), 'f1').out.outcome, 'FAILED');
  assert.equal(real(repo, ['next']).out.tier, 'T2');
  const r = record(real, repo, result(id, { status: 'failed', slice_id: 's1' }), 'f2');
  assert.equal(r.code, 2);
  assert.equal(r.out.outcome, 'ESCALATED');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'ESCALATED');
  assert.equal(st.slices[0].status, 'ESCALATED');
  assert.match(packOf(repo, id).questions[0].text, /s1/);
  const n = real(repo, ['next']);
  assert.equal(n.out.action, 'NONE');
  assert.equal(n.out.reason, 'escalated');
});

test('T-S2-18 readiness re-read catches an edit after the gate (adversarial)', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  readiness(repo);
  assert.equal(unit(repo, ['gate', 'build']).code, 0);
  const file = path.join(repo.doIt, 'plan', 'READINESS.json');
  const good = fs.readFileSync(file);
  const edited = JSON.parse(good.toString());
  edited.decisions[0].state = 'OPEN';
  fs.writeFileSync(file, JSON.stringify(edited));
  const before = fs.readFileSync(path.join(runDirOf(repo, id), 'state.json'));
  const n = unit(repo, ['next']);
  assert.equal(n.code, 1);
  assert.equal(n.out.outcome, 'READINESS_UNRESOLVED');
  assert.deepEqual(fs.readFileSync(path.join(runDirOf(repo, id), 'state.json')), before);
  assert.equal(stateOf(repo, id).status, 'BUILDING');
  assert.ok(eventsOf(repo, id).some((e) => e.event === 'readiness_revoked'));
  fs.writeFileSync(file, good);
  assert.equal(unit(repo, ['next']).code, 0);
  assert.ok(sha(file));
});

test('yaml-lite accepts the subset and rejects the rest', () => {
  const doc = parseYamlLite('name: x\nsteps:\n  - id: a\n    needs: [b, "c d"]\n    max_rounds: 3\n  - id: b # trailing\n');
  assert.deepEqual(doc, { name: 'x', steps: [{ id: 'a', needs: ['b', 'c d'], max_rounds: 3 }, { id: 'b' }] });
  for (const bad of ['a: &x 1\n', 'a: *x\n', 'a: !!str 1\n', 'a: |\n  text\n', 'a: {b: 1}\n', 'a:\n\t- 1\n']) {
    assert.throws(() => parseYamlLite(bad), (e) => e.outcome === 'PIPELINE_UNSUPPORTED_YAML', bad);
  }
});
