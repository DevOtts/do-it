import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail } from './errors.mjs';
import { atomicWriteJson, readJsonRegular } from './fs-atomic.mjs';
import { GATES_QUEUE_DEFAULTS, settingsPaths } from './settings.mjs';
import {
  gateProcParent, gateProcStart, gateProcStartMany, gateProcState,
  gateSignalsBudgetOnly, gateSignalsDecide, gateSignalsRead, gateSignalsReadSettled,
} from './gate-signals.mjs';

// Per-machine gate admission and run (CONTRACT §2.5, §3, §4.3–§4.5, §8 M3; PRD-4 D1–D20). Q1: admission half;
// Q2: own process group, descendant tracking and cleanup by PID, signal forwarding, nested admission, --status.
// Files under {HOME}/.do-it/queue/: .lock/ (owner.json), seq, tickets/, holders/, corrupt/.
// Every top-level name starts with gateQueue (bundle unique-name rule, G-15).
//
// Concurrency model:
// - The lock is a directory renamed into place already holding owner.json, so `.lock/` never exists without an
//   owner; it is held only for synchronous read-modify-write (seq + ticket write, admission rename).
// - Liveness (pid + start time) is judged OUTSIDE the lock: "dead" and "start time differs" are permanent for a
//   given file, so a reclaim decided early stays right; removal is one unlink (exactly one remover wins and prints).
// - Release is one unlink of the caller's own holder file: it only lowers held memory, so it needs no lock.

export const gateQueuePollMs = 2000;
export const gateQueueReprintMs = 60000;
// Effective defaults come from the settings layer's one helper constant (A8); read at call time because the bundle
// may order this module before settings.mjs.
export function gateQueueDefaults() {
  return { ...GATES_QUEUE_DEFAULTS, swap_used_max_mb: null };
}
const gateQueueEntryCap = 64 * 1024;
const gateQueueNameRe = /^(\d{10})-(\d+)\.json$/;

export function gateQueueRoot(ctx) {
  return path.join(ctx.userHome, '.do-it', 'queue');
}

export function gateQueueName(seq, pid) {
  return String(seq).padStart(10, '0') + '-' + pid + '.json';
}

function gateQueueErrWriter(ctx) {
  if (ctx && typeof ctx.stderrWrite === 'function') return (line) => ctx.stderrWrite(line + '\n');
  return (line) => process.stderr.write(line + '\n');
}

// == settings (Q1-07, PRD-4 D14): global layer only, never the workspace file ==

export function gateQueueSettings(ctx) {
  const file = settingsPaths(ctx).global;
  let doc = null;
  try { doc = readJsonRegular(file, gateQueueEntryCap * 16); } catch (e) {
    throw fail('QUEUE_SETTINGS_INVALID', 1, { file, message: 'global settings unreadable: ' + (e.code || 'error') });
  }
  const q = doc && doc.gates && doc.gates.queue;
  const out = gateQueueDefaults();
  if (q == null) return out;
  if (typeof q !== 'object' || Array.isArray(q)) throw fail('QUEUE_SETTINGS_INVALID', 1, { file, key: 'gates.queue', message: 'gates.queue must be an object' });
  const bad = (key, rule, v) => fail('QUEUE_SETTINGS_INVALID', 1, { file, key: 'gates.queue.' + key, message: 'gates.queue.' + key + ' must be ' + rule + ' (got ' + JSON.stringify(v) + ')' });
  if (q.budget_pct != null) {
    if (!Number.isInteger(q.budget_pct) || q.budget_pct < 1 || q.budget_pct > 90) throw bad('budget_pct', 'an integer 1-90', q.budget_pct);
    out.budget_pct = q.budget_pct;
  }
  if (q.timeout_s != null) {
    if (!Number.isInteger(q.timeout_s) || q.timeout_s < 1) throw bad('timeout_s', 'an integer >= 1', q.timeout_s);
    out.timeout_s = q.timeout_s;
  }
  if (q.swap_used_max_mb != null) {
    if (!Number.isInteger(q.swap_used_max_mb) || q.swap_used_max_mb < 1) throw bad('swap_used_max_mb', 'an integer >= 1 or null', q.swap_used_max_mb);
    out.swap_used_max_mb = q.swap_used_max_mb;
  }
  return out;
}

export function gateQueueBudgetMb(budgetPct, totalMb) {
  return Math.floor((budgetPct / 100) * totalMb);
}

// == entries ==

function gateQueueReadEntry(file, name) {
  let v;
  try { v = readJsonRegular(file, gateQueueEntryCap); } catch (e) {
    if (e.code === 'ENOENT') return { gone: true };
    return { corrupt: true };
  }
  if (v === null) return { gone: true };
  const m = gateQueueNameRe.exec(name);
  if (!v || typeof v !== 'object' || !Number.isInteger(v.seq) || !Number.isInteger(v.pid) || !m || Number(m[1]) !== v.seq || Number(m[2]) !== v.pid) return { corrupt: true };
  if (v.peak_mb != null && !(Number.isInteger(v.peak_mb) && v.peak_mb >= 1)) return { corrupt: true };
  return { entry: v };
}

