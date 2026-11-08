// CP-03 round 4 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';

const made = [];
const mk = (o) => { const r = mkRepo(o); made.push(r.dir, r.home); return r; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function start(repo, session, cwd, env) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session], env, cwd);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}
const hookStop = (repo, session, cwd, env) => real(repo, ['gate', 'stop', '--session', session, '--cwd', cwd || repo.dir], env, cwd);
const statusOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json')).status;
const packOf = (repo, id) => { try { return readJson(path.join(runDirOf(repo, id), 'owner-pack.json')); } catch { return null; } };
const res = (a, o) => ({ schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, verdicts: [], ...o });

function building(repo, session) {
  const a = start(repo, session);
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
  return a;
}

test('CP03 R4-S1-H8 run-level needs_human with no question, blocked or failed with no reason are refused; the run stays gated', () => {
  const repo = mk();
  const a = building(repo, 'S');
  const r = path.join(repo.dir, 'results', 'r.json');
  const cases = [
    [{ status: 'needs_human', exit_code: 2 }, 'NEEDS_HUMAN_WITHOUT_QUESTION'],
    [{ status: 'blocked', exit_code: 3 }, 'BLOCK_REASON_REQUIRED'],
    [{ status: 'failed', exit_code: 1 }, 'FAIL_REASON_REQUIRED'],
    [{ status: 'blocked', exit_code: 3, reason: '   ' }, 'BLOCK_REASON_REQUIRED'],
    [{ status: 'failed', exit_code: 1, reason: '' }, 'FAIL_REASON_REQUIRED'],
    // a questions file that yields nothing the pack accepts is no question
    [{ status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/empty-q.json' } }, 'NEEDS_HUMAN_WITHOUT_QUESTION'],
  ];
  writeJson(path.join(repo.dir, 'results', 'empty-q.json'), { questions: [{ kind: 'ratify', text: '  ' }] });
  for (const [o, want] of cases) {
    writeJson(r, res(a, o));
    const out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
    assert.equal(out.code, 1, JSON.stringify(o) + ': ' + out.stdout);
    assert.equal(out.out.outcome, want, JSON.stringify(o));
    assert.equal(statusOf(repo, a), 'BUILDING', JSON.stringify(o) + ' left the status alone');
  }
  // one hook stop after all of them (each stop without progress counts toward patience)
  const hook = hookStop(repo, 'S');
  assert.equal(hook.out.outcome, 'STOP_REFUSED', hook.stdout);
  assert.equal(hook.out.open.length, 10, 'the board still has its 10 open rows');
  assert.equal(packOf(repo, a), null, 'no pack was written by a refused record');
});

test('CP03 R4-S1-H8 with a reason, BLOCKED and FAILED record it in state and events; FAILED then escalates only through an owner-pack question', () => {
  const repo = mk();
  const a = building(repo, 'S');
  writeJson(path.join(repo.dir, 'results', 'b.json'), res(a, { status: 'blocked', exit_code: 3, reason: 'owner gate: the production flag is not set' }));
  const b = real(repo, ['record', '--run', a, '--result', 'results/b.json']);
  assert.equal(b.out.outcome, 'RECORDED', b.stdout);
  assert.equal(b.out.reason, 'owner gate: the production flag is not set');
  let st = readJson(path.join(runDirOf(repo, a), 'state.json'));
  assert.equal(st.status, 'BLOCKED');
  assert.deepEqual([st.status_reason.status, st.status_reason.reason], ['BLOCKED', 'owner gate: the production flag is not set']);
  const ev = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8');
  assert.match(ev, /"event":"run_blocked".*production flag/);

  const c = building(repo, 'S2');
  writeJson(path.join(repo.dir, 'results', 'f.json'), res(c, { status: 'failed', exit_code: 1, reason: 'the build exited non-zero three times' }));
  assert.equal(real(repo, ['record', '--run', c, '--result', 'results/f.json']).code, 1);
  st = readJson(path.join(runDirOf(repo, c), 'state.json'));
  assert.equal(st.status, 'FAILED');
  assert.equal(st.status_reason.reason, 'the build exited non-zero three times');
  assert.match(fs.readFileSync(path.join(runDirOf(repo, c), 'events.jsonl'), 'utf8'), /"event":"run_failed".*non-zero three times/);
  // the reviewer's `gate escalate --reason "x y z"`: it now hands the run to the owner through the pack
  assert.equal(packOf(repo, c), null);
  const esc = real(repo, ['gate', 'escalate', '--run', c, '--reason', 'x y z']);
  assert.equal(esc.out.outcome, 'ESCALATED', esc.stdout);
  const pack = packOf(repo, c);
  assert.equal(pack.questions.length, 1, 'the escalation wrote one owner-pack question');
  assert.equal(pack.questions[0].kind, 'escalation');
  assert.match(pack.questions[0].text, /x y z.*recorded cause: the build exited non-zero three times/);
  assert.equal(esc.out.pack_question, pack.questions[0].n);
  assert.match(fs.readFileSync(path.join(runDirOf(repo, c), 'events.jsonl'), 'utf8'), /"event":"escalated".*"question":1/);
});

test('CP03 R4-S1-H8 legitimate callers keep working: needs_human with a question from INTAKE, and G-8 mid-run defaults from BUILDING', () => {
  const repo = mk();
  const a = start(repo, 'S');
  writeJson(path.join(repo.dir, 'results', 'q.json'), { questions: [{ kind: 'ratify', text: 'Ship the plan?', options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: true }] });
  writeJson(path.join(repo.dir, 'results', 'r.json'), res(a, { stage: 'plan-it', status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q.json' } }));
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r.json']).code, 2);
  assert.equal(statusOf(repo, a), 'NEEDS_HUMAN');
  // a second needs_human on a run that already waits is not a new transition
  writeJson(path.join(repo.dir, 'results', 'r2.json'), res(a, { stage: 'plan-it', status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q.json' } }));
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r2.json']).code, 2);
  // autonomy (G-8, X27): from BUILDING the question becomes a default and the run keeps going
  const b = building(repo, 'S2');
  writeJson(path.join(repo.dir, 'results', 'q2.json'), [{ kind: 'attended', text: 'Keep the legacy flag?', options: ['keep', 'drop'], recommendation: 'keep', default: 'keep', reversible: true }]);
  writeJson(path.join(repo.dir, 'results', 'r3.json'), res(b, { status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q2.json' } }));
  const m = real(repo, ['record', '--run', b, '--result', 'results/r3.json']);
  assert.equal(m.out.outcome, 'MIDRUN_QUESTION_REFUSED', m.stdout);
  assert.equal(statusOf(repo, b), 'BUILDING');
  assert.equal(hookStop(repo, 'S2').out.outcome, 'STOP_REFUSED');
});
