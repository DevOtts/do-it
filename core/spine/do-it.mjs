#!/usr/bin/env node
// do-it spine: built by core/spine/build.mjs from core/spine/src. Do not edit.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EMBEDDED_SCHEMAS = {"do-it-state.1.schema.json":{"$id":"do-it-state/1","title":"do-it run state (written only by the spine)","type":"object","required":["schema","run_id","preset","request","status","size","host","stage","slices","gates","handoffs","stop_refusals","review","created_at","updated_at"],"properties":{"schema":{"const":"do-it-state/1"},"run_id":{"type":"string","minLength":1},"preset":{"type":["string","null"]},"request":{"type":"string"},"status":{"enum":["INTAKE","PLANNING","AWAIT_RATIFY","BUILDING","VERIFYING","REVIEWING","FIXING","DEPLOYING","PROVING","CONCLUDING","DONE","NEEDS_HUMAN","PARKED","BLOCKED","FAILED","PARTIAL_FAILURE","ROLLED_BACK","ESCALATED"]},"size":{"type":["integer","string","null"]},"host":{"type":["string","null"]},"stage":{"type":["string","null"]},"slices":{"type":"array","items":{"type":"object","required":["id","status"],"properties":{"id":{"type":"string","minLength":1},"lane":{"type":["string","null"]},"tier":{"type":["string","null"]},"status":{"type":"string"},"attempts":{"type":"integer","minimum":0},"escalations":{"type":"integer","minimum":0}}}},"gates":{"type":"object"},"handoffs":{"type":"integer","minimum":0},"stop_refusals":{"type":"integer","minimum":0},"review":{"type":"object","required":["round","exit"],"properties":{"round":{"type":"integer","minimum":0},"exit":{"type":["string","null"]}}},"created_at":{"type":"string","minLength":1},"updated_at":{"type":"string","minLength":1},"ceiling":{"type":["string","object","null"]},"park":{"type":["object","null"]},"handoff_state":{"type":["string","object","null"]},"run_verdict":{"enum":["DONE_ALL_VERIFIED","DONE_WITH_RESIDUALS","BLOCKED","NEEDS_RESET","USAGE_LIMIT",null]},"deploy":{"type":["object","null"]},"last_journal":{"type":["string","null"]}}},"events.schema.json":{"$id":"do-it-event/1","title":"events.jsonl row (trace fields frozen for v2 exporters)","type":"object","required":["ts","run_id","slice_id","stage","persona","tier","model","host","event","parent_id","verdict"],"properties":{"ts":{"type":"string","minLength":1},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"stage":{"type":["string","null"]},"persona":{"type":["string","null"]},"tier":{"type":["string","null"]},"model":{"type":["string","null"]},"host":{"type":["string","null"]},"event":{"type":"string","minLength":1},"parent_id":{"type":["string","null"]},"verdict":{"type":["string","null"]},"detail":{"type":["object","string","null"]}},"additionalProperties":false},"finish-line.schema.json":{"$id":"do-it-finish-line/1","title":"finish-line.json: rows that must all become terminal","type":"object","required":["rows"],"properties":{"rows":{"type":"array","items":{"type":"object","required":["id","kind","state"],"properties":{"id":{"type":"string","minLength":1},"kind":{"enum":["wave","package","dod"]},"state":{"enum":["OPEN","DONE","PARKED","BLOCKED"]},"evidence":{"type":["string","null"]},"owner_question":{"type":["string","null"]},"reason":{"type":["string","null"]},"archived_to":{"type":["string","null"]}}}}}},"it-result.1.schema.json":{"$id":"it-result/1","title":"Result file every stage writes as its last act","type":"object","required":["schema","stage","run_id","status","exit_code"],"properties":{"schema":{"const":"it-result/1"},"stage":{"enum":["prompt-it","plan-it","build-it","review-it","deploy-it","conclude-it","reconcile-it"]},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"version":{"type":["string","null"]},"head_sha":{"type":["string","null"]},"status":{"enum":["ok","needs_human","blocked","failed","context_reset","usage_limit"]},"exit_code":{"type":"integer","minimum":0,"maximum":3},"verdicts":{"type":"array","items":{"type":"object","required":["row","verdict"],"properties":{"row":{"type":"string","minLength":1},"verdict":{"enum":["VERIFIED","IMPLEMENTED-NOT-VERIFIED","BLOCKED"]},"evidence":{"type":["string","null"]},"real":{"type":"boolean"}}}},"reason":{"type":["string","null"]},"run_verdict":{"enum":["DONE_ALL_VERIFIED","DONE_WITH_RESIDUALS","BLOCKED","NEEDS_RESET","USAGE_LIMIT",null]},"next":{"type":["object","null"]},"pending_human":{"type":["object","null"]},"artifacts":{"type":"array","items":{"type":"object","required":["path"],"properties":{"path":{"type":"string"},"kind":{"type":["string","null"]},"sha256":{"type":["string","null"]}}}},"resume":{"type":["object","null"]},"tokens":{"type":["object","null"]},"rollback":{"type":"boolean"},"legs":{"type":"array","items":{"type":"object","required":["leg","state"],"properties":{"leg":{"type":"string","minLength":1},"state":{"enum":["DEPLOYED_VERIFIED","DEPLOYED_UNVERIFIED","HELD","FAILED","NEEDS_HUMAN","ROLLED_BACK","ROLLBACK_FAILED"]},"evidence":{"type":["string","null"]},"compensate":{"type":["string","object","array","null"]}}}}}},"ledger.schema.json":{"$id":"do-it-ledger/1","title":"ledger.json: latest verdict and evidence per DoD row","type":"object","required":["schema","run_id","rows"],"properties":{"schema":{"const":"do-it-ledger/1"},"run_id":{"type":"string","minLength":1},"rows":{"type":"array","items":{"type":"object","required":["row","verdict","evidence","evidence_sha256","real","recorded_at","updated_at"],"properties":{"row":{"type":"string","minLength":1},"verdict":{"enum":["VERIFIED","IMPLEMENTED-NOT-VERIFIED","BLOCKED"]},"evidence":{"type":["string","null"]},"evidence_path":{"type":["string","null"]},"evidence_sha256":{"type":["string","null"]},"real":{"type":"boolean"},"reason":{"type":["string","null"]},"recorded_at":{"type":"string","minLength":1},"updated_at":{"type":"string","minLength":1}}}}}},"readiness.schema.json":{"$id":"do-it-readiness/1","title":"plan/READINESS.json: the verdict that lets a build start (G-8)","type":"object","required":["decisions","preflight"],"properties":{"decisions":{"type":["array","object"]},"preflight":{"type":"object","required":["passed"],"properties":{"passed":{"type":"boolean"}}},"credentials":{"type":"array","items":{"type":"string","minLength":1}},"owner_dependent_slices":{"type":"integer","minimum":0},"slices":{"type":"array","items":{"type":"object","required":["id"],"properties":{"id":{"type":"string","minLength":1},"lane":{"type":["string","null"]},"tier":{"type":["string","null"]},"class":{"enum":["deterministic","gather","implementation","hard",null]},"depends_on":{"type":"array","items":{"type":"string"}},"depends_on_owner_answer":{"type":"boolean"}}}}}},"settings.schema.json":{"$id":"do-it-settings/1","title":"do-it settings (workspace, global or merged)","type":"object","additionalProperties":false,"properties":{"version":{"const":1},"interaction":{"type":"object","additionalProperties":false,"properties":{"owner_pack":{"enum":["auto","native","html","markdown"]},"fallback":{"type":"array","items":{"enum":["native","html","markdown"]}}}},"host":{"type":"object","additionalProperties":false,"properties":{"driver":{"type":"string","minLength":1},"alias":{"type":["string","null"]}}},"isolation":{"type":"object","additionalProperties":false,"properties":{"driver":{"type":"string","minLength":1}}},"state":{"type":"object","additionalProperties":false,"properties":{"backend":{"type":"string","minLength":1},"engine":{"type":"object","additionalProperties":false,"properties":{"blobs":{"enum":["rows","r2","fs-mirror"]}}}}},"secrets":{"type":"object","additionalProperties":false,"properties":{"provider":{"enum":["file","env","aws-secrets-manager","onepassword","1password"]},"ref":{"type":"string"}}},"handoff":{"type":"object","additionalProperties":false,"properties":{"mode":{"enum":["auto","ask"]},"max_per_run":{"type":"integer","minimum":1}}},"review":{"type":"object","additionalProperties":false,"properties":{"max_rounds":{"type":"integer","minimum":1},"cost_cap_tokens":{"type":"integer","minimum":1}}},"tiers":{"type":"object","additionalProperties":false,"properties":{"T1":{"type":"string"},"T2":{"type":"string"},"T3":{"type":"string"}}},"ceilings":{"type":"object","additionalProperties":false,"properties":{"warn_tokens":{"type":"integer","minimum":0},"warn_pct":{"type":"number","minimum":0,"maximum":100},"block_tokens":{"type":"integer","minimum":0},"block_pct":{"type":"number","minimum":0,"maximum":100}}},"stop_gate":{"type":"object","additionalProperties":false,"properties":{"patience":{"type":"integer","minimum":0}}},"observability":{"type":"object","additionalProperties":false,"properties":{"provider":{"type":"string","minLength":1}}}}},"token-meter.schema.json":{"$id":"do-it-token-meter/1","title":"token-meter.jsonl row: the event fields plus usage fields","type":"object","required":["ts","run_id","slice_id","stage","persona","tier","model","host","event","parent_id","verdict","tokens_in","tokens_out","cache_read","cache_write","estimated","source"],"properties":{"ts":{"type":"string","minLength":1},"run_id":{"type":"string","minLength":1},"slice_id":{"type":["string","null"]},"stage":{"type":["string","null"]},"persona":{"type":["string","null"]},"tier":{"type":["string","null"]},"model":{"type":["string","null"]},"host":{"type":["string","null"]},"event":{"type":"string","minLength":1},"parent_id":{"type":["string","null"]},"verdict":{"type":["string","null"]},"tokens_in":{"type":"integer","minimum":0},"tokens_out":{"type":"integer","minimum":0},"cache_read":{"type":"integer","minimum":0},"cache_write":{"type":"integer","minimum":0},"estimated":{"type":"boolean"},"source":{"enum":["provider","estimate","unknown"]},"extra":{"type":["object","null"]}},"additionalProperties":false}};

// ---- ceiling.mjs ----
// S5 fills this in. Until then no ceiling blocks `next`.
function ceilingBlock(_ctx, _state) {
  return null;
}

// ---- cli.mjs ----
const BOOL_FLAGS = new Set(['json', 'migrate', 'install', 'secrets', 'append', 'force', 'finalize', 'help', 'version', 'verbose']);
const COMMANDS = ['init', 'start', 'next', 'record', 'gate', 'answer', 'handoff', 'resume', 'park', 'status', 'meter', 'doctor'];

function parseArgs(argv) {
  const out = { positionals: [], flags: {}, sets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-v') { out.flags.version = true; continue; }
    if (!a.startsWith('--')) { out.positionals.push(a); continue; }
    let name = a.slice(2);
    let value;
    const eq = name.indexOf('=');
    if (eq !== -1) { value = name.slice(eq + 1); name = name.slice(0, eq); }
    if (name === 'set') {
      if (value === undefined) { value = argv[i + 1]; i++; }
      out.sets.push(value === undefined ? '' : value);
      continue;
    }
    if (BOOL_FLAGS.has(name) && value === undefined) { out.flags[name] = true; continue; }
    if (value === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { value = next; i++; } else value = true;
    }
    out.flags[name] = value;
  }
  return out;
}

function notImplemented(epic, what) {
  return { outcome: 'NOT_IMPLEMENTED', exit: 1, epic, command: what };
}

