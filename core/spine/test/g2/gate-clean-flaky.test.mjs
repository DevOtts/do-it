// Epic V2 — clean runs, FLAKY and UNSTABLE_UNDER_REUSE, TTL, taint, quarantine view, red-baseline
// (PRD-2 D16-D22; CONTRACT §4.5, §8 M1, §11 A4, A5, A9). Drives the built bundle with the stub adapter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  fileName, finishes, gate, harvest, isoAgo, lastStart, plantRun, range, rows, run, starts, stubRepo, writeBeh, writeStore,
} from './g2-helpers.mjs';

const H = 3600000;
const D = 24 * H;
const POLLUTER = 'src/a-polluter.spec.js';
const VICTIM = 'src/b-victim.spec.js';

function pvRepo(t) {
  return stubRepo(t, { n: 28, never: null, files: { [POLLUTER]: { result: 'pass' }, [VICTIM]: { result: 'pass', reads_flag: true } } });
}

function foldOf(repo, file) {
  const r = gate(repo, ['gate', 'results']);
  return r.out.files.find((f) => f.file === file) || null;
}

function decisionOf(repo, file) {
  const s = lastStart(repo);
  return s && s.decision_files ? s.decision_files.find((d) => d.file === file) : null;
}

test('T-V2-01 G-5 the safety net can fail: an order-dependent pass hidden by reuse is caught by the clean run', (t) => {
  const repo = pvRepo(t);
  const s1 = run(repo, []);
  assert.equal(s1.code, 0, s1.stdout);
  writeBeh(repo, POLLUTER, { result: 'pass', writes_flag: true });
  const s2 = run(repo, []);
  assert.deepEqual(lastStart(repo).run_list, [POLLUTER]);
  assert.equal(s2.out.outcome, 'GATE_PASS_COMPOSED');
  assert.equal(s2.code, 0);
  assert.match(s2.out.line, / · 29 reused from 1 run /);
  const s3 = run(repo, [], { scope: 'nightly' });
  assert.equal(s3.code, 1, s3.out.line);
  assert.equal(s3.out.line, '[FAIL nightly: 1 of 30 files FAIL (src/b-victim.spec.js) · 0 reused from 0 runs (oldest none) · 30 ran now · 0 skipped · 1 flaky-excluded] run=' + s3.out.run_id);
  assert.equal(foldOf(repo, VICTIM).state, 'UNSTABLE_UNDER_REUSE');
  assert.deepEqual(s3.out.unstable, [VICTIM]);
  const victimKey = finishes(repo, s3.out.run_id).find((r) => r.file === VICTIM).key;
  run(repo, []);
  assert.ok(lastStart(repo).run_list.includes(VICTIM));
  assert.equal(decisionOf(repo, VICTIM).key, victimKey);
  writeBeh(repo, POLLUTER, { result: 'pass' });
  const s5 = run(repo, [], { scope: 'nightly' });
  assert.equal(s5.out.outcome, 'GATE_PASS_FRESH', s5.out.line);
  assert.equal(s5.code, 0);
  assert.equal(foldOf(repo, VICTIM).state, 'UNSTABLE_UNDER_REUSE');
  t.diagnostic('T-V2-01 step2 ' + s2.out.line.slice(0, 80) + ' | step3 ' + s3.out.line + ' | step5 ' + s5.out.outcome);
});

