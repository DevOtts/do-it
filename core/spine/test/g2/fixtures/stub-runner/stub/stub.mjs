#!/usr/bin/env node
// Stub runner adapter for the verdict-lane tests (epics V1/V2, CONTRACT §11 A1). It behaves like a runner adapter:
// reads DO_IT_GATE_MANIFEST, writes keys.json, calls `do-it gate decide --run-dir D` once, runs only run-list.json
// (every file when decide fails), writes start/finish rows (store + run-dir mirror) and runner-report.json.
// Each spec file is a JSON behaviour record: {result: pass|fail|skip|kill, seq: [...], drop, then: 'kill', retried,
// writes_flag, reads_flag, edit_self, append_fail_for, unhandled, force_exit, wide, deps}. One-shot switches by env:
// GATE_FIXTURE_KILL_IN / _KILL_AFTER (SIGKILL self while / after a file), _EXIT, _REPORT=none, _KEYS=garbage,
// _KEYS_ERROR, _TAMPER_RUNLIST, _TAMPER_DECISION, _COPY_RUNDIR.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gateRowLine } from '../../../../../src/gate-results.mjs';

const argv = process.argv.slice(2);
const env = process.env;
const cwd = process.cwd();

function log(ev) {
  if (env.GATE_FIXTURE_LOG) fs.appendFileSync(env.GATE_FIXTURE_LOG, JSON.stringify({ pid: process.pid, ...ev }) + '\n');
}

function listFiles() {
  const out = [];
  const walk = (dir) => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const rel = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.spec\.js$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  out.sort();
  const i = argv.indexOf('--only');
  if (i >= 0 && argv[i + 1]) { const re = new RegExp(argv[i + 1]); return out.filter((f) => re.test(f)); }
  return out;
}

function behaviour(file) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')) || {}; } catch { return {}; }
}

function newRunId() {
  const d = new Date().toISOString();
  return 'g-' + d.slice(0, 4) + d.slice(5, 7) + d.slice(8, 10) + 'T' + d.slice(11, 13) + d.slice(14, 16) + d.slice(17, 19) + 'Z-' + crypto.randomBytes(2).toString('hex');
}

const holdersDir = path.join(env.HOME || '/nonexistent', '.do-it', 'queue', 'holders');
const ticketsDir = path.join(env.HOME || '/nonexistent', '.do-it', 'queue', 'tickets');
const count = (d) => { try { return fs.readdirSync(d).filter((n) => n.endsWith('.json')).length; } catch { return 0; } };
const files = listFiles();
const manifestPath = env.DO_IT_GATE_MANIFEST;
let manifest = null;
try { manifest = manifestPath ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null; } catch { manifest = null; }

if (!manifest) {
  // no handshake: run every file, write nothing (the runner "unchanged")
  let bad = 0;
  for (const f of files) { const b = behaviour(f); if ((b.result || 'pass') === 'fail') bad++; }
  log({ event: 'start', argv, manifest: false, run_list: files, holder: env.DO_IT_GATE_HOLDER || null, holders: count(holdersDir), tickets: count(ticketsDir) });
  process.exit(env.GATE_FIXTURE_EXIT !== undefined ? Number(env.GATE_FIXTURE_EXIT) : bad ? 1 : 0);
}

const runDir = path.dirname(manifestPath);
const storeFile = path.join(manifest.store_dir, 'results.jsonl');
const mirror = path.join(runDir, 'rows.jsonl');
const keys = { runner: { name: 'stub', version: '1.0.0' }, files: [], errors: [] };
const keyErr = new Set((env.GATE_FIXTURE_KEYS_ERROR || '').split(',').filter(Boolean));
for (const f of files) {
  const b = behaviour(f);
  if (keyErr.has(f)) { keys.errors.push({ file: f, error: 'closure crashed' }); continue; }
  keys.files.push({ file: f, class: b.wide ? 'WIDE' : 'NARROW', deps: Array.isArray(b.deps) ? b.deps : [] });
}
fs.writeFileSync(path.join(runDir, 'keys.json'), env.GATE_FIXTURE_KEYS === 'garbage' ? 'not json{' : JSON.stringify(keys));
const decideArgv = JSON.parse(env.DO_IT_GATE_DECIDE || '[]');
const d = decideArgv.length ? cp.spawnSync(decideArgv[0], [...decideArgv.slice(1), '--run-dir', runDir, '--json'], { cwd, env, encoding: 'utf8', timeout: 120000 }) : { status: 1 };
if (env.GATE_FIXTURE_COPY_RUNDIR) fs.cpSync(runDir, env.GATE_FIXTURE_COPY_RUNDIR, { recursive: true });
let list = files;
let decision = null;
let decided = false;
if (d.status === 0) {
  try {
    list = JSON.parse(fs.readFileSync(path.join(runDir, 'run-list.json'), 'utf8')).files;
    decision = JSON.parse(fs.readFileSync(path.join(runDir, 'decision.json'), 'utf8'));
    decided = true;
  } catch { list = files; decision = null; }
}
const keyOf = new Map();
for (const x of (decision && decision.files) || []) keyOf.set(x.file, x);
if (env.GATE_FIXTURE_TAMPER_DECISION && decided) {
  // adversarial: drop a file from the spine's decision.json and from the run list (it must still count, unsatisfied)
  decision.files = decision.files.filter((x) => x.file !== env.GATE_FIXTURE_TAMPER_DECISION);
  fs.writeFileSync(path.join(runDir, 'decision.json'), JSON.stringify(decision));
  list = list.filter((f) => f !== env.GATE_FIXTURE_TAMPER_DECISION);
}
if (env.GATE_FIXTURE_TAMPER_RUNLIST && decided) {
  list = list.filter((f) => f !== env.GATE_FIXTURE_TAMPER_RUNLIST);
  fs.writeFileSync(path.join(runDir, 'run-list.json'), JSON.stringify({ files: list }));
}
log({ event: 'start', argv, manifest: true, decided, decide_status: d.status, run_list: list, scope: manifest.scope, clean: manifest.clean, leg: manifest.leg, run_id: manifest.run_id, solo: argv.includes('--solo'), holder: env.DO_IT_GATE_HOLDER || null, holders: count(holdersDir), tickets: count(ticketsDir), decision_files: decision ? decision.files.map((x) => ({ file: x.file, decision: x.decision, why: x.why, key: x.key_now, fold: x.fold || null, streak: x.streak === undefined ? null : x.streak })) : null });

