import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { BULK_READ_CAP, STATE_READ_CAP, atomicWrite, readJsonRegular, readRegularFile } from './fs-atomic.mjs';
import { sha256Bytes } from './hash.mjs';
import { gateFold, gatePassInvariant, gateRowParse, gateStoreLiveRuns, gateStoreOpen, gateStoreScan } from './gate-results.mjs';
import { gateFpLineText, gateKeyFor, gateNeverCompile, gateWhy } from './gate-fingerprint.mjs';

// Gate verdict (resumable test gates, epics V1 and V2; PRD-2 D4-D10, D15-D22; CONTRACT §4.3, §4.4, §11 A1, A3-A5).
// The one reuse decision (`gate decide`), the composition of a verdict, the verdict line, `gate results` and the
// quarantine view. The M1 fold is L1's gateFold (A3); this module owns only what the fold does not decide: the
// NEVER set, keys.json errors, the five-component re-check, source-run eligibility inputs, the TTL horizon per leg,
// composition and the line. Every error path runs more, never less (G-1). A bare OK token is never printed (G-4).

export const GATE_VERDICT_SCOPES = ['edit', 'push', 'train', 'nightly'];
export const GATE_VERDICT_SPINE_KEYS = ['gate', 'core', 'installed', 'env', 'platform'];
export const GATE_VERDICT_DAY_MS = 86400000;

// == small helpers ==
export function gateVerdictReadJson(file, cap) {
  try {
    return { value: readJsonRegular(file, cap || STATE_READ_CAP) };
  } catch (e) {
    return { error: (e && (e.code || e.message)) || 'error' };
  }
}

export function gateVerdictMinute(at) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 'none';
  return new Date(t).toISOString().slice(0, 16) + 'Z';
}

function gateVerdictCmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// == the spine object handed from `gate run` to `gate decide` (spine.json in the run directory) ==
// The adapter-visible manifest.json is the A1 contract; spine.json is spine-private and carries exactly what
// gateKeyFor needs, so decide never re-hashes the repository and never trusts the adapter for gate, core,
// installed, env or platform (A1: the spine recomputes them).
export function gateVerdictSpineDump(spine) {
  const wide = {};
  const table = (spine && spine.table) || { hashes: {}, wide: {} };
  for (const [p, w] of Object.entries(table.wide || {})) if (w && (w[0] || w[1])) wide[p] = w;
  return {
    repo: spine.repo || null,
    runner: spine.runner || null,
    reason: spine.reason || null,
    lines: spine.lines || [],
    hashes: table.hashes || {},
    wide,
    wide_all: !!spine.wideAll,
    tree: spine.tree || null,
    core_digest: spine.core ? spine.core.digest : null,
    env_file_tokens: spine.envFileTokens ? Array.from(spine.envFileTokens.entries()) : [],
    never: spine.neverGlobs || [],
  };
}

export function gateVerdictSpineLoad(d) {
  const o = d || {};
  return {
    repo: o.repo,
    runner: o.runner,
    reason: o.reason || null,
    lines: Array.isArray(o.lines) ? o.lines : [],
    table: { hashes: o.hashes || {}, wide: o.wide || {} },
    wideHits: new Set(Object.keys(o.wide || {})),
    wideAll: !!o.wide_all,
    tree: o.tree,
    core: { digest: o.core_digest },
    envFileTokens: new Map(Array.isArray(o.env_file_tokens) ? o.env_file_tokens : []),
    neverGlobs: Array.isArray(o.never) ? o.never : [],
  };
}

// The five spine components of this run as row components (same digests gateFpComponents puts on a row).
export function gateVerdictSpineComponents(spine) {
  const out = {};
  const lines = (spine && spine.lines) || [];
  const one = (tag) => lines.find((l) => Array.isArray(l) && l[0] === tag) || null;
  if (one('gate')) out.gate = one('gate')[1];
  if (spine && spine.core && /^[0-9a-f]{64}$/.test(String(spine.core.digest || ''))) out.core = spine.core.digest;
  if (one('installed')) out.installed = one('installed')[1];
  const env = lines.filter((l) => Array.isArray(l) && l[0] === 'env').map((l) => gateFpLineText(l)).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  out.env = sha256Bytes(env.map((t) => t + '\n').join(''));
  if (one('platform')) out.platform = sha256Bytes(gateFpLineText(one('platform')));
  if (spine && /^[0-9a-f]{64}$/.test(String(spine.tree || ''))) out.tree = spine.tree;
  for (const k of Object.keys(out)) if (!/^[0-9a-f]{64}$/.test(String(out[k]))) delete out[k];
  return out;
}