test('T-V2-02 G-3 FAIL then PASS is FLAKY; two consecutive passes clear it; FAIL,PASS,FAIL,PASS stays FLAKY', (t) => {
  const repo = stubRepo(t, { beh: { [fileName(7)]: { seq: ['fail', 'pass', 'pass', 'pass', 'pass'] } } });
  assert.equal(run(repo, []).code, 1);
  const r2 = run(repo, []);
  let f = foldOf(repo, fileName(7));
  assert.equal(f.state, 'FLAKY');
  assert.equal(f.flaky_passes, 1);
  assert.equal(r2.out.outcome, 'GATE_PASS_COMPOSED', r2.out.line);
  assert.match(r2.out.line, / · 1 flaky-excluded\] /);
  run(repo, []);
  assert.ok(lastStart(repo).run_list.includes(fileName(7)));
  f = foldOf(repo, fileName(7));
  assert.equal(f.state, 'PASS');
  run(repo, []);
  assert.ok(!lastStart(repo).run_list.includes(fileName(7)));
  const v = stubRepo(t, { beh: { [fileName(7)]: { seq: ['fail', 'pass', 'fail', 'pass', 'pass'] } } });
  for (let i = 0; i < 4; i++) run(v, []);
  f = foldOf(v, fileName(7));
  assert.equal(f.state, 'FLAKY');
  assert.equal(f.flaky_passes, 1);
  run(v, []);
  assert.ok(lastStart(v).run_list.includes(fileName(7)));
  t.diagnostic('T-V2-02 run2 ' + r2.out.line + ' | variant FLAKY streak ' + f.flaky_passes);
});

test('T-V2-03 a clean run reads no rows: a write-only store still yields a clean FRESH line', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  fs.chmodSync(repo.rowsFile, 0o200);
  const size0 = fs.statSync(repo.rowsFile).size;
  const a = run(repo, ['--clean']);
  assert.equal(a.out.line, '[FRESH push: 30/30 files PASS · 0 reused from 0 runs (oldest none) · 30 ran now · 0 skipped · 0 flaky-excluded] run=' + a.out.run_id, JSON.stringify(a.out));
  assert.deepEqual(a.out.warnings, ['unstable check skipped: store unreadable']);
  assert.equal(a.code, 0);
  const size1 = fs.statSync(repo.rowsFile).size;
  assert.ok(size1 > size0);
  fs.chmodSync(repo.rowsFile, 0o644);
  const own = finishes(repo, a.out.run_id);
  assert.equal(own.length, 30);
  assert.ok(own.every((r) => r.clean === true));
  fs.chmodSync(repo.rowsFile, 0o200);
  const b = run(repo, []);
  assert.ok(b.out.warnings.includes('store unreadable: reuse disabled'), JSON.stringify(b.out.warnings));
  assert.match(b.out.line, / · 30 ran now · /);
  fs.chmodSync(repo.rowsFile, 0o644);
  t.diagnostic('T-V2-03 (a) ' + a.out.line + ' size ' + size0 + '->' + size1 + ' | (b) ' + b.out.warnings.join('; '));
});

test('T-V2-04 nightly implies clean; a typed --scope nightly --resume is USAGE', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  const cleanRows0 = rows(repo).filter((r) => r.type === 'clean').length;
  const a = run(repo, [], { scope: 'nightly' });
  assert.ok(a.out.line.startsWith('[FRESH nightly: 30/30 files PASS · 0 reused'), a.out.line);
  const own = finishes(repo, a.out.run_id);
  assert.equal(own.length, 30);
  assert.ok(own.every((r) => r.clean === true));
  const cleans = rows(repo).filter((r) => r.type === 'clean');
  assert.equal(cleans.length, cleanRows0 + 1);
  assert.equal(cleans[cleans.length - 1].leg, 'unit');
  const b = run(repo, ['--resume'], { scope: 'nightly' });
  assert.equal(b.out.outcome, 'USAGE');
  assert.equal(b.code, 1);
  t.diagnostic('T-V2-04 ' + a.out.line.slice(0, 60) + ' | resume ' + b.out.outcome);
});