function renderHuman(result) {
  const lines = ['OUTCOME: ' + result.outcome];
  for (const key of Object.keys(result)) {
    if (key === 'outcome') continue;
    const v = result[key];
    lines.push(key + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  }
  return lines.join('\n') + '\n';
}

function dispatch(ctx, args) {
  const cmd = args.positionals[0];
  switch (cmd) {
    case 'init': return cmdInit(ctx, args);
    case 'start': return cmdStart(ctx, args);
    case 'status': return cmdStatus(ctx, args);
    case 'meter': return cmdMeter(ctx, args);
    case 'doctor': return cmdDoctor(ctx, args);
    case 'record': return cmdRecord(ctx, args);
    case 'gate': return cmdGate(ctx, args);
    case 'next': return cmdNext(ctx, args);
    case 'answer': return notImplemented('S4', 'answer');
    case 'handoff': return notImplemented('S5', 'handoff');
    case 'resume': return notImplemented('S5', 'resume');
    case 'park': return notImplemented('S5', 'park');
    default:
      throw fail('USAGE', 1, { message: 'unknown command', commands: COMMANDS });
  }
}

// In-process entry: no process globals are read or written, so tests and the
// built file share one code path. Returns { exit, stdout }.
function cliMain(argv, opts) {
  const args = parseArgs(argv);
  const json = !!args.flags.json;
  let result;
  let ctx = null;
  try {
    if (args.flags.version) {
      result = { outcome: 'VERSION', exit: 0, version: DO_IT_VERSION };
      return { exit: 0, stdout: json ? JSON.stringify(result) + '\n' : DO_IT_VERSION + '\n' };
    }
    if (!args.positionals.length || args.flags.help) {
      result = { outcome: 'USAGE', exit: args.flags.help ? 0 : 1, commands: COMMANDS };
    } else {
      ctx = makeCtx({ cwd: opts && opts.cwd, env: opts && opts.env });
      result = dispatch(ctx, args);
    }
  } catch (e) {
    if (e instanceof CliError) {
      result = { outcome: e.outcome, exit: e.exit, ...e.extra };
    } else {
      result = { outcome: 'INTERNAL_ERROR', exit: 1, message: String(e && e.message ? e.message : e) };
    }
  }
  const exit = typeof result.exit === 'number' ? result.exit : 0;
  result.exit = exit;
  if (ctx) {
    if (result.root === undefined) result.root = ctx.root;
    if (result.home === undefined) result.home = ctx.home;
  }
  return { exit, stdout: json ? JSON.stringify(result) + '\n' : renderHuman(result) };
}

function cmdStart(ctx, args) {
  const f = args.flags;
  if (typeof f.request !== 'string' || !f.request.trim()) throw fail('USAGE', 1, { message: 'start requires --request "<text>"' });
  const settings = loadSettings(ctx, args.sets);
  const runId = newRunId(ctx);
  const size = f.size === undefined ? null : (/^\d+$/.test(String(f.size)) ? Number(f.size) : String(f.size));
  const state = newState(ctx, runId, {
    preset: typeof f.preset === 'string' ? f.preset : null,
    request: f.request,
    size,
    host: typeof f.host === 'string' ? f.host : settings.values.host.driver,
  });
  const routed = state.preset ? null : route(f.request);
  if (routed && routed.preset) {
    state.preset = routed.preset;
    if (state.size === null && routed.size !== null) state.size = routed.size;
  }
  fs.mkdirSync(path.join(runDir(ctx, runId), 'results'), { recursive: true });
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'run_started', stage: state.stage, host: state.host, verdict: null });
  if (routed && routed.preset) {
    appendEvent(ctx, runId, { event: 'route', stage: state.stage, host: state.host, verdict: routed.preset, detail: { rule: routed.rule, model_call: false } });
  }
  return { outcome: 'STARTED', exit: 0, run_id: runId, status: state.status, preset: state.preset, root: ctx.root, home: ctx.home };
}

function cmdStatus(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const removed = cleanStaleTmp(runDir(ctx, runId)) + cleanStaleTmp(path.join(runDir(ctx, runId), 'results'));
  const state = loadState(ctx, runId);
  return {
    outcome: 'STATUS',
    exit: 0,
    run_id: runId,
    status: state.status,
    preset: state.preset,
    stage: state.stage,
    host: state.host,
    root: ctx.root,
    home: ctx.home,
    slices: state.slices,
    handoffs: state.handoffs,
    stop_refusals: state.stop_refusals,
    run_verdict: state.run_verdict === undefined ? null : state.run_verdict,
    board: renderBoard(readFinishLine(ctx)),
    stale_tmp_removed: removed,
  };
}

function cmdGate(ctx, args) {
  const sub = args.positionals[1];
  switch (sub) {
    case 'verify': return gateVerify(ctx, args);
    case 'conclude': return gateConclude(ctx, args);
    case 'advance': return gateAdvance(ctx, args);
    case 'build': return gateBuild(ctx, args);
    case 'stop': return gateStop(ctx, args);
    case 'route': return gateRoute(ctx, args);
    case 'ceiling':
      return notImplemented('S5', 'gate ' + sub);
    default:
      throw fail('USAGE', 1, { message: 'gate needs a subcommand', subcommands: ['verify', 'conclude', 'advance', 'build', 'stop', 'route', 'ceiling'] });
  }
}

function gateAdvance(ctx, args) {
  const to = args.flags.to;
  if (typeof to !== 'string') throw fail('USAGE', 1, { message: 'gate advance requires --to STATUS' });
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const moved = advanceRunStatus(ctx, state, to);
  return { outcome: 'ADVANCED', exit: 0, run_id: runId, from: moved.from, status: moved.to };
}

// ---- conclude.mjs ----
// G-13: close only with every row accounted, no live worker, no pending wake.
function computeRunVerdict(ledger, fl) {
  const rows = ledger.rows;
  if (!rows.length) return 'DONE_WITH_RESIDUALS';
  if (rows.some((r) => r.verdict !== 'VERIFIED')) return 'DONE_WITH_RESIDUALS';
  if (fl.rows.some((r) => r.state !== 'DONE')) return 'DONE_WITH_RESIDUALS';
  return 'DONE_ALL_VERIFIED';
}

function gateConclude(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const reverified = verifyEvidence(ctx, runId);
  const ledger = readLedger(ctx, runId);
  const fl = readFinishLine(ctx);
  const reasons = [];

  const inLedger = new Set(ledger.rows.map((r) => r.row));
  const unaccounted = fl.rows.filter((r) => {
    if (inLedger.has(r.id)) return false;
    if (r.state === 'DONE' && r.evidence) return false;
    if (r.state === 'PARKED' && r.owner_question) return false;
    if (r.state === 'BLOCKED' && r.reason) return false;
    return true;
  }).map((r) => r.id);
  if (unaccounted.length) reasons.push({ reason: 'unaccounted_row', ids: unaccounted });

  const live = state.slices.filter((s) => s.status === 'RUNNING').map((s) => s.id);
  if (live.length) reasons.push({ reason: 'live_worker', ids: live });

  const wake = readJsonIfExists(path.join(ctx.home, 'runs', runId, 'wake.json'));
  if (wake && wake.status === 'scheduled') reasons.push({ reason: 'pending_wake', ids: wake.id ? [String(wake.id)] : [] });

  const legs = (state.deploy && state.deploy.legs) || [];
  if (legs.some((l) => l.state !== 'DEPLOYED_VERIFIED') || state.status === 'PARTIAL_FAILURE' || state.status === 'ROLLED_BACK') {
    reasons.push({ reason: 'deploy_not_reverified', ids: legs.filter((l) => l.state !== 'DEPLOYED_VERIFIED').map((l) => l.leg) });
  }
  if (reasons.length) {
    appendEvent(ctx, runId, { event: 'conclude_refused', verdict: reasons[0].reason, detail: { reasons } });
    throw fail('CONCLUDE_REFUSED', 1, { run_id: runId, reason: reasons[0].reason, ids: reasons[0].ids, reasons });
  }

  const runVerdict = computeRunVerdict(ledger, fl);
  state.status = 'DONE';
  state.run_verdict = runVerdict;
  state.stage = 'conclude-it';
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'concluded', stage: 'conclude-it', host: state.host, verdict: runVerdict });
  const residuals = ledger.rows.filter((r) => r.verdict !== 'VERIFIED').map((r) => r.row);
  return { outcome: 'CONCLUDED', exit: 0, run_id: runId, status: 'DONE', run_verdict: runVerdict, residuals, reverified: reverified.map((c) => c.row) };
}

// ---- ctx.mjs ----
function realpathSafe(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

function gitInfo(cwd, env) {
  try {
    const out = cp.execFileSync('git', ['rev-parse', '--show-toplevel', '--git-common-dir'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
    const top = realpathSafe(out[0].trim());
    const common = realpathSafe(path.resolve(cwd, out[1].trim()));
    const main = path.basename(common) === '.git' ? path.dirname(common) : top;
    return { top, main: realpathSafe(main) };
  } catch {
    return null;
  }
}

// Home rule (ruling D7): DO_IT_HOME wins; else the main checkout of the git
// repository (so every worktree shares one .do-it/); else the working directory.
function makeCtx(opts) {
  const env = opts.env || process.env;
  const cwd = realpathSafe(opts.cwd || process.cwd());
  const git = gitInfo(cwd, env);
  let root;
  let home;
  if (env.DO_IT_HOME) {
    root = realpathSafe(path.resolve(cwd, env.DO_IT_HOME));
    home = root;
  } else {
    root = git ? git.main : cwd;
    home = path.join(root, '.do-it');
  }
  return {
    cwd,
    env,
    git,
    repo: git ? git.top : cwd,
    root,
    home,
    userHome: env.HOME || os.homedir(),
    now: () => new Date().toISOString(),
  };
}

// ---- doctor.mjs ----
function cmdDoctor(ctx, args) {
  const f = args.flags;
  if (f.install) return cmdInstall(ctx);
  if (f.migrate) return cmdMigrate(ctx);
  if (f.secrets) return notImplemented('S5', 'doctor --secrets');
  const loaded = loadSettings(ctx, args.sets);
  const settings = {};
  for (const e of loaded.entries) settings[e.key] = { value: e.value, source: e.source };
  return {
    outcome: 'DOCTOR_OK',
    exit: 0,
    version: DO_IT_VERSION,
    node: process.version,
    root: ctx.root,
    home: ctx.home,
    repo: ctx.repo,
    files: loaded.files,
    entries: loaded.entries,
    settings,
  };
}

// ---- errors.mjs ----
class CliError extends Error {
  constructor(outcome, exit, extra) {
    super(outcome);
    this.outcome = outcome;
    this.exit = exit;
    this.extra = extra || {};
  }
}

function fail(outcome, exit, extra) {
  return new CliError(outcome, exit === undefined ? 1 : exit, extra);
}

// ---- events.mjs ----
const EVENT_FIELDS = ['ts', 'run_id', 'slice_id', 'stage', 'persona', 'tier', 'model', 'host', 'event', 'parent_id', 'verdict'];

function eventsPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'events.jsonl');
}

// Frozen row: exactly the 11 trace fields; `detail` is added only when given.
function buildEventRow(ctx, runId, fields) {
  const row = {};
  for (const k of EVENT_FIELDS) row[k] = fields[k] === undefined ? null : fields[k];
  row.ts = fields.ts || ctx.now();
  row.run_id = runId;
  if (fields.detail !== undefined) row.detail = fields.detail;
  return row;
}

function appendEvent(ctx, runId, fields) {
  const row = buildEventRow(ctx, runId, fields);
  const errors = validateSchema(loadSchemaFile('events.schema.json'), row);
  if (errors.length) throw fail('EVENT_INVALID', 1, { errors });
  appendLine(eventsPath(ctx, runId), JSON.stringify(row));
  return row;
}

// ---- evidence.mjs ----
function normalizeRel(p) {
  return path.normalize(String(p)).replace(/^\.\//, '');
}

function insideDir(real, base) {
  const rel = path.relative(base, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Evidence forms (D15): a path under the repo, `result:<file>` under runs/<id>/results/,
// or `sha256:<hex>` naming an entry in the result's artifacts[] whose file hashes to it.
// The spine re-reads the file; it never trusts mtime or the model's claim.
function resolveEvidence(ctx, runId, evidence, artifacts) {
  if (typeof evidence !== 'string' || !evidence.trim()) return { ok: false, reason: 'empty' };
  const ev = evidence.trim();
  const arts = Array.isArray(artifacts) ? artifacts : [];
  if (ev.startsWith('sha256:')) {
    const hex = ev.slice(7).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) return { ok: false, reason: 'bad_sha256' };
    const art = arts.find((a) => a && typeof a.sha256 === 'string' && a.sha256.toLowerCase().replace(/^sha256:/, '') === hex && a.path);
    if (!art) return { ok: false, reason: 'no_matching_artifact' };
    const inner = resolveEvidence(ctx, runId, art.path, []);
    if (!inner.ok) return { ok: false, reason: 'artifact_file_' + inner.reason };
    if (inner.sha256 !== hex) return { ok: false, reason: 'artifact_hash_differs' };
    return { ...inner, kind: art.kind || null };
  }
  let abs;
  let bases;
  let stored = ev;
  if (ev.startsWith('result:')) {
    const resultsDir = path.join(ctx.home, 'runs', runId, 'results');
    abs = path.resolve(resultsDir, ev.slice(7));
    bases = [resultsDir];
  } else {
    abs = path.resolve(ctx.repo, ev);
    bases = [ctx.repo, ctx.home];
    stored = normalizeRel(ev);
  }
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  const baseReals = bases.map((b) => { try { return fs.realpathSync(b); } catch { return b; } });
  if (!baseReals.some((b) => insideDir(real, b))) return { ok: false, reason: 'outside_repo' };
  let st;
  try { st = fs.statSync(real); } catch { return { ok: false, reason: 'missing' }; }
  if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  const art = arts.find((a) => a && a.path && normalizeRel(a.path) === stored);
  return { ok: true, path: stored, abs: real, sha256: sha256File(real), mtime_ms: st.mtimeMs, kind: art ? art.kind || null : null };
}

// ---- finish-line.mjs ----
// finish-line.json: the board of rows that must all become terminal (CONTRACT section 2).
// States: OPEN, DONE (the closed state, needs evidence), PARKED (needs owner_question),
// BLOCKED (needs reason).
const BOARD_CAP = 1200;

function finishLinePath(ctx) {
  return path.join(ctx.home, 'finish-line.json');
}

function readFinishLine(ctx) {
  const fl = readJsonIfExists(finishLinePath(ctx));
  if (!fl || !Array.isArray(fl.rows)) return { rows: [] };
  return fl;
}

function writeFinishLine(ctx, fl) {
  const errors = validateSchema(loadSchemaFile('finish-line.schema.json'), fl);
  if (errors.length) throw fail('FINISH_LINE_INVALID', 1, { errors });
  atomicWriteJson(finishLinePath(ctx), fl);
}

function finishLineUpsert(fl, id, patch) {
  let row = fl.rows.find((r) => r.id === id);
  if (!row) {
    row = { id, kind: 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null };
    fl.rows.push(row);
  }
  Object.assign(row, patch);
  return row;
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// Terminal = closed with evidence, or PARKED with a question, or BLOCKED with a reason.
function rowTerminal(row) {
  if (row.state === 'DONE') return nonEmpty(row.evidence);
  if (row.state === 'PARKED') return nonEmpty(row.owner_question);
  if (row.state === 'BLOCKED') return nonEmpty(row.reason);
  return false;
}

function rowClosed(row) {
  return row.state === 'DONE' && nonEmpty(row.evidence);
}

function openRows(fl) {
  return fl.rows.filter((r) => !rowTerminal(r));
}

// Signature of row states: any change in it is progress for the stop-gate.
function rowsSignature(fl) {
  return fl.rows.map((r) => r.id + '=' + r.state + (rowTerminal(r) ? '+' : '-')).join('|');
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '~' : t;
}

// Roughly 300 tokens, never more than BOARD_CAP characters, deterministic.
function renderBoard(fl) {
  const rows = fl.rows;
  const closed = rows.filter(rowClosed);
  const parked = rows.filter((r) => r.state === 'PARKED');
  const blocked = rows.filter((r) => r.state === 'BLOCKED');
  const open = rows.filter((r) => !rowClosed(r) && r.state !== 'PARKED' && r.state !== 'BLOCKED');
  const build = (detail) => {
    const lines = ['FINISH LINE: ' + closed.length + ' of ' + rows.length + ' closed'];
    if (open.length) lines.push('OPEN (' + open.length + '): ' + open.map((r) => r.id).join(' '));
    if (parked.length) lines.push('PARKED (' + parked.length + '): ' + parked.map((r) => r.id + (detail ? ' [' + clip(r.owner_question, detail) + ']' : '')).join('; '));
    if (blocked.length) lines.push('BLOCKED (' + blocked.length + '): ' + blocked.map((r) => r.id + (detail ? ' [' + clip(r.reason, detail) + ']' : '')).join('; '));
    return lines.join('\n');
  };
  for (const detail of [40, 16, 0]) {
    const text = build(detail);
    if (text.length <= BOARD_CAP) return text;
  }
  // very large boards: keep the counts and as many ids as fit
  let text = build(0);
  while (text.length > BOARD_CAP - 24) {
    const cut = text.lastIndexOf(' ', BOARD_CAP - 30);
    text = text.slice(0, cut > 0 ? cut : BOARD_CAP - 30);
  }
  return text + ' ... (truncated)';
}

// ---- fs-atomic.mjs ----
const TMP_PATTERN = /\.tmp-\d+-[0-9a-f]{8}$/;

// temp file in the same directory, fsync, rename. opts.faultAfterTmp is the
// DO_IT_FAULT=after_tmp test hook: stop after the temp file is durable.
function atomicWrite(file, data, opts) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (opts && opts.faultAfterTmp) throw fail('FAULT_INJECTED', 1, { fault: 'after_tmp' });
  fs.renameSync(tmp, file);
  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch {
    // directory fsync is best effort
  }
}

function atomicWriteJson(file, value, opts) {
  atomicWrite(file, JSON.stringify(value, null, 2) + '\n', opts);
}

function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n');
}

function readJsonIfExists(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text);
}

function cleanStaleTmp(dir) {
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    if (TMP_PATTERN.test(name)) {
      try { fs.unlinkSync(path.join(dir, name)); removed++; } catch { /* ignore */ }
    }
  }
  return removed;
}