// == store bucketing: one pass over the scan, then each (file, leg) fold sees only its own rows ==
// Run-level rows go to every file; a `clean` row only to its own leg (the TTL horizon is per leg, R9, §11 A4);
// a corrupt line that cannot be attributed to a file goes to every file (A5).
export function gateVerdictBucket(items) {
  const runLevel = [];
  const byFile = new Map();
  for (const it of items || []) {
    if (!it) continue;
    let file;
    if (it.ok) file = it.row.type === 'start' || it.row.type === 'finish' ? it.row.file : undefined;
    else file = it.file;
    if (file === undefined) { runLevel.push(it); continue; }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(it);
  }
  return { runLevel, byFile };
}

export function gateVerdictItemsFor(bucket, file, leg) {
  const own = bucket.byFile.get(file) || [];
  const run = bucket.runLevel.filter((it) => !(it.ok && it.row.type === 'clean' && (it.row.leg || 'unit') !== leg));
  return run.concat(own);
}

export function gateVerdictRuns(items) {
  const runs = new Map();
  for (const it of items || []) {
    if (!it || !it.ok) continue;
    const r = it.row;
    if (r.type !== 'run_start' && r.type !== 'run_end') continue;
    const run = runs.get(r.run_id) || { start: null, end: null };
    if (r.type === 'run_start' && !run.start) run.start = r;
    if (r.type === 'run_end' && !run.end) run.end = r;
    runs.set(r.run_id, run);
  }
  return runs;
}

// The finish row a fold's passRow names (the decisive PASS on the current key).
export function gateVerdictPassRow(items, fold, file, leg, key) {
  if (!fold || !fold.passRow) return null;
  for (const it of items) {
    if (!it.ok) continue;
    const r = it.row;
    if (r.type === 'finish' && r.run_id === fold.passRow.run_id && r.file === file && (r.leg || 'unit') === leg && r.key === key) return r;
  }
  return null;
}

// Independent re-check (PRD-2 D5, A1): a reusable PASS row's stored gate, core, installed, env and platform equal the
// spine's digests for this run, and a WIDE row's tree equals the current tree. Returns null when it holds, else the
// first component that differs.
export function gateVerdictRecheck(row, spineComp) {
  const c = (row && row.components) || {};
  for (const k of GATE_VERDICT_SPINE_KEYS) {
    const want = spineComp[k] === undefined ? null : spineComp[k];
    const got = c[k] === undefined ? null : c[k];
    if (want === null || got !== want) return k;
  }
  if (c.class === 'WIDE' && (!spineComp.tree || c.tree !== spineComp.tree)) return 'tree';
  return null;
}

// == keys.json (A1): {runner:{name, version}, files:[{file, class, deps, unknown, error}], errors:[{file, error}]} ==
function gateVerdictDeps(deps) {
  const out = [];
  for (const d of Array.isArray(deps) ? deps : []) {
    if (typeof d === 'string') out.push(d);
    else if (Array.isArray(d) && typeof d[0] === 'string') out.push(d[0]);
    else if (d && typeof d === 'object' && typeof d.path === 'string') out.push(d.path);
  }
  return out;
}

export function gateVerdictKeys(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.files)) return null;
  const errors = new Map();
  for (const e of Array.isArray(raw.errors) ? raw.errors : []) if (e && typeof e.file === 'string') errors.set(e.file, String(e.error || 'error'));
  const files = [];
  const seen = new Set();
  for (const f of raw.files) {
    const file = typeof f === 'string' ? f : f && typeof f.file === 'string' ? f.file : null;
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const o = typeof f === 'object' ? f : {};
    if (o.unknown === true && !errors.has(file)) errors.set(file, 'unknown closure');
    if (typeof o.error === 'string' && !errors.has(file)) errors.set(file, o.error);
    files.push({ file, cls: o.class === 'WIDE' ? 'WIDE' : 'NARROW', deps: gateVerdictDeps(o.deps), unresolved: Number.isInteger(o.unresolved) ? o.unresolved : 0 });
  }
  for (const file of errors.keys()) if (!seen.has(file)) { seen.add(file); files.push({ file, cls: 'NARROW', deps: [], unresolved: 0 }); }
  files.sort((a, b) => gateVerdictCmpStr(a.file, b.file));
  const runner = raw.runner && typeof raw.runner === 'object' ? raw.runner : {};
  const argv = Array.isArray(runner.argv) && runner.argv.every((a) => typeof a === 'string') ? runner.argv : null;
  return { files, errors, runner: { name: typeof runner.name === 'string' ? runner.name : null, version: typeof runner.version === 'string' ? runner.version : null, argv } };
}

