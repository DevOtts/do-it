import cp from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readJsonRegular, readRegularFile } from './fs-atomic.mjs';

// Memory signals and process liveness for the gate queue (CONTRACT §2.5, §4.5, §6; PRD-4 D3–D8).
// Every top-level name here starts with gateSignals or gateProc (bundle unique-name rule, G-15).
// MB = 1,048,576 bytes everywhere. The darwin free-page count and the OS free-memory
// call under-read badly on a compressing kernel; the available estimate is the compressor-aware one.

export const gateSignalsSwapWindowMs = 5000;
const gateSignalsMB = 1048576;
const gateSignalsSmallCap = 1024 * 1024;

export function gateSignalsPressureName(level) {
  const n = Number(level);
  if (n === 1) return 'normal';
  if (n === 2) return 'warn';
  if (n === 4) return 'critical';
  // anything other than 1 waits (PRD-4 D4); an unknown level is named, never guessed
  return Number.isFinite(n) ? 'level ' + n : null;
}

// `vm_stat` text -> { pagesize, counters by label }. Labels are matched by name, never by line position.
export function gateSignalsParseVmStat(text) {
  const out = { pagesize: null, counters: {} };
  const head = /page size of (\d+) bytes/.exec(text || '');
  if (head) out.pagesize = Number(head[1]);
  for (const line of String(text || '').split('\n')) {
    const m = /^"?([^":]+)"?:\s+(\d+)\.?\s*$/.exec(line.trim());
    if (m) out.counters[m[1].trim()] = Number(m[2]);
  }
  return out;
}

// `vm.swapusage` text -> used MB (`used = 4602.81M`), or null.
export function gateSignalsParseSwapUsage(text) {
  const m = /used = ([\d.]+)([KMG])/.exec(text || '');
  if (!m) return null;
  const v = Number(m[1]);
  const mult = m[2] === 'K' ? 1 / 1024 : m[2] === 'G' ? 1024 : 1;
  return Math.round(v * mult * 100) / 100;
}

// Pure darwin parse over captured text (Q1-01). Returns the signal object without the swap-out rate
// (that needs two reads; see gateSignalsSwapRate) plus the raw Swapouts counter.
export function gateSignalsParseDarwin(cap) {
  const vm = gateSignalsParseVmStat(cap.vmstatText);
  const pagesize = Number(cap.pagesizeText) || vm.pagesize || null;
  const memsize = Number(String(cap.memsizeText || '').trim()) || null;
  const pressureRaw = String(cap.pressureText == null ? '' : cap.pressureText).trim();
  const pressure = pressureRaw === '' ? null : gateSignalsPressureName(pressureRaw);
  const unavailable = [];
  if (pressure == null) unavailable.push('pressure');
  const total_mb = memsize ? Math.round(memsize / gateSignalsMB) : null;
  let avail_est_bytes = null;
  const c = vm.counters;
  const anon = c['Anonymous pages'];
  const wired = c['Pages wired down'];
  const comp = c['Pages occupied by compressor'];
  if (memsize && pagesize && [anon, wired, comp].every(Number.isFinite)) {
    const totalPages = Math.floor(memsize / pagesize);
    avail_est_bytes = Math.max(0, totalPages - anon - wired - comp) * pagesize;
  } else unavailable.push('available memory');
  const swap_used_mb = gateSignalsParseSwapUsage(cap.swapText);
  if (swap_used_mb == null) unavailable.push('swap used');
  const swapouts = Number.isFinite(c.Swapouts) ? c.Swapouts : null;
  return {
    source: 'darwin',
    pressure,
    total_mb,
    avail_est_bytes,
    avail_mb: avail_est_bytes == null ? null : Math.round(avail_est_bytes / gateSignalsMB),
    swap_used_mb,
    swapouts,
    pagesize,
    unavailable,
  };
}

