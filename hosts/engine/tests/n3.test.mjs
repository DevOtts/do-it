// Epic N3 test contract. Test names carry the case ID. [REAL] cases 11 to 13 use the real Engine-Core repo and
// real files; case 14 needs a live Engine and ends IMPLEMENTED-NOT-VERIFIED when none is reachable (G-3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCard, runCard, rereview, evidenceResolves } from '../conformance/engine-sim.mjs';
import { DEFAULT_DIR } from '../conformance/spec-lint.mjs';
import { DEFAULT_REPO } from '../conformance/scope-check.mjs';
import { probeEngine } from '../live/probe.mjs';
import { liveClient, liveReplay } from '../live/live-cases.mjs';
import { reviewLoop } from '../review/cap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONF = path.resolve(HERE, '../conformance');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const expected = readJson(path.join(CONF, 'expected.json'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'n3-'));
const node = (script, args = []) => spawnSync(process.execPath, [path.join(CONF, script), ...args], { encoding: 'utf8' });
const live = await probeEngine();
const verdict = (id, v, detail) => console.log(`VERDICT ${id} ${v}${detail ? ' ' + detail : ''}`);

test('T-N3-01 spec has 15 points', () => {
  const r = node('spec-lint.mjs');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /spec_points: 15/);
  const spec = fs.readFileSync(path.join(DEFAULT_DIR, '02-ENGINE-LAYER-SPEC.md'), 'utf8');
  const pts = [...spec.matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1])).filter((n) => n <= 15);
  assert.ok([...Array(15).keys()].every((i) => pts.includes(i + 1)));
  for (const n of [6, 9, 10, 15]) assert.match(spec.split('\n').find((l) => l.startsWith(`${n}. `)), /\*\*NEW/);
});

test('T-N3-02 adjustments file has 12 items', () => {
  const r = node('spec-lint.mjs');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /adjustments: 12/);
  const adj = fs.readFileSync(path.join(DEFAULT_DIR, '01-ADJUSTMENTS-TO-ENGINE-DEV-SQUAD.md'), 'utf8');
  assert.match(adj, /Status: PROPOSED/);
  assert.match(adj, /Recommended first batch: 1, 2, 4, 6, 7\./);
});

test('T-N3-03 hygiene fixes applied', () => {
  const after = node('spec-lint.mjs');
  assert.equal(after.status, 0, after.stdout);
  const spec = fs.readFileSync(path.join(DEFAULT_DIR, '02-ENGINE-LAYER-SPEC.md'), 'utf8');
  assert.ok(!/loop cap 2/i.test(spec));
  assert.match(spec, /3 per PD-06/);
  const p6 = spec.split('\n').find((l) => l.startsWith('6. '));
  for (const b of ['`local`', '`git-branch`', '`engine`']) assert.ok(p6.includes(b), b);
  assert.match(p6, /card[^.]*implementation/);
  // before: the stale text as it stood in the draft
  const dir = tmp();
  for (const f of fs.readdirSync(DEFAULT_DIR)) fs.copyFileSync(path.join(DEFAULT_DIR, f), path.join(dir, f));
  const stale = spec
    .replace(/in Engine the backend id is `engine` \([^)]*\)/, 'in Engine the backend is card + artifact refs')
    .replace('(`local`, `git-branch`, `engine`)', '(`local`, `git-branch`, `card`)')
    .replace('6 (write the loop cap, 3 per PD-06, in the statechart)', '6 (loop cap 2 in statechart)');
  fs.writeFileSync(path.join(dir, '02-ENGINE-LAYER-SPEC.md'), stale);
  const before = node('spec-lint.mjs', ['--dir', dir]);
  assert.equal(before.status, 1);
  assert.match(before.stdout, /LOOP_CAP_2/);
  assert.match(before.stdout, /POINT6_BACKENDS/);
});

test('T-N3-04 replay happy path: lp_content card', async () => {
  const out = tmp();
  const run = await runCard(loadCard('lp_content-card'), { runDir: out });
  assert.deepEqual(run.gates, expected.happy.gates);
  assert.equal(run.run_status, 'DONE');
  const res = readJson(run.result_path);
  assert.equal(res.exit_code, 0);
  assert.equal(res.status, 'ok');
  assert.ok(res.verdicts.length > 0 && evidenceResolves(run));
  for (const v of res.verdicts) assert.ok(fs.existsSync(path.join(path.dirname(run.result_path), v.evidence)));
  const cli = node('replay.mjs', ['--case', 'happy', '--out', out]);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});