// == gateSelect (D5): every file of keys.json gets a decision ==
// run = spine.json contents; keys = gateVerdictKeys(); scan = gateStoreScan result or null (clean or unreadable).
export function gateSelect(run, keys, scan, opts) {
  const o = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const spine = gateVerdictSpineLoad(run.spine);
  const spineComp = gateVerdictSpineComponents(spine);
  const never = gateNeverCompile(spine.neverGlobs, { log: () => {} });
  const leg = run.leg || 'unit';
  const items = scan ? scan.items : [];
  const bucket = gateVerdictBucket(items);
  const live = o.liveRuns || new Set();
  const out = [];
  const version = keys.runner.version || run.runner_version || '-';
  const name = run.runner;
  const solo = new Set(Array.isArray(run.solo) ? run.solo : []);
  for (const f of keys.files) {
    const d = { file: f.file, key_now: null, components: null, class: null, decision: 'run', why: null, source: null };
    out.push(d);
    let k = null;
    try {
      // the runner line is a per-run fact the adapter reports (keys.runner: the argv the runner really received, A1 / F1
      // gateKeyFor entry); without one the spine's own passthrough argv is used. gate/core/installed/env/platform stay spine-only.
      k = gateKeyFor(spine, { file: f.file, runner: { name, version, argv: keys.runner.argv || run.argv || [] }, deps: f.deps, unresolved: f.unresolved, wide: f.cls === 'WIDE' });
    } catch (e) {
      k = { key: null, reason: 'key-error' };
    }
    if (k && k.key) { d.key_now = k.key; d.components = k.components; d.class = k.class; }
    if (run.phase === 'solo') { d.decision = solo.has(f.file) ? 'run' : 'skip'; d.why = solo.has(f.file) ? 'solo' : 'not-solo'; continue; }
    const nv = never.match(f.file);
    if (nv && nv.never) { d.why = 'never-set'; continue; }
    if (keys.errors.has(f.file)) { d.why = 'keys-error: ' + keys.errors.get(f.file); continue; }
    if (!d.key_now) { d.why = 'key-unknown' + (k && k.reason ? ': ' + k.reason : ''); continue; }
    if (run.clean) { d.why = 'clean'; continue; }
    if (!scan || scan.source === 'unavailable') { d.why = 'store-unavailable'; continue; }
    // the adapter-independent components must equal the ones recorded at run_start (spine.json not tampered)
    const drift = GATE_VERDICT_SPINE_KEYS.find((c) => (d.components[c] || null) !== (o.startComponents ? o.startComponents[c] || null : d.components[c] || null));
    if (drift) { d.why = 'spine-drift: ' + drift; continue; }
    const fi = gateVerdictItemsFor(bucket, f.file, leg);
    const fold = gateFold(fi, { key: d.key_now, components: d.components }, now, { file: f.file, leg, resume: !!run.resume, liveRuns: live, source: scan.source });
    d.fold = fold.state;
    d.streak = fold.flakyPasses;
    if (fold.state === 'SUSPECT_KILLER') { d.decision = 'solo'; d.why = 'suspect-killer'; continue; }
    if (fold.reuse !== 'PASS') { d.why = fold.state === 'NEVER_RUN' ? fold.reason : fold.state.toLowerCase() + (fold.reason && fold.reason !== fold.state.toLowerCase() ? ': ' + fold.reason : ''); continue; }
    const row = gateVerdictPassRow(fi, fold, f.file, leg, d.key_now);
    const bad = row ? gateVerdictRecheck(row, spineComp) : 'pass-row-missing';
    if (bad) { d.why = 'recheck: ' + bad; continue; }
    d.decision = 'reuse';
    d.why = 'reuse';
    d.source = { run_id: row.run_id, at: row.at };
  }
  return out;
}

