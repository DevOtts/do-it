// Shared helpers for the store-lane tests (epics L1, F1). No bundle build side effect here: only l1-bundle builds.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const G1_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SPINE_DIR = path.resolve(G1_DIR, '..', '..');
export const CORE_DIR = path.resolve(SPINE_DIR, '..');
export const REPO_DIR = path.resolve(CORE_DIR, '..');
export const SRC_DIR = path.join(SPINE_DIR, 'src');
export const FIX = path.join(G1_DIR, 'fixtures');
export const NOW = Date.parse('2026-11-06T12:00:00.000Z');
export const H = 3600000;
export const D = 24 * H;

const made = [];
export function tmpDir(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'g1-')));
  made.push(d);
  return d;
}
export function cleanupTmp() {
  while (made.length) {
    const d = made.pop();
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

export function gitEnv(home) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_') || k.startsWith('GIT_')) delete env[k];
  env.HOME = home;
  env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  return env;
}

export function mkGitRepo(files) {
  const dir = tmpDir('g1-repo-');
  const home = tmpDir('g1-home-');
  const env = gitEnv(home);
  const git = (...args) => cp.execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'core.autocrlf', 'false');
  for (const [rel, content] of Object.entries(files || { 'README.md': 'x\n' })) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { dir, home, env, git };
}

export function tmpStore() {
  return { backend: 'local', dir: path.join(tmpDir('g1-store-'), 'gate-results') };
}

export function hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function rid(n) {
  return 'g-20261106T130657Z-' + (n & 0xffff).toString(16).padStart(4, '0');
}

export function iso(ms) {
  return new Date(ms).toISOString();
}

// process start time of a pid (the queue lane's gateProcStart stands in for this after merge)
export function psStart(pid) {
  try {
    const s = cp.execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return s || null;
  } catch {
    return null;
  }
}

export function comps(tag) {
  const c = {};
  for (const k of ['gate', 'runner', 'core', 'installed', 'env', 'platform', 'deps']) c[k] = hex(k + ':' + (typeof tag === 'object' ? (tag[k] ?? 'x') : tag || 'x'));
  c.class = 'NARROW';
  return c;
}

export function finishRow(o) {
  const res = o.result || 'PASS';
  const counts = o.counts || (res === 'PASS' ? { passed: 1, failed: 0, skipped: 0, pending: 0 }
    : res === 'FAIL' ? { passed: 0, failed: 1, skipped: 0, pending: 0 } : { passed: 0, failed: 0, skipped: 1, pending: 0 });
  const r = {
    schema: 'do-it-gate-result/1', type: 'finish', run_id: o.run, at: o.at, file: o.file, leg: o.leg || 'unit', scope: o.scope || 'push',
    key: o.key, components: o.components || comps('x'), result: res, retried: !!o.retried, counts,
    exec_error: o.exec_error === undefined ? false : o.exec_error, duration_ms: 5, failure_ref: o.failure_ref === undefined ? null : o.failure_ref,
    clean: !!o.clean, tree_dirty: false,
  };
  return r;
}
export function startRow(o) {
  return { schema: 'do-it-gate-result/1', type: 'start', run_id: o.run, at: o.at, file: o.file, leg: o.leg || 'unit', scope: 'push', key: o.key };
}
export function runStartRow(o) {
  return { schema: 'do-it-gate-result/1', type: 'run_start', run_id: o.run, at: o.at, scope: 'push', clean: !!o.clean, pid: o.pid || 999999, pid_start: o.pid_start === undefined ? 'dead' : o.pid_start };
}
export function runEndRow(o) {
  const r = { schema: 'do-it-gate-result/1', type: 'run_end', run_id: o.run, at: o.at, scope: 'push', tainted: !!o.tainted, verdict: o.verdict || 'GATE_PASS_FRESH' };
  return r;
}
export function cleanRow(o) {
  return { schema: 'do-it-gate-result/1', type: 'clean', run_id: o.run, at: o.at, scope: 'nightly', clean: true };
}

