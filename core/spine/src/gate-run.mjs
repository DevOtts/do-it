import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { BULK_READ_CAP, atomicWriteJson, readJsonRegular } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { loadSettings } from './settings.mjs';
import { gateStoreAppend, gateStoreLiveRuns, gateStoreOpen, gateStoreScan } from './gate-results.mjs';
import { gateFpComponentsWrite, gateFpManifestBuild, gateFpRunDir, gateFpSpine } from './gate-fingerprint.mjs';
import { gateQueueAdmit, gateQueueHeldBySelf } from './gate-queue.mjs';
import { gateProcStart } from './gate-signals.mjs';
import {
  GATE_VERDICT_SCOPES, gateVerdictAfter, gateVerdictCompose, gateVerdictLine, gateVerdictMirrorRows, gateVerdictReadJson,
  gateVerdictRemoveDir, gateVerdictSpineComponents, gateVerdictSpineDump, gateVerdictWriteView,
} from './gate-verdict.mjs';

// `do-it gate run` (resumable test gates, epics V1 and V2; PRD-2 D1-D3, D11-D14, D16, D20; CONTRACT §3, §8 M2,
// §11 A1, A4, A7-A9, A14). Run-free: never selects a do-it run and needs no .do-it/ directory.
// M2: QUEUED -> ADMITTED -> SELECTING -> RUNNING -> COMPOSING -> PASSED | FAILED; RUNNING -> INTERRUPTED.

export const GATE_RUN_EXIT = { GATE_PASS_COMPOSED: 0, GATE_PASS_FRESH: 0, GATE_FAIL: 1, GATE_INTERRUPTED: 3, GATE_WAIT_TIMEOUT: 3, GATE_QUEUE_REJECTED: 1 };
export const GATE_RUN_STATE = { GATE_PASS_COMPOSED: 'PASSED', GATE_PASS_FRESH: 'PASSED', GATE_FAIL: 'FAILED', GATE_INTERRUPTED: 'INTERRUPTED', GATE_WAIT_TIMEOUT: 'WAIT_TIMEOUT', GATE_QUEUE_REJECTED: 'REJECTED' };

// == where the bundle and the adapters live ==
export function gateRunBundlePath() {
  const self = fileURLToPath(import.meta.url);
  if (typeof EMBEDDED_SCHEMAS !== 'undefined') return self;
  return path.join(path.dirname(self), '..', 'do-it.mjs');
}

// DO_IT_GATE_ADAPTERS (test switch, A11) replaces the built-in directory; else beside the bundle (plugin
// scripts/../gates/adapters, repo core/spine/../gates/adapters) or beside the sources (src/../../gates/adapters).
export function gateRunAdaptersDir(ctx) {
  if (ctx.env.DO_IT_GATE_ADAPTERS) return path.resolve(ctx.cwd, ctx.env.DO_IT_GATE_ADAPTERS);
  const self = fileURLToPath(import.meta.url);
  if (typeof EMBEDDED_SCHEMAS !== 'undefined') return path.join(path.dirname(self), '..', 'gates', 'adapters');
  return path.join(path.dirname(self), '..', '..', 'gates', 'adapters');
}

// Descriptor `{adaptersDir}/{runner}/adapter.json` (A2): {runner, files[], command[], inject[], solo[], version}.
// A missing descriptor, an unreadable one or an absent declared file is "no adapter" (CONTRACT §6).
export function gateRunDescriptor(ctx, runner) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(runner)) return { missing: 'runner name' };
  const root = gateRunAdaptersDir(ctx);
  const dir = path.join(root, runner);
  let desc;
  try { desc = readJsonRegular(path.join(dir, 'adapter.json'), 1024 * 1024); } catch { return { missing: 'descriptor unreadable', root }; }
  if (!desc || typeof desc !== 'object') return { missing: 'no descriptor', root };
  for (const f of Array.isArray(desc.files) ? desc.files : []) {
    if (typeof f !== 'string' || f.includes('..') || !fs.existsSync(path.join(dir, f))) return { missing: 'adapter file absent: ' + f, root };
  }
  return { root, dir, desc };
}