// == `do-it gate decide --run-dir D` (internal, run-free; A1, D4) ==
export function gateDecideCmd(ctx, args) {
  const dirFlag = args.flags['run-dir'];
  if (typeof dirFlag !== 'string' || !dirFlag) throw fail('USAGE', 1, { message: 'gate decide requires --run-dir D' });
  const dir = path.resolve(ctx.cwd, dirFlag);
  const runR = gateVerdictReadJson(path.join(dir, 'spine.json'), BULK_READ_CAP);
  if (!runR.value || typeof runR.value !== 'object') throw fail('GATE_DECIDE_REFUSED', 1, { message: 'run directory has no readable spine.json', run_dir: dir });
  const run = runR.value;
  if (!/^g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}$/.test(String(run.run_id || ''))) throw fail('GATE_DECIDE_REFUSED', 1, { message: 'spine.json names no valid run_id' });
  const keysR = gateVerdictReadJson(path.join(dir, 'keys.json'), BULK_READ_CAP);
  const keys = keysR.value ? gateVerdictKeys(keysR.value) : null;
  if (!keys) throw fail('GATE_DECIDE_REFUSED', 1, { message: 'keys.json missing or unreadable', run_id: run.run_id });
  let scan = null;
  let startComponents = null;
  let liveRuns = new Set();
  if (!run.clean) {
    // clean mode never opens the store (G-5, D16); otherwise the run must exist in the store (adversarial: a copied or
    // forged run directory never yields a run list, D4)
    const store = run.store_dir ? { backend: 'local', dir: run.store_dir } : null;
    scan = gateStoreScan(store);
    if (scan.source === 'unavailable') throw fail('GATE_DECIDE_REFUSED', 1, { message: 'store unreadable', run_id: run.run_id });
    const start = scan.items.find((it) => it.ok && it.row.type === 'run_start' && it.row.run_id === run.run_id);
    if (!start) throw fail('GATE_DECIDE_REFUSED', 1, { message: 'no run_start row for ' + run.run_id + ' in the store', run_id: run.run_id });
    startComponents = start.row.components || {};
    liveRuns = gateStoreLiveRuns(scan.items);
    liveRuns.delete(run.run_id);
  }
  const files = gateSelect(run, keys, scan, { now: Date.now(), startComponents, liveRuns });
  const list = files.filter((d) => d.decision === 'run').map((d) => d.file);
  const decision = {
    schema: 'do-it-gate-decision/1',
    run_id: run.run_id,
    phase: run.phase || 'main',
    leg: run.leg || 'unit',
    scope: run.scope,
    clean: !!run.clean,
    resume: !!run.resume,
    at: new Date().toISOString(),
    runner: { name: run.runner, version: keys.runner.version || run.runner_version || '-' },
    files,
  };
  atomicWrite(path.join(dir, 'decision.json'), Buffer.from(JSON.stringify(decision) + '\n', 'utf8'));
  const runList = { schema: 'do-it-gate-run-list/1', run_id: run.run_id, files: list, entries: files.filter((d) => d.decision === 'run').map((d) => ({ file: d.file, key: d.key_now, why: d.why })) };
  atomicWrite(path.join(dir, 'run-list.json'), Buffer.from(JSON.stringify(runList) + '\n', 'utf8'));
  return { outcome: 'GATE_DECIDED', exit: 0, run_id: run.run_id, run: list.length, reuse: files.filter((d) => d.decision === 'reuse').length, solo: files.filter((d) => d.decision === 'solo').map((d) => d.file) };
}

