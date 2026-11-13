// Q1 integration cases: admission, FIFO, reclaim, timeout, rollback, settings (T-Q1-02..08, T-Q1-10..14).
// Every gate runs as its own process (core/spine/test/g3/driver.mjs) under a sandboxed HOME with the
// DO_IT_GATE_SIGNALS fixture, so the real machine queue and the live memory state are never involved.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { NORMAL, alive, holderJson, sandbox, sleep, waitFor } from './q1-helpers.mjs';

const WARN = { ...NORMAL, pressure: 'warn' };

// T-Q1-10's real-home listing is taken when this file loads and compared at the end of the last test.
function listTree(dir) {
  const out = [];
  const walk = (d) => {
    let names;
    try { names = fs.readdirSync(d).sort(); } catch { return; }
    for (const n of names) {
      const f = path.join(d, n);
      const st = fs.lstatSync(f);
      out.push(path.relative(dir, f) + ' ' + st.mtimeMs);
      if (st.isDirectory()) walk(f);
    }
  };
  if (!fs.existsSync(dir)) return 'absent';
  walk(dir);
  return out.join('\n');
}
const REAL_QUEUE = path.join(os.homedir(), '.do-it', 'queue');
const realBefore = listTree(REAL_QUEUE);

test('T-Q1-02 pressure warn holds the gate (never started), revert to normal admits it', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t, WARN);
  const g = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')]);
  await sleep(5000);
  assert.equal(fs.existsSync(sb.file('started')), false, 'command started under warn');
  assert.ok(g.lines().includes('[gate-queue] position 1/1 · waiting for memory pressure normal (now warn) · ahead: none'), g.err);
  sb.set(NORMAL);
  const flipped = Date.now();
  await waitFor(() => /admitted seq=1 /.test(g.err), 8000, 'admitted');
  const took = Date.now() - flipped;
  await g.done;
  assert.ok(took <= 4000, 'admitted ' + took + ' ms after the revert');
  assert.equal(fs.existsSync(sb.file('started')), true);
  assert.equal(g.code, 0, g.err);
});

test('T-Q1-03 WAIT_TIMEOUT: exit 3, never started, files clean; the retry gets a new seq and is admitted', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t, WARN);
  const g = sb.gate(['--peak-mb', '1000', '--timeout-s', '3'], ['--touch', sb.file('started')]);
  await g.done;
  assert.equal(g.code, 3, g.err);
  const last = g.lines().pop();
  assert.match(last, /^\[WAIT-TIMEOUT\] gate-queue: waited [3-5] s at position 1\/1 for memory pressure normal · not started · retryable$/);
  assert.equal(g.result().outcome, 'GATE_WAIT_TIMEOUT');
  assert.equal(fs.existsSync(sb.file('started')), false);
  assert.deepEqual(sb.ls('tickets'), []);
  assert.deepEqual(sb.ls('holders'), []);
  sb.set(NORMAL);
  const r = sb.gate(['--peak-mb', '1000', '--timeout-s', '3'], ['--touch', sb.file('started')]);
  await r.done;
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /enqueued seq=2 /);
  assert.match(r.err, /admitted seq=2 /);
  assert.equal(fs.existsSync(sb.file('started')), true);
});

test('T-Q1-04 reclaim: a dead holder and a PID-reused holder are reclaimed (never killed); the new gate is admitted', { timeout: 60000 }, async (t) => {
  // (a) dead pid
  {
    const sb = sandbox(t);
    const dead = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    const pid = Number(dead.stdout);
    const name = '0000000001-' + pid + '.json';
    fs.mkdirSync(path.join(sb.q, 'holders'), { recursive: true });
    fs.writeFileSync(path.join(sb.q, 'holders', name), JSON.stringify(holderJson(1, pid, { peak_mb: 6000, pid_start: 'darwin:Fri Nov  6 10:36:51 2026' })));
    const g = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')]);
    await g.done;
    assert.ok(g.lines().includes('[gate-queue] reclaimed seq=1 pid ' + pid + ' (dead)'), g.err);
    assert.equal(g.code, 0, g.err);
    assert.equal(fs.existsSync(path.join(sb.q, 'holders', name)), false);
    assert.match(g.err, /released seq=2 exit=0/);
  }
  // (b) live process whose start time differs (PID reuse)
  {
    const sb = sandbox(t);
    const sleeper = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    sb.procs.push(sleeper);
    const name = '0000000001-' + sleeper.pid + '.json';
    const fake = process.platform === 'linux' ? 'linux:1' : 'darwin:Thu Jan  1 00:00:00 1970';
    fs.mkdirSync(path.join(sb.q, 'holders'), { recursive: true });
    fs.writeFileSync(path.join(sb.q, 'holders', name), JSON.stringify(holderJson(1, sleeper.pid, { peak_mb: 6000, pid_start: fake })));
    const g = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')]);
    await g.done;
    assert.ok(g.lines().includes('[gate-queue] reclaimed seq=1 pid ' + sleeper.pid + ' (start time differs)'), g.err);
    assert.equal(g.code, 0, g.err);
    assert.equal(fs.existsSync(path.join(sb.q, 'holders', name)), false);
    assert.equal(alive(sleeper.pid), true, 'reclaim must never kill');
    sleeper.kill('SIGKILL');
  }
});

