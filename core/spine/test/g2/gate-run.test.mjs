// Epic V1 — gate run, resume and composed verdict (PRD-2; CONTRACT §3, §4.3, §4.4, §8 M2, §11 A1, A4, A7, A8, A14).
// Every case drives the built bundle with the stub adapter (core/spine/test/g2/fixtures/stub-runner/stub).
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { BIN, SPINE_DIR } from '../helpers.mjs';
import { parseArgs } from '../../src/cli.mjs';
import { gateProcStart } from '../../src/gate-signals.mjs';
import {
  LINE_RE, appendStore, commitAll, fileName, finishes, gate, harvest, headSha, isoAgo, lastStart, log, lsTree, plantRun,
  range, rows, run, starts, stubRepo, writeBeh, writeStore,
} from './g2-helpers.mjs';

const H = 3600000;
const minute = (iso) => new Date(Date.parse(iso)).toISOString().slice(0, 16) + 'Z';
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('T-V1-01 kill at file 20 of 30 is INTERRUPTED; --resume runs exactly the 10 unfinished files plus the NEVER set', (t) => {
  const repo = stubRepo(t);
  const r1 = run(repo, [], { env: { GATE_FIXTURE_KILL_AFTER: fileName(20) } });
  assert.equal(r1.code, 3, r1.stdout + r1.stderr);
  assert.equal(r1.out.outcome, 'GATE_INTERRUPTED');
  assert.equal(r1.out.state, 'INTERRUPTED');
  assert.match(r1.out.line, /^\[FAIL push: interrupted after 20 of 30 files · /);
  const first = r1.out.run_id;
  const end1 = rows(repo).find((r) => r.type === 'run_end' && r.run_id === first);
  assert.equal(end1.verdict, 'GATE_INTERRUPTED');
  const r2 = run(repo, ['--resume']);
  assert.equal(r2.code, 0, r2.stdout);
  assert.deepEqual(lastStart(repo).run_list, [fileName(1), fileName(2), ...range(21, 30)]);
  assert.equal(finishes(repo, r2.out.run_id).length, 12);
  assert.equal(r2.out.outcome, 'GATE_PASS_COMPOSED');
  const oldest = minute(finishes(repo, first).filter((r) => r.file !== fileName(1) && r.file !== fileName(2)).map((r) => r.at).sort()[0]);
  assert.equal(r2.out.line, '[COMPOSED push: 30/30 files PASS · 18 reused from 1 run (oldest ' + oldest + ') · 12 ran now · 0 skipped · 0 flaky-excluded] run=' + r2.out.run_id);
  assert.deepEqual(r2.out.resumed_from, [first]);
  t.diagnostic('T-V1-01 ' + r1.out.line.slice(0, 50) + ' | resume ' + r2.out.line);
});

test('T-V1-02 source-run eligibility: interrupted rows only under --resume, live owners never, run_end fault compensated by eligibility', (t) => {
  // (a) after a killed run, a plain run reuses nothing from it
  const a = stubRepo(t);
  run(a, [], { env: { GATE_FIXTURE_KILL_AFTER: fileName(20) } });
  const ra = run(a, []);
  assert.equal(ra.out.outcome, 'GATE_PASS_FRESH', ra.stdout);
  assert.match(ra.out.line, / · 0 reused from 0 runs \(oldest none\) · 30 ran now · /);
  // harvest current keys, then plant a run with no run_end
  const b = stubRepo(t);
  const full = run(b, []);
  const hv = harvest(b, full.out.run_id);
  const live = plantRun(hv, { files: range(1, 30), at: isoAgo(60000), runEnd: false, pid: process.pid, pid_start: gateProcStart(process.pid) });
  writeStore(b, live.lines);
  const rb = run(b, ['--resume']);
  assert.match(rb.out.line, / · 30 ran now · /, rb.stdout);
  assert.equal(rb.out.reused, 0);
  // (c) the same rows with a dead owner: reusable under --resume, named in resumed_from
  const dead = plantRun(hv, { files: range(1, 30), at: isoAgo(60000), runEnd: false, pid: 999999, pid_start: 'dead:0' });
  writeStore(b, dead.lines);
  const rc = run(b, ['--resume']);
  assert.equal(rc.out.outcome, 'GATE_PASS_COMPOSED', rc.stdout);
  assert.equal(rc.out.reused, 28);
  assert.deepEqual(rc.out.resumed_from, [dead.runId]);
  // (d) run_end append fails on a full passing run: verdict stands, warning, no run_end; the next plain run reuses nothing
  const d = stubRepo(t);
  const rd = run(d, [], { env: { DO_IT_FAULT: 'gate_run_end' } });
  assert.equal(rd.code, 0, rd.stdout);
  assert.ok(rd.out.warnings.includes('run_end not recorded'), JSON.stringify(rd.out.warnings));
  assert.equal(rows(d).filter((r) => r.type === 'run_end' && r.run_id === rd.out.run_id).length, 0);
  const rd2 = run(d, []);
  assert.match(rd2.out.line, / · 30 ran now · /);
  t.diagnostic('T-V1-02 (a) ' + ra.out.reused + ' (b) ' + rb.out.reused + ' (c) ' + rc.out.reused + ' from ' + rc.out.resumed_from + ' (d) ' + rd2.out.ran_now + ' ran');
});

test('T-V1-03 G-16: an unchanged all-PASS repeat runs only the NEVER set', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  const r = run(repo, []);
  assert.deepEqual(lastStart(repo).run_list, [fileName(1), fileName(2)]);
  assert.match(r.out.line, / · 28 reused from 1 run /);
  assert.match(r.out.line, / · 2 ran now · /);
  assert.equal(r.out.outcome, 'GATE_PASS_COMPOSED');
  assert.equal(r.code, 0);
  t.diagnostic('T-V1-03 ' + r.out.line);
});

