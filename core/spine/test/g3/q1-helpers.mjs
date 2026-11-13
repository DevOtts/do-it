// Shared helpers for the Q1 queue tests: sandboxed HOME, signal fixtures, gate processes with live stderr.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseEnv, tmp } from '../helpers.mjs';

export const G3 = path.dirname(fileURLToPath(import.meta.url));
export const DRIVER = path.join(G3, 'driver.mjs');
export const CMD = path.join(G3, 'fixtures', 'gate-cmd.mjs');
export const NORMAL = { pressure: 'normal', total_mb: 10000, avail_mb: 9000, swap_used_mb: 0, swapout_mb_per_s: 0 };

export function sandbox(t, signals) {
  const home = tmp('dit-g3-home-');
  const work = tmp('dit-g3-work-');
  const fx = path.join(home, 'signals.json');
  setSignals(fx, signals || NORMAL);
  const procs = [];
  const sb = {
    home, work, fx, procs,
    q: path.join(home, '.do-it', 'queue'),
    env: (extra) => baseEnv(home, { DO_IT_GATE_SIGNALS: fx, ...(extra || {}) }),
    set: (v) => setSignals(fx, v),
    gate: (flags, cmdArgs, opts) => startGate(sb, flags, cmdArgs, opts),
    file: (n) => path.join(work, n),
    ls: (sub) => { try { return fs.readdirSync(path.join(sb.q, sub)).filter((n) => !n.startsWith('.')); } catch { return []; } },
  };
  t.after(async () => {
    for (const p of procs) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });
  return sb;
}

export function setSignals(file, v) {
  const t = file + '.tmp';
  fs.writeFileSync(t, JSON.stringify(v));
  fs.renameSync(t, file);
}

// flags: array of queue flags; cmdArgs: args for fixtures/gate-cmd.mjs (or opts.argv for a raw command).
export function startGate(sb, flags, cmdArgs, opts) {
  const o = opts || {};
  const argv = o.argv || [process.execPath, CMD, ...(cmdArgs || [])];
  const child = cp.spawn(process.execPath, [DRIVER, ...(flags || []), '--', ...argv], {
    cwd: o.cwd || sb.work, env: o.env || sb.env(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  sb.procs.push(child);
  const g = { child, pid: child.pid, err: '', out: '', code: undefined, signal: undefined, exitedAt: null };
  child.stdout.on('data', (d) => { g.out += d; });
  child.stderr.on('data', (d) => { g.err += d; });
  g.done = new Promise((res) => child.on('close', (code, signal) => { g.code = code; g.signal = signal; g.exitedAt = Date.now(); res(g); }));
  g.lines = () => g.err.split('\n').filter(Boolean);
  g.result = () => { const l = g.out.trim().split('\n').filter(Boolean).pop(); try { return JSON.parse(l); } catch { return null; } };
  return g;
}

export async function waitFor(pred, ms, what) {
  const t0 = Date.now();
  for (;;) {
    if (pred()) return Date.now() - t0;
    if (Date.now() - t0 > ms) throw new Error('timed out after ' + ms + ' ms waiting for ' + (what || 'condition'));
    await new Promise((r) => setTimeout(r, 50));
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export function holderJson(seq, pid, extra) {
  return { seq, pid, pid_start: null, pgid: null, cwd: '/tmp/x', repo: null, label: 'old:gate', peak_mb: null, enqueued_at: new Date().toISOString(), admitted_at: new Date().toISOString(), ...(extra || {}) };
}
