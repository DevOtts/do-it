// Q2 cleanup cases (T-Q2-01..08, T-Q2-13, T-Q2-14): own process group, descendant tracking by (pid, start),
// signal forwarding, SIGTERM -> SIGKILL escalation, release after cleanup, spawn-failure rollback, crash recovery.
// Real processes under a sandboxed HOME and the DO_IT_GATE_SIGNALS fixture; every pid a case starts is reaped.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CMD, alive, sandbox, sleep, waitFor } from './q1-helpers.mjs';
import { aliveCount, decoy, gone, killAll, reapAfter, treeGate, treePids } from './q2-helpers.mjs';

test('T-Q2-01 G-11: pass, fail and SIGTERM-ed hang end every tracked pid; a same-argv decoy survives', { timeout: 120000 }, async (t) => {
  const sb = sandbox(t);
  const dDecoy = sb.file('decoy');
  fs.mkdirSync(dDecoy);
  const dec = decoy(dDecoy);
  const dirs = ['pass', 'fail', 'hang'].map((m) => sb.file(m));
  reapAfter(t, dirs, [dec]);
  const want = { pass: [0, 2], fail: [1, 2], hang: [143, 3] };
  for (const mode of ['pass', 'fail', 'hang']) {
    const dir = sb.file(mode);
    const g = treeGate(sb, ['--peak-mb', '1000'], mode, dir);
    const pids = await treePids(dir);
    assert.equal(Object.keys(pids).length, 3);
    if (mode === 'hang') { await sleep(3000); process.kill(g.pid, 'SIGTERM'); }
    await g.done;
    assert.equal(g.code, want[mode][0], mode + ': ' + g.err);
    for (const [k, p] of Object.entries(pids)) assert.equal(alive(p), false, mode + ': ' + k + ' pid ' + p + ' still alive');
    assert.equal(alive(dec.pid), true, mode + ': the decoy (same argv, not a descendant) was killed');
    assert.deepEqual(sb.ls('holders'), [], mode);
    assert.match(g.err, new RegExp('\\[gate-queue\\] released seq=\\d+ exit=' + want[mode][0] + ' cleaned=' + want[mode][1] + '\\n'), mode + ': ' + g.err);
    t.diagnostic(mode + ': ' + g.lines().find((l) => l.includes('released seq=')));
  }
});

test('T-Q2-02 can-fail: with queue_skip_cleanup the detector sees alive=2; without it alive=0', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const dF = sb.file('fault');
  const dC = sb.file('clean');
  reapAfter(t, [dF, dC]);
  const g1 = treeGate(sb, ['--peak-mb', '1000'], 'pass', dF, { DO_IT_FAULT: 'queue_skip_cleanup' });
  const p1 = await treePids(dF);
  await g1.done;
  assert.equal(g1.code, 0, g1.err);
  await gone(p1.root, 5000);
  const leaked = aliveCount(p1);
  t.diagnostic('with fault: alive=' + leaked);
  assert.equal(leaked, 2, 'the detector must see the child and grandchild survive: ' + g1.err);
  assert.ok(alive(p1.child) && alive(p1.grandchild));
  killAll(p1);
  const g2 = treeGate(sb, ['--peak-mb', '1000'], 'pass', dC);
  const p2 = await treePids(dC);
  await g2.done;
  assert.equal(g2.code, 0, g2.err);
  const after = aliveCount(p2);
  t.diagnostic('without fault: alive=' + after);
  assert.equal(after, 0);
});

test('T-Q2-03 jest-style hang after green: out-of-band handle cleaned within 12 s; in-band hang ends on SIGTERM', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const dA = sb.file('a');
  const dB = sb.file('b');
  reapAfter(t, [dA, dB]);
  const a = treeGate(sb, ['--peak-mb', '1000'], 'green-exit', dA);
  const pa = await treePids(dA);
  await a.done;
  const rootExit = Number(fs.readFileSync(path.join(dA, 'root-exit.txt'), 'utf8'));
  assert.equal(a.code, 0, a.err);
  assert.ok(a.exitedAt - rootExit <= 12000, 'queue exited ' + (a.exitedAt - rootExit) + ' ms after the root');
  assert.match(a.err, /Tests: 3 passed, 3 total/);
  assert.equal(alive(pa.child), false);
  assert.ok(a.lines().includes('[gate-queue] released seq=1 exit=0 cleaned=1'), a.err);
  const b = treeGate(sb, ['--peak-mb', '1000'], 'green-hang', dB);
  const pb = await treePids(dB);
  await waitFor(() => /Tests: 3 passed/.test(b.err), 5000, 'green line');
  await sleep(3000);
  process.kill(b.pid, 'SIGTERM');
  await b.done;
  assert.equal(b.code, 143, b.err);
  assert.equal(alive(pb.root), false);
  assert.equal(alive(pb.child), false);
  assert.deepEqual(sb.ls('holders'), []);
});