function gateRunSubst(list, dir) {
  return (Array.isArray(list) ? list : []).map((a) => String(a).split('{adapter}').join(dir).split('{node}').join(process.execPath));
}

// The command: a passthrough whose first token is not an option is the whole command; otherwise the descriptor's
// command comes first. The descriptor's inject argv is appended (selection hook, reporter, manifest channel).
export function gateRunCommand(found, passthrough, extra) {
  const p = passthrough || [];
  const base = p.length && !String(p[0]).startsWith('-') ? p.slice() : [...gateRunSubst(found.desc.command, found.dir), ...p];
  return [...base, ...gateRunSubst(found.desc.inject, found.dir), ...(extra || [])];
}

// == run ids (D13) ==
export function gateRunNewId(taken) {
  for (let i = 0; i < 16; i++) {
    const d = new Date().toISOString();
    const id = 'g-' + d.slice(0, 4) + d.slice(5, 7) + d.slice(8, 10) + 'T' + d.slice(11, 13) + d.slice(14, 16) + d.slice(17, 19) + 'Z-' + crypto.randomBytes(2).toString('hex');
    if (!taken || !taken.has(id)) return id;
  }
  throw fail('INTERNAL_ERROR', 1, { message: 'no free gate run id after 16 draws' });
}

// == git: dirty tree (D11, R11, G-9) ==
function gateRunGit(repo, args, env) {
  try {
    return cp.execFileSync('git', args, { cwd: repo, env: { ...env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  } catch {
    return null;
  }
}

export function gateRunPorcelain(repo, env) {
  const out = gateRunGit(repo, ['status', '--porcelain=v1', '--untracked-files=normal', '-z'], env);
  if (out === null) return null;
  const parts = out.toString('utf8').split('\0');
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    paths.push(rec.slice(3));
    if (xy[0] === 'R' || xy[0] === 'C') { if (parts[i + 1]) paths.push(parts[i + 1]); i++; }
  }
  return paths;
}

export function gateRunHead(repo, env) {
  const out = gateRunGit(repo, ['rev-parse', '--verify', '-q', 'HEAD'], env);
  const s = out ? out.toString('utf8').trim() : '';
  return /^[0-9a-f]{40,64}$/.test(s) ? s : null;
}

function gateRunRelevant(paths, relevant) {
  if (paths === null) return true;
  const hit = (p) => {
    if (p.startsWith('.do-it/')) return false;
    if (!relevant) return true;
    if (relevant.has(p)) return true;
    if (p.endsWith('/')) { for (const r of relevant) if (r.startsWith(p)) return true; }
    return false;
  };
  return paths.some(hit);
}

// == running the runner ==
// stdout of the runner goes to our stderr: stdout carries exactly one verdict line (D8).
function gateRunSpawn(argv, opts, sig) {
  return new Promise((resolve) => {
    let child;
    let done = false;
    const finish = (r) => { if (!done) { done = true; sig.child = null; resolve(r); } };
    try {
      child = cp.spawn(argv[0], argv.slice(1), { cwd: opts.cwd, env: opts.env, stdio: ['ignore', 2, 2] });
    } catch (e) {
      finish({ exit: 127, signal: null, startError: (e && e.code) || 'error' });
      return;
    }
    sig.child = child;
    child.on('error', (e) => {
      if (child.pid === undefined || (e && (e.code === 'ENOENT' || e.code === 'EACCES'))) finish({ exit: 127, signal: null, startError: (e && e.code) || 'error' });
    });
    child.on('exit', (code, signal) => finish({ exit: code, signal: signal || null, startError: null }));
  });
}

// SIGINT/SIGTERM/SIGHUP while the runner runs: forward to it and record the run as INTERRUPTED (M2).
function gateRunTrap() {
  const sig = { child: null, got: null, handlers: [] };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const h = () => {
      sig.got = sig.got || s;
      if (sig.child) { try { sig.child.kill(s); } catch { /* gone */ } }
    };
    process.on(s, h);
    sig.handlers.push([s, h]);
  }
  sig.untrap = () => { for (const [s, h] of sig.handlers) process.removeListener(s, h); sig.handlers = []; };
  return sig;
}

// manifest.json (A1, F1's builder and schema). A descriptor-registered runner outside the schema's runner enum (the
// test stub) is validated under the nearest listed name and written with its own name (proposed amendment V1-b).
function gateRunWriteManifest(runDir, manifest) {
  const schema = loadSchemaFile('gate-manifest.1.schema.json');
  const enumOk = schema.properties && schema.properties.runner && Array.isArray(schema.properties.runner.enum) ? schema.properties.runner.enum : [];
  const probe = enumOk.includes(manifest.runner) ? manifest : { ...manifest, runner: enumOk[0] };
  const errors = validateSchema(schema, probe);
  if (errors.length) throw fail('GATE_MANIFEST_INVALID', 1, { errors: errors.map((e) => e.pointer + ' ' + e.message) });
  atomicWriteJson(path.join(runDir, 'manifest.json'), manifest, { cap: BULK_READ_CAP });
}

function gateRunMinimalManifest(spine, run) {
  return {
    schema: 'rtg-manifest/1', run_id: run.run_id, scope: run.scope, leg: run.leg, clean: !!run.clean, runner: run.runner,
    lines: [], components: {}, hashes: {}, wide_patterns: { node: '', python: '' }, wide_hits: [], wide_all: true,
    tree: sha256Bytes('rtg-tree/1\n'), dirty: [], never: run.never || [], env_names: [], env_files: [], platform_expect: null,
    store_dir: run.store_dir, reason: (spine && spine.reason) || 'fingerprint-error',
  };
}

function gateRunReadKeys(runDir) {
  const r = gateVerdictReadJson(path.join(runDir, 'keys.json'), BULK_READ_CAP);
  const v = r.value;
  if (!v || typeof v !== 'object' || !Array.isArray(v.files)) return null;
  return v;
}

// == sweep of run directories left by a killed gate run (SIGKILL leaves no chance to remove them) ==
// Removes {tmpdir}/do-it-gate-{run_id}/ only when spine.json names an owner that is provably gone: the pid answers
// ESRCH, or it answers but its start time differs from the recorded one. Unsure (no owner, unreadable, EPERM, no
// start time to compare) keeps the directory.
export function gateRunSweep(ownRunId) {
  const root = path.dirname(gateFpRunDir('g-00000000T000000Z-0000'));
  let names = [];
  try { names = fs.readdirSync(root); } catch { return 0; }
  let removed = 0;
  for (const n of names) {
    const m = /^do-it-gate-(g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4})$/.exec(n);
    if (!m || m[1] === ownRunId) continue;
    const dir = path.join(root, n);
    const sp = gateVerdictReadJson(path.join(dir, 'spine.json'), BULK_READ_CAP).value;
    const owner = sp && sp.owner;
    if (!owner || !Number.isInteger(owner.pid) || owner.pid <= 0) continue;
    let dead = false;
    try {
      process.kill(owner.pid, 0);
    } catch (e) {
      dead = !!e && e.code === 'ESRCH';
    }
    if (!dead && typeof owner.pid_start === 'string' && owner.pid_start) {
      let now = null;
      try { now = gateProcStart(owner.pid); } catch { now = null; }
      if (typeof now === 'string' && now && now !== owner.pid_start) dead = true;
    }
    if (!dead) continue;
    gateVerdictRemoveDir(dir);
    removed++;
  }
  return removed;
}