function gateQueueListNames(dir) {
  try { return fs.readdirSync(dir).filter((n) => gateQueueNameRe.test(n)).sort(); } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function gateQueueQuarantine(root, kind, name, err) {
  const from = path.join(root, kind, name);
  const dir = path.join(root, 'corrupt');
  fs.mkdirSync(dir, { recursive: true });
  let to = path.join(dir, name);
  if (fs.existsSync(to)) to = path.join(dir, name + '.' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'));
  try { fs.renameSync(from, to); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  err('[gate-queue] corrupt ' + (kind === 'holders' ? 'holder' : 'ticket') + ' file ' + name + ' quarantined');
}

// Read both directories, quarantine damaged entries, reclaim dead ones (never kills anything).
// mine = the caller's own file name (never judged, never reclaimed).
export function gateQueueScan(root, err, mine) {
  const raw = { tickets: [], holders: [] };
  for (const kind of ['tickets', 'holders']) {
    for (const name of gateQueueListNames(path.join(root, kind))) {
      const r = gateQueueReadEntry(path.join(root, kind, name), name);
      if (r.gone) continue;
      if (r.corrupt) { gateQueueQuarantine(root, kind, name, err); continue; }
      raw[kind].push({ ...r.entry, kind, name, file: path.join(root, kind, name) });
    }
  }
  const others = [...raw.tickets, ...raw.holders].filter((e) => !(mine && e.name === mine));
  const starts = gateProcStartMany(others.filter((e) => e.pid_start).map((e) => e.pid));
  const out = { tickets: [], holders: [] };
  for (const kind of ['tickets', 'holders']) {
    for (const e of raw[kind]) {
      if (mine && e.name === mine) { out[kind].push(e); continue; }
      const state = gateProcState(e.pid, e.pid_start, starts);
      if (state === 'dead' || state === 'start time differs') {
        try {
          fs.unlinkSync(e.file);
          err('[gate-queue] reclaimed seq=' + e.seq + ' pid ' + e.pid + ' (' + state + ')');
          if (kind === 'holders' && Number.isInteger(e.pgid) && e.pgid > 1) gateQueueReportOrphans(e.pgid, err);
        } catch (x) { if (x.code !== 'ENOENT') throw x; }
        continue;
      }
      out[kind].push(e);
    }
    out[kind].sort((a, b) => a.seq - b.seq);
  }
  return out;
}

function gateQueuePeakOf(e, budgetMb) {
  return e.peak_mb == null ? budgetMb : e.peak_mb;
}

function gateQueueWho(e) {
  return (e.label || '?') + ' (' + path.basename(e.cwd || '?') + ', pid ' + e.pid + ')';
}

// == lock (PRD-4 D2) ==

function gateQueueLockOwnerState(root, err) {
  const lockDir = path.join(root, '.lock');
  let st;
  try { st = fs.statSync(lockDir); } catch { return null; }
  let owner;
  try { owner = readJsonRegular(path.join(lockDir, 'owner.json'), gateQueueEntryCap); } catch { owner = undefined; }
  const age = Date.now() - st.mtimeMs;
  let dead;
  if (!owner || !Number.isInteger(owner.pid)) dead = age > 10000;
  else {
    // a fresh lock is judged on kill 0 alone; a lock held over 30 s also has its start time checked (PID reuse)
    const s = gateProcState(owner.pid, age > 30000 ? owner.pid_start : null);
    dead = s === 'dead' || s === 'start time differs';
  }
  return { dead, owner, key: JSON.stringify(owner === undefined ? null : owner) };
}

function gateQueueLockSteal(root, seen, err) {
  const mutex = path.join(root, '.lock.steal');
  try { fs.mkdirSync(mutex); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - fs.statSync(mutex).mtimeMs > 10000) fs.rmdirSync(mutex); } catch { /* raced */ }
    return;
  }
  try {
    const again = gateQueueLockOwnerState(root, err);
    if (!again || !again.dead || again.key !== seen.key) return;
    const stale = path.join(root, '.lock.stale-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
    try { fs.renameSync(path.join(root, '.lock'), stale); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    fs.rmSync(stale, { recursive: true, force: true });
    err('[gate-queue] stale queue lock (owner ' + (seen.owner && Number.isInteger(seen.owner.pid) ? seen.owner.pid : 'unknown') + ' dead) reclaimed');
  } finally {
    try { fs.rmdirSync(mutex); } catch { /* gone */ }
  }
}

async function gateQueueLock(root, run) {
  fs.mkdirSync(root, { recursive: true });
  const me = { pid: process.pid, pid_start: run.selfStart, at: new Date().toISOString(), nonce: crypto.randomBytes(8).toString('hex') };
  const tmpDir = path.join(root, '.lock.tmp-' + process.pid + '-' + me.nonce);
  atomicWriteJson(path.join(tmpDir, 'owner.json'), me);
  try {
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmpDir, path.join(root, '.lock'));
        return me;
      } catch (e) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      }
      const seen = gateQueueLockOwnerState(root, run.err);
      if (seen && seen.dead) gateQueueLockSteal(root, seen, run.err);
      if (run.aborted) return null;
      await run.sleep(5 + Math.floor(Math.random() * 25), true);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function gateQueueUnlock(root, me) {
  if (!me) return;
  const lockDir = path.join(root, '.lock');
  let owner = null;
  try { owner = readJsonRegular(path.join(lockDir, 'owner.json'), gateQueueEntryCap); } catch { owner = null; }
  if (!owner || owner.pid !== me.pid || owner.nonce !== me.nonce) return;
  // rename first: `.lock` is freed in one step and a contender never sees a half-removed lock
  const gone = path.join(root, '.lock.rel-' + process.pid + '-' + me.nonce);
  try { fs.renameSync(lockDir, gone); } catch { return; }
  fs.rmSync(gone, { recursive: true, force: true });
}

async function gateQueueWithLock(root, run, fn) {
  const me = await gateQueueLock(root, run);
  if (!me) return { aborted: true };
  try { return { value: fn() }; } finally { gateQueueUnlock(root, me); }
}

// == seq (monotonic; recomputed from the highest seq on disk when unreadable) ==

function gateQueueDiskMaxSeq(root) {
  let max = 0;
  for (const kind of ['tickets', 'holders', 'corrupt']) {
    let names = [];
    try { names = fs.readdirSync(path.join(root, kind)); } catch { names = []; }
    for (const n of names) { const m = /^(\d{10})-/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
  }
  return max;
}

// Lock scratch dirs left by a process killed mid-acquire or mid-release (.lock.tmp-, .lock.stale-, .lock.rel-
// with a dead pid). Runs under the lock; a live pid's dir is in use and kept.
function gateQueueSweepLockScratch(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch { return; }
  for (const n of names) {
    const m = /^\.lock\.(?:tmp|stale|rel)-(\d+)-/.exec(n);
    if (!m) continue;
    if (gateProcState(Number(m[1]), null) === 'dead') fs.rmSync(path.join(root, n), { recursive: true, force: true });
  }
}

function gateQueueNextSeq(root) {
  gateQueueSweepLockScratch(root);
  const file = path.join(root, 'seq');
  let cur = null;
  try { cur = readJsonRegular(file, 4096); } catch { cur = null; }
  const base = Math.max(Number.isInteger(cur) && cur >= 0 ? cur : 0, gateQueueDiskMaxSeq(root));
  const next = base + 1;
  atomicWriteJson(file, next);
  return next;
}

// == waiting runtime: abortable sleep and signal handling ==

const gateQueueSignalNo = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

function gateQueueRuntime(ctx) {
  const run = {
    err: gateQueueErrWriter(ctx),
    aborted: null,
    wake: null,
    selfStart: gateProcStart(process.pid),
    handlers: [],
    // resolves true when a signal aborted the sleep. lockSpin sleeps are not woken early (tiny).
    sleep(ms, lockSpin) {
      if (run.aborted && !lockSpin) return Promise.resolve(true);
      return new Promise((resolve) => {
        const t = setTimeout(() => { run.wake = null; resolve(!!run.aborted); }, Math.max(0, ms));
        if (!lockSpin) run.wake = () => { clearTimeout(t); run.wake = null; resolve(true); };
      });
    },
    onSignal: null,
    trap() {
      for (const sig of Object.keys(gateQueueSignalNo)) {
        const h = () => {
          if (run.onSignal) { run.onSignal(sig); return; }
          if (!run.aborted) run.aborted = sig;
          if (run.wake) run.wake();
        };
        process.on(sig, h);
        run.handlers.push([sig, h]);
      }
    },
    untrap() {
      for (const [sig, h] of run.handlers) process.removeListener(sig, h);
      run.handlers = [];
    },
  };
  return run;
}

// == admission (Q1-05, Q1-06; PRD-4 D11–D13) ==

function gateQueueDefaultLabel(ctx, argv) {
  const repo = ctx.git && ctx.git.top ? ctx.git.top : ctx.cwd;
  const first = argv && argv.length ? path.basename(String(argv[0])) : 'gate';
  return path.basename(repo) + ':' + first;
}

function gateQueueIntOpt(v, flag) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : NaN);
  if (!Number.isInteger(n) || n < 1) throw fail('USAGE', 1, { message: flag + ' must be an integer >= 1 (got ' + JSON.stringify(v) + ')' });
  return n;
}

// Prints, once per invocation, CONTRACT §6's budget-only line, or one `signal unavailable: {name}` per
// missing signal (PRD-4 D6).
export function gateQueueSignalReporter(err) {
  const warned = new Set();
  let budgetOnlySaid = false;
  return (sig) => {
    if (gateSignalsBudgetOnly(sig)) {
      if (!budgetOnlySaid) err('[gate-queue] memory signals unavailable: budget-only admission');
      budgetOnlySaid = true;
      return;
    }
    for (const n of sig.unavailable || []) {
      if (!warned.has(n)) { warned.add(n); err('[gate-queue] signal unavailable: ' + n); }
    }
  };
}

// Blocks (asynchronously) until ADMITTED, WAIT_TIMEOUT, REJECTED or a signal. One process, one ticket,
// a 2 s poll; non-head waiters read no memory signals (PRD-4 D15).
async function gateQueueAdmitCore(ctx, opts, run) {
  const root = gateQueueRoot(ctx);
  const err = run.err;
  const settings = gateQueueSettings(ctx);
  const peak = opts.peakMb == null ? null : gateQueueIntOpt(opts.peakMb, '--peak-mb');
  const timeoutS = opts.timeoutS == null ? settings.timeout_s : gateQueueIntOpt(opts.timeoutS, '--timeout-s');
  const label = opts.label || gateQueueDefaultLabel(ctx, opts.argv);
  const sigOpts = { env: ctx.env, platform: opts.platform, linuxRoot: opts.linuxRoot, sleep: (ms) => run.sleep(ms) };
  const sigState = {};
  const say = gateQueueSignalReporter(err);
  const sig0 = gateSignalsRead(sigOpts, sigState);
  say(sig0);
  const budget = gateQueueBudgetMb(settings.budget_pct, sig0.total_mb);
  if (peak != null && peak > budget) {
    err('[REJECTED] gate-queue: peak ' + peak + ' MB above budget ' + budget + ' MB · not started');
    return { outcome: 'GATE_QUEUE_REJECTED', exit: 1, peak_mb: peak, budget_mb: budget };
  }
  if (peak == null) err('[gate-queue] peak undeclared: exclusive');
  const t0 = Date.now();
  const deadline = t0 + timeoutS * 1000;
  const entry = {
    seq: null, pid: process.pid, pid_start: run.selfStart, pgid: null, cwd: ctx.cwd,
    repo: ctx.git && ctx.git.top ? ctx.git.top : null, label, peak_mb: peak,
    enqueued_at: new Date(t0).toISOString(), admitted_at: null, reason: null, checked_at: null,
  };
  const ticketFile = () => path.join(root, 'tickets', gateQueueName(entry.seq, entry.pid));
  const enq = await gateQueueWithLock(root, run, () => {
    entry.seq = gateQueueNextSeq(root);
    atomicWriteJson(ticketFile(), entry);
    return entry.seq;
  });
  if (enq.aborted) return gateQueueInterrupted(run, null);
  const mine = gateQueueName(entry.seq, entry.pid);
  const removeTicket = () => { try { fs.unlinkSync(ticketFile()); } catch (e) { if (e.code !== 'ENOENT') throw e; } };
  {
    const v = gateQueueScan(root, err, mine);
    const n = v.holders.length + v.tickets.length;
    const p = v.holders.length + v.tickets.findIndex((e) => e.name === mine) + 1;
    err('[gate-queue] enqueued seq=' + entry.seq + ' position ' + p + '/' + n + ' peak=' + (peak == null ? 'exclusive' : peak + ' MB') + ' label=' + label);
  }
  let lastLine = null;
  let lastAt = 0;
  let lastWaitFor = 'turn';
  let lastPos = '1/1';
  for (;;) {
    if (run.aborted) { removeTicket(); return gateQueueInterrupted(run, entry.seq); }
    const v = gateQueueScan(root, err, mine);
    if (!v.tickets.some((e) => e.name === mine)) {
      // quarantined or removed under us: re-write it with the same seq (keeps the FIFO place)
      atomicWriteJson(ticketFile(), entry);
      err('[gate-queue] ticket file missing: re-written seq=' + entry.seq);
      v.tickets.push({ ...entry, name: mine });
      v.tickets.sort((a, b) => a.seq - b.seq);
    }
    const idx = v.tickets.findIndex((e) => e.name === mine);
    const n = v.holders.length + v.tickets.length;
    const pos = (v.holders.length + idx + 1) + '/' + n;
    const held = v.holders.reduce((s, e) => s + gateQueuePeakOf(e, budget), 0);
    let reason;
    let waitFor;
    let ahead = 'none';
    if (idx > 0) {
      reason = 'turn';
      waitFor = 'turn';
      ahead = gateQueueWho(v.tickets[idx - 1]);
    } else {
      const q = { peakMb: peak, budgetMb: budget, swapUsedMaxMb: settings.swap_used_max_mb };
      const sig = await gateQueueHeadSignals(sigOpts, sigState, say, { ...q, heldMb: held }, deadline);
      if (run.aborted) continue;
      let dec = gateSignalsDecide(sig, { ...q, heldMb: held });
      if (dec.admit && sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0) {
        // the 5 s swap-out window is not complete yet (deadline too close to wait it out): not admitted on a guess
        dec = { admit: false, reason: 'swap-out to stop (measuring)', wait_for: 'swap-out to stop' };
      }
      if (dec.admit) {
        const res = await gateQueueWithLock(root, run, () => gateQueueTryAdmit(root, entry, mine, budget, q, sig));
        if (res.aborted) continue;
        if (res.value.admitted) {
          const w = Math.round((Date.now() - t0) / 1000);
          err('[gate-queue] admitted seq=' + entry.seq + ' after ' + w + ' s · peak ' + (peak == null ? 'exclusive' : peak + ' MB') +
            ' · held ' + res.value.held + '/' + budget + ' MB · signals ' + sig.source);
          return { outcome: 'GATE_QUEUE_ADMITTED', exit: 0, seq: entry.seq, name: mine, root, peak_mb: peak, budget_mb: budget, held_mb: res.value.held, label, waited_s: w, entry: res.value.entry };
        }
        dec = res.value.dec;
      }
      reason = dec.reason;
      waitFor = dec.wait_for;
      const blockers = v.holders.slice().sort((a, b) => gateQueuePeakOf(b, budget) - gateQueuePeakOf(a, budget));
      if (blockers.length) ahead = gateQueueWho(blockers[0]);
    }
    lastWaitFor = waitFor;
    lastPos = pos;
    const line = '[gate-queue] position ' + pos + ' · waiting for ' + reason + ' · ahead: ' + ahead;
    const now = Date.now();
    if (line !== lastLine || now - lastAt >= gateQueueReprintMs) {
      err(line);
      if (line !== lastLine) {
        entry.reason = reason;
        entry.checked_at = new Date(now).toISOString();
        atomicWriteJson(ticketFile(), entry);
      }
      lastLine = line;
      lastAt = now;
    }
    if (Date.now() >= deadline) {
      removeTicket();
      const w = Math.round((Date.now() - t0) / 1000);
      err('[WAIT-TIMEOUT] gate-queue: waited ' + w + ' s at position ' + lastPos + ' for ' + lastWaitFor + ' · not started · retryable');
      return { outcome: 'GATE_WAIT_TIMEOUT', exit: 3, seq: entry.seq, waited_s: w, waiting_for: lastWaitFor };
    }
    await run.sleep(Math.min(gateQueuePollMs, Math.max(0, deadline - Date.now())));
  }
}

// The head's signal read. The swap-out rate needs two reads >= 5 s apart; the extra wait is paid only when
// every other condition would admit (a waiter blocked on pressure or budget never sleeps for it), and never
// past the deadline.
async function gateQueueHeadSignals(sigOpts, sigState, say, q, deadline) {
  let sig = gateSignalsRead(sigOpts, sigState);
  if (sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0 && gateSignalsDecide(sig, q).admit &&
      Date.now() + sig.swapout_pending_ms < deadline) {
    sig = await gateSignalsReadSettled(sigOpts, sigState);
  }
  say(sig);
  return sig;
}

// Under the lock: still the head, still fits; then the ticket becomes a holder by rename.
function gateQueueTryAdmit(root, entry, mine, budget, q, sig) {
  const lower = gateQueueListNames(path.join(root, 'tickets')).filter((n) => n < mine);
  if (lower.length) return { admitted: false, dec: { reason: 'turn', wait_for: 'turn' } };
  let held = 0;
  for (const name of gateQueueListNames(path.join(root, 'holders'))) {
    const r = gateQueueReadEntry(path.join(root, 'holders', name), name);
    if (r.entry) held += gateQueuePeakOf(r.entry, budget);
  }
  const dec = gateSignalsDecide(sig, { ...q, heldMb: held });
  if (!dec.admit) return { admitted: false, dec };
  const now = new Date().toISOString();
  const holder = { ...entry, admitted_at: now, reason: null, checked_at: now };
  const tf = path.join(root, 'tickets', mine);
  atomicWriteJson(tf, holder);
  fs.mkdirSync(path.join(root, 'holders'), { recursive: true });
  fs.renameSync(tf, path.join(root, 'holders', mine));
  return { admitted: true, held: held + gateQueuePeakOf(entry, budget), entry: holder };
}

function gateQueueInterrupted(run, seq) {
  const sig = run.aborted || 'SIGTERM';
  return { outcome: 'GATE_INTERRUPTED', exit: 128 + gateQueueSignalNo[sig], signal: sig, seq, started: false };
}

// Release = remove the caller's own holder file. Never kills; never needs the lock (it only lowers held).
export function gateQueueRelease(ctx, admitted, exitCode, cleaned) {
  const err = gateQueueErrWriter(ctx);
  try { fs.unlinkSync(path.join(admitted.root, 'holders', admitted.name)); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    err('[gate-queue] holder file missing at release');
  }
  err('[gate-queue] released seq=' + admitted.seq + ' exit=' + exitCode + ' cleaned=' + (cleaned || 0));
}

// In-process admission for `gate run` (CONTRACT §11 A8). Resolves to the CLI's result object; on ADMITTED it
// carries release(exitCode). Signals while waiting remove the ticket (GATE_INTERRUPTED, never started).
export async function gateQueueAdmit(ctx, opts) {
  const run = gateQueueRuntime(ctx);
  run.trap();
  let res;
  const o = opts || {};
  try { res = await gateQueueAdmitCore(ctx, { ...o, peakMb: gateQueueResolvePeak(ctx, o.peakMb) }, run); } finally { run.untrap(); }
  if (res.outcome === 'GATE_QUEUE_ADMITTED') {
    let done = false;
    res.release = (exitCode, cleaned) => {
      if (done) return;
      done = true;
      gateQueueRelease(ctx, res, exitCode == null ? 0 : exitCode, cleaned);
    };
  }
  return res;
}

// The live holder named by DO_IT_GATE_HOLDER that is an ancestor of this process, or null (forged, stale,
// or not above us). Used by nested admission and `gate run` (CONTRACT §11 A8).
export function gateQueueHeldBySelf(ctx) {
  const v = ctx && ctx.env ? ctx.env.DO_IT_GATE_HOLDER : null;
  const m = /^(\d+)-(\d+)$/.exec(v || '');
  if (!m) return null;
  const seq = Number(m[1]);
  const pid = Number(m[2]);
  const name = gateQueueName(seq, pid);
  const r = gateQueueReadEntry(path.join(gateQueueRoot(ctx), 'holders', name), name);
  if (!r.entry) return null;
  const st = gateProcState(pid, r.entry.pid_start);
  if (st !== 'alive' && st !== 'alive-unverified') return null;
  let p = process.pid;
  for (let i = 0; i < 64 && p && p > 1; i++) {
    if (p === pid) return r.entry;
    p = gateProcParent(p);
  }
  return null;
}


// == Q2: the run half (PRD-4 D16–D20). The command runs in its own process group; everything it starts is
// tracked by (pid, start time) from process-table snapshots and ended by PID on pass, fail or signal (G-11).
// No name, argv or pattern match anywhere: membership is ppid links from the root plus the root's pgid.

export const gateQueueGraceMs = 10000;
const gateQueuePsRe = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*\S)\s*$/;