// ---- hash.mjs ----
function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

// ---- init.mjs ----
const ENV_EXAMPLE_TEXT = [
  '# Credential NAMES only. Values live in the secrets provider named in',
  '# .do-it/settings.json (references only), never in this file.',
  '# Add one NAME= line per credential the project needs, with no value.',
  '',
].join('\n');

const GITIGNORE_LINES = ['.do-it/runs/', '.secrets/'];

function writeIfDifferent(file, text) {
  let current = null;
  try { current = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
  if (current === text) return false;
  atomicWrite(file, text);
  return true;
}

function cmdInit(ctx, args) {
  const f = args.flags;
  const provider = f['secrets-provider'];
  const ref = f['secrets-ref'];
  const schema = loadSchemaFile('settings.schema.json');
  fs.mkdirSync(ctx.home, { recursive: true });
  const settingsFile = path.join(ctx.home, 'settings.json');
  let settings;
  let existed = fs.existsSync(settingsFile);
  if (existed) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) {
      throw fail('SETTINGS_INVALID', 1, { errors: [{ file: settingsFile, pointer: '', message: 'JSON parse error: ' + e.message }] });
    }
  } else {
    settings = settingsClone(SETTINGS_DEFAULTS);
  }
  if (!isPlainObject(settings.secrets)) settings.secrets = settingsClone(SETTINGS_DEFAULTS.secrets);
  if (provider !== undefined) settings.secrets.provider = provider;
  if (ref !== undefined) settings.secrets.ref = ref;
  const secretHits = settingsScanSecrets(settings, '', []);
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, { errors: secretHits.map((k) => ({ file: settingsFile, key: k, pointer: '/' + k.split('.').join('/') })) });
  }
  const errors = validateSchema(schema, settings);
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors: errors.map((e) => ({ file: settingsFile, pointer: e.pointer, message: e.message })) });

  const changed = [];
  if (writeIfDifferent(settingsFile, JSON.stringify(settings, null, 2) + '\n')) changed.push(settingsFile);
  const envExample = path.join(ctx.home, '.env.example');
  if (!fs.existsSync(envExample) && writeIfDifferent(envExample, ENV_EXAMPLE_TEXT)) changed.push(envExample);

  const ignoreFile = path.join(ctx.repo, '.gitignore');
  let ignoreText = '';
  try { ignoreText = fs.readFileSync(ignoreFile, 'utf8'); } catch { /* absent */ }
  const present = new Set(ignoreText.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !present.has(l));
  if (missing.length) {
    const prefix = ignoreText.length && !ignoreText.endsWith('\n') ? '\n' : '';
    atomicWrite(ignoreFile, ignoreText + prefix + missing.join('\n') + '\n');
    changed.push(ignoreFile);
  }
  return {
    outcome: changed.length ? 'INIT_OK' : 'INIT_NOOP',
    exit: 0,
    root: ctx.root,
    home: ctx.home,
    changed,
    secrets: settings.secrets,
  };
}

// ---- install.mjs ----
function installSource() {
  const self = fileURLToPath(import.meta.url);
  if (path.basename(self) === 'do-it.mjs') return self;
  return path.join(path.dirname(self), '..', 'do-it.mjs');
}

function cmdInstall(ctx) {
  const source = installSource();
  if (!fs.existsSync(source)) throw fail('INSTALL_NO_BUILD', 1, { message: 'run node core/spine/build.mjs first', source });
  const binDir = ctx.env.DO_IT_BIN_DIR ? path.resolve(ctx.cwd, ctx.env.DO_IT_BIN_DIR) : path.join(ctx.userHome, '.do-it', 'bin');
  const dest = path.join(binDir, 'do-it');
  fs.mkdirSync(binDir, { recursive: true });
  atomicWrite(dest, fs.readFileSync(source));
  fs.chmodSync(dest, 0o755);
  let printed = '';
  try {
    printed = cp.execFileSync(process.execPath, [dest, '--version'], { encoding: 'utf8', env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw fail('INSTALL_VERIFY_FAILED', 1, { dest, message: 'installed file did not run: ' + e.message });
  }
  if (printed !== DO_IT_VERSION) throw fail('INSTALL_VERIFY_FAILED', 1, { dest, printed, expected: DO_IT_VERSION });
  return { outcome: 'INSTALLED', exit: 0, bin_dir: binDir, path: dest, version: printed, sha256: sha256File(dest) };
}

// ---- ladder.mjs ----
// Failure ladder (D14, CONTRACT M1): FAILED, retry one tier up once with a
// written reason, second failure ESCALATED.
const TIER_UP = { T3: 'T2', T2: 'T1', T1: 'T1' };
const RETRY_REASON = 'retry after FAILED';
const LADDER_MAX_ATTEMPTS = 2;

function ladderEscalated(slice) {
  return (slice.attempts || 0) >= LADDER_MAX_ATTEMPTS;
}

// Called by `next`: every FAILED slice with one attempt is requeued one tier up.
// Returns the changes so the caller can log them.
function ladderRetry(state) {
  const changes = [];
  for (const s of state.slices) {
    if (s.status !== 'FAILED' || ladderEscalated(s)) continue;
    const from = s.tier || 'T2';
    s.tier = TIER_UP[from] || 'T1';
    s.escalations = (s.escalations || 0) + 1;
    s.status = 'READY';
    changes.push({ slice_id: s.id, from, to: s.tier, reason: RETRY_REASON });
  }
  return changes;
}

function escalationQuestion(slice) {
  return {
    kind: 'owner-gate',
    text: 'Slice ' + slice.id + ' failed twice (attempts ' + slice.attempts + ', last tier ' + (slice.tier || 'unknown') + ') and was escalated. How should it proceed?',
    options: ['re-plan slice', 'take over manually', 'drop slice'],
    recommendation: 're-plan slice',
    default: 're-plan slice',
    reversible: true,
  };
}

// ---- ledger.mjs ----
function ledgerPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'ledger.json');
}

function readLedger(ctx, runId) {
  const l = readJsonIfExists(ledgerPath(ctx, runId));
  if (!l || !Array.isArray(l.rows)) return { schema: 'do-it-ledger/1', run_id: runId, rows: [] };
  return l;
}

function writeLedger(ctx, ledger) {
  const errors = validateSchema(loadSchemaFile('ledger.schema.json'), ledger);
  if (errors.length) throw fail('LEDGER_INVALID', 1, { errors });
  atomicWriteJson(ledgerPath(ctx, ledger.run_id), ledger);
}

// One row per id: the latest verdict wins, recorded_at is kept from the first write.
function ledgerUpsert(ledger, row) {
  const i = ledger.rows.findIndex((r) => r.row === row.row);
  if (i === -1) {
    ledger.rows.push(row);
  } else {
    ledger.rows[i] = { ...row, recorded_at: ledger.rows[i].recorded_at };
  }
}

// ---- legs.mjs ----
// Deploy legs (D17): the multi-leg cascade PARTIAL_FAILURE -> ROLLED_BACK -> re-verify,
// or ESCALATED when a compensation fails. Pure planning; record.mjs persists it.
const LEG_PASSED = 'DEPLOYED_VERIFIED';

function legsLookRolledBack(state, result) {
  if (result.rollback === true) return true;
  const legs = result.legs || [];
  if (legs.some((l) => l.state === 'ROLLED_BACK' || l.state === 'ROLLBACK_FAILED')) return true;
  const plan = state.deploy && state.deploy.rollback_plan;
  if (state.status === 'PARTIAL_FAILURE' && Array.isArray(plan) && plan.length) {
    return legs.length > 0 && legs.every((l) => plan.includes(l.leg) && !String(l.state).startsWith('DEPLOYED'));
  }
  return false;
}

function legRow(leg, resolved, now, extra) {
  const base = {
    evidence: leg.evidence || null,
    evidence_path: resolved ? resolved.path : null,
    evidence_sha256: resolved ? resolved.sha256 : null,
    real: false,
    reason: null,
    recorded_at: now,
    updated_at: now,
  };
  return { ...base, ...extra };
}