// Swap-out rate in MB/s from two cumulative page-counter samples {at_ms, pages, pagesize}; null when the
// two reads are less than the 5 s window apart (CONTRACT §4.5) or a counter is missing.
export function gateSignalsSwapRate(prev, cur) {
  if (!prev || !cur || !Number.isFinite(prev.pages) || !Number.isFinite(cur.pages)) return null;
  const dt = cur.at_ms - prev.at_ms;
  if (!(dt >= gateSignalsSwapWindowMs)) return null;
  const pages = Math.max(0, cur.pages - prev.pages);
  return Math.round((pages * (cur.pagesize || prev.pagesize || 4096) / gateSignalsMB / (dt / 1000)) * 1000) / 1000;
}

// Rolling sampler kept in the caller's per-process state: rate over the newest sample at least 5 s old.
export function gateSignalsSample(state, sample) {
  if (!state.samples) state.samples = [];
  const s = state.samples;
  if (!Number.isFinite(sample.pages)) return { rate: null, window_ms: null, pending_ms: null };
  s.push(sample);
  let base = null;
  for (let i = s.length - 2; i >= 0; i--) {
    if (sample.at_ms - s[i].at_ms >= gateSignalsSwapWindowMs) { base = s[i]; break; }
  }
  // keep the window bounded: drop samples older than the chosen base
  if (base) { const k = s.indexOf(base); if (k > 0) s.splice(0, k); }
  if (s.length > 64) s.splice(0, s.length - 64);
  if (!base) return { rate: null, window_ms: null, pending_ms: gateSignalsSwapWindowMs - (sample.at_ms - s[0].at_ms) };
  return { rate: gateSignalsSwapRate(base, sample), window_ms: sample.at_ms - base.at_ms, pending_ms: 0 };
}

function gateSignalsExec(file, args) {
  return cp.execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, env: { ...process.env, LC_ALL: 'C' } });
}

// Live darwin read (Q1-01). Each sysctl key is read on its own line; one failing key leaves only its signal
// unavailable. state carries the swap-out sampler between reads of one process.
export function gateSignalsReadDarwin(state) {
  const st = state || {};
  const keys = ['kern.memorystatus_vm_pressure_level', 'vm.swapusage', 'hw.memsize', 'hw.pagesize'];
  const vals = {};
  for (const k of keys) {
    try { vals[k] = gateSignalsExec('/usr/sbin/sysctl', ['-n', k]).trim(); } catch { vals[k] = null; }
  }
  let vmstatText = '';
  try { vmstatText = gateSignalsExec('/usr/bin/vm_stat', []); } catch { vmstatText = ''; }
  const at_ms = Date.now();
  const sig = gateSignalsParseDarwin({
    pressureText: vals['kern.memorystatus_vm_pressure_level'],
    swapText: vals['vm.swapusage'],
    memsizeText: vals['hw.memsize'],
    pagesizeText: vals['hw.pagesize'],
    vmstatText,
  });
  const r = gateSignalsSample(st, { at_ms, pages: sig.swapouts, pagesize: sig.pagesize });
  sig.swapout_mb_per_s = r.rate;
  sig.swapout_window_ms = r.window_ms;
  sig.swapout_pending_ms = r.pending_ms;
  if (sig.swapouts == null) sig.unavailable.push('swap-out');
  sig.at = new Date(at_ms).toISOString();
  if (!sig.total_mb && sig.avail_mb == null && sig.pressure == null) return gateSignalsUnavailable(sig.at);
  return sig;
}

function gateSignalsReadSmall(file) {
  try { return readRegularFile(file, gateSignalsSmallCap).toString('utf8'); } catch { return null; }
}

function gateSignalsKb(text, name) {
  const m = new RegExp('^' + name + ':\\s+(\\d+)\\s*kB', 'm').exec(text || '');
  return m ? Number(m[1]) : null;
}