function gateQueuePsCall() {
  // pid, ppid, pgid, state (zombies are already dead), start time (lstart last: it holds spaces)
  if (process.platform === 'linux') return [fs.existsSync('/bin/ps') ? '/bin/ps' : 'ps', ['-eo', 'pid=,ppid=,pgid=,stat=,lstart=']];
  return ['/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart=']];
}

function gateQueuePsOpts() {
  return { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 10000, env: { ...process.env, LC_ALL: 'C' } };
}

// Map pid -> {pid, ppid, pgid, zombie, start}.
export function gateQueuePsParse(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = gateQueuePsRe.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    out.set(pid, { pid, ppid: Number(m[2]), pgid: Number(m[3]), zombie: m[4].startsWith('Z'), start: m[5] });
  }
  return out;
}

// One snapshot, or null when `ps` could not run (the group kill still works without it).
export function gateQueuePsSnapshot() {
  const [bin, args] = gateQueuePsCall();
  return new Promise((resolve) => {
    cp.execFile(bin, args, gateQueuePsOpts(), (e, stdout) => {
      const snap = gateQueuePsParse(stdout);
      resolve(snap.size ? snap : null);
    });
  });
}

export function gateQueuePsSnapshotSync() {
  const [bin, args] = gateQueuePsCall();
  let text = '';
  try { text = cp.execFileSync(bin, args, { ...gateQueuePsOpts(), stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {
    text = e && typeof e.stdout === 'string' ? e.stdout : '';
  }
  const snap = gateQueuePsParse(text);
  return snap.size ? snap : null;
}

function gateQueueTrackKey(p) {
  return p.pid + '@' + p.start;
}

// Tracker for one command: root pid = its pgid (spawned detached). entries: key -> {pid, start}.
export function gateQueueTrackNew(rootPid) {
  return { root: rootPid, pgid: rootPid, entries: new Map(), groupSeen: false, groupGone: false };
}

// Q2-02: fold one snapshot into the tracked set. Adds every member of the root's group (while the group is
// ours) and everything reachable by ppid from a tracked process that is still the same process. Returns the
// number of new entries. Accumulating keeps processes that were re-parented to PID 1 after their parent died.
export function gateQueueTrack(tr, snap) {
  if (!snap) return 0;
  let added = 0;
  const add = (p) => {
    if (p.pid <= 1 || p.pid === process.pid) return;
    const k = gateQueueTrackKey(p);
    if (tr.entries.has(k)) return;
    tr.entries.set(k, { pid: p.pid, start: p.start });
    added++;
  };
  if (!tr.groupGone) {
    const members = [];
    for (const p of snap.values()) if (p.pgid === tr.pgid) members.push(p);
    // A group id is a pid we spawned and cannot be reused while the group lives; once the group has been seen
    // and then holds no tracked member, it is gone and a later group with the same id is not ours.
    const ours = tr.groupSeen ? members.some((p) => tr.entries.has(gateQueueTrackKey(p))) : members.length > 0;
    if (ours) { tr.groupSeen = true; for (const p of members) add(p); } else if (tr.groupSeen) tr.groupGone = true;
  }
  const kids = new Map();
  for (const p of snap.values()) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const stack = [];
  for (const e of tr.entries.values()) {
    const p = snap.get(e.pid);
    if (p && p.start === e.start) stack.push(e.pid);
  }
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    for (const c of kids.get(pid) || []) { add(c); stack.push(c.pid); }
  }
  return added;
}

// Tracked entries that are still the same live (non-zombie) process in snap.
export function gateQueueTrackLive(tr, snap, includeZombies) {
  const out = [];
  if (!snap) return out;
  for (const e of tr.entries.values()) {
    const p = snap.get(e.pid);
    if (p && p.start === e.start && (includeZombies || !p.zombie)) out.push({ ...e, pgid: p.pgid });
  }
  return out;
}

function gateQueueDelay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Q2-04 (PRD-4 D17): `sig` to the group and to every tracked live process outside it, a 10 s grace, SIGKILL
// for survivors, re-snapshot to confirm. Returns cleaned = tracked processes alive at the start and ended by it.
// rootUnreaped(): true while the root has not been reaped, so its pid (= the group id) cannot be reused yet.
async function gateQueueCleanup(ctx, tr, sig, err, rootUnreaped) {
  let snap = await gateQueuePsSnapshot();
  gateQueueTrack(tr, snap);
  const atStart = gateQueueTrackLive(tr, snap);
  if (ctx.env && ctx.env.DO_IT_FAULT === 'queue_skip_cleanup') {
    err('[gate-queue] fault queue_skip_cleanup: kill step skipped');
    return 0;
  }
  const signalled = new Set();
  const send = (s, list) => {
    // the group id is signalled only while it provably names our group: a tracked member is in it now, or the
    // root is unreaped. An empty group's id may already belong to an unrelated new group (G-11: by PID only).
    if (rootUnreaped() || list.some((e) => e.pgid === tr.pgid)) {
      try { process.kill(-tr.pgid, s); } catch { /* group gone */ }
    }
    for (const e of list) {
      if (s === sig && signalled.has(gateQueueTrackKey(e))) continue;
      signalled.add(gateQueueTrackKey(e));
      if (e.pgid === tr.pgid) continue;
      try { process.kill(e.pid, s); } catch { /* gone */ }
    }
  };
  send(sig, atStart);
  let live = atStart;
  const graceEnd = Date.now() + gateQueueGraceMs;
  while (live.length && Date.now() < graceEnd) {
    await gateQueueDelay(200);
    snap = await gateQueuePsSnapshot();
    if (!snap) continue;
    gateQueueTrack(tr, snap);
    live = gateQueueTrackLive(tr, snap);
    // a process born during cleanup gets the same signal
    const fresh = live.filter((e) => !signalled.has(gateQueueTrackKey(e)));
    if (fresh.length) send(sig, fresh);
  }
  if (live.length) {
    err('[gate-queue] cleanup: SIGKILL ' + live.length + ' after ' + Math.round(gateQueueGraceMs / 1000) + ' s grace');
    send('SIGKILL', live);
    const killEnd = Date.now() + 3000;
    while (live.length && Date.now() < killEnd) {
      await gateQueueDelay(100);
      snap = await gateQueuePsSnapshot();
      if (!snap) continue;
      gateQueueTrack(tr, snap);
      live = gateQueueTrackLive(tr, snap);
      if (live.length) send('SIGKILL', live);
    }
    for (const e of live) err('[gate-queue] cleanup incomplete: pid ' + e.pid + ' still alive');
  }
  // dead children of dead parents linger as zombies for a moment; wait (bounded) until they are reaped
  const reapEnd = Date.now() + 2000;
  while (snap && gateQueueTrackLive(tr, snap, true).length > live.length && Date.now() < reapEnd) {
    await gateQueueDelay(50);
    snap = (await gateQueuePsSnapshot()) || snap;
  }
  const still = new Set(gateQueueTrackLive(tr, snap).map(gateQueueTrackKey));
  return atStart.filter((e) => !still.has(gateQueueTrackKey(e))).length;
}

// Q2-01/02/03: run argv in its own process group, track, forward signals, clean up. Resolves
// { exit, command_exit, signal, start_error, cleaned }. The exit follows PRD-4 D18.
async function gateQueueExec(ctx, argv, run, opts) {
  const err = run.err;
  let signalled = null;
  let wakeSig = null;
  const sigP = new Promise((resolve) => { wakeSig = resolve; });
  run.onSignal = (sig) => { if (!signalled) { signalled = sig; wakeSig(sig); } };
  if (run.aborted) run.onSignal(run.aborted);
  const startFailed = (e) => {
    run.onSignal = null;
    const code = (e && e.code) || 'error';
    err('[gate-queue] command failed to start: ' + code);
    return { exit: 127, start_error: code, cleaned: 0 };
  };
  let child;
  try {
    child = cp.spawn(argv[0], argv.slice(1), {
      cwd: ctx.cwd, stdio: 'inherit', detached: true,
      env: { ...ctx.env, DO_IT_GATE_HOLDER: opts.holderEnv },
    });
  } catch (e) {
    return startFailed(e);
  }
  const spawnErr = await new Promise((resolve) => {
    child.once('spawn', () => resolve(null));
    child.once('error', (e) => resolve(e));
  });
  child.on('error', () => { /* a kill on a reaped child; cleanup works by pid */ });
  if (spawnErr || !child.pid) return startFailed(spawnErr);
  const tr = gateQueueTrackNew(child.pid);
  if (opts.onStart) opts.onStart(child.pid);
  let rootExit = null;
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => { rootExit = { code, signal }; resolve(rootExit); }));
  gateQueueTrack(tr, await gateQueuePsSnapshot());
  // early snapshots catch a tree that forks fast; then one snapshot per poll (D17)
  const early = [250, 750, 1000];
  for (let i = 0; !rootExit && !signalled; i++) {
    let timer = null;
    await Promise.race([exited, sigP, new Promise((r) => { timer = setTimeout(r, i < early.length ? early[i] : gateQueuePollMs); })]);
    clearTimeout(timer);
    if (rootExit || signalled) break;
    gateQueueTrack(tr, await gateQueuePsSnapshot());
  }
  // a signal during cleanup changes nothing: cleanup is already ending every tracked process
  run.onSignal = () => {};
  const cleaned = await gateQueueCleanup(ctx, tr, signalled || 'SIGTERM', err, () => !rootExit);
  const skipped = ctx.env && ctx.env.DO_IT_FAULT === 'queue_skip_cleanup';
  const r = rootExit || (skipped ? null : await exited);
  run.onSignal = null;
  const cmdExit = !r ? null : (r.code != null ? r.code : 128 + (os.constants.signals[r.signal] || 0));
  if (signalled) return { exit: 128 + gateQueueSignalNo[signalled], command_exit: cmdExit, signal: signalled, cleaned };
  return { exit: cmdExit == null ? 1 : cmdExit, command_exit: cmdExit, cleaned };
}