// Returns { runStatus, outcome, exit, deploy, ledgerRows, events, questions, flOps }.
function planDeploy(ctx, runId, state, result, resolveLeg) {
  const now = ctx.now();
  const legs = result.legs;
  const prev = state.deploy || { legs: [], rollback_plan: [], rollback_event_ts: null };
  const plan = { ledgerRows: [], events: [], questions: [], flOps: [] };

  if (legsLookRolledBack(state, result)) {
    const legStates = prev.legs.map((l) => ({ ...l }));
    const failedLegs = [];
    for (const leg of legs) {
      const r = resolveLeg(leg);
      const rolled = leg.state === 'ROLLED_BACK' && result.status !== 'failed';
      const existing = legStates.find((l) => l.leg === leg.leg);
      const entry = { leg: leg.leg, state: rolled ? 'ROLLED_BACK' : 'ROLLBACK_FAILED', evidence: leg.evidence || null, evidence_sha256: r ? r.sha256 : null, compensate: existing ? existing.compensate : null };
      if (existing) Object.assign(existing, entry); else legStates.push(entry);
      if (rolled) {
        plan.ledgerRows.push(legRow(leg, r, now, { row: 'ROLLBACK:' + leg.leg, verdict: 'VERIFIED' }));
        plan.ledgerRows.push(legRow(leg, null, now, { row: 'DEPLOY:' + leg.leg, verdict: 'IMPLEMENTED-NOT-VERIFIED', evidence: null, reason: 'rolled_back' }));
      } else {
        failedLegs.push({ leg: leg.leg, evidence: leg.evidence || null });
      }
    }
    if (failedLegs.length) {
      const f = failedLegs[0];
      plan.questions.push({
        kind: 'owner-gate',
        text: 'Rollback of leg ' + f.leg + ' failed (evidence: ' + (f.evidence || 'none') + '). The deploy is half rolled back; how should it be resolved?',
        options: ['retry rollback', 'manual rollback', 'leave as is'],
        recommendation: 'manual rollback',
        default: 'manual rollback',
        reversible: false,
      });
      plan.events.push({ event: 'rollback_failed', stage: result.stage, verdict: 'ESCALATED', detail: { legs: failedLegs.map((x) => x.leg) } });
      plan.runStatus = 'ESCALATED';
      plan.outcome = 'ESCALATED';
      plan.exit = 2;
      plan.deploy = { ...prev, legs: legStates };
      return plan;
    }
    const order = prev.rollback_plan || [];
    const complete = order.length > 0 && order.every((name) => (legStates.find((l) => l.leg === name) || {}).state === 'ROLLED_BACK');
    plan.deploy = { ...prev, legs: legStates, rollback_event_ts: complete ? now : prev.rollback_event_ts };
    if (complete) {
      plan.events.push({ event: 'rolled_back', stage: result.stage, verdict: 'ROLLED_BACK', ts: now, detail: { legs: order } });
      plan.runStatus = 'ROLLED_BACK';
      plan.outcome = 'ROLLED_BACK';
      plan.exit = 0;
    } else {
      plan.events.push({ event: 'rollback_recorded', stage: result.stage, verdict: null, detail: { legs: legs.map((l) => l.leg) } });
      plan.runStatus = state.status;
      plan.outcome = 'RECORDED';
      plan.exit = 0;
    }
    return plan;
  }

  const legStates = legs.map((leg) => {
    const r = resolveLeg(leg);
    return { leg: leg.leg, state: leg.state, evidence: leg.evidence || null, evidence_sha256: r ? r.sha256 : null, compensate: leg.compensate === undefined ? null : leg.compensate };
  });
  for (const leg of legs) {
    const r = resolveLeg(leg);
    const passed = leg.state === LEG_PASSED;
    plan.ledgerRows.push(legRow(leg, r, now, { row: 'DEPLOY:' + leg.leg, verdict: passed ? 'VERIFIED' : 'IMPLEMENTED-NOT-VERIFIED', reason: passed ? null : 'leg_' + String(leg.state).toLowerCase() }));
  }
  const passedLegs = legs.filter((l) => l.state === LEG_PASSED).map((l) => l.leg);
  const anyFailed = legs.some((l) => l.state === 'FAILED');
  const needsHuman = legs.some((l) => l.state === 'NEEDS_HUMAN');
  plan.deploy = { legs: legStates, rollback_plan: [], rollback_event_ts: prev.rollback_event_ts || null };
  if (anyFailed && passedLegs.length) {
    plan.deploy.rollback_plan = passedLegs.slice().reverse();
    plan.runStatus = 'PARTIAL_FAILURE';
    plan.outcome = 'PARTIAL_FAILURE';
    plan.exit = 1;
    plan.events.push({ event: 'partial_failure', stage: result.stage, verdict: 'PARTIAL_FAILURE', detail: { passed: passedLegs, failed: legs.filter((l) => l.state === 'FAILED').map((l) => l.leg) } });
  } else if (anyFailed) {
    plan.runStatus = 'FAILED';
    plan.outcome = 'DEPLOY_FAILED';
    plan.exit = 1;
    plan.events.push({ event: 'deploy_failed', stage: result.stage, verdict: 'FAILED', detail: { failed: legs.map((l) => l.leg) } });
  } else if (needsHuman) {
    plan.runStatus = 'NEEDS_HUMAN';
    plan.outcome = 'RECORDED';
    plan.exit = 2;
  } else if (passedLegs.length === legs.length) {
    plan.runStatus = 'PROVING';
    plan.outcome = 'RECORDED';
    plan.exit = EXIT_FOR_STATUS[result.status];
    plan.events.push({ event: 'deploy_verified', stage: result.stage, verdict: 'PROVING', detail: { legs: passedLegs } });
  } else {
    plan.runStatus = 'DEPLOYING';
    plan.outcome = 'RECORDED';
    plan.exit = EXIT_FOR_STATUS[result.status];
  }
  return plan;
}

// ROLLED_BACK -> DEPLOYING demands evidence written after the rollback event.
function staleLegsAfterRollback(state, legs, resolveLeg) {
  const ts = state.deploy && state.deploy.rollback_event_ts;
  if (!ts) return [];
  const cutoff = Date.parse(ts);
  const stale = [];
  for (const leg of legs) {
    const r = resolveLeg(leg);
    if (!r || r.mtime_ms < cutoff) stale.push(leg.leg);
  }
  return stale;
}

// ---- meter.mjs ----
function meterPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'token-meter.jsonl');
}

// meter --append --row '<json>' (or the individual flags). A row without a
// source is refused and never appended (ruling D17, G-6).
function cmdMeter(ctx, args) {
  const f = args.flags;
  if (!f.append) throw fail('USAGE', 1, { message: 'meter requires --append' });
  const runId = selectRunId(ctx, f);
  loadState(ctx, runId);
  let input = {};
  if (f.row !== undefined) {
    try { input = JSON.parse(f.row); } catch (e) { throw fail('METER_ROW_INVALID', 1, { message: 'row is not JSON: ' + e.message }); }
  } else {
    for (const [flag, key] of [['tokens-in', 'tokens_in'], ['tokens-out', 'tokens_out'], ['cache-read', 'cache_read'], ['cache-write', 'cache_write']]) {
      if (f[flag] !== undefined) input[key] = Number(f[flag]);
    }
    if (f.source !== undefined) input.source = f.source;
    if (f.estimated !== undefined) input.estimated = f.estimated === true || f.estimated === 'true';
    for (const [flag, key] of [['slice-id', 'slice_id'], ['stage', 'stage'], ['persona', 'persona'], ['tier', 'tier'], ['model', 'model'], ['host', 'host'], ['event', 'event'], ['parent-id', 'parent_id']]) {
      if (f[flag] !== undefined) input[key] = f[flag];
    }
  }
  if (input.source === undefined || input.source === null || input.source === '') {
    throw fail('METER_SOURCE_REQUIRED', 1, { message: 'a meter row needs source: provider, estimate or unknown' });
  }
  const row = buildEventRow(ctx, runId, { ...input, event: input.event || 'meter' });
  for (const k of ['tokens_in', 'tokens_out', 'cache_read', 'cache_write']) row[k] = input[k] === undefined ? 0 : input[k];
  row.estimated = input.estimated === undefined ? false : input.estimated;
  row.source = input.source;
  if (input.extra !== undefined) row.extra = input.extra;
  const errors = validateSchema(loadSchemaFile('token-meter.schema.json'), row);
  if (errors.length) throw fail('METER_ROW_INVALID', 1, { errors });
  appendLine(meterPath(ctx, runId), JSON.stringify(row));
  return { outcome: 'METER_APPENDED', exit: 0, run_id: runId, row };
}

// ---- migrate.mjs ----
// Legacy folder -> destination folder under .do-it/ (copy only, ruling D12).
const MIGRATION_MAP = [
  { legacy: '.build-it-reports', dest: 'build/build-it-reports' },
  { legacy: '.fable-it-reports', dest: 'build/fable-it-reports' },
  { legacy: '.plan-it', dest: 'plan/plan-it' },
];
const TERMINAL_RUN_STATUSES = ['DONE', 'ESCALATED', 'FAILED'];

function migrateWalk(dir, rel, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) migrateWalk(abs, r, out);
    else if (e.isFile()) out.push({ abs, rel: r });
  }
  return out;
}

function cmdMigrate(ctx) {
  const inFlight = listRunIds(ctx).filter((id) => !TERMINAL_RUN_STATUSES.includes(peekRunStatus(ctx, id)));
  if (inFlight.length) {
    throw fail('MIGRATE_REFUSED', 1, { run_id: inFlight[0], runs: inFlight, message: 'a run is in flight; finish or close it first' });
  }
  const manifestFile = path.join(ctx.home, 'migration.json');
  let manifest = { schema: 'do-it-migration/1', files: [] };
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { /* first migration */ }
  const known = new Map(manifest.files.map((x) => [x.source, x]));
  const copied = [];
  for (const m of MIGRATION_MAP) {
    const base = path.join(ctx.repo, m.legacy);
    if (!fs.existsSync(base)) continue;
    for (const file of migrateWalk(base, '', [])) {
      const source = m.legacy + '/' + file.rel;
      const dest = '.do-it/' + m.dest + '/' + file.rel;
      const bytes = fs.readFileSync(file.abs);
      const sha = sha256Bytes(bytes);
      const prior = known.get(source);
      const destAbs = path.join(ctx.home, m.dest, file.rel);
      if (prior && prior.sha256 === sha && fs.existsSync(destAbs) && sha256File(destAbs) === sha) continue;
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.writeFileSync(destAbs, bytes);
      const row = { source, dest, sha256: sha };
      known.set(source, row);
      copied.push(row);
    }
  }
  if (!copied.length) return { outcome: 'MIGRATE_NOOP', exit: 0, copied: [] };
  manifest.files = Array.from(known.values()).sort((a, b) => (a.source < b.source ? -1 : 1));
  atomicWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { outcome: 'MIGRATED', exit: 0, copied, manifest: manifestFile };
}

// ---- next.mjs ----
const SLICE_TERMINAL = ['DONE', 'BLOCKED', 'ESCALATED'];
const STEP_CLASS = { code: 'deterministic', checkpoint: 'gather', decision: 'gather', persona: 'implementation' };
const STEP_ACTION = { code: 'RUN_CODE', checkpoint: 'CHECKPOINT', decision: 'CHECKPOINT', persona: 'SPAWN' };

function none(runId, reason, extra) {
  return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'NONE', reason, ...(extra || {}) };
}

function sliceRunnable(state, s) {
  if (s.status !== 'READY' && s.status !== 'PENDING' && s.status !== undefined) return false;
  const deps = Array.isArray(s.depends_on) ? s.depends_on : [];
  return deps.every((d) => {
    const dep = state.slices.find((x) => x.id === d);
    return dep && dep.status === 'DONE';
  });
}

function nextSlice(ctx, state, runId) {
  const retried = ladderRetry(state);
  if (retried.length) {
    writeState(ctx, state);
    for (const c of retried) {
      appendEvent(ctx, runId, { event: 'tier_escalated', slice_id: c.slice_id, stage: state.stage, host: state.host, tier: c.to, verdict: 'RETRY', detail: { from: c.from, to: c.to, reason: c.reason } });
    }
  }
  const s = state.slices.find((x) => sliceRunnable(state, x));
  if (!s) return null;
  const klass = s.class || 'implementation';
  const out = {
    outcome: 'NEXT', exit: 0, run_id: runId, action: 'SPAWN', slice_id: s.id, lane: s.lane === undefined ? null : s.lane,
    tier: s.tier || CLASS_TIER[klass] || 'T2', class: klass, attempts: s.attempts || 0, escalations: s.escalations || 0,
  };
  if (out.escalations > 0) out.reason = RETRY_REASON;
  return out;
}

function nextWave(ctx, state, runId, fl) {
  const pipe = loadPipeline(ctx, state.preset);
  if (!pipe || !pipe.steps.length) return { pipe: null };
  let seeded = false;
  for (const st of pipe.steps) {
    if (!fl.rows.some((r) => r.id === st.id)) { finishLineUpsert(fl, st.id, { kind: 'wave' }); seeded = true; }
  }
  if (seeded) writeFinishLine(ctx, fl);
  const rowOf = (id) => fl.rows.find((r) => r.id === id);
  for (const st of pipe.steps) {
    const row = rowOf(st.id);
    if (row.state !== 'OPEN') continue;
    if (!st.needs.every((n) => rowClosed(rowOf(n)))) continue;
    const type = st.type || 'persona';
    const klass = st.class || STEP_CLASS[type] || 'implementation';
    return {
      pipe,
      out: {
        outcome: 'NEXT', exit: 0, run_id: runId, action: STEP_ACTION[type] || 'SPAWN', wave: st.id, step: st,
        tier: st.tier || CLASS_TIER[klass] || 'T2', class: klass,
      },
    };
  }
  return { pipe, out: null };
}