test('T-V1-04 G-4: the composed line names reused/fresh counts, 3 source runs and the oldest; no outcome prints [OK', (t) => {
  const repo = stubRepo(t, { never: null });
  const outs = [];
  const full = run(repo, [], { json: false });
  outs.push(full.stdout);
  assert.match(full.stdout, /^\[FRESH push: 30\/30 files PASS/m);
  const runId = /run=(g-\S+)/.exec(full.stdout)[1];
  const hv = harvest(repo, runId);
  const p1 = plantRun(hv, { files: range(1, 9), at: isoAgo(5 * H) });
  const p2 = plantRun(hv, { files: range(10, 18), at: isoAgo(3 * H) });
  const p3 = plantRun(hv, { files: range(19, 27), at: isoAgo(1 * H) });
  writeStore(repo, [...p1.lines, ...p2.lines, ...p3.lines]);
  const r = run(repo, [], { json: false });
  outs.push(r.stdout);
  const re = /^\[COMPOSED push: 30\/30 files PASS · 27 reused from 3 runs \(oldest \d{4}-\d\d-\d\dT\d\d:\d\dZ\) · 3 ran now · 0 skipped · 0 flaky-excluded\] run=g-\d{8}T\d{6}Z-[0-9a-f]{4}$/;
  const hits = r.stdout.split('\n').filter((l) => re.test(l));
  assert.equal(hits.length, 1, r.stdout);
  const oldestAt = rows(repo).find((x) => x.run_id === p1.runId && x.type === 'finish').at;
  assert.ok(hits[0].includes('(oldest ' + minute(oldestAt) + ')'), hits[0] + ' vs ' + oldestAt);
  const src = JSON.parse(/^source_runs: (.*)$/m.exec(r.stdout)[1]);
  assert.equal(src.length, 3);
  // FAIL, adapter fallback, WAIT_TIMEOUT
  writeBeh(repo, fileName(5), { result: 'fail' });
  const f = run(repo, [], { json: false });
  outs.push(f.stdout);
  assert.match(f.stdout, /^\[FAIL push: 1 of 30 files FAIL/m);
  fs.writeFileSync(path.join(repo.aux, 'fake.mjs'), 'process.exit(0)\n');
  const nf = run(repo, [], { json: false, runner: 'nosuch', pass: [process.execPath, path.join(repo.aux, 'fake.mjs')] });
  outs.push(nf.stdout);
  assert.match(nf.stdout, /^\[FRESH push: runner exit 0 · /m);
  fs.writeFileSync(path.join(repo.home, 'signals.json'), JSON.stringify({ pressure: 'critical', total_mb: 10000, avail_mb: 9000, swap_used_mb: 0, swapout_mb_per_s: 0 }));
  fs.mkdirSync(path.join(repo.home, '.do-it'), { recursive: true });
  fs.writeFileSync(path.join(repo.home, '.do-it', 'settings.json'), JSON.stringify({ gates: { queue: { timeout_s: 1 } } }));
  const wt = run(repo, [], { json: false });
  outs.push(wt.stdout);
  assert.match(wt.stdout, /^\[WAIT-TIMEOUT\] gate-queue: /m);
  for (const o of outs) assert.equal(o.split('[OK').length - 1, 0, o);
  t.diagnostic('T-V1-04 ' + hits[0] + ' | [OK hits 0 of 5 outputs');
});

test('T-V1-05 an unsatisfied file ends FAILED: dropped file, all skipped, no test file listed', (t) => {
  const a = stubRepo(t, { beh: { [fileName(5)]: { drop: true } } });
  const ra = run(a, []);
  assert.equal(ra.out.outcome, 'GATE_FAIL');
  assert.equal(ra.code, 1);
  assert.equal(ra.out.state, 'FAILED');
  assert.match(ra.out.line, /^\[FAIL push: 1 of 30 files FAIL \(src\/file-05\.spec\.js no result\) · /);
  assert.equal(ra.out.failed_files[0].reason, 'no_result');
  const beh = {};
  for (const f of range(1, 30)) beh[f] = { result: 'skip' };
  const b = stubRepo(t, { beh });
  const rb = run(b, []);
  assert.equal(rb.code, 1);
  assert.match(rb.out.line, /^\[FAIL push: 0 files PASS \(all 30 skipped\) · /);
  const c = stubRepo(t);
  const rc = run(c, [], { pass: ['--only', 'zzz-no-such-file'] });
  assert.equal(rc.code, 1);
  assert.match(rc.out.line, /^\[FAIL push: 0 test files listed · /);
  t.diagnostic('T-V1-05 ' + [ra, rb, rc].map((x) => x.out.line.slice(0, 70)).join(' | '));
});

test('T-V1-06 G-1 resolver crash: decide fails -> every file runs; one keys.json error -> that file runs', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  const copy = path.join(repo.aux, 'rundir-a');
  const ra = run(repo, [], { env: { GATE_FIXTURE_KEYS: 'garbage', GATE_FIXTURE_COPY_RUNDIR: copy } });
  assert.equal(fs.existsSync(path.join(copy, 'run-list.json')), false);
  assert.equal(lastStart(repo).decided, false);
  assert.equal(finishes(repo, ra.out.run_id).length, 30);
  assert.ok(ra.out.warnings.includes('reuse unavailable: decide failed'), JSON.stringify(ra.out.warnings));
  assert.equal(ra.out.outcome, 'GATE_PASS_FRESH', ra.stdout);
  assert.match(ra.out.line, / · 30 ran now · /);
  const rb = run(repo, [], { env: { GATE_FIXTURE_KEYS_ERROR: fileName(7) } });
  assert.deepEqual(lastStart(repo).run_list, [fileName(1), fileName(2), fileName(7)]);
  assert.match(rb.out.line, / · 27 reused from 1 run /);
  assert.match(rb.out.line, / · 3 ran now · /);
  assert.equal(rb.code, 0);
  t.diagnostic('T-V1-06 (a) ' + ra.out.line + ' | (b) ' + rb.out.line);
});

test('T-V1-07 can-fail proof: every row PASS but runner exit 1 fails; reverted passes', (t) => {
  const repo = stubRepo(t);
  const bad = run(repo, [], { env: { GATE_FIXTURE_EXIT: '1' } });
  assert.equal(bad.out.outcome, 'GATE_FAIL');
  assert.equal(bad.code, 1);
  assert.match(bad.out.line, /^\[FAIL push: runner exited 1 with no failing file · /);
  const good = run(repo, []);
  assert.equal(good.out.outcome, 'GATE_PASS_FRESH', good.stdout);
  assert.equal(good.code, 0);
  t.diagnostic('T-V1-07 defect ' + bad.out.line.slice(0, 60) + ' | reverted ' + good.out.outcome);
});

test('T-V1-08 G-9 dirty tree: suffix, commit null, tree_dirty on run rows, no stamp file', (t) => {
  const repo = stubRepo(t);
  const clean = run(repo, []);
  const head = headSha(repo);
  assert.ok(!/WORKING TREE/.test(clean.out.line), clean.out.line);
  assert.equal(clean.out.tree.commit, head);
  assert.equal(clean.out.tree.dirty, false);
  const before = { store: lsTree(repo.store), doit: lsTree(path.join(repo.dir, '.do-it')) };
  fs.writeFileSync(path.join(repo.dir, fileName(3)), JSON.stringify({ result: 'pass', v: 2 }) + '\n');
  const d = run(repo, []);
  assert.ok(d.out.line.endsWith(' · for WORKING TREE (dirty), not ' + head.slice(0, 12)), d.out.line);
  assert.equal(d.out.tree.dirty, true);
  assert.equal(d.out.tree.commit, null);
  const runRows = rows(repo).filter((r) => r.run_id === d.out.run_id && (r.type === 'run_start' || r.type === 'run_end'));
  assert.equal(runRows.length, 2);
  for (const r of runRows) assert.equal(r.tree_dirty, true);
  const after = { store: lsTree(repo.store), doit: lsTree(path.join(repo.dir, '.do-it')) };
  const strip = (l) => l.filter((x) => x !== 'results.jsonl' && x !== 'views/flaky.json');
  assert.deepEqual(strip(after.store), strip(before.store));
  assert.deepEqual(after.doit, before.doit);
  // (c) the runner edits a listed file after decide returned
  cp.execFileSync('git', ['checkout', '--', '.'], { cwd: repo.dir, env: repo.env });
  writeBeh(repo, fileName(10), { result: 'pass', edit_self: true });
  const c = run(repo, []);
  assert.match(c.out.line, / · for WORKING TREE \(dirty\), not [0-9a-f]{12}$/);
  t.diagnostic('T-V1-08 ' + d.out.line.slice(-62) + ' | (c) dirty=' + c.out.tree.dirty);
});

test('T-V1-09 CONTRACT §6 adapter missing: runner unchanged, no rows, FRESH with reuse unavailable', (t) => {
  const repo = stubRepo(t);
  run(repo, []);
  const fake = path.join(repo.aux, 'fake-runner.mjs');
  fs.writeFileSync(fake, 'process.exit(Number(process.env.FAKE_EXIT || 0))\n');
  const before = sha(repo.rowsFile);
  const ok = gate(repo, ['gate', 'run', '--scope', 'push', '--runner', 'nosuch', '--', 'node', fake]);
  assert.equal(ok.code, 0, ok.stdout);
  assert.match(ok.out.line, /^\[FRESH push: runner exit 0 · 0 reused from 0 runs \(oldest none\) · files not counted · reuse unavailable: no adapter\] run=g-\d{8}T\d{6}Z-[0-9a-f]{4}$/);
  assert.equal(sha(repo.rowsFile), before);
  const bad = gate(repo, ['gate', 'run', '--scope', 'push', '--runner', 'nosuch', '--', 'node', fake], { env: { FAKE_EXIT: '1' } });
  assert.equal(bad.code, 1);
  assert.equal(bad.out.outcome, 'GATE_FAIL');
  assert.match(bad.out.line, /^\[FAIL push: runner exited 1 · /);
  assert.equal(sha(repo.rowsFile), before);
  t.diagnostic('T-V1-09 ' + ok.out.line + ' | ' + bad.out.line.slice(0, 40));
});

test('T-V1-10 run-free CLI table and parser (A7)', (t) => {
  const repo = stubRepo(t, { never: null });
  fs.rmSync(path.join(repo.dir, '.do-it'), { recursive: true, force: true });
  const argv = ['gate', 'run', '--resume', '--scope', 'push', '--runner', 'stub', '--', '--testNamePattern', 'foo', 'bar'];
  const parsed = parseArgs(argv);
  assert.equal(parsed.flags.resume, true);
  assert.equal('testNamePattern' in parsed.flags, false);
  const a = gate(repo, argv.slice(0, 7).concat(['--json', '--', '--testNamePattern', 'foo', 'bar']), { json: false });
  const aout = JSON.parse(a.stdout.trim().split('\n').pop());
  assert.equal(a.code, 0, a.stdout + a.stderr);
  assert.equal(aout.outcome, 'GATE_PASS_FRESH');
  assert.deepEqual(lastStart(repo).argv, ['--testNamePattern', 'foo', 'bar']);
  assert.equal(fs.existsSync(path.join(repo.dir, '.do-it')), false);
  const b = gate(repo, ['gate', 'results']);
  assert.equal(b.code, 0);
  const c = gate(repo, ['gate', 'advance', '--to', 'BUILDING']);
  assert.equal(c.out.outcome, 'NO_RUN');
  const d = gate(repo, ['gate', 'run', '--resume', '--clean', '--scope', 'push', '--runner', 'stub']);
  assert.equal(d.out.outcome, 'USAGE');
  assert.equal(d.code, 1);
  const e = gate(repo, ['gate', 'frob']);
  assert.equal(e.out.outcome, 'USAGE');
  for (const s of ['verify', 'conclude', 'advance', 'build', 'stop', 'route', 'ceiling', 'run', 'results', 'decide', 'queue', 'push', 'train', 'nightly', 'schedule']) assert.ok(e.out.subcommands.includes(s), s);
  const f = parseArgs(['gate', 'queue', '--status', '--json']);
  assert.equal(f.flags.status, true);
  assert.equal(f.flags.json, true);
  const g = cp.spawnSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs')], { encoding: 'utf8' });
  assert.equal(g.status, 0);
  t.diagnostic('T-V1-10 subcommands ' + e.out.subcommands.length + ' (' + e.out.subcommands.join(',') + ')');
});

test('T-V1-11 merge rule item 6 and argv: another leg and a narrowed argv reuse nothing; --why names the runner', (t) => {
  const repo = stubRepo(t);
  run(repo, ['--leg', 'real-mongo']);
  const a = run(repo, ['--leg', 'unit']);
  assert.equal(a.out.reused, 0);
  assert.match(a.out.line, / · 30 ran now · /);
  const b = run(repo, [], { pass: ['--testNamePattern', 'foo'] });
  assert.equal(b.out.reused, 0);
  assert.match(b.out.line, / · 30 ran now · /);
  const c = gate(repo, ['gate', 'results', '--why', fileName(9)], { json: false });
  assert.equal(c.code, 0);
  assert.match(c.stdout, /invalidated: runner/);
  t.diagnostic('T-V1-11 (a) ' + a.out.ran_now + ' (b) ' + b.out.ran_now + ' (c) ' + /invalidated: runner/.exec(c.stdout)[0]);
});

test('T-V1-12 adversarial verify: tampered row, installed drift, tampered run list, concurrent FAIL, forged run dir', (t) => {
  // (a) a FAIL row rewritten to PASS without a new crc is CORRUPT; the file runs
  const a = stubRepo(t, { beh: { [fileName(4)]: { result: 'fail' } } });
  const a1 = run(a, []);
  const text = fs.readFileSync(a.rowsFile, 'utf8');
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('"type":"finish"') && l.includes(fileName(4)) && l.includes(a1.out.run_id));
  lines[i] = lines[i].replace('"result":"FAIL"', '"result":"PASS"');
  fs.writeFileSync(a.rowsFile, lines.join('\n'));
  const res = gate(a, ['gate', 'results']);
  assert.equal(res.out.corrupt, 1);
  assert.match(res.out.say[0], /corrupt: 1/);
  run(a, []);
  assert.ok(lastStart(a).run_list.includes(fileName(4)));
  // (b) installed state changes while the adapter reports unchanged class and dep lines
  const b = stubRepo(t);
  run(b, []);
  fs.writeFileSync(path.join(b.dir, 'node_modules', '.package-lock.json'), '{"lockfileVersion":3,"changed":true}\n');
  const b2 = run(b, []);
  assert.equal(b2.out.reused, 0);
  assert.match(b2.out.line, / · 30 ran now · /);
  // (c) the runner drops a file from run-list.json before running
  const c = stubRepo(t);
  const c1 = run(c, [], { env: { GATE_FIXTURE_TAMPER_RUNLIST: fileName(8) } });
  assert.equal(c1.out.outcome, 'GATE_FAIL');
  assert.match(c1.out.line, /^\[FAIL push: 1 of 30 files FAIL \(src\/file-08\.spec\.js no result\) · /);
  // (c2) beyond the contract: decision.json loses a file the runner then skips; the total never shrinks
  const c2 = stubRepo(t);
  const c2r = run(c2, [], { env: { GATE_FIXTURE_TAMPER_DECISION: fileName(9) } });
  assert.equal(c2r.out.outcome, 'GATE_FAIL', c2r.out.line);
  assert.match(c2r.out.line, /^\[FAIL push: 1 of 30 files FAIL \(src\/file-09\.spec\.js no result\) · /);
  // (d) a concurrent FAIL on file-15's current key lands between selection and compose
  const d = stubRepo(t);
  run(d, []);
  writeBeh(d, fileName(3), { result: 'pass', append_fail_for: fileName(15) });
  const d2 = run(d, []);
  assert.equal(d2.out.outcome, 'GATE_FAIL', d2.out.line);
  assert.ok(d2.out.failed_files.some((x) => x.file === fileName(15) && x.reason === 'no_result'), JSON.stringify(d2.out.failed_files));
  // (e) decide on a copied run directory whose run_id has no run_start row
  const copy = path.join(c.aux, 'copied-run');
  run(c, [], { env: { GATE_FIXTURE_COPY_RUNDIR: copy } });
  for (const n of ['run-list.json', 'decision.json']) fs.rmSync(path.join(copy, n), { force: true });
  const sp = JSON.parse(fs.readFileSync(path.join(copy, 'spine.json'), 'utf8'));
  sp.run_id = 'g-20200101T000000Z-dead';
  fs.writeFileSync(path.join(copy, 'spine.json'), JSON.stringify(sp));
  const e = gate(c, ['gate', 'decide', '--run-dir', copy]);
  assert.equal(e.code, 1);
  assert.equal(fs.existsSync(path.join(copy, 'run-list.json')), false);
  assert.equal(fs.existsSync(path.join(copy, 'decision.json')), false);
  t.diagnostic('T-V1-12 (a) corrupt ' + res.out.corrupt + ' (b) ' + b2.out.ran_now + ' ran (c) ' + c1.out.line.slice(0, 70) + ' (d) ' + d2.out.outcome + ' (e) ' + e.out.outcome);
});

test('T-V1-13 fix and retry: FAIL, FAIL again on the same key, then the fix composes', (t) => {
  const repo = stubRepo(t, { beh: { [fileName(12)]: { result: 'fail' } } });
  const r1 = run(repo, []);
  assert.equal(r1.out.outcome, 'GATE_FAIL');
  assert.equal(r1.code, 1);
  assert.match(r1.out.line, /^\[FAIL push: 1 of 30 files FAIL \(src\/file-12\.spec\.js\) · /);
  const r2 = run(repo, []);
  assert.deepEqual(lastStart(repo).run_list, [fileName(1), fileName(2), fileName(12)]);
  assert.equal(r2.code, 1);
  writeBeh(repo, fileName(12), { result: 'pass' });
  const r3 = run(repo, []);
  assert.deepEqual(lastStart(repo).run_list, [fileName(1), fileName(2), fileName(12)]);
  assert.equal(r3.out.outcome, 'GATE_PASS_COMPOSED', r3.out.line);
  assert.equal(r3.code, 0);
  assert.match(r3.out.line, / · 27 reused from 1 run /);
  assert.match(r3.out.line, / · 3 ran now · /);
  t.diagnostic('T-V1-13 ' + r3.out.line);
});

test('T-V1-14 G-10 via the queue: WAIT_TIMEOUT and REJECTED never start; under gate queue admission is inherited', (t) => {
  const a = stubRepo(t, { signals: { pressure: 'critical', total_mb: 10000, avail_mb: 9000, swap_used_mb: 0, swapout_mb_per_s: 0 }, globalGates: { queue: { timeout_s: 2 } } });
  const ra = run(a, [], { json: false });
  assert.equal(ra.code, 3, ra.stdout + ra.stderr);
  assert.ok(ra.stdout.split('\n').some((l) => l.startsWith('[WAIT-TIMEOUT] gate-queue:')), ra.stdout);
  assert.match(ra.stdout, /^OUTCOME: GATE_WAIT_TIMEOUT$/m);
  assert.match(ra.stdout, /^state: WAIT_TIMEOUT$/m);
  assert.equal(rows(a).filter((r) => r.type === 'run_start').length, 0);
  assert.equal(starts(a).length, 0);
  const b = stubRepo(t, { gates: { peak_mb: 100000000 } });
  const rb = run(b, [], { json: false });
  assert.equal(rb.code, 1);
  assert.ok(rb.stdout.split('\n').some((l) => l.startsWith('[REJECTED]')), rb.stdout);
  assert.match(rb.stdout, /^OUTCOME: GATE_QUEUE_REJECTED$/m);
  assert.match(rb.stdout, /^state: REJECTED$/m);
  assert.equal(rows(b).filter((r) => r.type === 'run_start').length, 0);
  assert.equal(starts(b).length, 0);
  const c = stubRepo(t);
  const rc = gate(c, ['gate', 'queue', '--', process.execPath, BIN, 'gate', 'run', '--scope', 'push', '--runner', 'stub', '--json'], { json: false });
  const inner = rc.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)).find((o) => o.outcome === 'GATE_PASS_FRESH');
  assert.ok(inner, rc.stdout + rc.stderr);
  assert.equal(inner.admission, 'inherited');
  const s = lastStart(c);
  assert.ok(s.holder, 'stub saw DO_IT_GATE_HOLDER');
  assert.equal(s.holders, 1);
  assert.equal(s.tickets, 0);
  assert.equal(rc.code, 0);
  t.diagnostic('T-V1-14 (a) exit ' + ra.code + ' (b) exit ' + rb.code + ' (c) admission ' + inner.admission + ' holders ' + s.holders);
});

test('T-V1-15 failed recovery escalates: a SUSPECT_KILLER runs solo; killed again it is a named FAIL, passing it composes', (t) => {
  for (const variant of ['killed', 'passes']) {
    const repo = stubRepo(t);
    const kill = { GATE_FIXTURE_KILL_IN: fileName(9) };
    assert.equal(run(repo, [], { env: kill }).code, 3);
    assert.equal(run(repo, [], { env: kill }).code, 3);
    const r3 = run(repo, ['--resume'], { env: variant === 'killed' ? kill : {} });
    const st = starts(repo).slice(-2);
    assert.equal(st[0].solo, false);
    assert.ok(!st[0].run_list.includes(fileName(9)), JSON.stringify(st[0].run_list));
    assert.equal(st[1].solo, true);
    assert.deepEqual(st[1].run_list, [fileName(9)]);
    assert.ok(st[1].argv.includes('--solo'));
    if (variant === 'killed') {
      assert.equal(r3.out.outcome, 'GATE_FAIL', r3.out.line);
      assert.equal(r3.code, 1);
      assert.match(r3.out.line, /^\[FAIL push: 1 of 30 files FAIL \(src\/file-09\.spec\.js suspect-killer\) · /);
    } else {
      assert.equal(r3.out.outcome, 'GATE_PASS_COMPOSED', r3.out.line);
      assert.equal(r3.code, 0);
    }
    t.diagnostic('T-V1-15 ' + variant + ': ' + r3.out.line);
  }
});

test('V1-sweep a SIGKILLed gate run leaves no run dir behind: dead owners swept, live or unknown owners kept', (t) => {
  const repo = stubRepo(t);
  const root = os.tmpdir();
  const dead = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const deadPid = Number(dead.stdout);
  const mk = (suffix, owner) => {
    const d = path.join(root, 'do-it-gate-g-20200101T000000Z-' + suffix);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'spine.json'), JSON.stringify(owner === undefined ? { run_id: 'x' } : { run_id: 'x', owner }));
    return d;
  };
  const gone = mk('dea1', { pid: deadPid, pid_start: 'darwin:Thu Jan  1 00:00:00 1970' });
  const reused = mk('dea2', { pid: process.pid, pid_start: 'darwin:not-this-process' });
  const live = mk('a1ve', { pid: process.pid, pid_start: gateProcStart(process.pid) });
  const unknown = mk('a2ve');
  t.after(() => { for (const d of [gone, reused, live, unknown]) fs.rmSync(d, { recursive: true, force: true }); });
  const r = run(repo, []);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(fs.existsSync(gone), false);
  assert.equal(fs.existsSync(reused), false);
  assert.equal(fs.existsSync(live), true);
  assert.equal(fs.existsSync(unknown), true);
  // the count is not asserted: concurrent gate runs in other test files sweep the same tmpdir
  assert.equal(typeof r.out.swept_run_dirs, 'number');
  t.diagnostic('V1-sweep swept ' + r.out.swept_run_dirs + ' (dead pid ' + deadPid + ', reused start); live and owner-less kept');
});