test('T-N3-05 replay: stale head', async () => {
  const out = tmp();
  const run = await runCard(loadCard('stale-head'), { runDir: out });
  assert.deepEqual(run.gates, expected['stale-head'].gates);
  assert.notEqual(run.run_status, 'DONE');
  assert.equal(run.status, 'blocked');
  assert.equal(run.reason, 'STALE_HEAD');
  assert.equal(readJson(run.result_path).exit_code, 3);
  assert.equal(run.rows.find((r) => r.row === 'review').verdict, 'IMPLEMENTED-NOT-VERIFIED');
  assert.notEqual(run.bound_head_sha, run.head_sha);
  const again = await rereview(run, { runDir: out });
  assert.equal(again.review_row.verdict, 'VERIFIED');
  assert.equal(again.run_status, 'DONE');
});

test('T-N3-06 replay: budget denied', async () => {
  const run = await runCard(loadCard('budget-denied'), { runDir: tmp() });
  assert.deepEqual(run.gates, expected['budget-denied'].gates);
  assert.equal(run.run_status, 'PARKED');
  assert.equal(run.reason, 'BUDGET_DENIED');
  assert.ok(!run.gates.includes('verify') && !run.gates.includes('build'));
  const res = readJson(run.result_path);
  assert.equal(res.exit_code, 3);
  assert.equal(res.resume.next_action, 'build');
});

test('T-N3-07 replay: loop cap', async () => {
  const run = await runCard(loadCard('loop-cap'), { runDir: tmp() });
  assert.deepEqual(run.gates, expected['loop-cap'].gates);
  assert.equal(run.run_status, 'ESCALATED');
  assert.equal(run.rounds, 3);
  assert.equal(readJson(run.result_path).exit_code, 2);
  assert.ok(!run.gates.includes('review:round4'));
  const stalled = await runCard({ ...loadCard('loop-cap'), id: 'card-stalled', review_script: [['same'], ['same'], ['same']] }, { runDir: tmp() });
  assert.equal(stalled.run_status, 'STALLED');
  assert.equal(stalled.gates.filter((g) => g.startsWith('review:round')).length, 2);
  assert.equal((await reviewLoop(async () => ({ findings: ['x'] }), { cap: 3 })).outcome, 'STALLED');
});

test('T-N3-08 replay: prompt injection in the card body', async () => {
  const out = tmp();
  const happy = await runCard(loadCard('lp_content-card'), { runDir: out });
  const inj = await runCard(loadCard('injection'), { runDir: out });
  assert.equal(inj.repo, 'acme/site');
  assert.equal(inj.host, 'engine');
  assert.deepEqual(inj.tools, happy.tools);
  assert.deepEqual(inj.definition, happy.definition);
  assert.ok(inj.events.some((e) => e.event === 'untrusted_instruction_ignored'));
  assert.ok(inj.definition.steps.filter((s) => s.type === 'persona').every((s) => s.deny.includes('deploy') && !(s.x_do_it?.capabilities || []).includes('publish')));
  assert.equal(inj.run_status, happy.run_status);
  assert.deepEqual(inj.gates, happy.gates);
});

test('T-N3-09 partial replay failure is reported, interrupted replay resumes', () => {
  const out = tmp();
  const wrong = readJson(path.join(CONF, 'expected.json'));
  wrong['loop-cap'].rounds = 2;
  const wrongFile = path.join(out, 'wrong-expected.json');
  fs.writeFileSync(wrongFile, JSON.stringify(wrong));
  const args = ['--out', out, '--run-id', 'rp', '--expected', wrongFile];
  const first = node('replay.mjs', [...args, '--kill-after', '2']);
  assert.equal(first.status, 137);
  const stateFile = path.join(out, 'runs/rp/replay-state.json');
  assert.deepEqual(readJson(stateFile).done, ['happy', 'stale-head']);
  const second = node('replay.mjs', args);
  assert.equal(second.status, 1, second.stdout + second.stderr);
  const rep = readJson(path.join(out, 'runs/rp/replay-report.json'));
  assert.equal(rep.status, 'PARTIAL_FAILURE');
  assert.deepEqual(rep.failed, ['T-N3-07']);
  assert.equal(rep.passed, 5);
  assert.equal(rep.resumed_from, 3);
  assert.deepEqual(rep.executed, ['budget-denied', 'loop-cap', 'injection', 'low-confidence']);
});

