// Test helpers of the adapters lane (epic A1): fixture repository, run directory and manifest writer, jest driver,
// DO_IT_REAL_JEST locator and cleanup. Pilot data comes only from env (X3); nothing here names a consumer.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_FP_WIDE_NODE, gateFpManifestBuild, gateFpManifestWrite, gateFpRunDir, gateFpSpine } from '../../spine/src/gate-fingerprint.mjs';
import { gateStoreAppend } from '../../spine/src/gate-results.mjs';
import { gateProcStart } from '../../spine/src/gate-signals.mjs';
import { gateVerdictSpineComponents, gateVerdictSpineDump } from '../../spine/src/gate-verdict.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GATES_DIR = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(GATES_DIR, '..', '..');
export const ADAPTERS = path.join(GATES_DIR, 'adapters');
export const JEST_ADAPTER = path.join(ADAPTERS, 'jest');
export const REPORTER = path.join(JEST_ADAPTER, 'reporter.cjs');
export const FILTER = path.join(JEST_ADAPTER, 'filter.cjs');
export const CLOSURE = path.join(JEST_ADAPTER, 'closure.cjs');
export const COMMON = path.join(JEST_ADAPTER, 'common.cjs');
export const FIXTURE = path.join(HERE, 'fixtures', 'jest-30');
export const CLOSURE_DRIVER = path.join(HERE, 'jest', 'closure-driver.cjs');
export const FAKE_DECIDE = path.join(HERE, 'fake-decide.mjs');
export const FAKE_DECIDE_CMD = JSON.stringify([process.execPath, FAKE_DECIDE, 'gate', 'decide']);
export const DECIDE_COUNT = path.join(HERE, 'decide-count.mjs');

// The decide a harness run calls. A1_DECIDE_ENTRY (JSON argv of the real `do-it gate decide`) runs the real command
// through a call counter. The stand-in's failure-injection modes (FAKE_DECIDE_MODE: exit1, sleep, malformed, nofile,
// fixed) have no real equivalent, so a run that sets one stays on fake-decide.mjs.
export function decideCmd(env) {
  if (process.env.A1_DECIDE_ENTRY && !(env && env.FAKE_DECIDE_MODE)) return JSON.stringify([process.execPath, DECIDE_COUNT]);
  return FAKE_DECIDE_CMD;
}
export const SPINE_SRC = path.join(REPO_ROOT, 'core', 'spine', 'src');
export const GOLDEN_ROW = path.join(REPO_ROOT, 'core', 'spine', 'test', 'g1', 'fixtures');