// PSI text -> 'warn' when some avg10 > 10 or full avg10 > 0, else 'normal'; null when unparseable.
export function gateSignalsParsePsi(text) {
  const some = /^some\s+avg10=([\d.]+)/m.exec(text || '');
  const full = /^full\s+avg10=([\d.]+)/m.exec(text || '');
  if (!some && !full) return null;
  if (some && Number(some[1]) > 10) return 'warn';
  if (full && Number(full[1]) > 0) return 'warn';
  return 'normal';
}

// Linux read (Q1-02, PRD-4 D5) under a root path so tests feed a fixture tree. Swap-out pages are taken as
// 4 KiB (pswpout counts pages; flagged for a live Linux [REAL] run).
export function gateSignalsReadLinux(root, state) {
  const st = state || {};
  const r = root || '/';
  const at_ms = Date.now();
  const meminfo = gateSignalsReadSmall(path.join(r, 'proc', 'meminfo'));
  const unavailable = [];
  const memTotalKb = gateSignalsKb(meminfo, 'MemTotal');
  const memAvailKb = gateSignalsKb(meminfo, 'MemAvailable');
  const swapTotalKb = gateSignalsKb(meminfo, 'SwapTotal');
  const swapFreeKb = gateSignalsKb(meminfo, 'SwapFree');
  let total_mb = memTotalKb == null ? null : Math.round(memTotalKb / 1024);
  let avail_mb = memAvailKb == null ? null : Math.round(memAvailKb / 1024);
  const cg = path.join(r, 'sys', 'fs', 'cgroup');
  const maxText = gateSignalsReadSmall(path.join(cg, 'memory.max'));
  const limit = maxText && /^\d+\s*$/.test(maxText) ? Number(maxText.trim()) : null;
  let psiText = null;
  if (limit != null) {
    const limitMb = Math.round(limit / gateSignalsMB);
    total_mb = total_mb == null ? limitMb : Math.min(total_mb, limitMb);
    const curText = gateSignalsReadSmall(path.join(cg, 'memory.current'));
    if (curText && /^\d+\s*$/.test(curText)) {
      const room = Math.round(Math.max(0, limit - Number(curText.trim())) / gateSignalsMB);
      avail_mb = avail_mb == null ? room : Math.min(avail_mb, room);
    }
    psiText = gateSignalsReadSmall(path.join(cg, 'memory.pressure'));
  }
  if (psiText == null) psiText = gateSignalsReadSmall(path.join(r, 'proc', 'pressure', 'memory'));
  const pressure = gateSignalsParsePsi(psiText);
  if (pressure == null) unavailable.push('pressure');
  if (avail_mb == null) unavailable.push('available memory');
  const swap_used_mb = swapTotalKb != null && swapFreeKb != null ? Math.round((swapTotalKb - swapFreeKb) / 1024 * 100) / 100 : null;
  if (swap_used_mb == null) unavailable.push('swap used');
  const vmstat = gateSignalsReadSmall(path.join(r, 'proc', 'vmstat'));
  const pm = /^pswpout\s+(\d+)/m.exec(vmstat || '');
  const pages = pm ? Number(pm[1]) : null;
  if (pages == null) unavailable.push('swap-out');
  const rr = gateSignalsSample(st, { at_ms, pages, pagesize: 4096 });
  const at = new Date(at_ms).toISOString();
  if (total_mb == null && avail_mb == null && pressure == null) return gateSignalsUnavailable(at);
  return {
    source: 'linux', pressure, total_mb, avail_mb, swap_used_mb,
    swapout_mb_per_s: rr.rate, swapout_window_ms: rr.window_ms, swapout_pending_ms: pages == null ? null : rr.pending_ms,
    unavailable, at,
  };
}

function gateSignalsUnavailable(at, totalMb) {
  return {
    source: 'unavailable', pressure: null,
    total_mb: totalMb || Math.round(os.totalmem() / gateSignalsMB),
    avail_mb: null, swap_used_mb: null, swapout_mb_per_s: null, swapout_window_ms: null, swapout_pending_ms: null,
    unavailable: ['pressure', 'available memory', 'swap used', 'swap-out'], at: at || new Date().toISOString(),
  };
}