// == validation of the command line (D1, A7, A9) ==
export function gateRunArgs(ctx, args) {
  const f = args.flags;
  const inherited = ctx.env.DO_IT_GATE_SCOPE === 'nightly';
  const warnings = [];
  if (f.resume === true && f.clean === true) throw fail('USAGE', 1, { message: 'gate run: --resume and --clean exclude each other' });
  if (typeof f.runner !== 'string' || !f.runner) throw fail('USAGE', 1, { message: 'gate run requires --runner R' });
  let scope = f.scope;
  if (scope !== undefined && (typeof scope !== 'string' || !GATE_VERDICT_SCOPES.includes(scope))) throw fail('USAGE', 1, { message: 'gate run: --scope must be one of ' + GATE_VERDICT_SCOPES.join(', ') });
  if (scope === undefined && !inherited) throw fail('USAGE', 1, { message: 'gate run requires --scope S (' + GATE_VERDICT_SCOPES.join(', ') + ')' });
  const leg = f.leg === undefined ? 'unit' : f.leg;
  if (typeof leg !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(leg)) throw fail('USAGE', 1, { message: 'gate run: --leg must match [A-Za-z0-9_.:-]+' });
  if (!inherited && scope === 'nightly' && f.resume === true) throw fail('USAGE', 1, { message: 'gate run: a nightly run is clean; --resume is refused' });
  let clean = f.clean === true || scope === 'nightly';
  let resume = f.resume === true;
  if (inherited) {
    // A9: an inherited DO_IT_GATE_SCOPE=nightly runs clean whatever the flags (G-5)
    scope = 'nightly';
    if (f.clean !== true) warnings.push('DO_IT_GATE_SCOPE=nightly: running clean; add --clean to the gates.nightly command');
    clean = true;
    resume = false;
  }
  return { scope, leg, runner: f.runner, clean, resume, warnings, passthrough: Array.isArray(args.passthrough) ? args.passthrough.map(String) : [] };
}

