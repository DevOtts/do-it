'use strict';
// jest reporter (epic A1, PRD-3 D1, D9, D11, D13-D15). Runs in jest's parent process: one `start` row per file when it
// starts, one `finish` row the moment it finishes, and `runner-report.json` at exit. It never folds and never reads the
// store to decide anything; it writes no run_start, run_end or clean row (those are the spine's).
const fs = require('node:fs');
const path = require('node:path');
const common = require('./common.cjs');
const closure = require('./closure.cjs');

// G-2: a crashed suite reports numFailingTests 0 with testExecError set (buildFailureTestResult), so a PASS needs all four.
const isPass = (r) => r.testExecError == null && r.numFailingTests === 0 && !r.failureMessage && r.numPassingTests > 0; // PREDICATE

// => 'PASS' | 'SKIPPED' | 'FAIL'. Skipped: nothing failed, nothing passed, something was skipped or todo.
function classify(r) {
  if (isPass(r)) return 'PASS';
  const clean = r.testExecError == null && r.numFailingTests === 0 && !r.failureMessage;
  if (clean && !(r.numPassingTests > 0) && (r.numPendingTests > 0 || r.numTodoTests > 0)) return 'SKIPPED';
  return 'FAIL';
}

function countsOf(r) {
  const n = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
  return { passed: n(r.numPassingTests), failed: n(r.numFailingTests), skipped: n(r.numPendingTests), pending: n(r.numTodoTests) };
}

function retriedOf(r) {
  return (r.testResults || []).some((c) => Number(c && c.invocations) > 1);
}

function failureText(r) {
  const parts = [];
  if (r.failureMessage) parts.push(String(r.failureMessage));
  const e = r.testExecError;
  if (e != null) parts.push(String((e && (e.stack || e.message)) || e));
  return parts.join('\n');
}

// workerIdleMemoryLimit is a hint (D19): the repo config wins; the manifest value is used only when the config sets none.
function memoryHint(config, manifest) {
  if (config && config.workerIdleMemoryLimit != null) return [];
  const v = manifest && manifest.worker_idle_memory_limit;
  return v ? ['--workerIdleMemoryLimit=' + v] : [];
}

const TAINT = ['UNHANDLED_ERRORS', 'FORCE_EXIT', 'OPEN_HANDLES'];

class DoItGateReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig || {};
    const o = options || {};
    this._env = o.env || process.env;
    this._cwd = o.cwd || process.cwd();
    this._loaded = common.loadManifest(this._env);
    this._manifest = this._loaded && this._loaded.manifest;
    this._dir = this._loaded && this._loaded.dir;
    this._repo = null;
    this._written = new Set();
    this._reasons = new Set();
    this._lastError = null;
    this._filesSeen = 0;
    this._unhandled = 0;
    this._keys = null;
    this._runList = null;
    this._redaction = null;
    this._monitor = null;
    if (this._manifest) {
      this._monitor = () => { this._unhandled++; };
      process.on('uncaughtExceptionMonitor', this._monitor);
    }
  }

  _guard(fn) {
    try { return fn(); } catch (e) {
      this._reasons.add('ADAPTER_ERROR');
      process.stderr.write('[do-it-gate] adapter error: ' + ((e && e.message) || e) + '\n');
      return undefined;
    }
  }

  _load() {
    if (this._keys !== null) return;
    this._repo = common.repoRootOf(this._cwd);
    const keys = common.readJson(path.join(this._dir, 'keys.json'));
    this._keys = new Map();
    if (keys && Array.isArray(keys.files)) {
      this._runner = keys.runner || { name: 'jest', version: '-', argv: [] };
      for (const f of keys.files) if (f && typeof f.file === 'string') this._keys.set(f.file, f);
    }
    const list = require('./filter.cjs').parseRunList(common.readJson(path.join(this._dir, 'run-list.json')), this._repo);
    this._runList = list;
    this._selected = common.readJson(path.join(this._dir, 'selected.json'));
    this._redaction = common.redactionSet(this._manifest, this._env, this._repo);
    this._tokens = common.envFileTokens(this._manifest);
  }

  _fileOf(testPath) {
    return common.realRel(this._repo, testPath).rel;
  }

  // => {key, components} for a file, or null when the file has no keyed closure (it simply runs again next time).
  _keyFor(file) {
    const entry = this._keys.get(file);
    if (!entry || entry.unknown) return null;
    const own = common.composeKey(
      this._manifest.lines,
      common.adapterLinesOf(this._manifest, common.runnerLine(this._runner.name || 'jest', this._runner.version || '-', this._runner.argv || []), entry),
    );
    const given = this._runList && this._runList.get(file);
    if (given && typeof given.key === 'string') {
      // The spine's key is authoritative (it recomputes gate, core, installed, env and platform). When it also hands back
      // the manifest lines it composed from, the adapter checks the facts it supplied: class, tree and every dep line.
      if (Array.isArray(given.lines)) {
        const theirs = given.lines.map(String);
        const mine = common.adapterLinesOf(this._manifest, ['runner', 'x'], entry).map((l) => l.join('\t'));
        const mineSet = mine.filter((t) => !t.startsWith('runner\t'));
        const sameFacts = mineSet.every((t) => theirs.includes(t))
          && theirs.filter((t) => /^(dep|class|tree)\t/.test(t)).every((t) => mineSet.includes(t));
        const recomposed = common.sha256(Buffer.from('rtg-key/1\n' + common.sortTexts(theirs).map((t) => t + '\n').join(''), 'utf8'));
        if (!sameFacts || recomposed !== given.key) return { mismatch: true };
      }
      const comps = given.components && typeof given.components === 'object' ? given.components : common.componentsOf(own.lines);
      return { key: given.key, components: comps };
    }
    if (!own.key) return null;
    return { key: own.key, components: common.componentsOf(own.lines) };
  }

  _drifted(entry) {
    for (const d of entry.deps || []) {
      if (d.path.startsWith('@outside/')) continue;
      if (common.depHash(this._repo, d.path, this._tokens).sha256 !== d.sha256) return true;
    }
    return false;
  }

  _base(type, file, k) {
    const m = this._manifest;
    return {
      schema: common.ROW_SCHEMA, type, run_id: m.run_id, at: new Date().toISOString(), file, leg: m.leg, scope: m.scope,
      key: k.key, components: k.components, clean: !!m.clean, tree_dirty: Array.isArray(m.dirty) && m.dirty.length > 0,
    };
  }

  _append(row) {
    try {
      common.appendRow(this._manifest.store_dir, row);
      return true;
    } catch (e) {
      this._reasons.add('ROW_WRITE_FAILED');
      this._lastError = new Error('ROW_WRITE_FAILED');
      process.stderr.write('[do-it-gate] row write failed\n');
      return false;
    }
  }

  onRunStart() {
    this._guard(() => {
      if (!this._manifest || !this._manifest.store_dir) return;
      this._load();
    });
  }

  onTestFileStart(test) {
    this._guard(() => {
      if (!this._manifest || !this._manifest.store_dir) return;
      this._load();
      const file = this._fileOf(test.path);
      const mark = 'start\0' + file;
      if (this._written.has(mark)) return;
      const k = this._keyFor(file);
      if (!k) return;
      if (k.mismatch) { this._reasons.add('KEY_MISMATCH'); return; }
      this._written.add(mark);
      this._append(this._base('start', file, k));
    });
  }

  onTestFileResult(test, testResult) {
    this._guard(() => {
      this._filesSeen++;
      if (!this._manifest || !this._manifest.store_dir) return;
      this._load();
      const file = this._fileOf(test.path);
      const mark = 'finish\0' + file;
      if (this._written.has(mark)) return;
      const entry = this._keys.get(file);
      const k = this._keyFor(file);
      if (!k || !entry) return;
      if (k.mismatch) { this._reasons.add('KEY_MISMATCH'); return; }
      if (this._drifted(entry)) { this._reasons.add('KEY_DRIFT'); return; }
      const result = classify(testResult);
      const row = this._base('finish', file, k);
      row.result = result;
      row.retried = retriedOf(testResult);
      row.counts = countsOf(testResult);
      row.exec_error = testResult.testExecError != null;
      const perf = testResult.perfStats || {};
      const ms = Number.isFinite(perf.runtime) ? perf.runtime : Number.isFinite(perf.end) && Number.isFinite(perf.start) ? perf.end - perf.start : 0;
      row.duration_ms = Math.max(0, Math.round(ms));
      row.failure_ref = null;
      if (result === 'FAIL') {
        const text = failureText(testResult);
        if (text) {
          try {
            row.failure_ref = common.writeFailure(this._manifest.store_dir, common.redact(text, this._redaction));
          } catch {
            this._reasons.add('ROW_WRITE_FAILED');
          }
        }
      }
      this._written.add(mark);
      if (!this._append(row)) return;
      try {
        common.writeJsonAtomic(
          path.join(this._manifest.store_dir, 'closures', closure.sidecarName(this._manifest, file)),
          closure.sidecarOf(this._manifest, entry, k.key),
        );
      } catch { /* a missing sidecar only costs a re-run */ }
    });
  }

  onRunComplete(_contexts, results) {
    this._guard(() => {
      if (this._monitor) process.removeListener('uncaughtExceptionMonitor', this._monitor);
      if (!this._manifest) return;
      this._load();
      const res = results || {};
      const received = Number.isInteger(res.numTotalTestSuites) ? res.numTotalTestSuites : null;
      const sent = this._selected && Number.isInteger(this._selected.sent) ? this._selected.sent : null;
      if (sent !== null && received !== null && sent !== received) {
        this._reasons.add('COUNT_MISMATCH');
        this._lastError = new Error('COUNT_MISMATCH sent ' + sent + ' received ' + received);
        process.stderr.write('COUNT_MISMATCH sent ' + sent + ' received ' + received + '\n');
      }
      // Outside watch mode jest bails by calling onRunComplete and exiting without setting wasInterrupted, so a bail is
      // recognised by its own arithmetic: bail set, enough failed tests, and fewer results seen than suites scheduled.
      const bail = Number(this._globalConfig.bail) || 0;
      const bailed = bail > 0 && res.numFailedTests >= bail && received !== null && this._filesSeen < received;
      const interrupted = res.wasInterrupted === true || bailed;
      let interruptReason = null;
      if (interrupted) interruptReason = bailed || (bail > 0 && res.numFailedTests > 0) ? 'BAIL' : 'INTERRUPTED';
      const handles = Array.isArray(res.openHandles) ? res.openHandles.length : 0;
      if (res.runExecError || this._unhandled > 0) this._reasons.add('UNHANDLED_ERRORS');
      if (handles > 0) this._reasons.add('OPEN_HANDLES');
      const all = Array.from(this._reasons);
      const taintReasons = all.filter((r) => TAINT.includes(r));
      const order = [...TAINT, 'KEY_DRIFT', 'KEY_MISMATCH', 'ROW_WRITE_FAILED', 'COUNT_MISMATCH', 'ADAPTER_ERROR'];
      const reason = taintReasons.length || all.length
        ? order.find((r) => this._reasons.has(r)) || all[0]
        : interruptReason;
      const report = {
        schema: 'rtg-runner-report/1',
        run_id: this._manifest.run_id,
        tainted: taintReasons.length > 0,
        reason: reason || null,
        reasons: all.concat(interruptReason && !all.includes(interruptReason) ? [interruptReason] : []),
        interrupted,
        unhandled_errors: this._unhandled + (res.runExecError ? 1 : 0),
        force_exited_workers: 0,
        open_handles: handles,
        sent,
        received,
        files_received: received,
        files_seen: this._filesSeen,
      };
      common.writeJsonAtomic(path.join(this._dir, 'runner-report.json'), report);
    });
  }

  getLastError() {
    return this._lastError;
  }
}

module.exports = DoItGateReporter;
module.exports.DoItGateReporter = DoItGateReporter;
module.exports.classify = classify;
module.exports.isPass = isPass;
module.exports.memoryHint = memoryHint;