test('T-Q2-04 failed recovery escalates: a SIGTERM-ignoring descendant is SIGKILLed after the 10 s grace', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const d = sb.file('s');
  reapAfter(t, [d]);
  const g = treeGate(sb, ['--peak-mb', '1000'], 'stubborn', d);
  const p = await treePids(d);
  await g.done;
  const rootExit = Number(fs.readFileSync(path.join(d, 'root-exit.txt'), 'utf8'));
  const lag = g.exitedAt - rootExit;
  t.diagnostic('queue exit ' + lag + ' ms after the root');
  assert.equal(g.code, 0, g.err);
  assert.ok(g.lines().includes('[gate-queue] cleanup: SIGKILL 1 after 10 s grace'), g.err);
  assert.equal(alive(p.child), false);
  assert.ok(lag >= 10000 && lag <= 14000, 'queue exit ' + lag + ' ms after the root (want 10-14 s)');
});

test('T-Q2-05 exit-code passthrough: 0 1 2 7 42 255, then SIGKILL 137 and SIGTERM 143', { timeout: 120000 }, async (t) => {
  const sb = sandbox(t);
  const runs = [0, 1, 2, 7, 42, 255].map((c) => ({ want: c, argv: [process.execPath, CMD, '--exit', String(c)] }));
  for (const s of ['SIGKILL', 'SIGTERM']) runs.push({ want: s === 'SIGKILL' ? 137 : 143, argv: [process.execPath, '-e', 'process.kill(process.pid, "' + s + '")'] });
  let seq = 0;
  for (const r of runs) {
    const g = sb.gate(['--peak-mb', '100'], null, { argv: r.argv });
    await g.done;
    seq++;
    assert.equal(g.code, r.want, g.err);
    assert.ok(g.lines().includes('[gate-queue] released seq=' + seq + ' exit=' + r.want + ' cleaned=0'), g.err);
  }
});

test('T-Q2-06 signal forwarding: SIGINT -> got.txt SIGINT, exit 130 GATE_INTERRUPTED; SIGHUP -> exit 129', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const dirs = [sb.file('int'), sb.file('hup')];
  reapAfter(t, dirs);
  for (const [sig, code, dir] of [['SIGINT', 130, dirs[0]], ['SIGHUP', 129, dirs[1]]]) {
    const g = treeGate(sb, ['--peak-mb', '100'], 'trap', dir);
    const p = await treePids(dir);
    process.kill(g.pid, sig);
    await g.done;
    assert.equal(fs.readFileSync(path.join(dir, 'got.txt'), 'utf8'), sig);
    assert.equal(g.code, code, g.err);
    assert.equal(g.result().outcome, 'GATE_INTERRUPTED');
    assert.equal(aliveCount(p), 0, sig + ': a tracked pid survived');
  }
});

test('T-Q2-07 release after cleanup: B never starts before A\'s trapping descendant is dead', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const d = sb.file('a');
  reapAfter(t, [d]);
  const a = treeGate(sb, [], 'release-check', d);
  await treePids(d);
  const b = sb.gate([], ['--touch', sb.file('started')]);
  await waitFor(() => /enqueued seq=2/.test(b.err), 10000, 'B enqueued');
  await Promise.all([a.done, b.done]);
  assert.ok(fs.existsSync(path.join(d, 'holder-present')), 'A\'s holder file was gone while its descendant was alive: ' + a.err);
  const death = Number(fs.readFileSync(path.join(d, 'death.txt'), 'utf8'));
  const startedMs = fs.statSync(sb.file('started')).mtimeMs;
  const startedAt = Number(fs.readFileSync(sb.file('started'), 'utf8'));
  assert.ok(startedAt >= death && startedMs >= death - 1, 'B started ' + (death - startedAt) + ' ms before the descendant died');
  assert.equal(a.code, 0, a.err);
  assert.equal(b.code, 0, b.err);
});