// Q2-05: a reclaimed holder whose group still has members is reported, never killed (they are not ours now).
function gateQueueReportOrphans(pgid, err) {
  const snap = gateQueuePsSnapshotSync();
  if (!snap) return;
  let n = 0;
  for (const p of snap.values()) if (p.pgid === pgid && !p.zombie) n++;
  if (n) err('[gate-queue] orphan process group ' + pgid + ' still has ' + n + ' processes (not killed: not ours)');
}

// Q2-07 (PRD-4 D10): the project's gates.peak_mb from the workspace settings file, used when --peak-mb is absent.
export function gateQueueWorkspacePeak(ctx) {
  if (!ctx || !ctx.home) return null;
  const file = settingsPaths(ctx).workspace;
  let doc = null;
  try { doc = readJsonRegular(file, gateQueueEntryCap * 16); } catch (e) {
    throw fail('QUEUE_SETTINGS_INVALID', 1, { file, message: 'workspace settings unreadable: ' + (e.code || 'error') });
  }
  const v = doc && doc.gates ? doc.gates.peak_mb : null;
  if (v == null) return null;
  if (!Number.isInteger(v) || v < 1) {
    throw fail('QUEUE_SETTINGS_INVALID', 1, { file, key: 'gates.peak_mb', message: 'gates.peak_mb must be an integer >= 1 or null (got ' + JSON.stringify(v) + ')' });
  }
  return v;
}