test('T-V2-05 R9: a PASS older than the last clean run\'s start of its own leg is EXPIRED; another leg\'s clean does not move it', (t) => {
  const repo = stubRepo(t);
  const full = run(repo, []);
  const hv = harvest(repo, full.out.run_id);
  const p03 = plantRun(hv, { files: [fileName(3)], at: isoAgo(3 * H) });
  const clean = plantRun(hv, { files: [], at: isoAgo(70 * 60000), clean: true, cleanRow: true, cleanAt: isoAgo(60 * 60000) });
  const p04 = plantRun(hv, { files: [fileName(4)], at: isoAgo(65 * 60000) });
  const rest = plantRun(hv, { files: range(5, 30), at: isoAgo(50 * 60000) });
  const mongo = plantRun(hv, { files: [], at: isoAgo(30 * 60000), leg: 'real-mongo', clean: true, cleanRow: true });
  writeStore(repo, [...p03.lines, ...clean.lines, ...p04.lines, ...rest.lines, ...mongo.lines]);
  const why = gate(repo, ['gate', 'results', '--why', fileName(3)], { json: false });
  assert.match(why.stdout, /EXPIRED older than last clean/);
  const r = run(repo, []);
  const list = lastStart(repo).run_list;
  assert.ok(list.includes(fileName(3)));
  assert.ok(!list.includes(fileName(4)));
  assert.ok(!list.includes(fileName(20)));
  assert.deepEqual(list, [fileName(1), fileName(2), fileName(3)]);
  t.diagnostic('T-V2-05 run list ' + list.join(',') + ' | ' + r.out.line);
});

test('T-V2-06 TTL 24 h boundary', (t) => {
  const repo = stubRepo(t);
  const full = run(repo, []);
  const hv = harvest(repo, full.out.run_id);
  const old = plantRun(hv, { files: [fileName(4)], at: isoAgo(D + 60000) });
  const young = plantRun(hv, { files: [fileName(5)], at: isoAgo(D - 60000) });
  const rest = plantRun(hv, { files: range(6, 30).concat(range(1, 3)), at: isoAgo(H) });
  writeStore(repo, [...old.lines, ...young.lines, ...rest.lines]);
  const why = gate(repo, ['gate', 'results', '--why', fileName(4)], { json: false });
  assert.match(why.stdout, /EXPIRED 24 h/);
  run(repo, []);
  const list = lastStart(repo).run_list;
  assert.ok(list.includes(fileName(4)));
  assert.ok(!list.includes(fileName(5)));
  t.diagnostic('T-V2-06 run list ' + list.join(','));
});

test('T-V2-07 a tainted run_end voids its PASS rows', (t) => {
  const a = stubRepo(t, { beh: { [fileName(3)]: { result: 'pass', force_exit: true } } });
  const ra = run(a, []);
  const end = rows(a).find((r) => r.type === 'run_end' && r.run_id === ra.out.run_id);
  assert.equal(end.tainted, true);
  assert.equal(end.reason, 'force-exited workers: 1');
  assert.equal(ra.out.outcome, 'GATE_FAIL');
  assert.equal(ra.code, 1);
  assert.match(ra.out.line, /^\[FAIL push: tainted: force-exited workers: 1 · /);
  const b = stubRepo(t);
  const rb = run(b, [], { env: { GATE_FIXTURE_REPORT: 'none' } });
  assert.equal(rows(b).find((r) => r.type === 'run_end' && r.run_id === rb.out.run_id).reason, 'runner report missing');
  assert.equal(rb.code, 1);
  writeBeh(a, fileName(3), { result: 'pass' });
  const after = run(a, []);
  assert.equal(after.out.reused, 0);
  assert.match(after.out.line, / · 30 ran now · /);
  t.diagnostic('T-V2-07 (a) ' + ra.out.line.slice(0, 60) + ' | (b) ' + rb.out.line.slice(0, 50) + ' | after ' + after.out.ran_now + ' ran');
});

test('T-V2-08 interruption is not taint; taint is not resumable', (t) => {
  const a = stubRepo(t);
  const ra = run(a, [], { env: { GATE_FIXTURE_KILL_AFTER: fileName(20) } });
  const end = rows(a).find((r) => r.type === 'run_end' && r.run_id === ra.out.run_id);
  assert.equal(end.tainted, false);
  assert.equal(end.verdict, 'GATE_INTERRUPTED');
  const b = stubRepo(t, { beh: { [fileName(3)]: { result: 'pass', force_exit: true } } });
  const tb = run(b, []);
  const rb = run(b, ['--resume']);
  assert.equal(rb.out.source_runs.filter((s) => s.run_id === tb.out.run_id).length, 0);
  assert.equal(rb.out.reused, 0);
  assert.deepEqual(rb.out.resumed_from, []);
  t.diagnostic('T-V2-08 (a) tainted ' + end.tainted + ' ' + end.verdict + ' | (b) reused ' + rb.out.reused);
});

test('T-V2-09 a retried pass is FLAKY and is counted flaky-excluded', (t) => {
  const repo = stubRepo(t, { beh: { [fileName(11)]: { result: 'pass', retried: true } } });
  const r = run(repo, []);
  assert.equal(r.out.outcome, 'GATE_PASS_FRESH');
  assert.match(r.out.line, / · 1 flaky-excluded\] /);
  const f = foldOf(repo, fileName(11));
  assert.equal(f.state, 'FLAKY');
  assert.equal(f.flaky_passes, 0);
  run(repo, []);
  assert.ok(lastStart(repo).run_list.includes(fileName(11)));
  t.diagnostic('T-V2-09 ' + r.out.line);
});