// == composition (D7) ==
// in: {runId, leg, scope, decision (main, or null when decide failed), keysFiles, fresh: Map file -> finish row,
//   freshStarts: Set file, soloKilled: Set, runnerExit, runnerSignal, startFailed, interrupted, report, reportExpected,
//   items (store scan for the re-check, own rows excluded), resume, liveRuns, spineComp, now}
export function gateVerdictCompose(input) {
  const i = input;
  const leg = i.leg || 'unit';
  const decMap = new Map();
  for (const d of (i.decision && i.decision.files) || []) decMap.set(d.file, d);
  // the listed files: the decision's, plus every file keys.json or this run's own rows name (a decision.json that lost
  // a file can never shrink the total; such a file is unsatisfied unless it has a fresh result)
  const listed = Array.from(new Set([...decMap.keys(), ...(i.keysFiles || []), ...(i.freshStarts || []), ...i.fresh.keys()]));
  listed.sort(gateVerdictCmpStr);
  const bucket = gateVerdictBucket(i.items || []);
  const runs = gateVerdictRuns(i.items || []);
  const files = [];
  const counts = { total: listed.length, passed: 0, reused: 0, ran: 0, skipped: 0, failed: 0, unsatisfied: 0, finished: 0 };
  const sources = new Map();
  for (const file of listed) {
    const d = decMap.get(file) || null;
    const row = i.fresh.get(file) || null;
    const e = { file, decision: d ? d.decision : 'run', status: null, reason: null, row, source: null };
    files.push(e);
    if (row) {
      counts.ran++;
      counts.finished++;
      let res = row.result === 'DESELECTED' ? 'SKIPPED' : row.result;
      if (res === 'PASS' && !gatePassInvariant(row)) res = 'FAIL';
      if (res === 'PASS') { e.status = 'pass'; counts.passed++; } else if (res === 'SKIPPED') { e.status = 'skipped'; counts.skipped++; } else { e.status = 'failed'; e.reason = 'FAIL'; counts.failed++; }
      continue;
    }
    if (d && d.decision === 'reuse' && d.key_now) {
      // satisfied-reused only if still reusable now: compose never trusts the pre-run decision as the record
      const fi = gateVerdictItemsFor(bucket, file, leg);
      const fold = gateFold(fi, { key: d.key_now, components: d.components }, i.now, { file, leg, resume: !!i.resume, liveRuns: i.liveRuns || new Set(), source: 'local' });
      const pr = fold.reuse === 'PASS' ? gateVerdictPassRow(fi, fold, file, leg, d.key_now) : null;
      if (pr && !gateVerdictRecheck(pr, i.spineComp || {})) {
        e.status = 'reused';
        e.source = { run_id: pr.run_id, at: pr.at };
        counts.passed++;
        counts.reused++;
        const s = sources.get(pr.run_id) || { run_id: pr.run_id, rows: 0, oldest_at: pr.at, newest_at: pr.at, ended: false, resumed: false };
        s.rows++;
        if (Date.parse(pr.at) < Date.parse(s.oldest_at)) s.oldest_at = pr.at;
        if (Date.parse(pr.at) > Date.parse(s.newest_at)) s.newest_at = pr.at;
        const run = runs.get(pr.run_id);
        s.ended = !!(run && run.end);
        s.resumed = !(run && run.end) || run.end.verdict === 'GATE_INTERRUPTED';
        sources.set(pr.run_id, s);
        continue;
      }
    }
    e.status = 'unsatisfied';
    e.reason = i.soloKilled && i.soloKilled.has(file) ? 'suspect_killer' : 'no_result';
    counts.unsatisfied++;
  }
  const sourceRuns = Array.from(sources.values()).sort((a, b) => gateVerdictCmpStr(a.oldest_at, b.oldest_at) || gateVerdictCmpStr(a.run_id, b.run_id));
  const oldest = sourceRuns.length ? sourceRuns.reduce((m, s) => (Date.parse(s.oldest_at) < Date.parse(m) ? s.oldest_at : m), sourceRuns[0].oldest_at) : null;
  // taint (D20): evidence that PASS rows may be wrong; interruption is not taint (A4)
  let tainted = false;
  let taintReason = null;
  const runnerFailedQuietly = !i.interrupted && !i.startFailed && i.runnerExit !== 0 && i.runnerExit !== null && counts.failed === 0;
  if (!i.interrupted && !i.startFailed) {
    const rep = i.report;
    if (runnerFailedQuietly) { tainted = true; taintReason = 'runner exited ' + i.runnerExit + ' with no failing file'; } else if (i.reportExpected && !rep) { tainted = true; taintReason = 'runner report missing'; } else if (rep) {
      const n = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
      if (n(rep.unhandled_errors)) { tainted = true; taintReason = 'unhandled errors: ' + n(rep.unhandled_errors); } else if (n(rep.force_exited_workers)) { tainted = true; taintReason = 'force-exited workers: ' + n(rep.force_exited_workers); } else if (n(rep.open_handles)) { tainted = true; taintReason = 'open handles: ' + n(rep.open_handles); } else if (rep.tainted === true) { tainted = true; taintReason = typeof rep.reason === 'string' && rep.reason ? rep.reason : 'runner reported taint'; }
    }
  }
  // verdict head precedence: interrupted, then failed or unsatisfied files, then runner exit, then taint, then zero files
  // and zero-pass (D7)
  let head = null;
  let outcome;
  const bad = files.filter((e) => e.status === 'failed' || e.status === 'unsatisfied');
  if (i.interrupted) {
    head = 'interrupted after ' + counts.finished + ' of ' + counts.total + ' files';
    outcome = 'GATE_INTERRUPTED';
  } else if (i.startFailed) {
    head = 'runner did not start: exit 127';
    outcome = 'GATE_FAIL';
  } else if (bad.length) {
    const shown = bad.slice(0, 5).map((e) => e.file + (e.reason === 'no_result' ? ' no result' : e.reason === 'suspect_killer' ? ' suspect-killer' : ''));
    head = bad.length + ' of ' + counts.total + ' files FAIL (' + shown.join(', ') + (bad.length > 5 ? ', +' + (bad.length - 5) + ' more' : '') + ')';
    outcome = 'GATE_FAIL';
  } else if (runnerFailedQuietly) {
    head = 'runner exited ' + i.runnerExit + ' with no failing file';
    outcome = 'GATE_FAIL';
  } else if (tainted) {
    head = 'tainted: ' + taintReason;
    outcome = 'GATE_FAIL';
  } else if (counts.total === 0) {
    head = '0 test files listed';
    outcome = 'GATE_FAIL';
  } else if (counts.passed === 0) {
    head = '0 files PASS (all ' + counts.total + ' skipped)';
    outcome = 'GATE_FAIL';
  } else if (counts.passed + counts.skipped !== counts.total) {
    head = (counts.total - counts.passed - counts.skipped) + ' of ' + counts.total + ' files FAIL';
    outcome = 'GATE_FAIL';
  } else outcome = counts.reused > 0 ? 'GATE_PASS_COMPOSED' : 'GATE_PASS_FRESH';
  return {
    outcome, head, files, counts, tainted, taint_reason: taintReason,
    source_runs: sourceRuns.map((s) => ({ run_id: s.run_id, rows: s.rows, oldest_at: s.oldest_at, newest_at: s.newest_at, ended: s.ended })),
    resumed_from: sourceRuns.filter((s) => s.resumed).map((s) => s.run_id),
    oldest_reused_at: oldest,
    failed_files: bad.map((e) => ({ file: e.file, reason: e.reason, failure_ref: e.row && e.row.failure_ref ? e.row.failure_ref : null })),
  };
}