test('T-Q1-05 budget: a small gate fits beside a big one; a third that does not fit waits until the second releases', { timeout: 90000 }, async (t) => {
  const sb = sandbox(t);
  const a = sb.gate(['--peak-mb', '4000', '--label', 'A'], ['--touch', sb.file('startedA'), '--until', sb.file('releaseA')]);
  await waitFor(() => fs.existsSync(sb.file('startedA')), 20000, 'A started');
  const b = sb.gate(['--peak-mb', '1500', '--label', 'B'], ['--touch', sb.file('startedB'), '--until', sb.file('releaseB')]);
  await waitFor(() => fs.existsSync(sb.file('startedB')), 20000, 'B started');
  assert.match(b.err, /admitted seq=2 after \d+ s · peak 1500 MB · held 5500\/6000 MB · signals fixture/);
  const c = sb.gate(['--peak-mb', '1000', '--label', 'C'], ['--touch', sb.file('startedC')]);
  await waitFor(() => /waiting for budget \(5500 MB held \+ 1000 MB > 6000 MB\)/.test(c.err), 20000, 'C waiting for budget');
  assert.equal(fs.existsSync(sb.file('startedC')), false);
  fs.writeFileSync(sb.file('releaseB'), '');
  await b.done;
  const released = b.exitedAt;
  await waitFor(() => /admitted seq=3 /.test(c.err), 10000, 'C admitted');
  const took = Date.now() - released;
  assert.ok(took <= 4000, 'C admitted ' + took + ' ms after B released');
  fs.writeFileSync(sb.file('releaseA'), '');
  await Promise.all([a.done, c.done]);
  assert.deepEqual([a.code, b.code, c.code], [0, 0, 0], a.err + b.err + c.err);
});

test('T-Q1-06 REJECTED: a peak above the budget ends at once with exit 1 and no ticket', { timeout: 30000 }, async (t) => {
  const sb = sandbox(t);
  const g = sb.gate(['--peak-mb', '7000'], ['--touch', sb.file('started')]);
  await g.done;
  assert.equal(g.code, 1, g.err);
  assert.ok(g.lines().includes('[REJECTED] gate-queue: peak 7000 MB above budget 6000 MB · not started'), g.err);
  assert.equal(g.result().outcome, 'GATE_QUEUE_REJECTED');
  assert.deepEqual(sb.ls('tickets'), []);
  assert.deepEqual(sb.ls('holders'), []);
  assert.equal(fs.existsSync(sb.file('started')), false);
});