test('T-V2-10 FLAKY is file-sticky across a key change for 7 days (AM-7)', (t) => {
  for (const age of [1, 8]) {
    const repo = stubRepo(t);
    const full = run(repo, []);
    const hv = harvest(repo, full.out.run_id);
    const base = plantRun(hv, { files: range(1, 30).filter((f) => f !== fileName(7)), at: isoAgo(H) });
    const flipPass = plantRun(hv, { files: [fileName(7)], at: isoAgo(age * D + 2 * 60000) });
    const flipFail = plantRun(hv, { files: [fileName(7)], at: isoAgo(age * D), result: 'FAIL', runEnd: { verdict: 'GATE_FAIL' } });
    writeStore(repo, [...flipPass.lines, ...flipFail.lines, ...base.lines]);
    writeBeh(repo, fileName(7), { result: 'pass', edited: true });
    const lists = [];
    const folds = [];
    for (let i = 0; i < 3; i++) {
      run(repo, []);
      lists.push(lastStart(repo).run_list.includes(fileName(7)));
      const f = foldOf(repo, fileName(7));
      folds.push(f.state + '/' + f.flaky_passes);
    }
    if (age === 1) {
      // the carried flag starts the new key at streak 0: one pass leaves FLAKY 1, the second clears it
      assert.deepEqual(lists, [true, true, false]);
      assert.deepEqual(folds.slice(0, 2), ['FLAKY/1', 'PASS/0']);
    } else {
      // an 8-day-old flag does not carry: one pass on the new key is PASS and it is reused on the second run
      assert.deepEqual(lists, [true, false, false], JSON.stringify(starts(repo).slice(-3).map((s) => (s.decision_files || []).find((d) => d.file === fileName(7)))) + ' ' + folds.join(' '));
      assert.equal(folds[0], 'PASS/0');
    }
    t.diagnostic('T-V2-10 flag ' + age + ' d: in run lists ' + JSON.stringify(lists) + ' folds ' + folds.join(' '));
  }
});