// == the verdict line (D8, CONTRACT §4.3) ==
export function gateVerdictLine(v) {
  const c = v.counts;
  const n = v.source_runs.length;
  const mid = c.reused + ' reused from ' + n + (n === 1 ? ' run' : ' runs') + ' (oldest ' + (v.oldest_reused_at ? gateVerdictMinute(v.oldest_reused_at) : 'none') + ') · ' +
    c.ran + ' ran now · ' + c.skipped + ' skipped · ' + (v.flaky_excluded || 0) + ' flaky-excluded';
  const tail = '] run=' + v.run_id + (v.dirty ? ' · for WORKING TREE (dirty), not ' + (v.head_sha ? v.head_sha.slice(0, 12) : 'no-commit') : '');
  if (v.outcome === 'GATE_PASS_COMPOSED') return '[COMPOSED ' + v.scope + ': ' + c.passed + '/' + c.total + ' files PASS · ' + mid + tail;
  if (v.outcome === 'GATE_PASS_FRESH') return '[FRESH ' + v.scope + ': ' + c.passed + '/' + c.total + ' files PASS · ' + mid + tail;
  return '[FAIL ' + v.scope + ': ' + v.head + ' · ' + mid + tail;
}

// == post-run folds: FLAKY / UNSTABLE counting, unstable[], prior FAILs on the same key (V2 D17, D18, D21) ==
// items = store scan including this run's rows; a synthetic run_end for this run is appended so its own PASS rows
// count as a completed run's (the real run_end is written right after).
export function gateVerdictAfter(items, input) {
  const i = input;
  const leg = i.leg || 'unit';
  const pos = items.length ? Math.max(...items.map((it) => it.pos)) + 1 : 0;
  const synthetic = { pos, ok: true, row: { schema: 'do-it-gate-result/1', type: 'run_end', run_id: i.runId, at: new Date(i.now).toISOString(), tainted: !!i.tainted, verdict: i.outcome === 'GATE_INTERRUPTED' ? 'GATE_INTERRUPTED' : 'GATE_FAIL' } };
  const all = items.concat([synthetic]);
  const bucket = gateVerdictBucket(all);
  const live = new Set(i.liveRuns || []);
  live.delete(i.runId);
  const flaky = [];
  const unstable = [];
  const prior = new Map();
  for (const d of i.decisionFiles || []) {
    if (!d.key_now) continue;
    const fi = gateVerdictItemsFor(bucket, d.file, leg);
    const fold = gateFold(fi, { key: d.key_now, components: d.components }, i.now, { file: d.file, leg, resume: false, liveRuns: live, source: 'local' });
    if (fold.state === 'FLAKY' || fold.state === 'UNSTABLE_UNDER_REUSE') flaky.push(d.file);
    if (fold.state === 'UNSTABLE_UNDER_REUSE') unstable.push(d.file);
    let p = false;
    for (const it of fi) {
      if (!it.ok) continue;
      const r = it.row;
      if (r.type === 'finish' && r.run_id !== i.runId && r.key === d.key_now && (r.leg || 'unit') === leg && r.result === 'FAIL') { p = true; break; }
    }
    prior.set(d.file, p);
  }
  return { flaky, unstable, prior };
}