function gateQueueResolvePeak(ctx, peakMb) {
  return peakMb == null ? gateQueueWorkspacePeak(ctx) : peakMb;
}

// One run: nested pass-through, or admission, run, cleanup, then release (release only after cleanup, D17).
async function gateQueueRunCore(ctx, o, run) {
  const argv = o.argv;
  const held = gateQueueHeldBySelf(ctx);
  if (held) {
    run.err('[gate-queue] nested under holder seq=' + held.seq + ': no second admission · admission: inherited');
    const r = await gateQueueExec(ctx, argv, run, { holderEnv: ctx.env.DO_IT_GATE_HOLDER });
    if (r.start_error) return { outcome: 'GATE_QUEUE_START_FAILED', exit: 127, seq: held.seq, nested: true, error: r.start_error };
    if (r.signal) return { outcome: 'GATE_INTERRUPTED', exit: r.exit, seq: held.seq, nested: true, signal: r.signal, command_exit: r.command_exit };
    return { outcome: 'GATE_QUEUE_RAN', exit: r.exit, seq: held.seq, nested: true, admission: 'inherited', cleaned: r.cleaned };
  }
  const admitted = await gateQueueAdmitCore(ctx, {
    peakMb: gateQueueResolvePeak(ctx, o.peakMb), timeoutS: o.timeoutS, label: o.label, argv,
    platform: o.platform, linuxRoot: o.linuxRoot,
  }, run);
  if (admitted.outcome !== 'GATE_QUEUE_ADMITTED') return admitted;
  if (run.aborted) {
    // a signal landed between admission and spawn: never start
    gateQueueRelease(ctx, admitted, 128 + gateQueueSignalNo[run.aborted], 0);
    return gateQueueInterrupted(run, admitted.seq);
  }
  const holderFile = path.join(admitted.root, 'holders', admitted.name);
  const r = await gateQueueExec(ctx, argv, run, {
    holderEnv: admitted.seq + '-' + process.pid,
    // the holder file names the group; cleanup itself trusts only the in-memory pgid (T-Q2-14)
    onStart: (pgid) => { try { atomicWriteJson(holderFile, { ...admitted.entry, pgid }); } catch { /* reported at release */ } },
  });
  gateQueueRelease(ctx, admitted, r.exit, r.cleaned);
  if (r.start_error) return { outcome: 'GATE_QUEUE_START_FAILED', exit: 127, seq: admitted.seq, error: r.start_error };
  if (r.signal) return { outcome: 'GATE_INTERRUPTED', exit: r.exit, seq: admitted.seq, signal: r.signal, command_exit: r.command_exit, cleaned: r.cleaned };
  return { outcome: 'GATE_QUEUE_RAN', exit: r.exit, seq: admitted.seq, label: admitted.label, cleaned: r.cleaned };
}