test('T-V2-11 UNSTABLE clears only after 7 days and two consecutive clean passes', (t) => {
  const repo = stubRepo(t);
  const full = run(repo, []);
  const hv = harvest(repo, full.out.run_id);
  const lines = [];
  const add = (p) => lines.push(...p.lines);
  // file-05: since now-6 d, 2 clean passes; file-06: since now-8 d, 1 clean then 1 non-clean pass; file-07: since now-8 d, 2 clean passes
  const cases = [[fileName(5), 6, [true, true]], [fileName(6), 8, [true, false]], [fileName(7), 8, [true, true]]];
  for (const [f, days, cl] of cases) {
    add(plantRun(hv, { files: [f], at: isoAgo(days * D + H) }));
    add(plantRun(hv, { files: [f], at: isoAgo(days * D), result: 'FAIL', clean: true, runEnd: { verdict: 'GATE_FAIL' } }));
    add(plantRun(hv, { files: [f], at: isoAgo(3 * H), clean: cl[0] }));
    add(plantRun(hv, { files: [f], at: isoAgo(2 * H), clean: cl[1] }));
  }
  add(plantRun(hv, { files: range(1, 30).filter((f) => !cases.some((c) => c[0] === f)), at: isoAgo(H) }));
  writeStore(repo, lines);
  const states = cases.map(([f]) => foldOf(repo, f).state);
  assert.deepEqual(states, ['UNSTABLE_UNDER_REUSE', 'UNSTABLE_UNDER_REUSE', 'PASS']);
  run(repo, []);
  const list = lastStart(repo).run_list;
  assert.ok(list.includes(fileName(5)));
  assert.ok(list.includes(fileName(6)));
  assert.ok(!list.includes(fileName(7)));
  t.diagnostic('T-V2-11 folds ' + states.join(', ') + ' | run list ' + list.join(','));
});

test('T-V2-12 R18 quarantine view: rebuilt every run, never read for a decision', (t) => {
  const repo = stubRepo(t);
  const full = run(repo, []);
  const hv = harvest(repo, full.out.run_id);
  const base = plantRun(hv, { files: range(1, 30), at: isoAgo(H) });
  const flip = plantRun(hv, { files: [fileName(7)], at: isoAgo(30 * 60000), result: 'FAIL', runEnd: { verdict: 'GATE_FAIL' } });
  const unstable = plantRun(hv, { files: [fileName(20)], at: isoAgo(20 * 60000), result: 'FAIL', clean: true, runEnd: { verdict: 'GATE_FAIL' } });
  writeStore(repo, [...base.lines, ...flip.lines, ...unstable.lines]);
  const view = path.join(repo.store, 'views', 'flaky.json');
  const only = { pass: ['--only', 'file-0[1-5]'] };
  run(repo, [], only);
  const v1 = JSON.parse(fs.readFileSync(view, 'utf8'));
  assert.equal(v1.schema, 'do-it-gate-flaky-view/1');
  assert.deepEqual(v1.files.map((f) => [f.file, f.state]), [[fileName(7), 'FLAKY'], [fileName(20), 'UNSTABLE_UNDER_REUSE']]);
  fs.rmSync(view);
  run(repo, [], only);
  const listAbsent = lastStart(repo).run_list;
  const v2 = JSON.parse(fs.readFileSync(view, 'utf8'));
  assert.deepEqual(v2.files, v1.files);
  fs.writeFileSync(view, 'garbage');
  run(repo, [], only);
  const listGarbage = lastStart(repo).run_list;
  assert.deepEqual(listGarbage, listAbsent);
  const v3 = JSON.parse(fs.readFileSync(view, 'utf8'));
  assert.equal(v3.schema, 'do-it-gate-flaky-view/1');
  assert.deepEqual(v3.files, v1.files);
  t.diagnostic('T-V2-12 view ' + v1.files.map((f) => f.file + ':' + f.state).join(', ') + ' | lists equal ' + listAbsent.join(','));
});