// `next` is a function of what is on disk. It advances only the deterministic
// bookkeeping the disk already implies: a FAILED slice is requeued one tier up.
function cmdNext(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);

  const blocked = ceilingBlock(ctx, state);
  if (blocked) return blocked;

  if (state.status === 'ESCALATED') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'escalated' };
  if (state.status === 'PARTIAL_FAILURE') {
    const deploy = state.deploy || { legs: [], rollback_plan: [] };
    const actions = (deploy.rollback_plan || []).map((name) => {
      const leg = deploy.legs.find((l) => l.leg === name) || {};
      return { action: 'ROLLBACK', leg: name, compensate: leg.compensate === undefined ? null : leg.compensate };
    });
    return { outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROLLBACK', legs: actions.map((a) => a.leg), actions };
  }
  if (state.status === 'DONE') return none(runId, 'done');
  if (state.status === 'PARKED') return { outcome: 'NEXT', exit: 3, run_id: runId, action: 'NONE', reason: 'parked' };
  if (state.status === 'NEEDS_HUMAN') return { outcome: 'NEXT', exit: 2, run_id: runId, action: 'NONE', reason: 'needs_human' };
  if (state.status === 'BLOCKED') {
    const fl = readFinishLine(ctx);
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, action: 'NONE', reason: 'blocked', board: renderBoard(fl) };
  }

  const revoked = rereadReadiness(ctx, state);
  if (revoked) throw revoked;

  if (!state.preset) {
    return {
      outcome: 'NEXT', exit: 0, run_id: runId, action: 'ROUTE_MODEL', class: 'gather', tier: 'T3',
      request: state.request, presets: PRESET_NAMES,
      instruction: 'Pick exactly one preset for the request, then run: do-it gate route --preset <name> --reason "<why>"',
    };
  }

  const fl = readFinishLine(ctx);
  if (state.slices.length) {
    const out = nextSlice(ctx, state, runId);
    if (out) return out;
    if (state.slices.some((s) => s.status === 'READY' || s.status === 'RUNNING' || s.status === 'NEEDS_HUMAN')) {
      return none(runId, 'waiting', { slices: state.slices.filter((s) => !SLICE_TERMINAL.includes(s.status)).map((s) => s.id) });
    }
    if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'awaiting_verification', { board: renderBoard(fl) });
  }

  const wave = nextWave(ctx, state, runId, fl);
  if (wave.out) return wave.out;
  if (wave.pipe) {
    if (!openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
    return none(runId, 'waiting', { board: renderBoard(fl) });
  }
  if (fl.rows.length && !openRows(fl).length) return { outcome: 'FINISH_LINE_REACHED', exit: 0, run_id: runId, action: 'NONE', board: renderBoard(fl) };
  return none(runId, 'no_runnable_work');
}

function gateRoute(ctx, args) {
  const f = args.flags;
  const runId = selectRunId(ctx, f);
  const state = loadState(ctx, runId);
  if (typeof f.preset !== 'string' || !PRESET_NAMES.includes(f.preset)) throw fail('USAGE', 1, { message: 'gate route requires --preset <name>', presets: PRESET_NAMES });
  if (typeof f.reason !== 'string' || !f.reason.trim()) throw fail('ROUTE_REASON_REQUIRED', 1, { message: 'a model route answer needs --reason' });
  if (state.preset) throw fail('ROUTE_ALREADY_SET', 1, { run_id: runId, preset: state.preset });
  state.preset = f.preset;
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'route_model', stage: state.stage, host: state.host, tier: 'T3', verdict: f.preset, detail: { preset: f.preset, reason: f.reason.trim(), model_call: true } });
  return { outcome: 'ROUTED', exit: 0, run_id: runId, preset: f.preset };
}

// ---- pack.mjs ----
function packPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'owner-pack.json');
}

// Stages only append questions; numbering is stable and duplicates by text are ignored (ruling D7).
function packAppend(ctx, runId, questions) {
  const file = packPath(ctx, runId);
  const pack = readJsonIfExists(file) || { pack_id: null, run_id: runId, questions: [], created_at: ctx.now() };
  const added = [];
  for (const q of questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) continue;
    if (pack.questions.some((x) => x.text === q.text)) continue;
    const n = pack.questions.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    const row = {
      n,
      kind: q.kind || 'default',
      text: q.text,
      options: Array.isArray(q.options) ? q.options : [],
      recommendation: q.recommendation === undefined ? null : q.recommendation,
      default: q.default === undefined ? null : q.default,
      reversible: q.reversible === undefined ? true : !!q.reversible,
    };
    pack.questions.push(row);
    added.push(row);
  }
  if (added.length || !fs.existsSync(file)) {
    pack.pack_id = sha256Bytes(canonicalJson(pack.questions));
    atomicWriteJson(file, pack);
  }
  return added;
}

// ---- pipeline.mjs ----
function pipelineDirs(ctx) {
  const dirs = [];
  if (ctx.env.DO_IT_PIPELINES) dirs.push(path.resolve(ctx.cwd, ctx.env.DO_IT_PIPELINES));
  const here = path.dirname(fileURLToPath(import.meta.url));
  dirs.push(path.join(here, '..', 'pipelines'), path.join(here, '..', '..', 'pipelines'));
  return dirs;
}

function pipelineFile(ctx, preset) {
  for (const dir of pipelineDirs(ctx)) {
    for (const ext of ['.yaml', '.yml']) {
      const file = path.join(dir, preset + ext);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

// Preset steps in declaration order: { id, type, persona, tier, class, needs, ... }.
// Returns null when no preset file exists (the host may not ship pipelines).
function loadPipeline(ctx, preset) {
  if (!preset) return null;
  const file = pipelineFile(ctx, preset);
  if (!file) return null;
  const doc = parseYamlLite(fs.readFileSync(file, 'utf8'));
  const raw = doc && Array.isArray(doc.steps) ? doc.steps : null;
  if (!raw) throw fail('PIPELINE_INVALID', 1, { file, message: 'a preset needs a steps list' });
  const ids = new Set();
  const steps = raw.map((s, i) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + i + ' has no id' });
    if (ids.has(s.id)) throw fail('PIPELINE_INVALID', 1, { file, message: 'duplicate step id ' + s.id });
    ids.add(s.id);
    const needs = s.needs === undefined || s.needs === null ? [] : (Array.isArray(s.needs) ? s.needs.map(String) : [String(s.needs)]);
    return { ...s, needs };
  });
  for (const s of steps) {
    for (const n of s.needs) if (!ids.has(n)) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + s.id + ' needs unknown step ' + n });
  }
  return { file, name: doc.name || preset, steps };
}

// ---- readiness.mjs ----
const CLASS_TIER = { deterministic: 'T3', gather: 'T3', implementation: 'T2', hard: 'T1' };
const GATE_BUILD_FROM = ['INTAKE', 'PLANNING', 'AWAIT_RATIFY', 'BLOCKED', 'NEEDS_HUMAN'];
const CRED_ROW_ID = 'readiness:credentials';

function readinessPath(ctx) {
  return path.join(ctx.home, 'plan', 'READINESS.json');
}

function decisionList(decisions) {
  if (Array.isArray(decisions)) {
    return decisions.map((d) => ({ id: d && d.id !== undefined ? String(d.id) : '?', state: d ? (d.state !== undefined ? d.state : d.status) : undefined }));
  }
  return Object.keys(decisions || {}).map((id) => {
    const v = decisions[id];
    return { id, state: v && typeof v === 'object' ? (v.state !== undefined ? v.state : v.status) : v };
  });
}

// G-8: the verdict is judged from disk each time it is asked. Returns
// { ok, outcome, extra, data, sha256 }; never throws for a bad verdict.
function checkReadiness(ctx) {
  const file = readinessPath(ctx);
  let bytes;
  try { bytes = fs.readFileSync(file); } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, outcome: 'READINESS_MISSING', extra: { file } };
    throw e;
  }
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch (e) {
    return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors: [{ pointer: '', message: 'not JSON: ' + e.message }] } };
  }
  const errors = validateSchema(loadSchemaFile('readiness.schema.json'), data);
  if (errors.length) return { ok: false, outcome: 'READINESS_INVALID', extra: { file, errors } };
  const unresolved = decisionList(data.decisions).filter((d) => d.state !== 'RESOLVED' && d.state !== 'DEFAULTED').map((d) => d.id);
  if (unresolved.length) return { ok: false, outcome: 'READINESS_UNRESOLVED', extra: { decisions: unresolved } };
  if (data.preflight.passed !== true) return { ok: false, outcome: 'READINESS_PREFLIGHT_FAILED', extra: {} };
  const dependent = (data.slices || []).filter((s) => s.depends_on_owner_answer === true).map((s) => s.id);
  if (dependent.length || (data.owner_dependent_slices || 0) > 0) {
    return { ok: false, outcome: 'READINESS_OWNER_DEPENDENT', extra: { slices: dependent, owner_dependent_slices: data.owner_dependent_slices || dependent.length } };
  }
  return { ok: true, outcome: 'READINESS_OK', extra: {}, data, sha256: sha256Bytes(bytes) };
}

// `next` calls this for a run whose build gate was approved: an edit after the
// gate cannot slip through. The run status is never advanced here.
function rereadReadiness(ctx, state) {
  const gate = state.gates && state.gates.build;
  if (!gate || gate.approved !== true) return null;
  const v = checkReadiness(ctx);
  if (v.ok) return null;
  appendEvent(ctx, state.run_id, { event: 'readiness_revoked', stage: state.stage, host: state.host, verdict: v.outcome, detail: { outcome: v.outcome, ...v.extra } });
  return fail(v.outcome, 1, { run_id: state.run_id, revoked: true, ...v.extra });
}

function seedSlices(state, data) {
  if (state.slices.length || !Array.isArray(data.slices)) return;
  for (const s of data.slices) {
    const klass = s.class || 'implementation';
    state.slices.push({
      id: s.id,
      lane: s.lane === undefined ? null : s.lane,
      tier: s.tier || CLASS_TIER[klass] || 'T2',
      class: klass,
      depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
      status: 'READY',
      attempts: 0,
      escalations: 0,
    });
  }
}

function gateBuild(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const v = checkReadiness(ctx);
  if (!v.ok) {
    appendEvent(ctx, runId, { event: 'build_refused', stage: state.stage, host: state.host, verdict: v.outcome, detail: v.extra });
    throw fail(v.outcome, 1, { run_id: runId, status: state.status, ...v.extra });
  }
  if (state.status !== 'BUILDING' && !GATE_BUILD_FROM.includes(state.status)) {
    throw fail('TRANSITION_REFUSED', 1, { from: state.status, to: 'BUILDING', allowed: GATE_BUILD_FROM });
  }
  const names = v.data.credentials || [];
  const settings = loadSettings(ctx, []);
  const missing = names.length ? resolveCredentials(ctx, runId, names, settings.values.secrets).filter((r) => !r.ok) : [];
  const fl = readFinishLine(ctx);
  const now = ctx.now();
  if (missing.length) {
    const provider = settings.values.secrets.provider;
    const reason = 'missing credential ' + missing.map((m) => m.name).join(', ') + ' via provider ' + provider;
    const from = state.status;
    state.status = 'BLOCKED';
    writeState(ctx, state);
    finishLineUpsert(fl, CRED_ROW_ID, { kind: 'package', state: 'BLOCKED', reason, evidence: null });
    writeFinishLine(ctx, fl);
    appendEvent(ctx, runId, { event: 'build_blocked', stage: state.stage, host: state.host, verdict: 'CREDENTIAL_MISSING', detail: { from, credentials: missing.map((m) => m.name), provider } });
    return { outcome: 'BLOCKED', exit: 3, run_id: runId, status: 'BLOCKED', reason, missing: missing.map((m) => m.name), provider };
  }
  const from = state.status;
  seedSlices(state, v.data);
  state.gates.build = { approved: true, owner: 'readiness', date: now, readiness_sha256: v.sha256 };
  state.status = 'BUILDING';
  writeState(ctx, state);
  for (const s of state.slices) {
    if (!fl.rows.some((r) => r.id === s.id)) finishLineUpsert(fl, s.id, { kind: 'package' });
  }
  const credRow = fl.rows.find((r) => r.id === CRED_ROW_ID);
  if (credRow && credRow.state === 'BLOCKED') {
    finishLineUpsert(fl, CRED_ROW_ID, { state: 'DONE', reason: null, evidence: path.relative(ctx.repo, readinessPath(ctx)) });
  }
  writeFinishLine(ctx, fl);
  appendEvent(ctx, runId, { event: 'build_approved', stage: state.stage, host: state.host, verdict: 'READINESS_OK', detail: { from, readiness_sha256: v.sha256, slices: state.slices.length } });
  return { outcome: 'READINESS_OK', exit: 0, run_id: runId, status: 'BUILDING', slices: state.slices.map((s) => s.id) };
}

// ---- record.mjs ----
const EXIT_FOR_STATUS = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };

function journalPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'record.journal.json');
}

function recordFault(ctx, name) {
  if (ctx.env.DO_IT_FAULT === name) throw fail('FAULT_INJECTED', 1, { fault: name });
}

// record --result <file>: validate it-result/1, apply G-2/G-3, then persist in two
// phases (journal, ledger, then state) so a crash in between replays to one result.
function cmdRecord(ctx, args) {
  const f = args.flags;
  if (typeof f.result !== 'string') throw fail('USAGE', 1, { message: 'record requires --result <file>' });
  const runId = selectRunId(ctx, f);
  let state = loadState(ctx, runId);

  const resultFile = path.resolve(ctx.cwd, f.result);
  let bytes;
  try { bytes = fs.readFileSync(resultFile); } catch (e) {
    throw fail('RESULT_UNREADABLE', 1, { file: f.result, message: e.message });
  }
  const resultSha = sha256Bytes(bytes);

  const pending = readJsonIfExists(journalPath(ctx, runId));
  if (pending) {
    const response = applyJournal(ctx, pending, false);
    if (pending.result_sha256 === resultSha) return { ...response, replayed: true };
    state = loadState(ctx, runId);
  }
  if (state.status === 'DONE') throw fail('RUN_CLOSED', 1, { run_id: runId, message: 'run is already concluded' });

  let result;
  try { result = JSON.parse(bytes.toString('utf8')); } catch (e) {
    throw fail('RESULT_INVALID', 1, { errors: [{ pointer: '', message: 'not JSON: ' + e.message }] });
  }
  const schemaErrors = validateSchema(loadSchemaFile('it-result.1.schema.json'), result);
  if (schemaErrors.length) throw fail('RESULT_INVALID', 1, { errors: schemaErrors });
  if (result.run_id !== runId) throw fail('RUN_ID_MISMATCH', 1, { expected: runId, got: result.run_id });
  const expectedExit = EXIT_FOR_STATUS[result.status];
  if (result.exit_code !== expectedExit) {
    throw fail('EXIT_CODE_MISMATCH', 1, { status: result.status, expected: expectedExit, got: result.exit_code });
  }

  const plan = planRecord(ctx, runId, state, result);
  const journal = {
    id: crypto.randomBytes(8).toString('hex'),
    run_id: runId,
    result_sha256: resultSha,
    result_name: 'record-' + resultSha.slice(0, 12) + '.json',
    result_text: bytes.toString('utf8'),
    ledger_rows: plan.ledgerRows,
    fl_ops: plan.flOps,
    questions: plan.questions,
    next_state: plan.nextState,
    events: plan.events,
    response: { outcome: plan.outcome, exit: plan.exit, run_id: runId, status: plan.nextState.status, ...plan.extra },
  };
  atomicWriteJson(journalPath(ctx, runId), journal);
  return applyJournal(ctx, journal, true);
}