// == fold every (file, leg) at its newest key (gate results, quarantine view) ==
export function gateVerdictFoldAll(items, now, opts) {
  const o = opts || {};
  const bucket = gateVerdictBucket(items);
  const newest = new Map();
  for (const it of items) {
    if (!it.ok || it.row.type !== 'finish') continue;
    const k = it.row.file + '\0' + (it.row.leg || 'unit');
    const prev = newest.get(k);
    if (!prev || it.pos > prev.pos) newest.set(k, { pos: it.pos, row: it.row });
  }
  const out = [];
  for (const [k, n] of newest) {
    const [file, leg] = k.split('\0');
    const fi = gateVerdictItemsFor(bucket, file, leg);
    const fold = gateFold(fi, { key: n.row.key, components: n.row.components || {} }, now, { file, leg, resume: !!o.resume, liveRuns: o.liveRuns || new Set(), source: 'local' });
    out.push({ file, leg, newest: n.row, fold, items: fi });
  }
  out.sort((a, b) => gateVerdictCmpStr(a.file, b.file) || gateVerdictCmpStr(a.leg, b.leg));
  return out;
}

// == quarantine view (V2 D22): derived, rebuilt at the end of every run, never read for a decision ==
export function gateVerdictFlakyView(items, now) {
  const files = [];
  for (const f of gateVerdictFoldAll(items, now)) {
    if (f.fold.state !== 'FLAKY' && f.fold.state !== 'UNSTABLE_UNDER_REUSE') continue;
    const onKey = f.items.filter((it) => it.ok && it.row.type === 'finish' && it.row.key === f.newest.key && (it.row.leg || 'unit') === f.leg);
    let since = null;
    if (f.fold.state === 'UNSTABLE_UNDER_REUSE') {
      const cleanFails = f.items.filter((it) => it.ok && it.row.type === 'finish' && it.row.clean === true && it.row.result === 'FAIL' && (it.row.leg || 'unit') === f.leg);
      since = cleanFails.length ? cleanFails[cleanFails.length - 1].row.at : null;
    } else {
      const fails = f.items.filter((it) => it.ok && it.row.type === 'finish' && it.row.result === 'FAIL' && (it.row.leg || 'unit') === f.leg);
      const retried = onKey.filter((it) => it.row.retried === true);
      const last = [...fails, ...retried].sort((a, b) => a.pos - b.pos).pop();
      since = last ? last.row.at : null;
    }
    files.push({
      file: f.file, leg: f.leg, state: f.fold.state, key: f.newest.key, since,
      until: f.fold.unstableUntil ? new Date(f.fold.unstableUntil).toISOString() : null,
      streak: f.fold.flakyPasses || 0,
      run_ids: Array.from(new Set(onKey.map((it) => it.row.run_id))).slice(-5),
    });
  }
  return { schema: 'do-it-gate-flaky-view/1', built_at: new Date(now).toISOString(), files };
}

export function gateVerdictWriteView(store, items, now) {
  const view = gateVerdictFlakyView(items, now);
  atomicWrite(path.join(store.dir, 'views', 'flaky.json'), Buffer.from(JSON.stringify(view, null, 2) + '\n', 'utf8'));
  return view;
}

// == `do-it gate results [--why FILE] [--json]` (D15; read-only, run-free, exit 0) ==
function gateVerdictAge(at, now) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '?';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return m + ' min';
  if (m < 2880) return Math.floor(m / 60) + ' h';
  return Math.floor(m / 1440) + ' d';
}

