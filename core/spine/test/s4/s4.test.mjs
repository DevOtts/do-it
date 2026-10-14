import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseReply } from '../../src/reply.mjs';
import { packAppend, packPath } from '../../src/pack.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { BIN, mkRepo, real, unit, readJson, readJsonl, runDirOf, sha, sha256Bytes, startRun, tmp, writeJson } from '../helpers.mjs';

const CORPUS = JSON.parse(fs.readFileSync(new URL('../fixtures/replies.json', import.meta.url), 'utf8'));

function q(n, extra) {
  return { n, kind: 'default', text: 'Question ' + n, options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: true, ...(extra || {}) };
}

// Writes owner-pack.json through the spine's own appender (stable numbering, pack_id).
function seed(repo, runId, questions) {
  const ctx = makeCtx({ cwd: repo.dir, env: repo.env });
  packAppend(ctx, runId, questions.map((x) => { const { n, ...rest } = x; return rest; }));
  return readJson(packPath(ctx, runId));
}

function events(repo, runId) { return readJsonl(path.join(runDirOf(repo, runId), 'events.jsonl')); }
function setStatus(repo, runId, status) {
  for (const to of ['BUILDING', status]) {
    if (to === 'BUILDING' && status === 'BUILDING') continue;
    const r = unit(repo, ['gate', 'advance', '--to', to, '--run', runId]);
    assert.equal(r.code, 0, r.stdout);
  }
}

function setup(questions, opts) {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, unit);
  const pack = seed(repo, runId, questions);
  if (opts && opts.status) setStatus(repo, runId, opts.status);
  return { repo, runId, pack, dir: runDirOf(repo, runId) };
}

test('T-S4-01 one pack from two stages (ruling D7) [REAL]', () => {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, real);
  const one = (stage, name, questions) => {
    writeJson(path.join(repo.dir, 'results', name + '-q.json'), { questions });
    const res = {
      schema: 'it-result/1', stage, run_id: runId, slice_id: null, version: '0.1.0', head_sha: null, status: 'needs_human', exit_code: 2,
      verdicts: [], run_verdict: null, next: null, pending_human: { questions_path: 'results/' + name + '-q.json' }, artifacts: [],
      resume: { state_files: [], next_action: '' }, tokens: { meter: '', peak_ctx: 0, tier_mix: { T1: 0, T2: 0, T3: 0 }, estimated: false },
    };
    writeJson(path.join(repo.dir, 'results', name + '.json'), res);
    return real(repo, ['record', '--result', 'results/' + name + '.json']);
  };
  const qa = { kind: 'ratify', text: 'Ship the plan?', options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: true };
  const qb = { kind: 'review-cap', text: 'Raise the cap?', options: ['yes', 'no'], recommendation: 'no', default: 'no', reversible: true };
  const qc = { kind: 'owner-gate', text: 'Enable the flag?', options: ['yes', 'no'], recommendation: 'no', default: null, reversible: false };
  assert.equal(one('plan-it', 'a', [qa]).code, 2);
  assert.equal(one('review-it', 'b', [qb, qc]).code, 2);
  assert.equal(one('review-it', 'c', [qb]).code, 2);
  const pack = readJson(path.join(runDirOf(repo, runId), 'owner-pack.json'));
  assert.deepEqual(pack.questions.map((x) => x.n), [1, 2, 3]);
  assert.deepEqual(pack.questions.map((x) => x.text), [qa.text, qb.text, qc.text]);
  for (const x of pack.questions) for (const k of ['n', 'kind', 'text', 'options', 'recommendation', 'default', 'reversible']) assert.ok(k in x, k);
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
  assert.equal(pack.pack_id, sha256Bytes(canon(pack.questions)));
  assert.equal(fs.readdirSync(runDirOf(repo, runId)).filter((f) => f === 'owner-pack.json').length, 1);
});

test('T-S4-02 terse reply with a free-text clause (G-16)', () => {
  const { repo } = setup([q(1), q(2), q(3, { options: ['A', 'B'], recommendation: 'A', default: 'A' })], { status: 'NEEDS_HUMAN' });
  const r = unit(repo, ['answer', '--reply', '1 yes 2 no 3: B']);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.out.outcome, 'ANSWERED');
  const a = r.out.answers;
  assert.deepEqual(a.map((x) => [x.n, x.answer, x.free_text]), [[1, 'yes', false], [2, 'no', false], [3, 'B', true]]);
});