function applyJournal(ctx, j, allowFault) {
  const runId = j.run_id;
  if (j.ledger_rows.length) {
    const ledger = readLedger(ctx, runId);
    for (const row of j.ledger_rows) ledgerUpsert(ledger, row);
    writeLedger(ctx, ledger);
  }
  if (allowFault) recordFault(ctx, 'after_ledger');

  const resultsDir = path.join(ctx.home, 'runs', runId, 'results');
  const copy = path.join(resultsDir, j.result_name);
  if (!fs.existsSync(copy)) atomicWrite(copy, j.result_text);
  if (j.fl_ops.length) {
    const fl = readFinishLine(ctx);
    for (const op of j.fl_ops) finishLineUpsert(fl, op.id, op.patch);
    writeFinishLine(ctx, fl);
  }
  if (j.questions.length) packAppend(ctx, runId, j.questions);

  const current = loadState(ctx, runId);
  const alreadyApplied = current.last_journal === j.id;
  if (!alreadyApplied) {
    const next = { ...j.next_state, last_journal: j.id };
    writeState(ctx, next);
    for (const ev of j.events) appendEvent(ctx, runId, { ...ev, host: next.host });
  }
  try { fs.unlinkSync(journalPath(ctx, runId)); } catch { /* already gone */ }
  return j.response;
}

function isMockKind(kind) {
  return kind === 'mock' || kind === 'fixture';
}

// Pure planning: refuses (throws) before anything is written.
function planRecord(ctx, runId, state, result) {
  const now = ctx.now();
  const verdicts = result.verdicts || [];
  const artifacts = result.artifacts || [];
  const isDeploy = Array.isArray(result.legs) && result.legs.length > 0;

  const needsEvidence = [];
  for (const v of verdicts) if (v.verdict === 'VERIFIED' && !(typeof v.evidence === 'string' && v.evidence.trim())) needsEvidence.push(v.row);
  const legClaims = isDeploy ? result.legs.filter((l) => l.state === 'DEPLOYED_VERIFIED' || l.state === 'ROLLED_BACK') : [];
  for (const l of legClaims) if (!(typeof l.evidence === 'string' && l.evidence.trim())) needsEvidence.push('leg:' + l.leg);
  if (needsEvidence.length) throw fail('EVIDENCE_REQUIRED', 1, { rows: needsEvidence });

  const resolved = new Map();
  const unresolved = [];
  for (const v of verdicts) {
    if (v.verdict === 'VERIFIED') {
      const r = resolveEvidence(ctx, runId, v.evidence, artifacts);
      if (r.ok) resolved.set(v.row, r); else unresolved.push({ row: v.row, evidence: v.evidence, reason: r.reason });
    } else if (typeof v.evidence === 'string' && v.evidence.trim()) {
      const r = resolveEvidence(ctx, runId, v.evidence, artifacts);
      if (r.ok) resolved.set(v.row, r);
    }
  }
  const legResolved = new Map();
  for (const l of legClaims) {
    const r = resolveEvidence(ctx, runId, l.evidence, artifacts);
    if (r.ok) legResolved.set(l.leg, r); else unresolved.push({ row: 'leg:' + l.leg, evidence: l.evidence, reason: r.reason });
  }
  if (isDeploy) {
    for (const l of result.legs) {
      if (legResolved.has(l.leg) || !l.evidence) continue;
      const r = resolveEvidence(ctx, runId, l.evidence, artifacts);
      if (r.ok) legResolved.set(l.leg, r);
    }
  }
  if (unresolved.length) throw fail('EVIDENCE_UNRESOLVED', 1, { rows: unresolved.map((u) => u.row), details: unresolved });

  const next = JSON.parse(JSON.stringify(state));
  const plan = { ledgerRows: [], flOps: [], questions: [], events: [], extra: {} };
  let outcome = 'RECORDED';
  let exit = EXIT_FOR_STATUS[result.status];
  const mockRows = [];

  for (const v of verdicts) {
    const r = resolved.get(v.row) || null;
    const real = v.real === true;
    let verdict = v.verdict;
    let reason = null;
    if (verdict === 'VERIFIED' && real && r && isMockKind(r.kind)) {
      verdict = 'IMPLEMENTED-NOT-VERIFIED';
      reason = 'real_on_mock';
      mockRows.push(v.row);
    }
    plan.ledgerRows.push({
      row: v.row,
      verdict,
      evidence: typeof v.evidence === 'string' && v.evidence.trim() ? v.evidence : null,
      evidence_path: r ? r.path : null,
      evidence_sha256: r ? r.sha256 : null,
      real,
      reason,
      recorded_at: now,
      updated_at: now,
    });
    if (verdict === 'VERIFIED') {
      plan.flOps.push({ id: v.row, patch: { state: 'DONE', evidence: v.evidence, reason: null } });
    } else if (verdict === 'BLOCKED') {
      plan.flOps.push({ id: v.row, patch: { state: 'BLOCKED', reason: (typeof v.evidence === 'string' && v.evidence.trim()) || 'blocked' } });
    } else {
      plan.flOps.push({ id: v.row, patch: { state: 'OPEN', evidence: null, reason: reason || 'implemented_not_verified' } });
    }
  }
  if (mockRows.length) {
    outcome = 'REAL_ON_MOCK';
    exit = 1;
    plan.extra.rows = mockRows;
  }

  plan.events.push({ event: 'result_recorded', slice_id: result.slice_id || null, stage: result.stage, verdict: result.status });

  if (isDeploy) {
    const resolveLeg = (leg) => legResolved.get(leg.leg) || null;
    if (state.status === 'ROLLED_BACK' && !legsLookRolledBack(state, result) && result.legs.every((l) => l.state === 'DEPLOYED_VERIFIED')) {
      const stale = staleLegsAfterRollback(state, result.legs, resolveLeg);
      if (stale.length) throw fail('REVERIFY_REQUIRED', 1, { legs: stale, message: 'evidence must be newer than the rollback event', rollback_event_ts: state.deploy.rollback_event_ts });
    }
    const d = planDeploy(ctx, runId, state, result, resolveLeg);
    plan.ledgerRows.push(...d.ledgerRows);
    plan.questions.push(...d.questions);
    plan.events.push(...d.events);
    next.deploy = d.deploy;
    next.status = d.runStatus;
    next.stage = result.stage;
    if (d.outcome !== 'RECORDED' || outcome === 'RECORDED') { outcome = d.outcome; exit = d.exit; }
    if (d.questions.length) plan.extra.question = d.questions[0].text;
  } else {
    const slice = result.slice_id ? next.slices.find((x) => x.id === result.slice_id) : null;
    let reason = null;
    if (slice && result.status === 'blocked') {
      reason = blockReason(result);
      if (!reason) throw fail('BLOCK_REASON_REQUIRED', 1, { slice_id: slice.id, message: 'a BLOCKED slice needs a reason' });
    }
    applyStatusToState(next, result);
    next.stage = result.stage;
    if (slice && outcome === 'RECORDED') {
      const sl = planSliceOutcome(plan, next, result, slice, reason);
      if (sl) { outcome = sl.outcome; exit = sl.exit; }
    }
  }

  if (result.status === 'needs_human' && result.pending_human && result.pending_human.questions_path) {
    const qs = readQuestionsFile(ctx, result.pending_human.questions_path);
    const midrun = !isDeploy && state.status === 'BUILDING' ? qs.filter((q) => q && q.kind !== 'owner-gate') : [];
    if (midrun.length) {
      // G-8: no question to the owner mid-run; the recommendation decides and the end report shows it.
      for (const q of midrun) {
        const answer = q.recommendation !== undefined && q.recommendation !== null ? q.recommendation : (q.default === undefined ? null : q.default);
        plan.events.push({ event: 'default_applied', slice_id: result.slice_id || null, stage: result.stage, verdict: 'MIDRUN_QUESTION_REFUSED', detail: { answer, text: q.text, kind: q.kind || null } });
        plan.questions.push({ ...q, kind: 'default', recommendation: answer, default: answer });
      }
      plan.questions.push(...qs.filter((q) => !midrun.includes(q)));
      next.status = state.status;
      next.slices = JSON.parse(JSON.stringify(state.slices));
      outcome = 'MIDRUN_QUESTION_REFUSED';
      exit = 1;
    } else {
      plan.questions.push(...qs);
    }
  }
  if (result.run_verdict !== undefined && result.run_verdict !== null) plan.extra.reported_run_verdict = result.run_verdict;
  plan.outcome = outcome;
  plan.exit = exit;
  plan.nextState = next;
  return plan;
}

function blockReason(result) {
  if (typeof result.reason === 'string' && result.reason.trim()) return result.reason.trim();
  const v = (result.verdicts || []).find((x) => x.verdict === 'BLOCKED' && typeof x.evidence === 'string' && x.evidence.trim());
  return v ? v.evidence.trim() : null;
}

// Slice-attached results (D14, CONTRACT M1): FAILED, ESCALATED, BLOCKED and the
// run settling to BLOCKED once only blocked slices are left.
function planSliceOutcome(plan, next, result, slice, reason) {
  let out = null;
  if (result.status === 'failed') {
    if (ladderEscalated(slice)) {
      slice.status = 'ESCALATED';
      next.status = 'ESCALATED';
      plan.questions.push(escalationQuestion(slice));
      plan.events.push({ event: 'escalated', slice_id: slice.id, stage: result.stage, tier: slice.tier || null, verdict: 'ESCALATED', detail: { attempts: slice.attempts } });
      out = { outcome: 'ESCALATED', exit: 2 };
    } else {
      plan.events.push({ event: 'slice_failed', slice_id: slice.id, stage: result.stage, tier: slice.tier || null, verdict: 'FAILED', detail: { attempts: slice.attempts } });
      out = { outcome: 'FAILED', exit: 1 };
    }
  } else if (result.status === 'blocked') {
    plan.flOps.push({ id: slice.id, patch: { state: 'BLOCKED', reason } });
    plan.events.push({ event: 'slice_blocked', slice_id: slice.id, stage: result.stage, verdict: 'BLOCKED', detail: { reason } });
    out = { outcome: 'BLOCKED', exit: 3 };
  }
  const terminal = ['DONE', 'BLOCKED', 'ESCALATED'];
  if (next.status === 'BUILDING' && next.slices.length && next.slices.every((x) => terminal.includes(x.status)) && next.slices.some((x) => x.status === 'BLOCKED')) {
    next.status = 'BLOCKED';
    plan.events.push({ event: 'run_blocked', stage: result.stage, verdict: 'BLOCKED', detail: { slices: next.slices.filter((x) => x.status === 'BLOCKED').map((x) => x.id) } });
    out = { outcome: 'BLOCKED', exit: 3 };
  }
  return out;
}

function readQuestionsFile(ctx, file) {
  try {
    const j = JSON.parse(fs.readFileSync(path.resolve(ctx.repo, file), 'utf8'));
    const list = Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : []);
    return list;
  } catch {
    return [];
  }
}

// Slice and run status per M1 for a result that is not a deploy cascade.
function applyStatusToState(st, result) {
  const slice = result.slice_id ? st.slices.find((s) => s.id === result.slice_id) : null;
  switch (result.status) {
    case 'ok':
      if (slice) slice.status = 'DONE';
      break;
    case 'failed':
      if (slice) { slice.status = 'FAILED'; slice.attempts = (slice.attempts || 0) + 1; } else st.status = 'FAILED';
      break;
    case 'needs_human':
      if (slice) slice.status = 'NEEDS_HUMAN';
      st.status = 'NEEDS_HUMAN';
      break;
    case 'blocked':
      if (slice) slice.status = 'BLOCKED'; else st.status = 'BLOCKED';
      break;
    case 'usage_limit':
      st.status = 'PARKED';
      break;
    default:
      break;
  }
}

// ---- router.mjs ----
// Deterministic-first routing (D9): an ordered rule table. A request that
// matches no rule, or ties between presets at the best priority, goes to the
// single logged model fallback (ROUTE_MODEL) which `next` requests once.
const PRESET_NAMES = ['feature', 'investigate-fix', 'drain', 'review-loop', 'reconcile'];

function routeWords(list) {
  return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + list.join('|') + ')(?![\\p{L}\\p{N}_])', 'iu');
}

