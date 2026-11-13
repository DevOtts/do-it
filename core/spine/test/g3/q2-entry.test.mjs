// Q2 entry-point cases: nested admission (T-Q2-09), the one entry point plus its lint (T-Q2-11) and the
// read-only `--status` (T-Q2-12). Sandboxed HOME and the DO_IT_GATE_SIGNALS fixture throughout.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmp } from '../helpers.mjs';
import { CMD, alive, sandbox, sleep, waitFor } from './q1-helpers.mjs';
import { NEST } from './q2-helpers.mjs';
import { SPINE_DIR } from '../helpers.mjs';
import { gateQueueAdmit, gateQueueHeldBySelf, gateQueueName, gateQueueRun } from '../../src/gate-queue.mjs';
import { gateProcStart } from '../../src/gate-signals.mjs';

// The entry-point lint (Q2-07, PRD-4 D20): no core/spine/src module other than gate-queue.mjs may spawn a
// detached child or run a gate command through a shell. Returns the offending file names.
const LINT_RULES = [
  /\bdetached\s*:\s*(?:true|!0|1)\b/,
  /['"`]\/bin\/(?:ba|z|da)?sh['"`][^\n]{0,60}['"`]-c['"`]/,
  /\bshell\s*:\s*(?:true|['"`])/,
];
export function gateEntryLint(srcDir) {
  const bad = [];
  for (const n of fs.readdirSync(srcDir).filter((x) => x.endsWith('.mjs')).sort()) {
    if (n === 'gate-queue.mjs') continue;
    const text = fs.readFileSync(path.join(srcDir, n), 'utf8');
    if (LINT_RULES.some((re) => re.test(text))) bad.push(n);
  }
  return bad;
}

function inProcCtx(sb, lines) {
  return {
    cwd: sb.work, env: sb.env(), git: null, repo: sb.work, root: sb.work, home: path.join(sb.work, '.do-it'),
    userHome: sb.home, now: () => new Date().toISOString(), stderrWrite: (s) => lines.push(...s.split('\n').filter(Boolean)),
  };
}

test('T-Q2-09 nested admission: inherited under a live ancestor holder; a forged holder value is ignored', { timeout: 90000 }, async (t) => {
  const sb = sandbox(t, { pressure: 'normal', total_mb: 10000, avail_mb: 9000, swap_used_mb: 0, swapout_mb_per_s: 0 });
  // part 1: outer peak 6000 (the whole budget) runs an inner gate queue --peak-mb 6000 --timeout-s 5
  let maxHolders = 0;
  let watching = true;
  const watch = (async () => { while (watching) { maxHolders = Math.max(maxHolders, sb.ls('holders').length); await sleep(25); } })();
  const heldFile = sb.file('held.json');
  const t0 = Date.now();
  const outer = sb.gate(['--peak-mb', '6000'], null, {
    argv: [process.execPath, NEST, heldFile, '--peak-mb', '6000', '--timeout-s', '5', '--', process.execPath, '-e', '0'],
  });
  await outer.done;
  const took = Date.now() - t0;
  watching = false;
  await watch;
  t.diagnostic('outer+inner took ' + took + ' ms; max holders ' + maxHolders);
  assert.equal(outer.code, 0, outer.err);
  assert.ok(outer.lines().includes('[gate-queue] nested under holder seq=1: no second admission · admission: inherited'), outer.err);
  assert.doesNotMatch(outer.err, /WAIT-TIMEOUT/);
  assert.equal(JSON.parse(fs.readFileSync(heldFile, 'utf8')).seq, 1);
  assert.ok(took <= 5000, 'outer and inner took ' + took + ' ms');
  assert.ok(maxHolders <= 1, 'holders/ held ' + maxHolders + ' files');
  assert.deepEqual(sb.ls('tickets'), []);
  // part 2: a real 4000 MB holder, and a non-descendant with a forged DO_IT_GATE_HOLDER
  const rel = sb.file('release');
  const real = sb.gate(['--peak-mb', '4000'], ['--until', rel]);
  await waitFor(() => /admitted seq=2 /.test(real.err), 10000, 'real holder admitted');
  const realName = sb.ls('holders')[0];
  const realHolderPid = Number(/-(\d+)\.json$/.exec(realName)[1]);
  for (const forged of ['1-99999', '2-' + realHolderPid]) {
    const ctx = { cwd: sb.work, env: { ...sb.env(), DO_IT_GATE_HOLDER: forged }, userHome: sb.home };
    assert.equal(gateQueueHeldBySelf(ctx), null, 'forged ' + forged + ' accepted');
  }
  const forgedGate = sb.gate(['--peak-mb', '6000', '--timeout-s', '60'], ['--touch', sb.file('forged-started')], { env: sb.env({ DO_IT_GATE_HOLDER: '1-99999' }) });
  await waitFor(() => forgedGate.err.includes('waiting for budget (4000 MB held + 6000 MB > 6000 MB)'), 10000, 'forged gate waits for budget');
  assert.doesNotMatch(forgedGate.err, /nested under holder/);
  assert.equal(sb.ls('tickets').length, 1, 'the forged run has its own ticket');
  assert.equal(fs.existsSync(sb.file('forged-started')), false);
  fs.writeFileSync(rel, '1');
  await Promise.all([real.done, forgedGate.done]);
  assert.equal(real.code, 0, real.err);
  assert.equal(forgedGate.code, 0, forgedGate.err);
  assert.match(forgedGate.err, /admitted seq=3 /);
});

test('T-Q2-11 one entry point: gateQueueRun for train/nightly/manual, gateQueueAdmit + release, and the lint', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  for (const label of ['train', 'nightly', 'manual']) {
    const lines = [];
    const code = await gateQueueRun(inProcCtx(sb, lines), { argv: [process.execPath, CMD, '--exit', '0'], peakMb: 100, label });
    assert.equal(code, 0, lines.join('\n'));
    assert.ok(lines.some((l) => /^\[gate-queue\] enqueued seq=\d+ .*label=/.test(l) && l.endsWith('label=' + label)), lines.join('\n'));
    assert.ok(lines.some((l) => /^\[gate-queue\] admitted seq=\d+ /.test(l)), lines.join('\n'));
    assert.ok(lines.some((l) => /^\[gate-queue\] released seq=\d+ exit=0 cleaned=0$/.test(l)), lines.join('\n'));
  }
  assert.deepEqual(sb.ls('holders'), []);
  const lines = [];
  const adm = await gateQueueAdmit(inProcCtx(sb, lines), { peakMb: 1000, label: 'gate-run' });
  assert.equal(adm.outcome, 'GATE_QUEUE_ADMITTED', lines.join('\n'));
  assert.ok(Number.isInteger(adm.seq));
  const hf = path.join(sb.q, 'holders', gateQueueName(adm.seq, process.pid));
  assert.equal(fs.existsSync(hf), true);
  adm.release(0);
  assert.equal(fs.existsSync(hf), false);
  // the lint: 0 on the real tree, exactly the planted file on a copy
  const src = path.join(SPINE_DIR, 'src');
  assert.deepEqual(gateEntryLint(src), []);
  const copy = tmp('dit-q2-lint-');
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
  for (const n of fs.readdirSync(src)) fs.copyFileSync(path.join(src, n), path.join(copy, n));
  fs.writeFileSync(path.join(copy, 'planted.mjs'), "import cp from 'node:child_process';\nexport function plantedRun() { return cp.spawn('x', [], { detached: true }); }\n");
  assert.deepEqual(gateEntryLint(copy), ['planted.mjs']);
});

test('T-Q2-12 --status: budget, holders, a dead holder, the FIFO with stored reasons; read-only; exit 0', { timeout: 60000 }, async (t) => {
  const sb = sandbox(t);
  const sleeper = () => {
    const c = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    sb.procs.push(c);
    return c;
  };
  const a = sleeper();
  const b = sleeper();
  const w = sleeper();
  const dead = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const deadPid = Number(dead.stdout);
  await waitFor(() => [a, b, w].every((c) => gateProcStart(c.pid)), 5000, 'sleepers up');
  const now = new Date().toISOString();
  const entry = (seq, pid, peak, extra) => ({
    seq, pid, pid_start: gateProcStart(pid), pgid: null, cwd: sb.work, repo: null, label: 'job' + seq, peak_mb: peak,
    enqueued_at: now, admitted_at: now, reason: null, checked_at: now, ...(extra || {}),
  });
  const put = (kind, e) => {
    fs.mkdirSync(path.join(sb.q, kind), { recursive: true });
    fs.writeFileSync(path.join(sb.q, kind, gateQueueName(e.seq, e.pid)), JSON.stringify(e));
  };
  put('holders', entry(1, a.pid, 1000));
  put('holders', entry(2, b.pid, 2000));
  put('holders', entry(3, deadPid, 500, { pid_start: 'darwin:Thu Jan  1 00:00:00 1970' }));
  put('tickets', entry(4, w.pid, 4000, { admitted_at: null, reason: 'budget (3000 MB held + 4000 MB > 6000 MB)' }));
  fs.writeFileSync(path.join(sb.q, 'seq'), '4');
  const listing = () => {
    const out = [];
    const walk = (d) => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n); const st = fs.statSync(f); out.push(path.relative(sb.q, f) + ' ' + st.mtimeMs + ' ' + st.size); if (st.isDirectory()) walk(f); } };
    walk(sb.q);
    return out.join('\n');
  };
  const before = listing();
  const h = sb.gate(['--status'], null, { argv: [] });
  await h.done;
  assert.equal(h.code, 0, h.err);
  const L = h.lines();
  assert.equal(L[0], '[gate-queue] budget 6000 MB · held 3000 MB by 2 holders · signals fixture');
  assert.equal(L.filter((l) => l.startsWith('[gate-queue] holder ')).length, 2, h.err);
  assert.equal(L.filter((l) => l.includes('dead (reclaim pending)')).length, 1, h.err);
  const wl = L.filter((l) => l.includes('waiting 1/1 seq=4'));
  assert.equal(wl.length, 1, h.err);
  assert.ok(wl[0].endsWith('waiting for budget (3000 MB held + 4000 MB > 6000 MB)'), wl[0]);
  const j = sb.gate(['--status', '--json'], null, { argv: [] });
  await j.done;
  assert.equal(j.code, 0, j.err);
  const doc = j.result();
  assert.equal(doc.holders.length, 3);
  assert.equal(doc.holders.filter((x) => x.alive === false).length, 1);
  assert.equal(doc.waiting.length, 1);
  assert.equal(doc.budget_mb, 6000);
  assert.equal(doc.held_mb, 3000);
  assert.equal(listing(), before, 'the queue dir changed under --status');
  assert.ok(alive(a.pid) && alive(b.pid) && alive(w.pid));
  t.diagnostic(L.join(' | '));
});
