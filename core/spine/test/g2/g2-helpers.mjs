// Shared helpers for the verdict-lane tests (epics V1, V2): a 30-file stub leg in a temp git repository, driven
// through the built bundle with the stub adapter registered by DO_IT_GATE_ADAPTERS (CONTRACT §11 A11).
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIN, baseEnv, tmp } from '../helpers.mjs';
import { gateRowLine } from '../../src/gate-results.mjs';

export const G2 = path.dirname(fileURLToPath(import.meta.url));
export const STUB_ADAPTERS = path.join(G2, 'fixtures', 'stub-runner');
export const NORMAL = { pressure: 'normal', total_mb: 10000, avail_mb: 9000, swap_used_mb: 0, swapout_mb_per_s: 0 };
export const NEVER = { always_run: ['src/file-01.spec.js'], never_reuse: ['src/file-02.spec.js'] };
export const LINE_RE = /^\[(COMPOSED|FRESH|FAIL) [a-z]+: .*\] run=g-\d{8}T\d{6}Z-[0-9a-f]{4}( · for WORKING TREE \(dirty\), not [0-9a-f]{12})?$/;

export function fileName(n) {
  return 'src/file-' + String(n).padStart(2, '0') + '.spec.js';
}

function git(dir, env, args) {
  return cp.execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// opts: {n: 30, beh: {[file]: object}, files: {[path]: content}, never: NEVER | null, gates: {...}, globalGates: {...}}
export function stubRepo(t, opts) {
  const o = opts || {};
  const dir = tmp('dit-g2-repo-');
  const home = tmp('dit-g2-home-');
  const aux = tmp('dit-g2-aux-');
  const env0 = baseEnv(home);
  git(dir, env0, ['init', '-q', '-b', 'main']);
  git(dir, env0, ['config', 'user.email', 't@example.com']);
  git(dir, env0, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.do-it/\nnode_modules/\n');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  const n = o.n === undefined ? 30 : o.n;
  for (let i = 1; i <= n; i++) {
    const f = fileName(i);
    fs.writeFileSync(path.join(dir, f), JSON.stringify({ result: 'pass', ...((o.beh && o.beh[f]) || {}) }) + '\n');
  }
  for (const [p, c] of Object.entries(o.files || {})) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), typeof c === 'string' ? c : JSON.stringify(c) + '\n');
  }
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', '.package-lock.json'), '{"lockfileVersion":3}\n');
  git(dir, env0, ['add', '-A']);
  git(dir, env0, ['commit', '-q', '-m', 'fixture']);
  const reuse = o.never === null ? {} : { ...(o.never || NEVER) };
  const gates = { reuse, ...(o.gates || {}) };
  fs.mkdirSync(path.join(dir, '.do-it'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.do-it', 'settings.json'), JSON.stringify({ gates }, null, 2));
  if (o.globalGates) {
    fs.mkdirSync(path.join(home, '.do-it'), { recursive: true });
    fs.writeFileSync(path.join(home, '.do-it', 'settings.json'), JSON.stringify({ gates: o.globalGates }, null, 2));
  }
  const signals = path.join(home, 'signals.json');
  fs.writeFileSync(signals, JSON.stringify(o.signals || NORMAL));
  const env = {
    ...env0,
    DO_IT_GATE_SIGNALS: signals,
    DO_IT_GATE_ADAPTERS: STUB_ADAPTERS,
    GATE_FIXTURE_LOG: path.join(aux, 'stub-log.jsonl'),
    GATE_FIXTURE_STATE: path.join(aux, 'state'),
    GATE_FIXTURE_FLAG: path.join(aux, 'flag'),
  };
  const repo = { dir, home, aux, env, store: path.join(dir, '.git', 'do-it', 'gate-results') };
  repo.rowsFile = path.join(repo.store, 'results.jsonl');
  if (t) t.after(() => cleanup(repo));
  return repo;
}

export function cleanup(repo) {
  for (const d of [repo.dir, repo.home, repo.aux]) { try { fs.chmodSync(path.join(repo.store, 'results.jsonl'), 0o644); } catch { /* absent */ } fs.rmSync(d, { recursive: true, force: true }); }
}

export function writeBeh(repo, file, beh, commit) {
  fs.writeFileSync(path.join(repo.dir, file), JSON.stringify(beh) + '\n');
  if (commit !== false) { git(repo.dir, repo.env, ['add', '-A']); git(repo.dir, repo.env, ['commit', '-q', '-m', 'edit ' + file]); }
}

export function commitAll(repo, msg) {
  git(repo.dir, repo.env, ['add', '-A']);
  git(repo.dir, repo.env, ['commit', '-q', '-m', msg || 'edit']);
}

export function headSha(repo) {
  return git(repo.dir, repo.env, ['rev-parse', 'HEAD']).trim();
}

// Runs the built bundle. json: true adds --json and parses the last stdout line.
export function gate(repo, args, opts) {
  const o = opts || {};
  const json = o.json !== false;
  const cut = args.indexOf('--');
  const full = !json ? args : cut === -1 ? [...args, '--json'] : [...args.slice(0, cut), '--json', ...args.slice(cut)];
  const r = cp.spawnSync(process.execPath, [BIN, ...full], {
    cwd: o.cwd || repo.dir, env: { ...repo.env, ...(o.env || {}) }, encoding: 'utf8', timeout: o.timeout || 180000,
  });
  let out = null;
  if (json) {
    const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
    try { out = JSON.parse(lines[lines.length - 1]); } catch { out = null; }
  }
  return { code: r.status, signal: r.signal, out, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// `gate run` with the stub runner; extra = args after the defaults, pass = passthrough argv after `--`.
export function run(repo, extra, opts) {
  const o = opts || {};
  const args = ['gate', 'run', '--scope', o.scope || 'push', '--runner', o.runner || 'stub', ...(extra || [])];
  if (o.pass) args.push('--', ...o.pass);
  return gate(repo, args, o);
}

export function log(repo) {
  try { return fs.readFileSync(repo.env.GATE_FIXTURE_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function starts(repo) {
  return log(repo).filter((e) => e.event === 'start');
}

export function lastStart(repo) {
  const s = starts(repo);
  return s[s.length - 1] || null;
}

export function rows(repo) {
  try { return fs.readFileSync(repo.rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { corrupt: l }; } }); } catch { return []; }
}

export function finishes(repo, runId) {
  return rows(repo).filter((r) => r.type === 'finish' && (!runId || r.run_id === runId));
}

export function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(fileName(i));
  return out;
}

export function isoAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

let plantSeq = 0;
export function plantRunId(atIso) {
  const d = atIso;
  plantSeq = (plantSeq + 1) % 65536;
  return 'g-' + d.slice(0, 4) + d.slice(5, 7) + d.slice(8, 10) + 'T' + d.slice(11, 13) + d.slice(14, 16) + d.slice(17, 19) + 'Z-' + plantSeq.toString(16).padStart(4, '0');
}

export function line(row) {
  return gateRowLine(row);
}

// Re-plant harvested finish rows (current keys and components) as a run of their own at `at`.
// opts: {files, at, runEnd: true | {tainted, verdict}, pid, pid_start, result, clean, leg}
export function plantRun(harvest, opts) {
  const o = opts || {};
  const at = o.at || new Date().toISOString();
  const runId = o.runId || plantRunId(at);
  const out = [];
  out.push(line({ type: 'run_start', run_id: runId, at, leg: o.leg || 'unit', scope: o.scope || 'push', clean: !!o.clean, tree_dirty: false, pid: o.pid || 999999, pid_start: o.pid_start === undefined ? null : o.pid_start }));
  for (const f of o.files) {
    const h = harvest.get(f);
    if (!h) throw new Error('no harvested row for ' + f);
    const res = (o.results && o.results[f]) || o.result || 'PASS';
    const counts = res === 'PASS' ? { passed: 1, failed: 0, skipped: 0, pending: 0 } : res === 'FAIL' ? { passed: 0, failed: 1, skipped: 0, pending: 0 } : { passed: 0, failed: 0, skipped: 1, pending: 0 };
    const r = { type: 'finish', run_id: runId, at, file: f, leg: o.leg || 'unit', scope: o.scope || 'push', key: (o.keys && o.keys[f]) || h.key, result: res, retried: false, counts, exec_error: false, duration_ms: 1, failure_ref: null, clean: !!o.clean };
    if (h.components) r.components = h.components;
    out.push(line(r));
  }
  if (o.runEnd !== false) {
    const e = o.runEnd && typeof o.runEnd === 'object' ? o.runEnd : {};
    out.push(line({ type: 'run_end', run_id: runId, at, leg: o.leg || 'unit', scope: o.scope || 'push', clean: !!o.clean, tree_dirty: false, tainted: !!e.tainted, reason: e.reason || null, verdict: e.verdict || 'GATE_PASS_FRESH' }));
  }
  if (o.cleanRow) out.push(line({ type: 'clean', run_id: runId, at: o.cleanAt || at, leg: o.leg || 'unit', scope: o.scope || 'push' }));
  return { runId, lines: out };
}

export function harvest(repo, runId) {
  const m = new Map();
  for (const r of finishes(repo, runId)) m.set(r.file, { key: r.key, components: r.components });
  return m;
}

export function writeStore(repo, lines) {
  fs.mkdirSync(repo.store, { recursive: true });
  fs.writeFileSync(repo.rowsFile, lines.length ? lines.join('\n') + '\n' : '');
}

export function appendStore(repo, lines) {
  fs.appendFileSync(repo.rowsFile, lines.join('\n') + '\n');
}

export function lsTree(dir) {
  const out = [];
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}