const ROUTE_RULES = [
  { id: 'R-DRAIN', preset: 'drain', priority: 1, re: routeWords(['drain', 'backlog', 'burn ?down', 'work through the (?:cards|tickets|issues)']) },
  { id: 'R-RECONCILE', preset: 'reconcile', priority: 1, re: routeWords(['reconcile', 'stray branches', 'worktrees?', 'clean ?up (?:the )?branches', 'branch(?:es)? inventory']) },
  { id: 'R-REVIEW', preset: 'review-loop', priority: 2, re: routeWords(['review', 'roteiro', 'audit', 'walk ?through', 'attended gate']) },
  {
    id: 'R-BUG',
    preset: 'investigate-fix',
    priority: 3,
    re: routeWords([
      'bugs?', 'fix(?:es|ed)?', 'broken', 'crash(?:es|ed|ing)?', 'fail(?:s|ed|ing|ure)?', 'regress(?:ion)?', 'exception', 'stack ?trace',
      'not working', "doesn'?t work", 'does not work', "can'?t", 'cannot', 'incomplete', 'wrong',
      'n[aã]o (?:recebe|funciona|abre|carrega|envia|salva|chega|aparece|responde)', 'erro', 'falha', 'quebrad[oa]', 'travou', 'incompleta?s?',
    ]),
  },
  { id: 'R-FEATURE', preset: 'feature', priority: 3, re: routeWords(['ship', 'build', 'add', 'implement', 'create', 'features?', 'w\\d+(?:\\s*(?:-|to|a)\\s*w?\\d+)?', 'waves?', 'epics?', 'prds?', 'release', 'launch', 'integrate', 'support']) },
];

// First integer in the request: the size hint for drain-shaped work.
function routeSizeHint(text) {
  const m = /(?<![\p{L}\p{N}_.])(\d{1,6})(?![\p{L}\p{N}_.])/u.exec(text);
  return m ? Number(m[1]) : null;
}

function route(text) {
  const request = String(text || '');
  const hits = ROUTE_RULES.filter((r) => r.re.test(request));
  if (!hits.length) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'no_rule_matched' };
  const best = Math.min(...hits.map((h) => h.priority));
  const top = hits.filter((h) => h.priority === best);
  const presets = Array.from(new Set(top.map((h) => h.preset)));
  if (presets.length > 1) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'tie:' + presets.join(',') };
  const out = { preset: top[0].preset, rule: top[0].id, model_call: false, ambiguous: false, size: null };
  if (out.preset === 'drain') out.size = routeSizeHint(request);
  return out;
}

// ---- schema.mjs ----
// JSON Schema subset: type, enum, const, required, properties, items,
// additionalProperties, pattern, minLength, minimum, maximum, minItems, oneOf.
function schemaTypeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function schemaTypeMatches(want, v) {
  const t = schemaTypeOf(v);
  if (want === t) return true;
  if (want === 'number' && t === 'integer') return true;
  return false;
}

function schemaDeepEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

function validateSchema(schema, data, pointer) {
  const errors = [];
  schemaWalk(schema, data, pointer || '', errors);
  return errors;
}

function schemaWalk(schema, data, ptr, errors) {
  if (!schema || schema === true) return;
  if (schema.oneOf) {
    let passing = 0;
    for (const sub of schema.oneOf) {
      const e = [];
      schemaWalk(sub, data, ptr, e);
      if (e.length === 0) passing++;
    }
    if (passing !== 1) errors.push({ pointer: ptr, message: 'must match exactly one of oneOf (matched ' + passing + ')' });
    return;
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => schemaTypeMatches(t, data))) {
      errors.push({ pointer: ptr, message: 'expected type ' + types.join('|') + ' but got ' + schemaTypeOf(data) });
      return;
    }
  }
  if (schema.const !== undefined && !schemaDeepEqual(schema.const, data)) {
    errors.push({ pointer: ptr, message: 'must equal ' + JSON.stringify(schema.const) });
  }
  if (schema.enum !== undefined && !schema.enum.some((v) => schemaDeepEqual(v, data))) {
    errors.push({ pointer: ptr, message: 'must be one of ' + schema.enum.map((v) => JSON.stringify(v)).join(', ') });
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ pointer: ptr, message: 'must be at least ' + schema.minLength + ' characters' });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
      errors.push({ pointer: ptr, message: 'must match pattern ' + schema.pattern });
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ pointer: ptr, message: 'must be at least ' + schema.minimum });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ pointer: ptr, message: 'must be at most ' + schema.maximum });
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ pointer: ptr, message: 'must have at least ' + schema.minItems + ' items' });
    }
    if (schema.items) data.forEach((item, i) => schemaWalk(schema.items, item, ptr + '/' + i, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push({ pointer: ptr + '/' + schemaEscape(key), message: 'is required' });
      }
    }
    for (const key of Object.keys(data)) {
      const child = ptr + '/' + schemaEscape(key);
      if (props[key] !== undefined) schemaWalk(props[key], data[key], child, errors);
      else if (schema.additionalProperties === false) errors.push({ pointer: child, message: 'is not an allowed property' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        schemaWalk(schema.additionalProperties, data[key], child, errors);
      }
    }
  }
}

function schemaEscape(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

// The built file embeds every schema (EMBEDDED_SCHEMAS); in source mode they are
// read from core/schemas.
function loadSchemaFile(name) {
  if (typeof EMBEDDED_SCHEMAS !== 'undefined' && EMBEDDED_SCHEMAS[name]) return EMBEDDED_SCHEMAS[name];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, '..', '..', 'schemas', name);
  if (!fs.existsSync(file)) throw fail('SCHEMA_NOT_FOUND', 1, { schema: name });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- secrets.mjs ----
// S5 fills this in; until then a credential list resolves vacuously.
function resolveCredentials(_ctx, _runId, names, _secrets) {
  return names.map((name) => ({ name, ok: true, length: 0 }));
}

// ---- settings.mjs ----
const SETTINGS_DEFAULTS = {
  version: 1,
  interaction: { owner_pack: 'auto', fallback: ['native', 'html', 'markdown'] },
  host: { driver: 'auto', alias: null },
  isolation: { driver: 'worktree' },
  state: { backend: 'local', engine: { blobs: 'rows' } },
  secrets: { provider: 'file', ref: '.secrets/' },
  handoff: { mode: 'auto', max_per_run: 5 },
  review: { max_rounds: 3, cost_cap_tokens: 600000 },
  tiers: { T1: '', T2: '', T3: '' },
  ceilings: { warn_tokens: 150000, warn_pct: 40, block_tokens: 250000, block_pct: 60 },
  stop_gate: { patience: 3 },
  observability: { provider: 'none' },
};

const SECRET_KEY_NAMES = /^(value|token|password|passwd|secret|api_?key|apikey|private_?key|access_?key)$/i;
const SECRET_SHAPES = [
  /^AKIA[0-9A-Z]{16}$/,
  /^ASIA[0-9A-Z]{16}$/,
  /^(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}$/,
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}$/,
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*$/,
  /^[A-Fa-f0-9]{40,}$/,
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function settingsLooksSecret(keyName, value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (SECRET_KEY_NAMES.test(keyName)) return true;
  if (SECRET_SHAPES.some((re) => re.test(value))) return true;
  // long unbroken mixed token (no path separators, dots or spaces)
  if (value.length >= 32 && /^[A-Za-z0-9+_=-]+$/.test(value) && /[0-9]/.test(value) && /[A-Za-z]/.test(value)) return true;
  return false;
}

// Returns key paths only; the value never leaves this function.
function settingsScanSecrets(obj, prefix, out) {
  if (!isPlainObject(obj)) return out;
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) settingsScanSecrets(v, keyPath, out);
    else if (Array.isArray(v)) v.forEach((item, i) => { if (settingsLooksSecret(key, item)) out.push(keyPath + '.' + i); });
    else if (settingsLooksSecret(key, v)) out.push(keyPath);
  }
  return out;
}

function flattenSettings(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) flattenSettings(v, keyPath, out);
    else out[keyPath] = v;
  }
  return out;
}

function settingsClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function settingsMerge(base, over) {
  for (const key of Object.keys(over)) {
    if (isPlainObject(over[key]) && isPlainObject(base[key])) settingsMerge(base[key], over[key]);
    else base[key] = settingsClone(over[key]);
  }
  return base;
}

function settingsSetPath(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function settingsPaths(ctx) {
  return {
    global: path.join(ctx.userHome, '.do-it', 'settings.json'),
    workspace: path.join(ctx.home, 'settings.json'),
  };
}

function parseSetValue(raw, defaultValue) {
  try {
    return JSON.parse(raw);
  } catch {
    if (Array.isArray(defaultValue)) return raw === '' ? [] : raw.split(',').map((s) => s.trim());
    return raw;
  }
}

// Layers: defaults, global, workspace, run flag. Every leaf keeps its source.
function loadSettings(ctx, setFlags) {
  const schema = loadSchemaFile('settings.schema.json');
  const paths = settingsPaths(ctx);
  const layers = [];
  const parseErrors = [];
  const files = [];
  const seen = new Set();
  for (const name of ['global', 'workspace']) {
    const file = paths[name];
    const real = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (seen.has(real)) {
      files.push({ layer: name, path: file, exists: fs.existsSync(file), shadowed: true });
      continue;
    }
    seen.add(real);
    const exists = fs.existsSync(file);
    files.push({ layer: name, path: file, exists });
    if (!exists) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      parseErrors.push({ file, pointer: '', message: 'JSON parse error: ' + e.message });
      continue;
    }
    layers.push({ name, file, data: parsed });
  }
  const secretHits = [];
  for (const layer of layers) {
    for (const keyPath of settingsScanSecrets(layer.data, '', [])) secretHits.push({ file: layer.file, key: keyPath });
  }
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, {
      errors: secretHits.map((h) => ({ file: h.file, key: h.key, pointer: '/' + h.key.split('.').join('/'), message: 'looks like a credential value; settings hold references only' })),
    });
  }
  const errors = parseErrors.slice();
  for (const layer of layers) {
    for (const e of validateSchema(schema, layer.data)) errors.push({ file: layer.file, pointer: e.pointer, message: e.message });
  }
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors });

  const defaultLeaves = flattenSettings(SETTINGS_DEFAULTS, '', {});
  const merged = settingsClone(SETTINGS_DEFAULTS);
  const sources = {};
  for (const k of Object.keys(defaultLeaves)) sources[k] = 'default';
  for (const layer of layers) {
    settingsMerge(merged, layer.data);
    for (const k of Object.keys(flattenSettings(layer.data, '', {}))) sources[k] = layer.name;
  }
  for (const pair of setFlags || []) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (eq === -1 || !Object.prototype.hasOwnProperty.call(defaultLeaves, key)) {
      throw fail('SETTINGS_UNKNOWN_KEY', 1, { key });
    }
    settingsSetPath(merged, key, parseSetValue(pair.slice(eq + 1), defaultLeaves[key]));
    sources[key] = 'run-flag';
  }
  if (setFlags && setFlags.length) {
    const flagErrors = validateSchema(schema, merged).map((e) => ({ file: 'run-flag', pointer: e.pointer, message: e.message }));
    if (flagErrors.length) throw fail('SETTINGS_INVALID', 1, { errors: flagErrors });
  }
  const leaves = flattenSettings(merged, '', {});
  const entries = Object.keys(leaves).sort().map((key) => ({ key, value: leaves[key], source: sources[key] || 'default' }));
  return { values: merged, entries, files };
}

// ---- state.mjs ----
// The only module that writes run state (G-1): state.json and its sidecar digest.
function runDir(ctx, runId) {
  return path.join(ctx.home, 'runs', runId);
}

function newRunId(ctx) {
  const stamp = ctx.now().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return 'r-' + stamp + '-' + crypto.randomBytes(2).toString('hex');
}

function newState(ctx, runId, fields) {
  const now = ctx.now();
  return {
    schema: 'do-it-state/1',
    run_id: runId,
    preset: fields.preset === undefined ? null : fields.preset,
    request: fields.request,
    status: 'INTAKE',
    size: fields.size === undefined ? null : fields.size,
    host: fields.host === undefined ? null : fields.host,
    stage: 'intake',
    slices: [],
    gates: {},
    handoffs: 0,
    stop_refusals: 0,
    review: { round: 0, exit: null },
    created_at: now,
    updated_at: now,
  };
}

// Validate, then temp-fsync-rename state.json and its .state.sha256 sidecar.
function writeState(ctx, state) {
  state.updated_at = ctx.now();
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw fail('STATE_INVALID', 1, { errors });
  const dir = runDir(ctx, state.run_id);
  const bytes = JSON.stringify(state, null, 2) + '\n';
  const fault = ctx.env.DO_IT_FAULT === 'after_tmp';
  atomicWrite(path.join(dir, 'state.json'), bytes, { faultAfterTmp: fault });
  atomicWrite(path.join(dir, '.state.sha256'), sha256Bytes(bytes) + '\n');
  return state;
}

function tamperFail(ctx, runId, reason) {
  try {
    appendEvent(ctx, runId, { event: 'state_tamper_detected', stage: null, detail: { reason } });
  } catch {
    // the refusal must still be reported when the event log is unwritable
  }
  return fail('STATE_TAMPERED', 1, { run_id: runId, reason });
}

