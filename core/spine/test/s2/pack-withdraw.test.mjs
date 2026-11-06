// S1-08 (D10): `pack withdraw --by stop-gate` withdraws unanswered stop-gate questions and nothing else.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, runDirOf, sha, startRun, writeJson } from '../helpers.mjs';
import { packIdOf } from '../../src/pack.mjs';

const q = (n, text, extra) => ({ n, kind: 'default', text, options: ['resume run', 'close with residuals'], recommendation: 'resume run', default: 'resume run', reversible: true, ...(extra || {}) });

function setup() {
  const repo = mkRepo();
  const id = startRun(repo, real);
  const questions = [
    q(1, 'The run stopped with 2 open row(s) after 3 refusals: A, B. Resume the run or close it with the open rows as residuals?', { source: 'stop-gate' }),
    q(2, 'The run stopped with 1 open row(s) after 3 refusals: C. Resume the run or close it with the open rows as residuals?', { source: 'stop-gate' }),
    q(3, 'The run stopped with 4 open row(s) after 3 refusals: D, E, F, G. Resume the run or close it with the open rows as residuals?', { source: 'stop-gate' }),
    q(4, 'Which tenant should the migration target?', { kind: 'owner-gate', options: [], recommendation: null, default: null, reversible: false }),
  ];
  const dir = runDirOf(repo, id);
  writeJson(path.join(dir, 'owner-pack.json'), { pack_id: packIdOf(questions), run_id: id, questions, created_at: '2026-11-06T00:00:00.000Z' });
  writeJson(path.join(dir, 'answers.json'), { pack_id: packIdOf(questions), answers: [{ n: 2, answer: 'resume run', source: 'reply', free_text: false }], pending: [1, 3, 4], complete: false });
  return { repo, id, dir };
}

test('T-S1-11 withdraw marks unanswered stop-gate questions, keeps answered and stage ones, and is idempotent', () => {
  const { repo, id, dir } = setup();
  const packFile = path.join(dir, 'owner-pack.json');
  const before = readJson(packFile);
  const answersBefore = sha(path.join(dir, 'answers.json'));
  const r = real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', id]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.out.outcome, 'PACK_WITHDRAWN');
  assert.deepEqual(r.out.withdrawn.map((x) => x.n), [1, 3]);
  const after = readJson(packFile);
  assert.equal(after.questions.length, 4, 'withdrawn questions are kept');
  for (const n of [1, 3]) {
    const w = after.questions.find((x) => x.n === n);
    assert.equal(w.status, 'withdrawn');
    assert.match(w.withdrawn_at, /^\d{4}-\d\d-\d\dT/);
    assert.ok(w.withdrawn_reason.length > 0);
    assert.equal(w.text, before.questions.find((x) => x.n === n).text);
  }
  for (const n of [2, 4]) {
    assert.equal(JSON.stringify(after.questions.find((x) => x.n === n)), JSON.stringify(before.questions.find((x) => x.n === n)), 'question ' + n + ' is byte-identical');
  }
  assert.equal(after.pack_id, packIdOf(after.questions));
  assert.equal(sha(path.join(dir, 'answers.json')), answersBefore);
  const once = sha(packFile);
  const again = real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', id]);
  assert.equal(again.code, 0);
  assert.equal(again.out.outcome, 'PACK_NOOP');
  assert.equal(sha(packFile), once, 'the second run changes nothing');
});

test('T-S1-11b without --run every pack is considered; a pack written before `source` existed is matched by the gate\'s own sentence', () => {
  const { repo, id, dir } = setup();
  const file = path.join(dir, 'owner-pack.json');
  const pack = readJson(file);
  for (const x of pack.questions) delete x.source;
  pack.pack_id = packIdOf(pack.questions);
  writeJson(file, pack);
  const r = real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--reason', 'raised by a session that did not own the run']);
  assert.equal(r.out.outcome, 'PACK_WITHDRAWN', r.stdout);
  assert.deepEqual(r.out.withdrawn.map((x) => x.n), [1, 3]);
  assert.equal(readJson(file).questions[0].withdrawn_reason, 'raised by a session that did not own the run');
  assert.equal(readJson(file).questions[3].status, undefined, 'the stage question is untouched');
  assert.equal(r.out.withdrawn[0].run_id, id);
});

test('T-S1-11c withdrawn questions are not asked and do not block completion', () => {
  const { repo, id, dir } = setup();
  real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', id]);
  const render = real(repo, ['answer', '--run', id, '--render', 'markdown']);
  assert.equal(render.code, 2, render.stdout);
  const md = fs.readFileSync(render.out.file, 'utf8');
  assert.match(md, /Which tenant/);
  assert.doesNotMatch(md, /A, B|D, E, F, G/, 'the two withdrawn questions are not shown');
  const done = real(repo, ['answer', '--run', id, '--reply', '4: Tenant A']);
  assert.equal(done.code, 0, done.stdout);
  assert.deepEqual(done.out.pending, []);
  assert.deepEqual(readJson(path.join(dir, 'answers.json')).pending, []);
});

test('T-S1-11d usage errors', () => {
  const { repo, id } = setup();
  assert.equal(real(repo, ['pack', 'withdraw', '--run', id]).out.outcome, 'USAGE');
  assert.equal(real(repo, ['pack']).out.outcome, 'USAGE');
  assert.equal(real(repo, ['pack', 'withdraw', '--by', 'stop-gate', '--run', 'r-nope']).out.outcome, 'RUN_NOT_FOUND');
});