test('T-N3-10 low-confidence route asks the owner', async () => {
  const run = await runCard(loadCard('low-confidence'), { runDir: tmp() });
  assert.equal(run.step_list, null);
  assert.equal(run.status, 'needs_human');
  assert.equal(readJson(run.result_path).exit_code, 2);
  assert.deepEqual(run.owner_question.options, ['lp_content', 'feature']);
  assert.match(run.owner_question.text, /lp_content/);
  assert.match(run.owner_question.text, /feature/);
  const edge = await runCard({ ...loadCard('lp_content-card'), id: 'edge-070', work_type_scores: { lp_content: 0.7, feature: 0.2 } }, { runDir: tmp() });
  assert.equal(edge.status, 'ok');
  assert.ok(!edge.owner_question);
});

test('T-N3-11 [REAL] scope check on the real Engine-Core repo', () => {
  assert.ok(fs.existsSync(path.join(DEFAULT_REPO, '.git')), 'real Engine-Core repo present');
  const r = node('scope-check.mjs');
  assert.ok([0, 2].includes(r.status), r.stdout + r.stderr);
  assert.match(r.stdout, /outside_changes: \d+/);
  if (r.status === 0) assert.match(r.stdout, /outside_changes: 0/);
  else { assert.match(r.stdout, /result: NEEDS_HUMAN/); assert.match(r.stdout, /UNEXPLAINED \S+/); }
  assert.match(r.stdout, /in_lane: [1-9]/);
  verdict('T-N3-11', 'VERIFIED', r.status === 0 ? 'clean' : 'NEEDS_HUMAN path listed');
});

test('T-N3-12 [REAL] scope check catches a stray edit', () => {
  const dir = tmp();
  const clone = path.join(dir, 'clone');
  try {
    execFileSync('git', ['clone', '-q', '--local', DEFAULT_REPO, clone], { stdio: 'pipe' });
    const before = execFileSync('git', ['-C', DEFAULT_REPO, 'status', '--porcelain'], { encoding: 'utf8' });
    fs.appendFileSync(path.join(clone, 'CLAUDE.md'), '\nstray edit by T-N3-12\n');
    const r = node('scope-check.mjs', ['--repo', clone, '--strict']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /OUTSIDE_LANE CLAUDE\.md/);
    assert.equal(execFileSync('git', ['-C', DEFAULT_REPO, 'status', '--porcelain'], { encoding: 'utf8' }), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(!fs.existsSync(clone));
  verdict('T-N3-12', 'VERIFIED');
});

test('T-N3-13 [REAL] manifest tamper detection', () => {
  const ok = node('manifest.mjs', ['verify']);
  assert.equal(ok.status, 0, ok.stdout);
  const dir = tmp();
  for (const f of fs.readdirSync(DEFAULT_DIR)) fs.copyFileSync(path.join(DEFAULT_DIR, f), path.join(dir, f));
  const spec = path.join(dir, '02-ENGINE-LAYER-SPEC.md');
  const buf = fs.readFileSync(spec);
  buf[10] ^= 0x01;
  fs.writeFileSync(spec, buf);
  const bad = node('manifest.mjs', ['verify', '--dir', dir]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /MISMATCH 02-ENGINE-LAYER-SPEC\.md expected [0-9a-f]{64} actual [0-9a-f]{64}/);
  assert.ok(!/MISMATCH (README|01-|03-)/.test(bad.stdout));
  verdict('T-N3-13', 'VERIFIED');
});

test('T-N3-14 [REAL] live replay against Engine', async () => {
  if (!live.reachable) { verdict('T-N3-14', 'IMPLEMENTED-NOT-VERIFIED', `probe: ${live.error}`); assert.ok(live.error); return; }
  const r = await liveReplay(liveClient(live), expected, loadCard);
  assert.ok(Object.values(r).every((x) => x.ok), JSON.stringify(r));
  verdict('T-N3-14', 'VERIFIED');
});