// Every command re-reads state and compares it with the sidecar. A mismatch is
// reported and never repaired.
function loadState(ctx, runId) {
  const dir = runDir(ctx, runId);
  let bytes;
  try {
    bytes = fs.readFileSync(path.join(dir, 'state.json'));
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('RUN_NOT_FOUND', 1, { run_id: runId });
    throw e;
  }
  let sidecar = null;
  try { sidecar = fs.readFileSync(path.join(dir, '.state.sha256'), 'utf8').trim(); } catch { /* missing */ }
  if (sidecar === null) throw tamperFail(ctx, runId, 'sidecar_missing');
  if (sidecar !== sha256Bytes(bytes)) throw tamperFail(ctx, runId, 'digest_mismatch');
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { throw tamperFail(ctx, runId, 'unparseable'); }
  const errors = validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state);
  if (errors.length) throw tamperFail(ctx, runId, 'schema_invalid');
  return state;
}

function listRunIds(ctx) {
  const base = path.join(ctx.home, 'runs');
  let names = [];
  try { names = fs.readdirSync(base); } catch { return []; }
  return names.filter((n) => fs.existsSync(path.join(base, n, 'state.json'))).sort();
}

// Newest run by created_at (ties by id); --run picks one explicitly.
function selectRunId(ctx, flags) {
  if (flags && flags.run) {
    if (!fs.existsSync(path.join(runDir(ctx, flags.run), 'state.json'))) throw fail('RUN_NOT_FOUND', 1, { run_id: flags.run });
    return flags.run;
  }
  const ids = listRunIds(ctx);
  if (!ids.length) throw fail('NO_RUN', 1, { home: ctx.home });
  let best = null;
  for (const id of ids) {
    let created = '';
    try { created = JSON.parse(fs.readFileSync(path.join(runDir(ctx, id), 'state.json'), 'utf8')).created_at || ''; } catch { /* tampered: still selectable */ }
    if (!best || created > best.created || (created === best.created && id > best.id)) best = { id, created };
  }
  return best.id;
}

// Raw read for callers that only need to know whether a run is in flight.
function peekRunStatus(ctx, runId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir(ctx, runId), 'state.json'), 'utf8')).status;
  } catch {
    return 'UNREADABLE';
  }
}

const RUN_TRANSITIONS = {
  INTAKE: ['PLANNING', 'BUILDING'],
  PLANNING: ['AWAIT_RATIFY', 'BUILDING'],
  AWAIT_RATIFY: ['BUILDING', 'NEEDS_HUMAN'],
  BUILDING: ['VERIFYING', 'FAILED', 'PARKED', 'BLOCKED', 'NEEDS_HUMAN', 'ESCALATED'],
  VERIFYING: ['REVIEWING', 'DEPLOYING', 'CONCLUDING', 'BUILDING'],
  REVIEWING: ['FIXING', 'DEPLOYING', 'CONCLUDING'],
  FIXING: ['VERIFYING'],
  DEPLOYING: ['PROVING', 'PARTIAL_FAILURE', 'FAILED'],
  PROVING: ['CONCLUDING', 'DONE'],
  CONCLUDING: ['DONE'],
  FAILED: ['BUILDING', 'ESCALATED'],
  PARTIAL_FAILURE: ['ROLLED_BACK', 'ESCALATED'],
  ROLLED_BACK: ['DEPLOYING', 'ESCALATED'],
  PARKED: ['BUILDING'],
  NEEDS_HUMAN: ['BUILDING'],
  BLOCKED: ['BUILDING'],
  ESCALATED: [],
  DONE: [],
};

// gate advance --to STATUS: a move along the M1 lifecycle, nothing else.
function advanceRunStatus(ctx, state, to) {
  const allowed = RUN_TRANSITIONS[state.status] || [];
  if (!allowed.includes(to)) throw fail('TRANSITION_REFUSED', 1, { from: state.status, to, allowed });
  const from = state.status;
  state.status = to;
  writeState(ctx, state);
  appendEvent(ctx, state.run_id, { event: 'status_changed', stage: state.stage, host: state.host, verdict: to, detail: { from, to } });
  return { from, to };
}

// ---- stopgate.mjs ----
// G-9: refuse to stop with open rows, with the board, `patience` times without
// progress; the next call parks the run and asks the owner.
function gateStop(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  const state = loadState(ctx, runId);
  const fl = readFinishLine(ctx);
  const open = openRows(fl);
  const board = renderBoard(fl);
  if (!open.length) {
    return { outcome: 'STOP_ALLOWED', exit: 0, run_id: runId, stop_refusals: state.stop_refusals, board };
  }
  const patience = loadSettings(ctx, []).values.stop_gate.patience;
  const sig = rowsSignature(fl);
  const prev = state.gates.stop_gate;
  if (prev && prev.sig !== sig) state.stop_refusals = 0;
  if (state.stop_refusals >= patience) {
    const ids = open.map((r) => r.id);
    packAppend(ctx, runId, [{
      kind: 'default',
      text: 'The run stopped with ' + ids.length + ' open row(s) after ' + patience + ' refusals: ' + ids.join(', ') + '. Resume the run or close it with the open rows as residuals?',
      options: ['resume run', 'close with residuals'],
      recommendation: 'resume run',
      default: 'resume run',
      reversible: true,
    }]);
    state.stop_refusals = 0;
    state.gates.stop_gate = { sig };
    const from = state.status;
    state.status = 'PARKED';
    writeState(ctx, state);
    appendEvent(ctx, runId, { event: 'stop_parked', stage: state.stage, host: state.host, verdict: 'PARKED', detail: { from, open: ids } });
    return { outcome: 'PARKED', exit: 2, run_id: runId, status: 'PARKED', open: ids, board };
  }
  state.stop_refusals += 1;
  state.gates.stop_gate = { sig };
  writeState(ctx, state);
  appendEvent(ctx, runId, { event: 'stop_refused', stage: state.stage, host: state.host, verdict: 'STOP_REFUSED', detail: { refusals: state.stop_refusals, open: open.map((r) => r.id) } });
  throw fail('STOP_REFUSED', 1, { run_id: runId, stop_refusals: state.stop_refusals, patience, open: open.map((r) => r.id), board });
}

// ---- verify.mjs ----
// Re-read the world: recompute every VERIFIED row's evidence hash (never mtime).
// A changed or missing file downgrades the row and reopens its finish-line row.
function verifyEvidence(ctx, runId) {
  const ledger = readLedger(ctx, runId);
  const changed = [];
  const now = ctx.now();
  for (const row of ledger.rows) {
    if (row.verdict !== 'VERIFIED' || !row.evidence_sha256) continue;
    const target = row.evidence_path || row.evidence;
    const r = resolveEvidence(ctx, runId, target, []);
    if (r.ok && r.sha256 === row.evidence_sha256) continue;
    changed.push({ row: row.row, reason: r.ok ? 'hash_changed' : 'evidence_' + r.reason, was: row.evidence_sha256, now: r.ok ? r.sha256 : null });
    row.verdict = 'IMPLEMENTED-NOT-VERIFIED';
    row.reason = 'evidence_changed';
    row.updated_at = now;
  }
  if (changed.length) {
    writeLedger(ctx, ledger);
    const fl = readFinishLine(ctx);
    for (const c of changed) {
      if (fl.rows.some((r) => r.id === c.row)) finishLineUpsert(fl, c.row, { state: 'OPEN', evidence: null, reason: 'evidence_changed' });
      appendEvent(ctx, runId, { event: 'evidence_changed', verdict: 'IMPLEMENTED-NOT-VERIFIED', detail: { row: c.row, reason: c.reason } });
    }
    writeFinishLine(ctx, fl);
  }
  return changed;
}

function gateVerify(ctx, args) {
  const runId = selectRunId(ctx, args.flags);
  loadState(ctx, runId);
  const changed = verifyEvidence(ctx, runId);
  if (changed.length) throw fail('EVIDENCE_CHANGED', 1, { run_id: runId, rows: changed.map((c) => c.row), changed });
  const ledger = readLedger(ctx, runId);
  return { outcome: 'VERIFY_OK', exit: 0, run_id: runId, checked: ledger.rows.filter((r) => r.verdict === 'VERIFIED').length };
}

// ---- version.mjs ----
const DO_IT_VERSION = '0.1.0';

// ---- yaml-lite.mjs ----
// YAML subset for pipeline presets (D10): block maps, block lists, scalars,
// flow lists of scalars, comments. Anything else is PIPELINE_UNSUPPORTED_YAML.
function yamlUnsupported(line, reason) {
  return fail('PIPELINE_UNSUPPORTED_YAML', 1, { line, reason });
}

function yamlStripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:\[,-]/.test(raw[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function yamlLines(text) {
  const out = [];
  const raw = String(text).split(/\r?\n/);
  let docs = 0;
  for (let i = 0; i < raw.length; i++) {
    const line = yamlStripComment(raw[i]).replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^ *\t/.test(line)) throw yamlUnsupported(i + 1, 'tab indentation');
    if (line.trim() === '---') {
      docs++;
      if (docs > 1 || out.length) throw yamlUnsupported(i + 1, 'multiple documents');
      continue;
    }
    if (line.trim() === '...') throw yamlUnsupported(i + 1, 'document end marker');
    out.push({ indent: line.match(/^ */)[0].length, text: line.trim(), n: i + 1 });
  }
  return out;
}

function yamlSplitFlow(inner, n) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += inner[++i] || ''; } else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") { quote = c; cur += c; }
    else if (c === ',') { parts.push(cur); cur = ''; }
    else if (c === '[' || c === '{') throw yamlUnsupported(n, 'nested flow collection');
    else cur += c;
  }
  if (quote) throw yamlUnsupported(n, 'unterminated quote');
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => yamlScalar(p.trim(), n));
}

function yamlScalar(s, n) {
  if (s === '') return null;
  const first = s[0];
  if (first === '&' || first === '*') throw yamlUnsupported(n, 'anchors and aliases');
  if (first === '!') throw yamlUnsupported(n, 'tags');
  if (first === '|' || first === '>') throw yamlUnsupported(n, 'block scalars');
  if (first === '{') {
    if (s === '{}') return {};
    throw yamlUnsupported(n, 'flow map');
  }
  if (first === '[') {
    if (s[s.length - 1] !== ']') throw yamlUnsupported(n, 'multi-line flow list');
    return yamlSplitFlow(s.slice(1, -1), n);
  }
  if (first === '"') {
    if (s.length < 2 || s[s.length - 1] !== '"') throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  if (first === "'") {
    if (s.length < 2 || s[s.length - 1] !== "'") throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}

function yamlKeyOf(text) {
  const m = /^("[^"]*"|'[^']*'|[^\s:"'\[\]{},#&*!|>-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!m) return null;
  let key = m[1];
  if (key[0] === '"' || key[0] === "'") key = key.slice(1, -1);
  return { key, rest: m[2] === undefined ? '' : m[2].trim() };
}

function yamlIsItem(text) {
  return text === '-' || text.startsWith('- ');
}

function yamlParseNode(lines, pos, indent) {
  return yamlIsItem(lines[pos.i].text) ? yamlParseList(lines, pos, indent) : yamlParseMap(lines, pos, indent);
}

function yamlChild(lines, pos, indent, allowSameIndentList) {
  const nxt = lines[pos.i];
  if (!nxt) return null;
  if (nxt.indent > indent) return yamlParseNode(lines, pos, nxt.indent);
  if (allowSameIndentList && nxt.indent === indent && yamlIsItem(nxt.text)) return yamlParseList(lines, pos, indent);
  return null;
}

function yamlParseMap(lines, pos, indent) {
  const out = {};
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (yamlIsItem(line.text)) break;
    const kv = yamlKeyOf(line.text);
    if (!kv) throw yamlUnsupported(line.n, 'not a key: value line');
    if (Object.prototype.hasOwnProperty.call(out, kv.key)) throw yamlUnsupported(line.n, 'duplicate key ' + kv.key);
    pos.i++;
    out[kv.key] = kv.rest === '' ? yamlChild(lines, pos, indent, true) : yamlScalar(kv.rest, line.n);
  }
  return out;
}

function yamlParseList(lines, pos, indent) {
  const out = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (!yamlIsItem(line.text)) break;
    const body = line.text === '-' ? '' : line.text.slice(2).trim();
    if (body === '') {
      pos.i++;
      out.push(yamlChild(lines, pos, indent, false));
    } else if (yamlIsItem(body)) {
      throw yamlUnsupported(line.n, 'nested inline list');
    } else if (yamlKeyOf(body) && body[0] !== '[' && body[0] !== '"' && body[0] !== "'") {
      const offset = line.text.length - body.length;
      lines[pos.i] = { indent: indent + offset, text: body, n: line.n };
      out.push(yamlParseMap(lines, pos, indent + offset));
    } else {
      pos.i++;
      out.push(yamlScalar(body, line.n));
    }
  }
  return out;
}

function parseYamlLite(text) {
  const lines = yamlLines(text);
  if (!lines.length) return {};
  const pos = { i: 0 };
  const value = yamlParseNode(lines, pos, lines[0].indent);
  if (pos.i < lines.length) throw yamlUnsupported(lines[pos.i].n, 'unexpected content');
  return value;
}

const doItResult = cliMain(process.argv.slice(2), { cwd: process.cwd(), env: process.env });
process.stdout.write(doItResult.stdout);
process.exitCode = doItResult.exit;