// R19 test seam: DO_IT_GATE_SIGNALS names a JSON fixture, re-read on every poll; no sysctl, no 5 s window.
export function gateSignalsReadFixture(file) {
  let fx = null;
  try { fx = readJsonRegular(file, gateSignalsSmallCap); } catch { fx = null; }
  const at = new Date().toISOString();
  if (!fx || typeof fx !== 'object') return gateSignalsUnavailable(at);
  if (fx.unavailable === true) return gateSignalsUnavailable(at, Number(fx.total_mb) || null);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sig = {
    source: 'fixture',
    pressure: typeof fx.pressure === 'string' ? fx.pressure : null,
    total_mb: num(fx.total_mb) || Math.round(os.totalmem() / gateSignalsMB),
    avail_mb: num(fx.avail_mb),
    swap_used_mb: num(fx.swap_used_mb),
    swapout_mb_per_s: num(fx.swapout_mb_per_s),
    swapout_window_ms: null, swapout_pending_ms: null,
    unavailable: [], at,
  };
  if (sig.pressure == null) sig.unavailable.push('pressure');
  if (sig.avail_mb == null) sig.unavailable.push('available memory');
  if (sig.swap_used_mb == null) sig.unavailable.push('swap used');
  if (sig.swapout_mb_per_s == null) sig.unavailable.push('swap-out');
  return sig;
}

// One read of the machine (fixture, darwin, linux, or unavailable). opts.env (ctx.env), opts.platform and
// opts.linuxRoot exist for tests. Never blocks for the swap-out window; see gateSignalsReadSettled.
export function gateSignalsRead(opts, state) {
  const o = opts || {};
  const env = o.env || process.env;
  if (env.DO_IT_GATE_SIGNALS) return gateSignalsReadFixture(env.DO_IT_GATE_SIGNALS);
  const platform = o.platform || process.platform;
  if (platform === 'darwin') return gateSignalsReadDarwin(state);
  if (platform === 'linux') return gateSignalsReadLinux(o.linuxRoot || '/', state);
  return gateSignalsUnavailable();
}

// A read whose swap-out rate spans the full 5 s window: when the sampler has no old-enough sample yet, wait
// (abortable) and read again. opts.sleep(ms) -> Promise<boolean aborted>.
export async function gateSignalsReadSettled(opts, state) {
  let sig = gateSignalsRead(opts, state);
  for (let i = 0; i < 4 && sig.swapout_mb_per_s == null && sig.swapout_pending_ms > 0; i++) {
    const aborted = opts && opts.sleep ? await opts.sleep(sig.swapout_pending_ms + 50) : await new Promise((res) => setTimeout(() => res(false), sig.swapout_pending_ms + 50));
    if (aborted) return sig;
    sig = gateSignalsRead(opts, state);
  }
  return sig;
}

// Budget-only when no memory signal is readable (CONTRACT §6).
export function gateSignalsBudgetOnly(sig) {
  return sig.source === 'unavailable' || (sig.pressure == null && sig.avail_mb == null && sig.swap_used_mb == null && sig.swapout_mb_per_s == null);
}

function gateSignalsGb(mb) {
  return (mb / 1024).toFixed(1);
}