test('T-V2-13 the red-baseline annotation never launders a red', (t) => {
  const repo = stubRepo(t, { beh: { [fileName(12)]: { result: 'fail' } } });
  run(repo, []);
  writeBeh(repo, fileName(13), { result: 'fail' });
  const r2 = run(repo, []);
  assert.equal(r2.out.outcome, 'GATE_FAIL');
  assert.equal(r2.code, 1);
  const by = Object.fromEntries(r2.out.failed_files.map((f) => [f.file, f]));
  assert.equal(by[fileName(12)].prior_fail_on_same_key, true);
  assert.equal(by[fileName(13)].prior_fail_on_same_key, false);
  assert.match(r2.out.line, /^\[FAIL push: 2 of 30 files FAIL \(src\/file-12\.spec\.js, src\/file-13\.spec\.js\) · /);
  const res = gate(repo, ['gate', 'results']);
  const fs2 = res.out.fail_set.filter((f) => f.run_id === r2.out.run_id).map((f) => f.file).sort();
  assert.deepEqual(fs2, [fileName(12), fileName(13)]);
  t.diagnostic('T-V2-13 ' + r2.out.line.slice(0, 90));
});

test('T-V2-14 disagreement in the other directions is FLAKY or a plain FAIL, never UNSTABLE', (t) => {
  const a = stubRepo(t, { beh: { [fileName(14)]: { seq: ['fail', 'pass'] } } });
  run(a, []);
  const ca = run(a, ['--clean']);
  const fa = foldOf(a, fileName(14));
  assert.equal(fa.state, 'FLAKY');
  assert.equal(fa.flaky_passes, 1);
  assert.deepEqual(ca.out.unstable, []);
  const b = stubRepo(t);
  run(b, []);
  writeBeh(b, fileName(14), { result: 'fail' });
  const cb = run(b, ['--clean']);
  assert.equal(foldOf(b, fileName(14)).state, 'FAIL');
  assert.deepEqual(cb.out.unstable, []);
  assert.equal(cb.code, 1);
  t.diagnostic('T-V2-14 (a) ' + fa.state + ' streak ' + fa.flaky_passes + ' (b) FAIL exit ' + cb.code);
});

test('T-V2-15 an interrupted clean run writes no clean row; the TTL boundary does not move', (t) => {
  const repo = stubRepo(t);
  const full = run(repo, []);
  const hv = harvest(repo, full.out.run_id);
  writeStore(repo, plantRun(hv, { files: range(1, 30), at: isoAgo(2 * H) }).lines);
  const cleans0 = rows(repo).filter((r) => r.type === 'clean').length;
  const c = run(repo, ['--clean'], { env: { GATE_FIXTURE_KILL_AFTER: fileName(12) } });
  assert.equal(c.out.outcome, 'GATE_INTERRUPTED');
  assert.equal(c.code, 3);
  const own = finishes(repo, c.out.run_id);
  assert.equal(own.length, 12);
  assert.ok(own.every((r) => r.clean === true));
  assert.equal(rows(repo).filter((r) => r.type === 'clean').length, cleans0);
  run(repo, []);
  assert.ok(!lastStart(repo).run_list.includes(fileName(20)));
  t.diagnostic('T-V2-15 clean ' + c.out.line.slice(0, 60) + ' | file-20 reused');
});

test('T-V2-17 G-5 enforced for nightly: an inherited DO_IT_GATE_SCOPE=nightly runs clean whatever the flags (A9)', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  const env = { DO_IT_GATE_SCOPE: 'nightly' };
  const warn = 'DO_IT_GATE_SCOPE=nightly: running clean; add --clean to the gates.nightly command';
  const head = '[FRESH nightly: 30/30 files PASS · 0 reused from 0 runs (oldest none) · 30 ran now';
  const a = run(repo, [], { env });
  assert.ok(a.out.line.startsWith(head), a.out.line);
  const ra = finishes(repo, a.out.run_id);
  assert.ok(ra.length === 30 && ra.every((r) => r.scope === 'nightly' && r.clean === true));
  assert.ok(a.out.warnings.includes(warn));
  assert.equal(a.code, 0);
  const b = run(repo, ['--resume'], { env });
  assert.ok(b.out.line.startsWith(head), JSON.stringify(b.out));
  assert.ok(finishes(repo, b.out.run_id).every((r) => r.scope === 'nightly' && r.clean === true));
  assert.deepEqual(b.out.resumed_from, []);
  assert.equal(b.code, 0);
  const c = run(repo, ['--clean'], { env, scope: 'nightly' });
  assert.ok(c.out.line.startsWith(head), c.out.line);
  assert.ok(!c.out.warnings.includes(warn));
  t.diagnostic('T-V2-17 ' + a.out.line.slice(0, 80) + ' | (b) exit ' + b.code + ' | (c) warnings ' + JSON.stringify(c.out.warnings));
});