// == entry ==
export async function gateRunCmd(ctx, args) {
  const a = gateRunArgs(ctx, args);
  const settings = loadSettings(ctx, args.sets);
  const gates = settings.values.gates || {};
  const found = gateRunDescriptor(ctx, a.runner);
  const label = path.basename(ctx.repo || ctx.cwd) + ':' + a.scope + ':' + a.leg;
  // QUEUED -> ADMITTED (D3, G-10): inherited from a live holder above us, else self-admission in process
  let admission = 'inherited';
  let admitted = null;
  if (!gateQueueHeldBySelf(ctx)) {
    admission = 'self';
    const said = [];
    const qctx = {
      ...ctx,
      stderrWrite: (s) => {
        process.stderr.write(s);
        const line = String(s).replace(/\n+$/, '');
        if (/^\[(WAIT-TIMEOUT|REJECTED)\]/.test(line)) said.push(line);
      },
    };
    const res = await gateQueueAdmit(qctx, { peakMb: gates.peak_mb == null ? null : gates.peak_mb, label, timeoutS: null });
    if (res.outcome !== 'GATE_QUEUE_ADMITTED') {
      const outcome = res.outcome;
      return {
        outcome, exit: typeof res.exit === 'number' ? res.exit : (GATE_RUN_EXIT[outcome] === undefined ? 1 : GATE_RUN_EXIT[outcome]),
        state: GATE_RUN_STATE[outcome] || outcome, scope: a.scope, leg: a.leg, admission, say: said, line: said[0] || null,
        warnings: a.warnings, queue: { seq: res.seq === undefined ? null : res.seq, waited_s: res.waited_s === undefined ? null : res.waited_s },
      };
    }
    admitted = res;
  }
  let result;
  try {
    result = await gateRunAdmitted(ctx, a, gates, found, admission);
  } finally {
    if (admitted) { try { admitted.release(result ? result.exit : 1); } catch { /* the holder file is reclaimed by liveness */ } }
  }
  return result;
}

// CONTRACT §6, D12: no adapter means the runner runs unchanged, no rows at all, files not counted.
async function gateRunNoAdapter(ctx, a, admission, why) {
  if (!a.passthrough.length) throw fail('USAGE', 1, { message: 'gate run --runner ' + a.runner + ': no adapter (' + why + '); give the runner command after --' });
  const runId = gateRunNewId(null);
  const sig = gateRunTrap();
  let r;
  try { r = await gateRunSpawn(a.passthrough, { cwd: ctx.cwd, env: ctx.env }, sig); } finally { sig.untrap(); }
  const tail = ' · 0 reused from 0 runs (oldest none) · files not counted · reuse unavailable: no adapter] run=' + runId;
  let outcome;
  let line;
  if (r.startError) { outcome = 'GATE_FAIL'; line = '[FAIL ' + a.scope + ': runner did not start: exit 127' + tail; } else if (r.signal || sig.got) { outcome = 'GATE_INTERRUPTED'; line = '[FAIL ' + a.scope + ': interrupted (' + (r.signal || sig.got) + ')' + tail; } else if (r.exit === 0) { outcome = 'GATE_PASS_FRESH'; line = '[FRESH ' + a.scope + ': runner exit 0' + tail; } else { outcome = 'GATE_FAIL'; line = '[FAIL ' + a.scope + ': runner exited ' + r.exit + tail; }
  return {
    outcome, exit: GATE_RUN_EXIT[outcome], state: GATE_RUN_STATE[outcome], scope: a.scope, leg: a.leg, run_id: runId, line, say: [line],
    adapter: null, reuse: 'unavailable: no adapter (' + why + ')', runner_exit: r.exit, admission, warnings: a.warnings,
  };
}