// R13 conditions in order (PRD-4 D11). peakMb null = exclusive: reserves the whole budget, and the
// available-memory check is skipped (no declared number to compare; pressure and swap still guard).
// Returns { admit, reason, wait_for } — wait_for is the reason without its "(now …)" detail.
export function gateSignalsDecide(sig, q) {
  const peak = q.peakMb == null ? q.budgetMb : q.peakMb;
  if (sig.pressure != null && sig.pressure !== 'normal') {
    return { admit: false, reason: 'memory pressure normal (now ' + sig.pressure + ')', wait_for: 'memory pressure normal' };
  }
  if (sig.swapout_mb_per_s != null && sig.swapout_mb_per_s > 1) {
    return { admit: false, reason: 'swap-out to stop (' + sig.swapout_mb_per_s.toFixed(1) + ' MB/s)', wait_for: 'swap-out to stop' };
  }
  if (q.peakMb != null && sig.avail_mb != null && sig.avail_mb < q.peakMb) {
    return { admit: false, reason: gateSignalsGb(q.peakMb) + ' GB free (' + gateSignalsGb(sig.avail_mb) + ' GB now)', wait_for: gateSignalsGb(q.peakMb) + ' GB free' };
  }
  if (q.swapUsedMaxMb != null && sig.swap_used_mb != null && sig.swap_used_mb > q.swapUsedMaxMb) {
    return { admit: false, reason: 'swap used below ' + q.swapUsedMaxMb + ' MB (' + Math.round(sig.swap_used_mb) + ' MB now)', wait_for: 'swap used below ' + q.swapUsedMaxMb + ' MB' };
  }
  if (q.heldMb + peak > q.budgetMb) {
    return { admit: false, reason: 'budget (' + q.heldMb + ' MB held + ' + peak + ' MB > ' + q.budgetMb + ' MB)', wait_for: 'budget' };
  }
  return { admit: true, reason: null, wait_for: null };
}

// == process start time and liveness (CONTRACT §2.5, PRD-4 D3) ==

// Start times for many pids in one `ps` call (darwin) or /proc reads (linux). Map pid -> 'darwin:{text}' |
// 'linux:{ticks}'. A pid missing from the map had no readable start time (dead, hidden, or ps failed).
export function gateProcStartMany(pids, platform) {
  const plat = platform || process.platform;
  const out = new Map();
  const list = Array.from(new Set(pids.filter((p) => Number.isInteger(p) && p > 0)));
  if (!list.length) return out;
  if (plat === 'darwin') {
    let text = '';
    try {
      text = gateSignalsExec('/bin/ps', ['-o', 'pid=,lstart=', '-p', list.join(',')]);
    } catch (e) {
      text = e && typeof e.stdout === 'string' ? e.stdout : '';
    }
    for (const line of text.split('\n')) {
      const m = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
      if (m) out.set(Number(m[1]), 'darwin:' + m[2]);
    }
    return out;
  }
  if (plat === 'linux') {
    for (const pid of list) {
      const stat = gateSignalsReadSmall('/proc/' + pid + '/stat');
      if (!stat) continue;
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      // fields after "pid (comm)" start at field 3; starttime is field 22
      if (rest[19] && /^\d+$/.test(rest[19])) out.set(pid, 'linux:' + rest[19]);
    }
  }
  return out;
}

export function gateProcStart(pid) {
  return gateProcStartMany([pid]).get(pid) || null;
}

function gateProcSignalZero(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); }
}

// 'alive' | 'alive-unverified' (answers kill 0, start time unreadable: fail toward waiting) | 'dead' |
// 'start time differs'. starts: optional Map from gateProcStartMany for batching.
export function gateProcState(pid, start, starts) {
  if (!Number.isInteger(pid) || pid <= 0) return 'dead';
  if (!gateProcSignalZero(pid)) return 'dead';
  if (!start) return 'alive-unverified';
  const now = starts ? starts.get(pid) : gateProcStart(pid);
  if (!now) return gateProcSignalZero(pid) ? 'alive-unverified' : 'dead';
  return now === start ? 'alive' : 'start time differs';
}

export function gateProcAlive(pid, start, starts) {
  const s = gateProcState(pid, start, starts);
  return s === 'alive' || s === 'alive-unverified';
}

// Parent pid (for the ancestor walk of nested admission).
export function gateProcParent(pid, platform) {
  const plat = platform || process.platform;
  if (plat === 'linux') {
    const stat = gateSignalsReadSmall('/proc/' + pid + '/stat');
    if (!stat) return null;
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return Number(rest[1]) || null;
  }
  try {
    const t = gateSignalsExec('/bin/ps', ['-o', 'ppid=', '-p', String(pid)]).trim();
    return Number(t) || null;
  } catch { return null; }
}