// Q2-07 (PRD-4 D20): the one in-process entry point for train, nightly and manual runs. Resolves to the exit code.
export async function gateQueueRun(ctx, opts) {
  const o = opts || {};
  if (!Array.isArray(o.argv) || !o.argv.length) throw fail('USAGE', 1, { message: 'gateQueueRun needs a non-empty argv' });
  const run = gateQueueRuntime(ctx);
  run.trap();
  try {
    const r = await gateQueueRunCore(ctx, { argv: o.argv, peakMb: o.peakMb, label: o.label, timeoutS: o.timeoutS }, run);
    return r.exit;
  } finally {
    run.untrap();
  }
}

// == --status (Q2-06, PRD-4 D20): a read-only snapshot; never writes, renames, removes or quarantines ==

function gateQueueAge(iso, now) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null;
}

export function gateQueueStatus(ctx, opts) {
  const o = opts || {};
  const root = gateQueueRoot(ctx);
  const settings = gateQueueSettings(ctx);
  const sig = gateSignalsRead({ env: ctx.env, platform: o.platform, linuxRoot: o.linuxRoot }, {});
  const budget = gateQueueBudgetMb(settings.budget_pct, sig.total_mb);
  const read = (kind) => gateQueueListNames(path.join(root, kind))
    .map((name) => ({ name, ...gateQueueReadEntry(path.join(root, kind, name), name) }))
    .filter((r) => !r.gone);
  const hs = read('holders');
  const ts = read('tickets');
  const starts = gateProcStartMany([...hs, ...ts].filter((r) => r.entry).map((r) => r.entry.pid));
  const now = Date.now();
  const view = (r) => {
    if (r.corrupt) return { name: r.name, corrupt: true, alive: false, state: 'corrupt (quarantine pending)' };
    const e = r.entry;
    const state = gateProcState(e.pid, e.pid_start, starts);
    return {
      seq: e.seq, pid: e.pid, pgid: e.pgid == null ? null : e.pgid, peak_mb: e.peak_mb == null ? null : e.peak_mb,
      label: e.label || null, cwd: e.cwd || null, repo: e.repo || null,
      enqueued_at: e.enqueued_at || null, admitted_at: e.admitted_at || null,
      age_s: gateQueueAge(e.admitted_at || e.enqueued_at, now), reason: e.reason || null, checked_at: e.checked_at || null,
      alive: state === 'alive' || state === 'alive-unverified', state,
    };
  };
  const holders = hs.map(view);
  const waiting = ts.map(view);
  const live = holders.filter((h) => h.alive);
  const held = live.reduce((s, h) => s + (h.peak_mb == null ? budget : h.peak_mb), 0);
  const signals = {
    source: sig.source, pressure: sig.pressure == null ? null : sig.pressure, avail_mb: sig.avail_mb == null ? null : sig.avail_mb,
    total_mb: sig.total_mb, swap_used_mb: sig.swap_used_mb == null ? null : sig.swap_used_mb,
    swapout_mb_per_s: sig.swapout_mb_per_s == null ? null : sig.swapout_mb_per_s, unavailable: sig.unavailable || [],
  };
  const res = { outcome: 'GATE_QUEUE_STATUS', exit: 0, budget_mb: budget, budget_pct: settings.budget_pct, held_mb: held, signals, holders, waiting };
  if (o.json) return res;
  const err = gateQueueErrWriter(ctx);
  const na = (v, unit) => (v == null ? 'unavailable' : v + unit);
  const peak = (v) => (v == null ? 'exclusive' : v + ' MB');
  err('[gate-queue] budget ' + budget + ' MB · held ' + held + ' MB by ' + live.length + ' holder' + (live.length === 1 ? '' : 's') + ' · signals ' + sig.source);
  err('[gate-queue] signals: pressure ' + na(signals.pressure, '') + ' · avail ' + na(signals.avail_mb == null ? null : Math.round(signals.avail_mb), ' MB') +
    ' · swap used ' + na(signals.swap_used_mb == null ? null : Math.round(signals.swap_used_mb), ' MB') + ' · swap-out ' + na(signals.swapout_mb_per_s, ' MB/s') + ' (single read)');
  const who = (e) => 'seq=' + e.seq + ' pid ' + e.pid + ' peak ' + peak(e.peak_mb) + ' label=' + (e.label || '?') + ' cwd=' + (e.cwd || '?') + ' repo=' + (e.repo || '-');
  if (!holders.length) err('[gate-queue] no holders');
  for (const h of holders) {
    if (h.corrupt) { err('[gate-queue] corrupt holder file ' + h.name + ' (quarantine pending)'); continue; }
    const line = 'holder ' + who(h) + ' admitted ' + (h.admitted_at || '?') + ' age ' + (h.age_s == null ? '?' : h.age_s + ' s');
    err('[gate-queue] ' + (h.alive ? line : 'dead (reclaim pending): ' + line + ' · ' + h.state));
  }
  const liveTickets = waiting.filter((w) => w.alive);
  if (!waiting.length) err('[gate-queue] nothing waiting');
  let i = 0;
  for (const w of waiting) {
    if (w.corrupt) { err('[gate-queue] corrupt ticket file ' + w.name + ' (quarantine pending)'); continue; }
    if (!w.alive) { err('[gate-queue] dead (reclaim pending): ticket ' + who(w) + ' · ' + w.state); continue; }
    i++;
    err('[gate-queue] waiting ' + i + '/' + liveTickets.length + ' ' + who(w) + ' checked ' + (w.checked_at || 'never') +
      ' · waiting for ' + (w.reason || '(not checked yet)'));
  }
  return res;
}

// `do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command` and `gate queue --status [--json]`
// (CLI entry; async). args: parseArgs shape; the command argv comes from args.passthrough (the `--` tail).
export async function gateQueueCmd(ctx, args) {
  const flags = (args && args.flags) || {};
  if (flags.status) return gateQueueStatus(ctx, { json: !!flags.json });
  const argv = (args && (args.passthrough || args.rest || args['--'])) || [];
  if (!Array.isArray(argv) || !argv.length) throw fail('USAGE', 1, { message: 'usage: do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command | --status [--json]' });
  const run = gateQueueRuntime(ctx);
  run.trap();
  try {
    return await gateQueueRunCore(ctx, {
      peakMb: flags['peak-mb'] === undefined ? null : flags['peak-mb'],
      timeoutS: flags['timeout-s'] === undefined ? null : flags['timeout-s'],
      label: typeof flags.label === 'string' ? flags.label : null,
      argv,
    }, run);
  } catch (e) {
    if (e && e.outcome === 'QUEUE_SETTINGS_INVALID') run.err('[gate-queue] ' + ((e.extra && e.extra.message) || 'queue settings invalid') + ' · not started');
    throw e;
  } finally {
    run.untrap();
  }
}