test('T-S4-03 all except leaves the named questions pending', () => {
  const qs = [1, 2, 3, 4, 5, 6, 7].map((n) => q(n, { recommendation: n % 2 ? 'yes' : 'no' }));
  for (const reply of ['all except 4 7', 'approve all except 4 and 7']) {
    const { repo } = setup(qs);
    const r = unit(repo, ['answer', '--reply', reply]);
    assert.equal(r.code, 2, r.stdout);
    assert.equal(r.out.outcome, 'PENDING');
    assert.deepEqual(r.out.pending, [4, 7]);
    assert.deepEqual(r.out.answers.map((x) => x.n), [1, 2, 3, 5, 6]);
    for (const x of r.out.answers) {
      assert.equal(x.source, 'recommendation');
      assert.equal(x.answer, x.n % 2 ? 'yes' : 'no');
    }
  }
});

test('T-S4-04 free text may contain digits', () => {
  for (const reply of ['3: use 2 workers; 4 yes', '3: use 2 workers\n4 yes']) {
    const p = parseReply(reply, [q(3), q(4)]);
    assert.deepEqual(p.items, [{ n: 3, answer: 'use 2 workers', free_text: true }, { n: 4, answer: 'yes', free_text: false }]);
  }
  assert.deepEqual(parseReply('3: keep it', [q(3)]).items, [{ n: 3, answer: 'keep it', free_text: true }]);
});

test('T-S4-05 G-16 golden corpus is deterministic', () => {
  assert.equal(CORPUS.cases.length, 25);
  let parses = 0;
  for (const c of CORPUS.cases) {
    const first = JSON.stringify(parseReply(c.reply, CORPUS.questions));
    assert.equal(first, JSON.stringify(c.expected), 'golden mismatch for ' + JSON.stringify(c.reply));
    for (let i = 0; i < 20; i++) { assert.equal(JSON.stringify(parseReply(c.reply, CORPUS.questions)), first); parses++; }
  }
  assert.equal(parses, 500);
});

test('T-S4-06 G-16 same answers regardless of environment [REAL]', () => {
  const hashes = [];
  const envs = [{ LC_ALL: 'C', TZ: 'UTC' }, { LC_ALL: 'pt_BR.UTF-8', TZ: 'UTC' }, { LC_ALL: 'tr_TR.UTF-8', TZ: 'UTC' }, { LC_ALL: 'C', TZ: 'Asia/Tokyo' }, { LC_ALL: 'tr_TR.UTF-8', TZ: 'Asia/Tokyo' }];
  let upper;
  for (const env of envs) {
    const repo = mkRepo({ commit: true });
    const runId = startRun(repo, real);
    seed(repo, runId, [q(1), q(2), q(3, { options: ['A', 'B'], recommendation: 'A', default: 'A' })]);
    const reply = env.LC_ALL === 'tr_TR.UTF-8' ? 'ALL EXCEPT 2' : 'all except 2';
    const r = real(repo, ['answer', '--reply', reply], env);
    assert.equal(r.code, 2, r.stdout);
    hashes.push(sha(path.join(runDirOf(repo, runId), 'answers.json')));
    if (env.LC_ALL === 'tr_TR.UTF-8') upper = r.out.answers;
  }
  assert.equal(new Set(hashes).size, 1, hashes.join(' '));
  assert.ok(upper && upper.length === 2);
  assert.ok(fs.existsSync(BIN));
});

test('T-S4-07 invalid option or unknown question', () => {
  const { repo, dir } = setup([q(1), q(2), q(3)]);
  const a = unit(repo, ['answer', '--reply', '1 maybe']);
  assert.equal(a.code, 1);
  assert.equal(a.out.outcome, 'ANSWER_INVALID');
  assert.equal(a.out.n, 1);
  assert.deepEqual(a.out.allowed, ['yes', 'no']);
  const b = unit(repo, ['answer', '--reply', '9 yes']);
  assert.equal(b.code, 1);
  assert.equal(b.out.outcome, 'ANSWER_UNKNOWN_QUESTION');
  assert.equal(b.out.n, 9);
  assert.ok(!fs.existsSync(path.join(dir, 'answers.json')));
});