function row(r) {
  const line = gateRowLine(r) + '\n';
  fs.appendFileSync(storeFile, line);
  fs.appendFileSync(mirror, line);
}

function next(file, b) {
  if (!Array.isArray(b.seq)) return b.result || 'pass';
  const dir = env.GATE_FIXTURE_STATE;
  const f = path.join(dir, file.replace(/[^A-Za-z0-9]/g, '_') + '.n');
  let n = 0;
  try { n = Number(fs.readFileSync(f, 'utf8')) || 0; } catch { n = 0; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, String(n + 1));
  return b.seq[Math.min(n, b.seq.length - 1)];
}

const report = { files_received: list.length, unhandled_errors: 0, force_exited_workers: 0, open_handles: 0 };
let anyFail = false;
for (const file of list) {
  const b = behaviour(file);
  if (b.drop) continue;
  const dec = keyOf.get(file);
  const key = dec && dec.key_now ? dec.key_now : crypto.createHash('sha256').update('stub-nokey\0' + file).digest('hex');
  const base = { run_id: manifest.run_id, file, leg: manifest.leg, scope: manifest.scope, key, clean: !!manifest.clean };
  if (dec && dec.components) base.components = dec.components;
  row({ ...base, type: 'start', at: new Date().toISOString() });
  let res = next(file, b);
  if (res === 'kill' || env.GATE_FIXTURE_KILL_IN === file) process.kill(process.pid, 'SIGKILL');
  if (b.reads_flag && env.GATE_FIXTURE_FLAG) {
    if (fs.existsSync(env.GATE_FIXTURE_FLAG)) { fs.unlinkSync(env.GATE_FIXTURE_FLAG); res = 'fail'; }
  }
  if (b.writes_flag && env.GATE_FIXTURE_FLAG) fs.writeFileSync(env.GATE_FIXTURE_FLAG, 'polluted');
  if (b.edit_self) fs.appendFileSync(path.join(cwd, file), ' ');
  if (b.append_fail_for) {
    const other = keyOf.get(b.append_fail_for);
    if (other && other.key_now) {
      const r = { type: 'finish', run_id: newRunId(), at: new Date().toISOString(), file: b.append_fail_for, leg: manifest.leg, scope: manifest.scope, key: other.key_now, result: 'FAIL', retried: false, counts: { passed: 0, failed: 1, skipped: 0, pending: 0 }, exec_error: false, duration_ms: 1, failure_ref: null, clean: false };
      if (other.components) r.components = other.components;
      fs.appendFileSync(storeFile, gateRowLine(r) + '\n');
    }
  }
  if (b.unhandled) report.unhandled_errors++;
  if (b.force_exit) report.force_exited_workers++;
  const counts = res === 'pass' ? { passed: 1, failed: 0, skipped: 0, pending: 0 } : res === 'fail' ? { passed: 0, failed: 1, skipped: 0, pending: 0 } : { passed: 0, failed: 0, skipped: 1, pending: 0 };
  const result = res === 'pass' ? 'PASS' : res === 'fail' ? 'FAIL' : 'SKIPPED';
  if (result === 'FAIL') anyFail = true;
  row({ ...base, type: 'finish', at: new Date().toISOString(), result, retried: b.retried === true, counts, exec_error: false, duration_ms: 1, failure_ref: null });
  if (b.then === 'kill' || env.GATE_FIXTURE_KILL_AFTER === file) process.kill(process.pid, 'SIGKILL');
}
if (env.GATE_FIXTURE_REPORT !== 'none') fs.writeFileSync(path.join(runDir, 'runner-report.json'), JSON.stringify(report));
process.exit(env.GATE_FIXTURE_EXIT !== undefined ? Number(env.GATE_FIXTURE_EXIT) : anyFail ? 1 : 0);