async function gateRunAdmitted(ctx, a, gates, found, admission) {
  if (found.missing) return gateRunNoAdapter(ctx, a, admission, found.missing);
  const store = gateStoreOpen({ cwd: ctx.cwd, env: ctx.env });
  if (!store) return gateRunNoAdapter(ctx, a, admission, 'no git repository');
  const warnings = a.warnings.slice();
  fs.mkdirSync(store.dir, { recursive: true });
  const repo = ctx.repo;
  // SELECTING. A clean run reads no rows before COMPOSING (G-5, D16).
  let scan0 = null;
  if (!a.clean) {
    scan0 = gateStoreScan(store);
    if (scan0.source === 'unavailable') warnings.push('store unreadable: reuse disabled');
  }
  const taken = new Set(((scan0 && scan0.items) || []).filter((it) => it.ok && it.row.type === 'run_start').map((it) => it.row.run_id));
  const runId = gateRunNewId(taken);
  const reuse = gates.reuse || {};
  const spine = gateFpSpine({ repo, runner: a.runner, store, env: ctx.env, reuse, adaptersDir: found.root, argv: a.passthrough, log: (m) => process.stderr.write(m + '\n') });
  if (spine.reason) warnings.push('reuse unavailable: ' + spine.reason);
  const spineComp = spine.table ? gateVerdictSpineComponents(spine) : {};
  try { if (spine.table) gateFpComponentsWrite(store, spine); } catch { /* --why detail only */ }
  const porcelain0 = gateRunPorcelain(repo, ctx.env);
  const head = gateRunHead(repo, ctx.env);
  const dirty0 = gateRunRelevant(porcelain0, null);
  let swept = 0;
  if (!ctx.env.DO_IT_GATE_KEEP_RUN_DIR) { try { swept = gateRunSweep(runId); } catch { swept = 0; } }
  let pidStart = null;
  try { pidStart = gateProcStart(process.pid); } catch { pidStart = null; }
  const runDir = gateFpRunDir(runId);
  fs.mkdirSync(runDir, { recursive: true });
  const run = {
    owner: { pid: process.pid, pid_start: typeof pidStart === 'string' ? pidStart : null },
    schema: 'do-it-gate-spine-run/1', run_id: runId, phase: 'main', scope: a.scope, leg: a.leg, clean: a.clean, resume: a.resume,
    runner: a.runner, runner_version: typeof found.desc.version === 'string' ? found.desc.version : null, argv: a.passthrough,
    store_dir: store.dir, repo, solo: [], spine: spine.table ? gateVerdictSpineDump(spine) : { reason: spine.reason || 'fingerprint-error', never: [] },
  };
  let manifest;
  try {
    manifest = spine.table ? gateFpManifestBuild(spine, { run_id: runId, scope: a.scope, leg: a.leg, clean: a.clean, argv: a.passthrough, store_dir: store.dir }) : gateRunMinimalManifest(spine, run);
    manifest.runner = a.runner;
    gateRunWriteManifest(runDir, manifest);
  } catch (e) {
    manifest = gateRunMinimalManifest(spine, run);
    gateRunWriteManifest(runDir, manifest);
    warnings.push('reuse unavailable: manifest ' + ((e && (e.outcome || e.code)) || 'error'));
  }
  atomicWriteJson(path.join(runDir, 'spine.json'), run, { cap: BULK_READ_CAP });
  try {
    gateStoreAppend(store, {
      type: 'run_start', run_id: runId, at: new Date().toISOString(), leg: a.leg, scope: a.scope, clean: a.clean, tree_dirty: dirty0,
      pid: process.pid, pid_start: pidStart === undefined ? null : pidStart, components: spineComp,
    });
  } catch (e) {
    warnings.push('run_start not recorded: ' + ((e && (e.outcome || e.code)) || 'error'));
  }
  // RUNNING: one runner invocation (A1), then the suspect-killer solo passes (D14)
  const env = {
    ...ctx.env,
    DO_IT_GATE_MANIFEST: path.join(runDir, 'manifest.json'),
    DO_IT_GATE_DECIDE: JSON.stringify([process.execPath, gateRunBundlePath(), 'gate', 'decide']),
  };
  const sig = gateRunTrap();
  let main;
  let decision = null;
  let keysRaw = null;
  const soloKilled = new Set();
  let report = null;
  try {
    main = await gateRunSpawn(gateRunCommand(found, a.passthrough), { cwd: ctx.cwd, env }, sig);
    decision = gateVerdictReadJson(path.join(runDir, 'decision.json'), BULK_READ_CAP).value || null;
    if (decision && (decision.run_id !== runId || !Array.isArray(decision.files))) decision = null;
    keysRaw = gateRunReadKeys(runDir);
    report = gateVerdictReadJson(path.join(runDir, 'runner-report.json')).value || null;
    const interruptedMain = !!(main.signal || sig.got);
    const solo = decision ? decision.files.filter((d) => d.decision === 'solo').map((d) => d.file) : [];
    if (!interruptedMain && !main.startError) {
      for (const file of solo) {
        run.phase = 'solo';
        run.solo = [file];
        atomicWriteJson(path.join(runDir, 'spine.json'), run, { cap: BULK_READ_CAP });
        for (const n of ['run-list.json', 'decision.json']) { try { fs.unlinkSync(path.join(runDir, n)); } catch { /* absent */ } }
        const r = await gateRunSpawn(gateRunCommand(found, a.passthrough, gateRunSubst(found.desc.solo, found.dir)), { cwd: ctx.cwd, env }, sig);
        if (r.signal && !sig.got) soloKilled.add(file);
        if (sig.got) break;
      }
    }
  } finally {
    sig.untrap();
  }
  if (!decision) warnings.push('reuse unavailable: decide failed');
  // COMPOSING: re-read the store (never trust the pre-run decision as the record)
  const now = Date.now();
  const scan1 = gateStoreScan(store);
  let readable = scan1.source !== 'unavailable';
  let ownItems;
  if (readable) ownItems = scan1.items.filter((it) => it.ok && it.row.run_id === runId);
  else ownItems = gateVerdictMirrorRows(path.join(runDir, 'rows.jsonl')).filter((it) => it.row.run_id === runId);
  const fresh = new Map();
  const freshStarts = new Set();
  for (const it of ownItems) {
    const r = it.row;
    if ((r.leg || 'unit') !== a.leg) continue;
    if (r.type === 'finish' && !fresh.has(r.file)) fresh.set(r.file, r);
    if (r.type === 'start') freshStarts.add(r.file);
  }
  const otherItems = readable && !a.clean ? scan1.items.filter((it) => !(it.ok && it.row.run_id === runId)) : [];
  let liveRuns = new Set();
  if (readable && !a.clean) { liveRuns = gateStoreLiveRuns(otherItems); liveRuns.delete(runId); }
  const interrupted = !!(main.signal || sig.got);
  const keysFiles = keysRaw ? keysRaw.files.map((x) => (typeof x === 'string' ? x : x && x.file)).filter((x) => typeof x === 'string') : [];
  const v = gateVerdictCompose({
    runId, leg: a.leg, scope: a.scope, decision, keysFiles, fresh, freshStarts, soloKilled,
    runnerExit: main.exit, runnerSignal: main.signal, startFailed: !!main.startError, interrupted,
    report, reportExpected: true, items: otherItems, resume: a.resume, liveRuns, spineComp, now,
  });
  // dirty tree (D11): relevant paths changed before or after, or a fresh row keyed differently than decided
  const porcelain1 = gateRunPorcelain(repo, ctx.env);
  let relevant = null;
  if (keysRaw) {
    relevant = new Set(v.files.map((e) => e.file));
    for (const x of keysRaw.files) {
      if (!x || typeof x !== 'object') continue;
      for (const d of Array.isArray(x.deps) ? x.deps : []) relevant.add(typeof d === 'string' ? d : Array.isArray(d) ? String(d[0]) : d && d.path ? String(d.path) : '');
    }
    for (const l of (spine.core && spine.core.lines) || []) if (l[0] === 'c') relevant.add(l[1]);
  }
  let dirty = gateRunRelevant(porcelain0, relevant) || gateRunRelevant(porcelain1, relevant);
  if (decision) {
    for (const d of decision.files) {
      const row = fresh.get(d.file);
      if (row && d.key_now && row.key !== d.key_now) dirty = true;
    }
  }
  // V2: post-run folds for flaky-excluded, unstable[] (clean runs) and prior FAILs on the same key
  let after = { flaky: [], unstable: [], prior: new Map() };
  if (readable && decision) {
    after = gateVerdictAfter(scan1.items, { runId, leg: a.leg, now, tainted: v.tainted, outcome: v.outcome, liveRuns, decisionFiles: decision.files });
  } else if (a.clean && !readable) warnings.push('unstable check skipped: store unreadable');
  const listed = new Set(v.files.map((e) => e.file));
  const flakyExcluded = after.flaky.filter((f) => listed.has(f)).length;
  const verdict = { ...v, run_id: runId, scope: a.scope, flaky_excluded: flakyExcluded, dirty, head_sha: head };
  const line = gateVerdictLine(verdict);
  const outcome = v.outcome;
  // run_end (D13): if it cannot be recorded the verdict still stands; the run then has no run_end, so its rows are
  // reused only under --resume (compensation by eligibility, never by rewriting rows)
  try {
    if (ctx.env.DO_IT_FAULT === 'gate_run_end') throw fail('FAULT_INJECTED', 1, { fault: 'gate_run_end' });
    gateStoreAppend(store, {
      type: 'run_end', run_id: runId, at: new Date().toISOString(), leg: a.leg, scope: a.scope, clean: a.clean, tree_dirty: dirty,
      tainted: v.tainted, reason: v.taint_reason, verdict: outcome,
    });
  } catch {
    warnings.push('run_end not recorded');
  }
  // a completed, untainted clean run marks the TTL horizon (R9, A4); an interrupted or tainted one does not
  if (a.clean && !v.tainted && outcome !== 'GATE_INTERRUPTED') {
    try { gateStoreAppend(store, { type: 'clean', run_id: runId, at: new Date().toISOString(), leg: a.leg, scope: a.scope }); } catch { warnings.push('clean row not recorded'); }
  }
  // the quarantine view is derived; it is never read for a decision (D22)
  if (readable) {
    try { gateVerdictWriteView(store, gateStoreScan(store).items, Date.now()); } catch { /* derived */ }
  }
  // DO_IT_GATE_KEEP_RUN_DIR: do-it-internal test switch (A11 family) that keeps the run directory for decide-parity checks
  if (!ctx.env.DO_IT_GATE_KEEP_RUN_DIR) gateVerdictRemoveDir(runDir);
  const failedFiles = v.failed_files.map((x) => ({ ...x, prior_fail_on_same_key: !!after.prior.get(x.file) }));
  return {
    outcome, exit: GATE_RUN_EXIT[outcome], state: GATE_RUN_STATE[outcome], scope: a.scope, leg: a.leg, run_id: runId, line, say: [line],
    passed: v.counts.passed, total: v.counts.total, reused: v.counts.reused, ran_now: v.counts.ran, skipped: v.counts.skipped,
    flaky_excluded: flakyExcluded, source_runs: v.source_runs, oldest_reused_at: v.oldest_reused_at, resumed_from: v.resumed_from,
    failed_files: failedFiles, unstable: a.clean ? after.unstable : [], tainted: v.tainted, taint_reason: v.taint_reason,
    tree: { dirty, commit: dirty ? null : head }, admission, clean: a.clean, resume: a.resume, store: store.dir,
    runner_exit: main.exit, runner_signal: main.signal, adapter: a.runner, run_dir: ctx.env.DO_IT_GATE_KEEP_RUN_DIR ? runDir : null, swept_run_dirs: swept, warnings,
  };
}