// == temp dirs and children ==
const made = [];
const children = new Set();
export function tmpDir(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'a1-')));
  made.push(d);
  return d;
}
export function trackDir(d) {
  made.push(d);
  return d;
}
export function cleanup() {
  for (const c of children) { try { process.kill(c, 'SIGKILL'); } catch { /* gone */ } }
  children.clear();
  while (made.length) {
    try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// == the real runner (A11) ==
// DO_IT_REAL_JEST is a jest binary or a directory whose node_modules holds jest. => {bin, nodeModules} | null.
export function realJest() {
  const v = process.env.DO_IT_REAL_JEST;
  if (!v) return null;
  try {
    let bin = v;
    if (fs.statSync(v).isDirectory()) bin = path.join(v, 'node_modules', '.bin', 'jest');
    const real = fs.realpathSync(bin);
    const i = real.lastIndexOf(path.sep + 'node_modules' + path.sep);
    if (i < 0) return null;
    return { bin: real, nodeModules: real.slice(0, i) + path.sep + 'node_modules' };
  } catch {
    return null;
  }
}

// A [REAL] case without its runner reports IMPLEMENTED-NOT-VERIFIED and skips: never a pass (CONTRACT §7).
export function needReal(t) {
  const r = realJest();
  if (r) return r;
  const msg = 'IMPLEMENTED-NOT-VERIFIED: DO_IT_REAL_JEST is unset or its target is missing';
  process.stdout.write(msg + '\n');
  t.skip(msg);
  return null;
}

// == git repositories ==
export function gitEnv(home) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_') || k.startsWith('GIT_') || k.startsWith('FAKE_') || k.startsWith('FIXTURE_')) delete env[k];
  env.HOME = home;
  env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  return env;
}

export function mkRepo(files, o) {
  const dir = tmpDir('a1-repo-');
  const home = tmpDir('a1-home-');
  const env = gitEnv(home);
  const git = (...args) => cp.execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'core.autocrlf', 'false');
  for (const [rel, content] of Object.entries(files || {})) write({ dir }, rel, content);
  if (o && o.fixture) fs.cpSync(o.fixture, dir, { recursive: true });
  if (o && o.nodeModules) fs.symlinkSync(o.nodeModules, path.join(dir, 'node_modules'));
  write({ dir }, '.gitignore', 'node_modules\n.jest-cache\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  const store = path.join(tmpDir('a1-store-'), 'gate-results');
  return { dir, home, env, git, store };
}

export function write(repo, rel, content) {
  const f = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

export function mkFixtureRepo(real) {
  const repo = mkRepo({}, { fixture: FIXTURE, nodeModules: real.nodeModules });
  repo.cache = tmpDir('a1-jestcache-');
  return repo;
}

// == run ids, run directory, manifest ==
export function newRunId() {
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return 'g-' + t + '-' + crypto.randomBytes(2).toString('hex');
}

// Writes {os.tmpdir()}/do-it-gate-{run_id}/manifest.json with the spine's own builder (F1) over the repository.
export function mkManifest(repo, o) {
  const opts = o || {};
  const runId = opts.runId || newRunId();
  const spine = gateFpSpine({
    repo: repo.dir, runner: 'jest', env: repo.env, store: { backend: 'local', dir: repo.store }, adaptersDir: ADAPTERS,
    reuse: { always_run: opts.alwaysRun || [], never_reuse: [], env: opts.envNames || [], env_files: opts.envFiles || [], core: [] },
    argv: opts.argv || [], log: () => {},
  });
  if (spine.reason) throw new Error('spine unavailable: ' + spine.reason);
  const runDir = gateFpRunDir(runId);
  fs.mkdirSync(runDir, { recursive: true });
  trackDir(runDir);
  const manifest = gateFpManifestBuild(spine, { run_id: runId, scope: opts.scope || 'push', leg: opts.leg || 'unit', clean: !!opts.clean, argv: opts.argv || [], store_dir: repo.store });
  gateFpManifestWrite(runDir, manifest);
  // spine.json exactly as `gate run` writes it (V1): the real decide reads the spine from here, never from the adapter
  fs.writeFileSync(path.join(runDir, 'spine.json'), JSON.stringify({
    schema: 'do-it-gate-spine-run/1', owner: { pid: process.pid, pid_start: null }, run_id: runId, phase: 'main',
    scope: opts.scope || 'push', leg: opts.leg || 'unit', clean: !!opts.clean, resume: !!opts.resume, runner: 'jest',
    runner_version: null, argv: opts.argv || [], store_dir: repo.store, repo: spine.repo, solo: [], spine: gateVerdictSpineDump(spine),
  }));
  return { runId, runDir, manifest, spine, manifestFile: path.join(runDir, 'manifest.json'), components: gateVerdictSpineComponents(spine) };
}

export function storeHandle(repo) {
  return { backend: 'local', dir: repo.store };
}

export function storeRows(repo) {
  try {
    return fs.readFileSync(path.join(repo.store, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function appendRow(repo, row) {
  return gateStoreAppend(storeHandle(repo), row);
}

export function nowIso() {
  return new Date().toISOString();
}

// == the jest driver ==
export async function waitFor(fn, ms, what) {
  const end = Date.now() + (ms || 60000);
  for (;;) {
    if (fn()) return true;
    if (Date.now() > end) throw new Error('timed out waiting for ' + (what || 'condition'));
    await new Promise((r) => setTimeout(r, 15));
  }
}

// o: {real, paths, args, planted, resume, clean, env, runId, killWhen(runCtx), alwaysRun}
// => {code, signal, killed, stdout, stderr, runId, runDir, report, keys, runList, selected, decideCalls, rows(), finishes()}
export async function runJest(repo, o) {
  const opts = o || {};
  const m = mkManifest(repo, { runId: opts.runId, clean: opts.clean, resume: opts.resume, alwaysRun: opts.alwaysRun === undefined ? ['test/guards/**'] : opts.alwaysRun, argv: opts.args || [] });
  const callsFile = path.join(m.runDir, 'decide-calls');
  const argv = [
    ...(opts.paths || []), ...(opts.paths ? ['--runTestsByPath'] : []),
    '--ci', '--silent', '--passWithNoTests', '--filter=' + FILTER, '--reporters=' + REPORTER, ...(opts.args || []),
  ];
  const env = {
    ...gitEnv(repo.home),
    DO_IT_GATE_MANIFEST: m.manifestFile, DO_IT_GATE_DECIDE: decideCmd(opts.env), A1_DECIDE_ENTRY: process.env.A1_DECIDE_ENTRY || '', FAKE_DECIDE_COUNT_FILE: callsFile,
    FIXTURE_JEST_CACHE: repo.cache, ...(opts.planted ? { FIXTURE_PLANTED: '1' } : {}), ...(opts.resume ? { FAKE_DECIDE_RESUME: '1' } : {}),
    ...(opts.env || {}),
  };
  const child = cp.spawn(process.execPath, [opts.real.bin, ...argv], { cwd: repo.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child.pid);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  appendRow(repo, {
    schema: 'do-it-gate-result/1', type: 'run_start', run_id: m.runId, at: nowIso(), scope: 'push', leg: 'unit',
    pid: child.pid, pid_start: gateProcStart(child.pid), clean: !!opts.clean, components: m.components,
  });
  const ctx = { ...m, repo, child, rows: () => storeRows(repo).filter((r) => r.run_id === m.runId) };
  let killed = false;
  const guard = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* done */ } }, opts.timeoutMs || 240000);
  if (opts.killWhen) {
    await waitFor(() => opts.killWhen(ctx), opts.timeoutMs || 240000, 'kill condition');
    killed = true;
    child.kill('SIGKILL');
  }
  const { code, signal } = await exited;
  clearTimeout(guard);
  children.delete(child.pid);
  const report = readJson(path.join(m.runDir, 'runner-report.json'));
  if (!killed) {
    appendRow(repo, {
      schema: 'do-it-gate-result/1', type: 'run_end', run_id: m.runId, at: nowIso(), scope: 'push', leg: 'unit',
      tainted: !!(report && report.tainted), reason: report && report.reason ? report.reason : null,
      verdict: code === 0 ? 'GATE_PASS_FRESH' : 'GATE_FAIL',
    });
  }
  let calls = 0;
  try { calls = fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).length; } catch { calls = 0; }
  const rows = ctx.rows();
  return {
    code, signal, killed, stdout, stderr, runId: m.runId, runDir: m.runDir, report,
    keys: readJson(path.join(m.runDir, 'keys.json')), runList: readJson(path.join(m.runDir, 'run-list.json')),
    selected: readJson(path.join(m.runDir, 'selected.json')), decideCalls: calls, rows,
    finishes: rows.filter((r) => r.type === 'finish'), starts: rows.filter((r) => r.type === 'start'),
  };
}

export function runListFiles(res) {
  const l = res.runList;
  const list = Array.isArray(l) ? l : l && l.files ? l.files : [];
  return list.map((e) => (typeof e === 'string' ? e : e.file)).sort();
}

export function finishFiles(res) {
  return res.finishes.map((r) => r.file).sort();
}

export const SPECS = ['test/guards/g1.spec.ts', 'test/guards/g2.spec.ts', ...Array.from({ length: 28 }, (_, i) => 'test/s' + String(i + 1).padStart(2, '0') + '.spec.ts')];
export const sNN = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'test/s' + String(a + i).padStart(2, '0') + '.spec.ts');

// == synthetic runs (no jest process): a small repo, keys.json by hand, reporter driven through its hooks ==
export function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function synthKeys(repo, m, files, extra) {
  const keys = {
    schema: 'rtg-keys/1', run_id: m.runId, runner: { name: 'jest', version: '29.7.0', argv: ['--ci'] },
    files: files.map((f) => ({ file: f, class: 'NARROW', deps: [{ path: f, sha256: sha256Of(path.join(repo.dir, f)) }], unknown: false, unresolved: 0 })),
    errors: [], ...(extra || {}),
  };
  fs.writeFileSync(path.join(m.runDir, 'keys.json'), JSON.stringify(keys));
  return keys;
}

export function testResult(o) {
  return {
    testExecError: null, numFailingTests: 0, failureMessage: null, numPassingTests: 1, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ invocations: 1 }], perfStats: { start: 0, end: 12, runtime: 12 }, ...(o || {}),
  };
}

export function walkFiles(dir) {
  const out = [];
  const go = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p); else out.push(p);
    }
  };
  try { go(dir); } catch { /* absent */ }
  return out;
}

// == fakes for closure and filter tests ==
export function fakeResolver(throwing) {
  return {
    isCoreModule: () => false,
    getMockModule: () => null,
    resolveModule(from, spec) {
      if (throwing) throw new Error('resolver crashed');
      const nf = () => Object.assign(new Error('Cannot find module ' + spec), { code: 'MODULE_NOT_FOUND' });
      if (!spec.startsWith('.')) throw nf();
      const base = path.resolve(path.dirname(from), spec);
      for (const ext of ['', '.js', '.ts']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
      throw nf();
    },
  };
}

export function minimalManifest(dir, extra) {
  const m = {
    schema: 'rtg-manifest/1', run_id: 'g-20261106T130657Z-7ff2', scope: 'push', leg: 'unit', clean: false, runner: 'jest', lines: [],
    components: {}, hashes: {}, wide_patterns: { node: GATE_FP_WIDE_NODE, python: 'x' }, wide_hits: [], wide_all: false,
    tree: 'a'.repeat(64), dirty: [], never: [], env_names: [], env_files: [], ...(extra || {}),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  return m;
}