export function gateResultsCmd(ctx, args) {
  const f = args.flags;
  const now = Date.now();
  const store = gateStoreOpen({ cwd: ctx.cwd, env: ctx.env });
  const scan = gateStoreScan(store);
  const items = scan.items;
  const runs = gateVerdictRuns(items);
  const live = gateStoreLiveRuns(items);
  const folds = gateVerdictFoldAll(items, now, { liveRuns: live });
  const lastClean = {};
  for (const it of items) {
    if (!it.ok || it.row.type !== 'clean') continue;
    const run = runs.get(it.row.run_id);
    if (run && run.end && run.end.tainted === true) continue;
    lastClean[it.row.leg || 'unit'] = { run_id: it.row.run_id, at: it.row.at, started_at: run && run.start ? run.start.at : it.row.at };
  }
  const rows = folds.map((x) => ({
    file: x.file, leg: x.leg, state: x.fold.state, reason: x.fold.reason, key: x.newest.key,
    last_result: x.newest.result, at: x.newest.at, run_id: x.newest.run_id,
    source_run: x.fold.passRow ? x.fold.passRow.run_id : null, flaky_passes: x.fold.flakyPasses,
    unstable_until: x.fold.unstableUntil ? new Date(x.fold.unstableUntil).toISOString() : null,
  }));
  // red-baseline (V2 D21): files whose newest finish on their newest key is FAIL; a baseline, never a discount
  const failSet = folds.filter((x) => x.newest.result === 'FAIL').map((x) => ({ file: x.file, leg: x.leg, key: x.newest.key, run_id: x.newest.run_id, at: x.newest.at, failure_ref: x.newest.failure_ref || null }));
  const header = '[gate-results] store ' + (store ? store.dir : 'none') + ' · ' + scan.source + ' · corrupt: ' + scan.corrupt + ' · last clean: ' +
    (Object.keys(lastClean).length ? Object.keys(lastClean).sort().map((l) => l + ' ' + lastClean[l].run_id + ' (' + gateVerdictMinute(lastClean[l].at) + ')').join(', ') : 'none');
  const say = [header];
  const out = { outcome: 'GATE_RESULTS', exit: 0, store: store ? store.dir : null, source: scan.source, corrupt: scan.corrupt, last_clean: lastClean, files: rows, fail_set: failSet };
  if (typeof f.why === 'string') {
    const file = f.why;
    const mine = folds.filter((x) => x.file === file && (f.leg === undefined || x.leg === f.leg));
    const why = [];
    for (const x of mine) {
      const prefix = mine.length > 1 ? '[' + x.leg + '] ' : '';
      const newest = x.newest;
      // newest PASS row on another key: which component changed
      let otherPass = null;
      for (const it of x.items) {
        if (it.ok && it.row.type === 'finish' && it.row.result === 'PASS' && it.row.key !== newest.key && (it.row.leg || 'unit') === x.leg) otherPass = it.row;
      }
      if (otherPass) for (const l of gateWhy(otherPass.components || {}, newest.components || {}, { store })) why.push(prefix + l);
      const st = x.fold.state;
      if (st === 'EXPIRED' && x.fold.passRow) {
        const at = Date.parse(x.fold.passRow.at);
        why.push(prefix + (at < now - GATE_VERDICT_DAY_MS ? 'EXPIRED 24 h' : 'EXPIRED older than last clean'));
      } else if (st === 'FLAKY') why.push(prefix + 'FLAKY ' + x.fold.flakyPasses + ' of 2');
      else if (st === 'UNSTABLE_UNDER_REUSE') why.push(prefix + 'UNSTABLE until ' + new Date(x.fold.unstableUntil).toISOString());
      else if (x.fold.reason === 'tainted-run') why.push(prefix + 'tainted run ' + newest.run_id);
      else why.push(prefix + st + (x.fold.reason ? ' (' + x.fold.reason + ')' : ''));
    }
    if (!mine.length) why.push('no rows for ' + file);
    out.why = why;
    say.push(...why);
  } else {
    for (const r of rows) say.push(r.state + ' ' + r.file + (r.leg !== 'unit' ? ' [' + r.leg + ']' : '') + ' key ' + String(r.key).slice(0, 12) + ' last ' + r.last_result + ' ' + gateVerdictAge(r.at, now) + ' ago run ' + r.run_id);
  }
  out.say = say;
  return out;
}

// rows mirrored by the adapter into the run directory (used only when the store cannot be read)
export function gateVerdictMirrorRows(file) {
  let bytes = null;
  try { bytes = readRegularFile(file, BULK_READ_CAP); } catch { return []; }
  const out = [];
  bytes.toString('utf8').split('\n').forEach((raw, pos) => {
    if (!raw.trim()) return;
    const row = gateRowParse(raw);
    if (row) out.push({ pos, ok: true, row });
  });
  return out;
}

export function gateVerdictRemoveDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* swept later by age */ }
}