test('T-Q1-07 strict FIFO: exclusive gates run in seq order; a small ticket never overtakes a blocked head', { timeout: 180000 }, async (t) => {
  // (a) 8 exclusive gates, each enqueued >= 300 ms after the previous one's ticket exists
  {
    const sb = sandbox(t);
    const gates = [];
    for (let i = 1; i <= 8; i++) {
      const g = sb.gate(['--label', 'q' + i], ['--append', sb.file('order.txt'), 'q' + i, '--hold-ms', '500']);
      gates.push(g);
      await waitFor(() => /enqueued seq=\d+ /.test(g.err), 20000, 'q' + i + ' enqueued');
      await sleep(300);
    }
    await Promise.all(gates.map((g) => g.done));
    for (const g of gates) {
      assert.equal(g.code, 0, g.err);
      assert.match(g.err, /peak undeclared: exclusive/);
    }
    assert.equal(fs.readFileSync(sb.file('order.txt'), 'utf8').trim(), 'q1 q2 q3 q4 q5 q6 q7 q8');
  }
  // (b) holder 5000, head 2000 (blocked on budget), then 500 (would fit, must wait for its turn)
  {
    const sb = sandbox(t);
    const a = sb.gate(['--peak-mb', '5000', '--label', 'big'], ['--touch', sb.file('startedA'), '--until', sb.file('releaseA')]);
    await waitFor(() => fs.existsSync(sb.file('startedA')), 20000, 'big started');
    const h = sb.gate(['--peak-mb', '2000', '--label', 'head'], ['--touch', sb.file('startedH'), '--until', sb.file('releaseH')]);
    await waitFor(() => /waiting for budget \(5000 MB held \+ 2000 MB > 6000 MB\)/.test(h.err), 20000, 'head waiting');
    const s = sb.gate(['--peak-mb', '500', '--label', 'small'], ['--touch', sb.file('startedS'), '--until', sb.file('releaseS')]);
    await waitFor(() => /position 3\/3 · waiting for turn/.test(s.err), 20000, 'small waiting for turn');
    await sleep(2500);
    assert.equal(fs.existsSync(sb.file('startedS')), false, 'small overtook the head');
    fs.writeFileSync(sb.file('releaseA'), '');
    await waitFor(() => fs.existsSync(sb.file('startedH')) && fs.existsSync(sb.file('startedS')), 20000, 'head and small started');
    const holders = sb.ls('holders').map((n) => JSON.parse(fs.readFileSync(path.join(sb.q, 'holders', n), 'utf8')));
    const H = holders.find((e) => e.label === 'head');
    const S = holders.find((e) => e.label === 'small');
    assert.ok(H && S, JSON.stringify(holders));
    assert.ok(S.admitted_at >= H.admitted_at, 'small admitted ' + S.admitted_at + ' before head ' + H.admitted_at);
    fs.writeFileSync(sb.file('releaseH'), '');
    fs.writeFileSync(sb.file('releaseS'), '');
    await Promise.all([a.done, h.done, s.done]);
    assert.deepEqual([a.code, h.code, s.code], [0, 0, 0]);
  }
});

test('T-Q1-08 budget-only fallback when memory signals are unavailable', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t, { unavailable: true, total_mb: 10000 });
  const line = '[gate-queue] memory signals unavailable: budget-only admission';
  const a = sb.gate(['--peak-mb', '4000', '--label', 'A'], ['--touch', sb.file('startedA'), '--until', sb.file('releaseA')]);
  await waitFor(() => fs.existsSync(sb.file('startedA')), 20000, 'A started');
  const b = sb.gate(['--peak-mb', '3000', '--label', 'B'], ['--touch', sb.file('startedB')]);
  await waitFor(() => /waiting for budget \(4000 MB held \+ 3000 MB > 6000 MB\)/.test(b.err), 20000, 'B waiting');
  await sleep(4500); // several polls: the fallback line must still be printed only once
  assert.equal(fs.existsSync(sb.file('startedB')), false);
  fs.writeFileSync(sb.file('releaseA'), '');
  await Promise.all([a.done, b.done]);
  assert.equal(a.code, 0, a.err);
  assert.equal(b.code, 0, b.err);
  assert.equal(a.lines().filter((l) => l === line).length, 1, a.err);
  assert.equal(b.lines().filter((l) => l === line).length, 1, b.err);
});

test('T-Q1-11 one blocking process, no polling chatter: one line while unchanged, one more on change', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t, WARN);
  const g = sb.gate(['--peak-mb', '1000'], ['--ppid', sb.file('ppid')]);
  await waitFor(() => /enqueued seq=1 /.test(g.err), 20000, 'enqueued');
  const ticket = sb.ls('tickets');
  assert.deepEqual(ticket, ['0000000001-' + g.pid + '.json']);
  await sleep(9000);
  const pos = () => g.lines().filter((l) => l.startsWith('[gate-queue] position '));
  assert.equal(pos().length, 1, g.err);
  sb.set({ ...NORMAL, pressure: 'critical' });
  await sleep(3000);
  assert.equal(pos().length, 2, g.err);
  assert.equal(pos().filter((l) => l.includes('(now critical)')).length, 1, g.err);
  sb.set(NORMAL);
  await g.done;
  assert.equal(g.code, 0, g.err);
  assert.equal(Number(fs.readFileSync(sb.file('ppid'), 'utf8')), g.pid, 'the admitted command is the child of the same queue process');
  assert.match(g.err, /admitted seq=1 /);
});

test('T-Q1-12 adversarial: a holder file tampered after admission is quarantined; the holder still finishes cleanly', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const a = sb.gate(['--peak-mb', '6000', '--label', 'A'], ['--touch', sb.file('startedA'), '--until', sb.file('releaseA')]);
  await waitFor(() => fs.existsSync(sb.file('startedA')), 20000, 'A started');
  const name = '0000000001-' + a.pid + '.json';
  fs.writeFileSync(path.join(sb.q, 'holders', name), '{garbage');
  const b = sb.gate(['--peak-mb', '1000', '--label', 'B'], ['--touch', sb.file('startedB')]);
  await b.done;
  assert.ok(b.lines().includes('[gate-queue] corrupt holder file ' + name + ' quarantined'), b.err);
  assert.equal(fs.existsSync(path.join(sb.q, 'corrupt', name)), true);
  assert.equal(b.code, 0, b.err);
  fs.writeFileSync(sb.file('releaseA'), '');
  await a.done;
  assert.equal(a.code, 0, a.err);
  assert.ok(a.lines().includes('[gate-queue] holder file missing at release'), a.err);
});