// Event DSL -> rows in order (used by the M1 fixture and the fold tests).
// event: {t:'f'|'s'|'x', run, key, res, ago (hours before now; default spaced 0.1 h apart), retried, clean, inv, file}
// opts: {open: [runs without run_end], tainted: [runs], interrupted: [runs with run_end verdict GATE_INTERRUPTED]}
export function streamRows(events, opts, now, file) {
  const o = opts || {};
  const f = file || 'f.spec.ts';
  const t0 = now === undefined ? NOW : now;
  const rows = [];
  const runs = [];
  const runInfo = new Map();
  events.forEach((e, i) => {
    const ago = e.ago !== undefined ? e.ago : (events.length - i) * 0.1;
    const at = iso(t0 - ago * H);
    if (e.t === 'x') { rows.push({ corrupt: true, file: e.file === null ? undefined : (e.file || f) }); return; }
    const run = e.run;
    if (!runInfo.has(run)) {
      runInfo.set(run, { first: at, last: at, clean: false });
      runs.push(run);
      rows.push({ row: runStartRow({ run: rid(run), at, clean: !!e.clean, pid_start: 'dead' }) });
    }
    const info = runInfo.get(run);
    info.last = at;
    if (e.clean) info.clean = true;
    const key = hex(e.key || 'k1');
    if (e.t === 's') rows.push({ row: startRow({ run: rid(run), at, file: e.file || f, key }) });
    if (e.t === 'f') {
      const fr = finishRow({ run: rid(run), at, file: e.file || f, key, result: e.res || 'PASS', retried: e.retried, clean: e.clean, components: comps(e.key || 'k1') });
      if (e.inv) fr.counts = { passed: 1, failed: 1, skipped: 0, pending: 0 };
      if (e.inv === 'h5') fr.counts = { passed: 0, failed: 0, skipped: 3, pending: 0 };
      rows.push({ row: fr });
    }
  });
  for (const run of runs) {
    if ((o.open || []).includes(run)) continue;
    const info = runInfo.get(run);
    rows.push({ row: runEndRow({ run: rid(run), at: info.last, tainted: (o.tainted || []).includes(run), verdict: (o.interrupted || []).includes(run) ? 'GATE_INTERRUPTED' : 'GATE_PASS_FRESH' }) });
    if (info.clean) rows.push({ row: cleanRow({ run: rid(run), at: info.last }) });
  }
  return rows;
}

export function rowsToItems(rows) {
  return rows.map((r, pos) => (r.corrupt ? (r.file === undefined ? { pos, ok: false } : { pos, ok: false, file: r.file }) : { pos, ok: true, row: r.row }));
}

export function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function walkFiles(dir) {
  const out = [];
  const go = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p); else out.push(p);
    }
  };
  if (fs.existsSync(dir)) go(dir);
  return out.sort();
}

export function treeHash(dir) {
  return walkFiles(dir).map((f) => path.relative(dir, f) + ':' + sha(f)).join('\n');
}

// Seeded PRNG (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Copy core/spine/src + core/schemas (+ bundled siblings) to a temp tree, apply `mutate(name, text)`, return paths.
export function mutantCopy(mutate) {
  const root = tmpDir('g1-mutant-');
  const dstSpine = path.join(root, 'core', 'spine');
  fs.mkdirSync(path.join(dstSpine, 'src'), { recursive: true });
  fs.copyFileSync(path.join(SPINE_DIR, 'build.mjs'), path.join(dstSpine, 'build.mjs'));
  for (const n of fs.readdirSync(SRC_DIR)) {
    if (!n.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(SRC_DIR, n), 'utf8');
    fs.writeFileSync(path.join(dstSpine, 'src', n), mutate ? mutate(n, text) : text);
  }
  for (const sub of ['schemas', 'renderers', path.join('drivers', 'secrets'), path.join('gates', 'adapters')]) {
    const from = path.join(CORE_DIR, sub);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(root, 'core', sub), { recursive: true });
  }
  return { root, spine: dstSpine, src: path.join(dstSpine, 'src') };
}