test('T-Q2-08 rollback: a command that cannot start exits 127, releases, and the next gate is admitted at once', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const g = sb.gate(['--peak-mb', '100'], null, { argv: ['/nonexistent/gate'] });
  await g.done;
  assert.equal(g.code, 127, g.err);
  const L = g.lines();
  const i = L.indexOf('[gate-queue] command failed to start: ENOENT');
  assert.ok(i >= 0, g.err);
  assert.equal(L[i + 1], '[gate-queue] released seq=1 exit=127 cleaned=0');
  assert.deepEqual(sb.ls('holders'), []);
  assert.deepEqual(sb.ls('tickets'), []);
  const n = sb.gate([], ['--exit', '0']);
  await n.done;
  assert.equal(n.code, 0, n.err);
  assert.match(n.err, /admitted seq=2 after 0 s/);
});

test('T-Q2-13 recovery after a queue crash: reclaimed, orphans reported (not killed), next gate runs', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const d = sb.file('a');
  reapAfter(t, [d]);
  const a = treeGate(sb, ['--peak-mb', '1000'], 'hang', d);
  const p = await treePids(d);
  await waitFor(() => {
    const h = sb.ls('holders');
    if (h.length !== 1) return false;
    return JSON.parse(fs.readFileSync(path.join(sb.q, 'holders', h[0]), 'utf8')).pgid === p.root;
  }, 5000, 'holder names the pgid');
  process.kill(a.pid, 'SIGKILL');
  await gone(a.pid, 5000);
  const b = sb.gate([], ['--exit', '0']);
  await b.done;
  assert.equal(b.code, 0, b.err);
  assert.ok(b.lines().includes('[gate-queue] reclaimed seq=1 pid ' + a.pid + ' (dead)'), b.err);
  assert.ok(b.lines().includes('[gate-queue] orphan process group ' + p.root + ' still has 2 processes (not killed: not ours)'), b.err);
  assert.equal(alive(p.root), true, 'orphan root was killed');
  assert.equal(alive(p.child), true, 'orphan child was killed');
  killAll(p);
});

test('T-Q2-14 adversarial: a deleted holder file is reported at release; a rewritten pgid never redirects cleanup', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const dA = sb.file('a');
  const dB = sb.file('b');
  const dDecoy = sb.file('decoy');
  fs.mkdirSync(dDecoy);
  const dec = decoy(dDecoy, { detached: true });
  reapAfter(t, [dA, dB], [dec]);
  const holderWithPgid = () => {
    const h = sb.ls('holders');
    if (h.length !== 1) return null;
    const f = path.join(sb.q, 'holders', h[0]);
    try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); return v.pgid ? { f, v } : null; } catch { return null; }
  };
  // (a) holder file deleted while the gate runs
  const a = treeGate(sb, ['--peak-mb', '1000'], 'pass', dA);
  const pa = await treePids(dA);
  await waitFor(() => holderWithPgid(), 5000, 'holder with pgid');
  fs.unlinkSync(holderWithPgid().f);
  await a.done;
  assert.equal(a.code, 0, a.err);
  assert.ok(a.lines().includes('[gate-queue] holder file missing at release'), a.err);
  assert.equal(aliveCount(pa), 0);
  // (b) holder file's pgid rewritten to a decoy group
  const b = treeGate(sb, ['--peak-mb', '1000'], 'pass', dB);
  const pb = await treePids(dB);
  await waitFor(() => holderWithPgid(), 5000, 'holder with pgid');
  const { f, v } = holderWithPgid();
  fs.writeFileSync(f + '.tmp', JSON.stringify({ ...v, pgid: dec.pid }));
  fs.renameSync(f + '.tmp', f);
  await b.done;
  assert.equal(b.code, 0, b.err);
  assert.equal(aliveCount(pb), 0, 'a real tree pid survived');
  assert.equal(alive(dec.pid), true, 'the decoy group was killed');
  process.kill(-dec.pid, 0);
});