test('T-Q1-13 stale lock reclaimed once; 20 concurrent gates get distinct seqs 1..20 and leave nothing behind', { timeout: 240000 }, async (t) => {
  const sb = sandbox(t);
  const dead = Number(cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);
  fs.mkdirSync(path.join(sb.q, '.lock'), { recursive: true });
  fs.writeFileSync(path.join(sb.q, '.lock', 'owner.json'), JSON.stringify({ pid: dead, pid_start: null, at: new Date().toISOString() }));
  // scratch left by a locker killed mid-acquire: swept once its pid is dead
  fs.mkdirSync(path.join(sb.q, '.lock.tmp-' + dead + '-deadbeef'), { recursive: true });
  const gates = [];
  for (let i = 0; i < 20; i++) gates.push(sb.gate(['--peak-mb', '1', '--label', 'n' + i], null, { argv: [process.execPath, '-e', '0'] }));
  await Promise.all(gates.map((g) => g.done));
  for (const g of gates) assert.equal(g.code, 0, g.err);
  const stale = gates.filter((g) => g.lines().includes('[gate-queue] stale queue lock (owner ' + dead + ' dead) reclaimed'));
  assert.equal(stale.length, 1, 'stale-lock line printed by ' + stale.length + ' gates');
  const seqs = gates.map((g) => Number((/released seq=(\d+) exit=0/.exec(g.err) || [])[1])).sort((x, y) => x - y);
  assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb.q, 'seq'), 'utf8')), 20);
  assert.deepEqual(sb.ls('tickets'), []);
  assert.deepEqual(sb.ls('holders'), []);
  assert.equal(fs.existsSync(path.join(sb.q, '.lock')), false);
  assert.deepEqual(fs.readdirSync(sb.q).filter((n) => n.startsWith('.lock')), []);
});

test('T-Q1-14 rollback: SIGTERM / SIGINT while waiting remove the ticket, exit 143 / 130, never start', { timeout: 60000 }, async (t) => {
  for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    const sb = sandbox(t, WARN);
    const g = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')]);
    await waitFor(() => /position 1\/1 · waiting/.test(g.err), 20000, 'waiting');
    await sleep(3000);
    assert.equal(sb.ls('tickets').length, 1);
    g.child.kill(sig);
    await g.done;
    assert.equal(g.code, code, sig + ': ' + g.err);
    assert.equal(g.result().outcome, 'GATE_INTERRUPTED');
    assert.deepEqual(sb.ls('tickets'), []);
    assert.equal(fs.existsSync(path.join(sb.q, 'holders')), false, 'a holder was written');
    assert.equal(fs.existsSync(sb.file('started')), false);
  }
});

// Last in the file: compares the real home's queue listing taken when the file loaded.
test('T-Q1-10 queue settings come from the sandboxed global layer only; a bad value fails before anything starts', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const repo = path.join(sb.work, 'repo');
  fs.mkdirSync(path.join(repo, '.do-it'), { recursive: true });
  cp.execFileSync('git', ['init', '-q', repo], { env: sb.env() });
  fs.writeFileSync(path.join(repo, '.do-it', 'settings.json'), JSON.stringify({ gates: { queue: { budget_pct: 90 } } }));
  const globalFile = path.join(sb.home, '.do-it', 'settings.json');
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.writeFileSync(globalFile, JSON.stringify({ gates: { queue: { budget_pct: 50 } } }));
  const g = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')], { cwd: repo });
  await g.done;
  assert.equal(g.code, 0, g.err);
  assert.match(g.err, /held 1000\/5000 MB/);
  fs.rmSync(sb.file('started'));
  fs.writeFileSync(globalFile, JSON.stringify({ gates: { queue: { budget_pct: 95 } } }));
  const bad = sb.gate(['--peak-mb', '1000'], ['--touch', sb.file('started')], { cwd: repo });
  await bad.done;
  assert.equal(bad.code, 1, bad.err);
  assert.equal(bad.result().outcome, 'QUEUE_SETTINGS_INVALID');
  assert.equal(fs.existsSync(sb.file('started')), false);
  assert.deepEqual(sb.ls('tickets'), []);
  assert.equal(listTree(REAL_QUEUE), realBefore, 'the real ~/.do-it/queue changed while this file ran');
});
