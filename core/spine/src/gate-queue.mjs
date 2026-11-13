import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail } from './errors.mjs';
import { atomicWriteJson, readJsonRegular } from './fs-atomic.mjs';
import { settingsPaths } from './settings.mjs';
import {
  gateProcParent, gateProcStart, gateProcStartMany, gateProcState,
  gateSignalsBudgetOnly, gateSignalsDecide, gateSignalsRead, gateSignalsReadSettled,
} from './gate-signals.mjs';

// Per-machine gate admission (CONTRACT §2.5, §3, §4.3–§4.5, §8 M3; PRD-4 D1–D15). Q1: admission half.
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
export const gateQueueDefaults = { budget_pct: 60, timeout_s: 14400, swap_used_max_mb: null };
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

// ---- settings (Q1-07, PRD-4 D14): global layer only, never the workspace file ----

export function gateQueueSettings(ctx) {
  const file = settingsPaths(ctx).global;
  let doc = null;
  try { doc = readJsonRegular(file, gateQueueEntryCap * 16); } catch (e) {
    throw fail('QUEUE_SETTINGS_INVALID', 1, { file, message: 'global settings unreadable: ' + (e.code || 'error') });
  }
  const q = doc && doc.gates && doc.gates.queue;
  const out = { ...gateQueueDefaults };
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

// ---- entries ----

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

// ---- lock (PRD-4 D2) ----

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

// ---- seq (monotonic; recomputed from the highest seq on disk when unreadable) ----

function gateQueueDiskMaxSeq(root) {
  let max = 0;
  for (const kind of ['tickets', 'holders', 'corrupt']) {
    let names = [];
    try { names = fs.readdirSync(path.join(root, kind)); } catch { names = []; }
    for (const n of names) { const m = /^(\d{10})-/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
  }
  return max;
}

function gateQueueNextSeq(root) {
  const file = path.join(root, 'seq');
  let cur = null;
  try { cur = readJsonRegular(file, 4096); } catch { cur = null; }
  const base = Math.max(Number.isInteger(cur) && cur >= 0 ? cur : 0, gateQueueDiskMaxSeq(root));
  const next = base + 1;
  atomicWriteJson(file, next);
  return next;
}

// ---- waiting runtime: abortable sleep and signal handling ----

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

// ---- admission (Q1-05, Q1-06; PRD-4 D11–D13) ----

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
  try { res = await gateQueueAdmitCore(ctx, opts || {}, run); } finally { run.untrap(); }
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

// Q1 basic run (Q2 replaces it with process-group cleanup): spawn, wait, release, exit passthrough.
// Signals while running are forwarded to the child; the queue then exits 128 + N (PRD-4 D18).
async function gateQueueRunChild(ctx, admitted, argv, run) {
  const err = run.err;
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let interrupted = null;
    const finish = (exit, extra) => {
      if (settled) return;
      settled = true;
      run.onSignal = null;
      resolve({ exit, ...extra });
    };
    try {
      child = cp.spawn(argv[0], argv.slice(1), {
        cwd: ctx.cwd, stdio: 'inherit',
        env: { ...ctx.env, DO_IT_GATE_HOLDER: admitted.seq + '-' + process.pid },
      });
    } catch (e) {
      err('[gate-queue] command failed to start: ' + (e.code || 'error'));
      finish(127, { start_error: e.code || 'error' });
      return;
    }
    run.onSignal = (sig) => {
      interrupted = interrupted || sig;
      try { child.kill(sig); } catch { /* gone */ }
    };
    child.on('error', (e) => {
      if (child.pid == null || e.code === 'ENOENT' || e.code === 'EACCES') {
        err('[gate-queue] command failed to start: ' + (e.code || 'error'));
        finish(127, { start_error: e.code || 'error' });
      }
    });
    child.on('exit', (code, signal) => {
      let exit = code;
      if (exit == null) exit = 128 + (os.constants.signals[signal] || 0);
      if (interrupted) finish(128 + gateQueueSignalNo[interrupted], { command_exit: exit, signal: interrupted });
      else finish(exit, { command_exit: exit });
    });
  });
}

// `do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command` (CLI entry; async).
// args: parseArgs shape; the command argv comes from args.passthrough (the `--` tail; V1's cli.mjs names it).
export async function gateQueueCmd(ctx, args) {
  const flags = (args && args.flags) || {};
  const argv = (args && (args.passthrough || args.rest || args['--'])) || [];
  if (flags.status) throw fail('USAGE', 1, { message: 'gate queue --status arrives with Q2' });
  if (!Array.isArray(argv) || !argv.length) throw fail('USAGE', 1, { message: 'usage: do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command' });
  const run = gateQueueRuntime(ctx);
  run.trap();
  try {
    let admitted;
    try {
      admitted = await gateQueueAdmitCore(ctx, {
        peakMb: flags['peak-mb'] === undefined ? null : flags['peak-mb'],
        timeoutS: flags['timeout-s'] === undefined ? null : flags['timeout-s'],
        label: typeof flags.label === 'string' ? flags.label : null,
        argv,
      }, run);
    } catch (e) {
      if (e && e.outcome === 'QUEUE_SETTINGS_INVALID') run.err('[gate-queue] ' + (e.extra.message || 'queue settings invalid') + ' · not started');
      throw e;
    }
    if (admitted.outcome !== 'GATE_QUEUE_ADMITTED') return admitted;
    if (run.aborted) {
      // a signal landed between admission and spawn: never start
      gateQueueRelease(ctx, admitted, 128 + gateQueueSignalNo[run.aborted], 0);
      return gateQueueInterrupted(run, admitted.seq);
    }
    const r = await gateQueueRunChild(ctx, admitted, argv, run);
    gateQueueRelease(ctx, admitted, r.exit, 0);
    if (r.signal) return { outcome: 'GATE_INTERRUPTED', exit: r.exit, seq: admitted.seq, signal: r.signal, command_exit: r.command_exit };
    if (r.start_error) return { outcome: 'GATE_QUEUE_START_FAILED', exit: 127, seq: admitted.seq, error: r.start_error };
    return { outcome: 'GATE_QUEUE_RAN', exit: r.exit, seq: admitted.seq, label: admitted.label };
  } finally {
    run.untrap();
  }
}