test('T-S4-08 defaults applied when unanswered', () => {
  const { repo, runId } = setup([
    q(1, { default: 'A', options: ['A', 'B'], recommendation: 'A' }),
    q(2, { default: 'B', options: ['A', 'B'], recommendation: 'B' }),
    q(3, { default: 'C', options: ['C', 'D'], reversible: false }),
    q(4, { kind: 'owner-gate', default: 'D', options: ['C', 'D'] }),
  ]);
  const r = unit(repo, ['answer', '--reply', '1 B', '--finalize']);
  assert.equal(r.code, 2, r.stdout);
  assert.equal(r.out.outcome, 'PENDING');
  assert.deepEqual(r.out.pending, [3, 4]);
  const byN = Object.fromEntries(r.out.answers.map((x) => [x.n, x]));
  assert.deepEqual([byN[1].answer, byN[1].source, byN[2].answer, byN[2].source], ['B', 'reply', 'B', 'default']);
  const applied = events(repo, runId).filter((e) => e.event === 'default_applied');
  assert.deepEqual(applied.map((e) => e.detail.n), [2]);
});

test('T-S4-09 HTML renderer is well-formed and escaped [REAL]', () => {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, real);
  seed(repo, runId, [
    { n: 1, kind: 'default', text: 'Use <b>X</b> & "Y"?', options: ['</script><script>alert(1)</script>', 'no'], recommendation: 'no', default: 'no', reversible: true },
    q(2), q(3),
  ]);
  const r = real(repo, ['answer', '--render', 'html']);
  assert.equal(r.code, 2, r.stdout);
  const file = path.join(runDirOf(repo, runId), 'owner-pack.html');
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.length > 0);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt; &amp;'));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!/<script/i.test(html));
  // tag balance
  const VOID = new Set(['meta', 'br', 'hr', 'img', 'link', 'input']);
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (m[3] === '/' || VOID.has(name)) continue;
    if (m[1]) assert.equal(stack.pop(), name, 'stray </' + name + '>');
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
  assert.equal((html.match(/<li\b/g) || []).length, 3);
  for (const n of [1, 2, 3]) assert.equal((html.match(new RegExp('<li id="q' + n + '"', 'g')) || []).length, 1);
});

test('T-S4-10 markdown renderer', () => {
  const { repo, dir } = setup([q(1), q(2, { recommendation: 'no' }), q(3, { options: ['A', 'B'], recommendation: 'B', default: 'A' })]);
  const r = unit(repo, ['answer', '--render', 'markdown']);
  assert.equal(r.code, 2, r.stdout);
  const md = fs.readFileSync(path.join(dir, 'owner-pack.md'), 'utf8');
  for (const n of [1, 2, 3]) assert.match(md, new RegExp('^' + n + '\\. Question ' + n, 'm'));
  assert.equal((md.match(/Options:/g) || []).length, 3);
  assert.equal((md.match(/Recommendation:/g) || []).length, 3);
  assert.equal((md.match(/Default:/g) || []).length, 3);
  const last = md.trim().split('\n').pop();
  assert.equal(last, 'Example reply: `1 yes 2 no 3 B`');
  assert.equal((md.match(/```/g) || []).length % 2, 0);
});

test('T-S4-11 native renderer for 4 questions or fewer', () => {
  const { repo, dir } = setup([1, 2, 3].map((n) => q(n, { options: ['a', 'b', 'c'], recommendation: 'a', default: 'a' })));
  const r = unit(repo, ['answer', '--render', 'auto', '--native-max', '4']);
  assert.equal(r.out.mode, 'native');
  assert.equal(r.out.payload.questions.length, 3);
  for (const e of r.out.payload.questions) { assert.ok(e.header && e.question); assert.equal(e.options.length, 3); }
  assert.ok(!fs.existsSync(path.join(dir, 'owner-pack.html')));
});

test('T-S4-12 native limit exceeded falls back to html', () => {
  const five = setup([1, 2, 3, 4, 5].map((n) => q(n)));
  const a = unit(five.repo, ['answer', '--render', 'auto', '--native-max', '4']);
  assert.equal(a.out.mode, 'html'); assert.equal(a.code, 2); assert.equal(a.out.outcome, 'AWAITING_REPLY');
  assert.equal(a.out.file, path.join(five.dir, 'owner-pack.html')); assert.ok(fs.existsSync(a.out.file));
  const wide = setup([q(1), q(2, { options: ['a', 'b', 'c', 'd', 'e'], recommendation: 'a', default: 'a' }), q(3)]);
  const b = unit(wide.repo, ['answer', '--render', 'auto', '--native-max', '4']);
  assert.equal(b.out.mode, 'html'); assert.equal(b.code, 2); assert.ok(fs.existsSync(path.join(wide.dir, 'owner-pack.html')));
});

test('T-S4-13 fallback chain ends in markdown [REAL]', () => {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, real);
  seed(repo, runId, [q(1), q(2)]);
  const dir = runDirOf(repo, runId);
  fs.mkdirSync(path.join(dir, 'owner-pack.html'));
  const r = real(repo, ['answer', '--render', 'auto', '--native-max', '0']);
  assert.equal(r.code, 2, r.stdout);
  assert.equal(r.out.outcome, 'AWAITING_REPLY');
  assert.equal(r.out.mode, 'markdown');
  assert.ok(fs.existsSync(path.join(dir, 'owner-pack.md')));
  const failed = events(repo, runId).filter((e) => e.event === 'render_failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].detail.mode, 'html');
});

test('T-S4-14 settings fallback order is honored', () => {
  const { repo, dir } = setup([q(1), q(2)]);
  writeJson(path.join(repo.doIt, 'settings.json'), { version: 1, interaction: { fallback: ['markdown', 'html'] } });
  const r = unit(repo, ['answer', '--render', 'auto', '--native-max', '4']);
  assert.equal(r.out.mode, 'markdown');
  assert.ok(fs.existsSync(path.join(dir, 'owner-pack.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'owner-pack.html')));
});

test('T-S4-15 full reply resumes the run [REAL]', () => {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, real);
  seed(repo, runId, [q(1), q(2)]);
  setStatus(repo, runId, 'NEEDS_HUMAN');
  const first = real(repo, ['answer', '--reply', '1 yes 2 no']);
  assert.equal(first.code, 0, first.stdout);
  assert.equal(first.out.outcome, 'ANSWERED');
  const file = path.join(runDirOf(repo, runId), 'answers.json');
  assert.ok(fs.existsSync(file));
  assert.equal(readJson(path.join(runDirOf(repo, runId), 'state.json')).status, 'BUILDING');
  const before = fs.readFileSync(file);
  const second = real(repo, ['answer', '--reply', '1 yes 2 no']);
  assert.equal(second.code, 0);
  assert.equal(second.out.outcome, 'ANSWER_NOOP');
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('T-S4-16 adversarial: pack altered after rendering', () => {
  const { repo, runId, dir } = setup([q(1), q(2), q(3)]);
  assert.equal(unit(repo, ['answer', '--render', 'html']).code, 2);
  const f = path.join(dir, 'owner-pack.json');
  const pack = readJson(f);
  pack.questions[1].options = ['yes', 'no', 'sneaky'];
  writeJson(f, pack);
  const r = unit(repo, ['answer', '--reply', '1 yes 2 no 3 yes']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'PACK_CHANGED');
  assert.ok(!fs.existsSync(path.join(dir, 'answers.json')));
  assert.ok(runId);
});

test('B9 meter rows keep null tokens (G-6) and still validate', () => {
  const { repo, runId } = setup([q(1)]);
  const row = { source: 'unknown', tokens_in: null, tokens_out: null, cache_read: null, cache_write: null };
  const r = unit(repo, ['meter', '--append', '--row', JSON.stringify(row)]);
  assert.equal(r.code, 0, r.stdout);
  const last = readJsonl(path.join(runDirOf(repo, runId), 'token-meter.jsonl')).pop();
  assert.deepEqual([last.tokens_in, last.tokens_out, last.cache_read, last.cache_write], [null, null, null, null]);
});
