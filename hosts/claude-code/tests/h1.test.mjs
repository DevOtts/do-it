// H1 Test Contract. Test names carry the case ID. [REAL] cases run the installed `claude` binary;
// a case whose live target is unreachable prints "VERDICT <id> IMPLEMENTED-NOT-VERIFIED <reason>".
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createAdapter from '../adapter.mjs';
import { buildSpawn } from '../lib/spawn.mjs';
import { buildContinue, runContinueOnce } from '../lib/continue.mjs';
import { mapPack } from '../lib/ask-map.mjs';
import { askPack } from '../lib/ask-map.mjs';
import { parseResult, missingPaths } from '../lib/meter.mjs';
import { buildWake } from '../lib/wake.mjs';
import { mergeNotes, NOTES_PATH } from '../lib/notes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, '..');
const REPO = resolve(HOST, '..', '..');
const node = process.execPath;
const scratch = (p = 'h1-') => mkdtempSync(join(tmpdir(), p));
const fixture = (n) => JSON.parse(readFileSync(join(HERE, 'fixtures', n), 'utf8'));
const verdict = (id, v, why = '') => console.log(`VERDICT ${id} ${v}${why ? ' ' + why : ''}`);

// A directory holding an executable `claude` that runs the stub; returns env with it first on PATH.
function stubEnv(mode, extra = {}) {
  const bin = scratch('h1-bin-');
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\nexec "${node}" "${join(HERE, 'stub-claude.mjs')}" "$@"\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  return { bin, log, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_MODE: mode, STUB_LOG: log, ...extra } };
}
const calls = (log) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}
const scratchRepo = () => { const d = scratch('h1-repo-'); spawnSync('git', ['init', '-q', d]); return d; };

// ---------------------------------------------------------------- manifest [REAL]
test('T-H1-01 plugin manifest validates with the real validator', () => {
  const r = spawnSync('claude', ['plugin', 'validate', join(HOST, 'plugin'), '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const report = JSON.parse(r.stdout);
  const entries = [...report.manifest.errors, ...report.manifest.warnings, ...report.manifest.notes];
  assert.ok(!entries.some((e) => e.path === 'dependencies'), JSON.stringify(entries));
  const manifest = JSON.parse(readFileSync(join(HOST, 'plugin/.claude-plugin/plugin.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.dependencies) && manifest.dependencies.length > 0);
  assert.ok(manifest.dependencies.every((d) => typeof d === 'string' || (d && typeof d.name === 'string')));
  verdict('T-H1-01', 'VERIFIED', `claude plugin validate exit 0, deps=${manifest.dependencies.join(',')}`);
});

test('T-H1-02 a non-array dependencies field is rejected', () => {
  const dir = scratch('h1-bad-');
  cpSync(join(HOST, 'plugin'), dir, { recursive: true });
  const f = join(dir, '.claude-plugin/plugin.json');
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), dependencies: 'notarray' }));
  const j = spawnSync('claude', ['plugin', 'validate', dir, '--json'], { encoding: 'utf8' });
  assert.equal(j.status, 1);
  const err = JSON.parse(j.stdout).manifest.errors.find((e) => e.path === 'dependencies');
  assert.ok(err, j.stdout);
  assert.match(err.message, /expected array, received string/);
  const t = spawnSync('claude', ['plugin', 'validate', dir], { encoding: 'utf8' });
  assert.equal(t.status, 1);
  assert.match(t.stdout + t.stderr, /dependencies: Invalid input: expected array, received string/);
  verdict('T-H1-02', 'VERIFIED', 'path "dependencies" is a JSON field (text mode prints "dependencies: ...")');
});

test('T-H1-03 install-time dependency resolution is observed, not assumed', { timeout: 240000 }, () => {
  const cfg = scratch('h1-cfg-');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  const add = spawnSync('claude', ['plugin', 'marketplace', 'add', REPO], { encoding: 'utf8', env });
  assert.equal(add.status, 0, add.stdout + add.stderr);
  const name = JSON.parse(readFileSync(join(REPO, '.claude-plugin/marketplace.json'), 'utf8')).name;
  const inst = spawnSync('claude', ['plugin', 'install', `do-it@${name}`], { encoding: 'utf8', env, timeout: 200000 });
  const message = (inst.stdout + inst.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim();
  const resolved = inst.status === 0 && /dependenc/i.test(message);
  const notes = mergeNotes({ exit_code: inst.status, message, plugin_dependency_resolution: { resolved, claude_version: spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim(), config_dir: 'scratch (empty CLAUDE_CONFIG_DIR)' } });
  assert.ok('exit_code' in notes && 'message' in notes);
  const caps = JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8'));
  assert.equal(caps.unknown.includes('plugin-dependency-resolution'), !resolved, 'unknown[] must track the recorded observation');
  rmSync(cfg, { recursive: true, force: true });
  if (inst.status === 0) verdict('T-H1-03', 'VERIFIED', message.slice(0, 160));
  else verdict('T-H1-03', 'IMPLEMENTED-NOT-VERIFIED', `install exit ${inst.status}: ${message.slice(0, 160)}`);
});

// ---------------------------------------------------------------- hooks
const hooksJson = () => JSON.parse(readFileSync(join(HOST, 'hooks/hooks.json'), 'utf8'));
test('T-H1-04 hooks.json registers the stop-gate and the ceiling block', () => {
  const h = hooksJson().hooks;
  const cmd = (ev) => h[ev][0].hooks[0].command;
  assert.match(cmd('Stop'), /stop-gate\.mjs/);
  assert.match(cmd('PreToolUse'), /pretooluse-ceiling\.mjs/);
  for (const ev of ['Stop', 'PreToolUse']) {
    const file = /hooks\/([\w-]+\.mjs)/.exec(cmd(ev))[1];
    assert.ok(existsSync(join(HOST, 'hooks', file)), file);
  }
});

function hookRun(script, payload, { cwd, fixtureData, log }) {
  const fx = join(cwd, 'fixture.json');
  writeFileSync(fx, JSON.stringify(fixtureData));
  return spawnSync(node, [join(HOST, 'hooks', script)], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd,
    env: { ...process.env, DO_IT_SPINE: join(HERE, 'stub-spine.mjs'), DO_IT_STUB_LOG: log, DO_IT_STUB_FIXTURE: fx, DO_IT_HOME: cwd },
  });
}
const spineCalls = (log) => calls(log);

test('T-H1-05 stop-gate refuses three times then parks', () => {
  const cwd = scratch('h1-stop-'); const log = join(cwd, 'spine.log');
  const fixtureData = { 'gate stop': { outcome: 'STOP_REFUSED', reason: 'row R2 is OPEN', progress: false, _exit: 1 }, park: { outcome: 'PARKED' } };
  const out = [1, 2, 3, 4].map(() => hookRun('stop-gate.mjs', { session_id: 's1', cwd, hook_event_name: 'Stop' }, { cwd, fixtureData, log }));
  assert.deepEqual(out.map((r) => r.status), [2, 2, 2, 0]);
  for (const r of out.slice(0, 3)) assert.ok(r.stderr.trim().length > 0);
  assert.equal(spineCalls(log).filter((c) => c.name === 'park').length, 1);
  const counter = JSON.parse(readFileSync(join(cwd, '.do-it/host-claude-code/stop-refusals.json'), 'utf8'));
  assert.equal(counter.s1, 3);
});

test('T-H1-06 stop-gate allows a finished run', () => {
  const cwd = scratch('h1-stop-'); const log = join(cwd, 'spine.log');
  const r = hookRun('stop-gate.mjs', { session_id: 's1', cwd }, { cwd, log, fixtureData: { 'gate stop': { outcome: 'STOP_ALLOWED' } } });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  const counterFile = join(cwd, '.do-it/host-claude-code/stop-refusals.json');
  const n = existsSync(counterFile) ? JSON.parse(readFileSync(counterFile, 'utf8')).s1 ?? 0 : 0;
  assert.equal(n, 0);
  assert.equal(spineCalls(log).filter((c) => c.name === 'park').length, 0);
});

test('T-H1-06b stop-gate scopes the spine call to its session and cwd, and parks only the run it refused', () => {
  const cwd = scratch('h1-stop-'); const log = join(cwd, 'spine.log');
  const fixtureData = { 'gate stop': { outcome: 'STOP_REFUSED', run_id: 'r-own', reason: 'open', progress: false, _exit: 1 }, park: { outcome: 'PARKED' } };
  for (let i = 0; i < 4; i++) hookRun('stop-gate.mjs', { session_id: 's-own', cwd, hook_event_name: 'Stop' }, { cwd, fixtureData, log });
  const c = spineCalls(log);
  const stop = c.find((x) => x.name === 'gate stop').args.args;
  assert.deepEqual(stop.slice(stop.indexOf('--session'), stop.indexOf('--session') + 2), ['--session', 's-own']);
  assert.deepEqual(stop.slice(stop.indexOf('--cwd'), stop.indexOf('--cwd') + 2), ['--cwd', cwd]);
  const park = c.find((x) => x.name === 'park').args.args;
  assert.deepEqual(park.slice(park.indexOf('--run'), park.indexOf('--run') + 2), ['--run', 'r-own']);
});

test('T-H1-07 ceiling blocks a spawn but not the handoff write', () => {
  const cwd = scratch('h1-ceil-'); const log = join(cwd, 'spine.log');
  const fixtureData = { 'gate ceiling': { outcome: 'CEILING_BLOCKED', _exit: 3 } };
  const agent = hookRun('pretooluse-ceiling.mjs', { tool_name: 'Agent', tool_input: { prompt: 'x' }, cwd }, { cwd, fixtureData, log });
  assert.equal(agent.status, 2);
  assert.match(agent.stderr, /handoff/);
  const write = hookRun('pretooluse-ceiling.mjs', { tool_name: 'Write', tool_input: { file_path: 'runs/r1/handoff.md', content: 'h' }, cwd }, { cwd, fixtureData, log });
  assert.equal(write.status, 0);
  assert.equal(write.stderr, '');
});

// ---------------------------------------------------------------- spawn
test('T-H1-08 spawn sets a per-spawn model from the tier map; untiered is refused', () => {
  const tiers = JSON.parse(readFileSync(join(HOST, 'tiers.json'), 'utf8'));
  assert.equal(tiers.tiers.T3, 'haiku');
  const ok = buildSpawn({ role: 'intake', tier: 'T3', brief: 'b' }, tiers);
  assert.equal(ok.outcome, 'ok');
  assert.equal(ok.request.input.model, 'haiku');
  assert.equal(ok.tier, 'T3');
  const cli = (args) => spawnSync(node, [join(HOST, 'lib/spawn.mjs'), ...args], { encoding: 'utf8' });
  const good = cli(['--role', 'intake', '--tier', 'T3']);
  assert.equal(good.status, 0);
  assert.equal(JSON.parse(good.stdout).request.input.model, 'haiku');
  const bad = cli(['--role', 'intake']);
  assert.equal(bad.status, 1);
  const out = JSON.parse(bad.stdout);
  assert.equal(out.outcome, 'UNTIERED_SPAWN');
  assert.equal(out.request, undefined);
  const a = createAdapter({ workdir: scratch() });
  assert.equal(a.spawn({ role: 'intake', brief: 'b' }).outcome, 'UNTIERED_SPAWN');
  assert.equal(a.stats.spawns, 0);
});

test('T-H1-09 T1 without a written reason is downgraded', () => {
  const noReason = buildSpawn({ role: 'planner', tier: 'T1', reason: '', brief: 'b' });
  assert.equal(noReason.request.input.model, 'sonnet');
  assert.equal(noReason.event.downgraded_from, 'T1');
  assert.equal(noReason.tier, 'T2');
  const withReason = buildSpawn({ role: 'planner', tier: 'T1', reason: 'cross-cutting architecture decision', brief: 'b' });
  assert.equal(withReason.request.input.model, 'opus');
  assert.equal(withReason.event.downgraded_from, undefined);
});

// ---------------------------------------------------------------- continue
test('T-H1-10 continue builds the exact headless command', () => {
  const repo = scratchRepo();
  const sid = '11111111-2222-3333-4444-555555555555';
  const r = spawnSync(node, [join(HOST, 'lib/continue.mjs'), '--dry-run', '--alias', '8fai', '--session-id', sid, '--cwd', repo],
    { encoding: 'utf8', env: { ...process.env, DOIT_CANARY_SECRET: 'canary-secret-value-123', ANTHROPIC_API_KEY: 'sk-canary-456' } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.command, `claude -p --output-format json --session-id ${sid}`);
  assert.ok(!out.argv.includes('--bare'));
  assert.deepEqual(Object.keys(out.env), ['CLAUDE_CONFIG_DIR']);
  assert.equal(out.env.CLAUDE_CONFIG_DIR, join(homedir(), '.claude-8fai'));
  assert.equal(out.cwd, repo);
  assert.ok(!r.stdout.includes('canary-secret-value-123') && !r.stdout.includes('sk-canary-456'));
  assert.throws(() => buildContinue({ bare: true }), /--bare/);
  assert.deepEqual(buildContinue({ resume: true, sessionId: sid }).argv.slice(-2), ['-r', sid]);
});

test('T-H1-11 headless start under a real subscription alias', { timeout: 400000 }, () => {
  // Owner aliases are tried in order; an alias whose OAuth session expired is recorded, not hidden (D13).
  const candidates = process.env.DO_IT_TEST_ALIAS ? [process.env.DO_IT_TEST_ALIAS] : ['8fai', '8ftools', 'anm', 'loudr'].filter((x) => existsSync(join(homedir(), `.claude-${x}`)));
  const tried = [];
  let started = null;
  for (const alias of candidates) {
    const r = runContinueOnce({ alias, cwd: scratchRepo(), prompt: 'reply with the word ok', outDir: scratch('h1-out-'), timeoutMs: 90000 });
    tried.push({ alias, outcome: r.outcome, ...(r.outcome === 'ok' ? {} : { reason: r.reason }) });
    if (r.outcome === 'ok') {
      assert.ok(typeof r.result.session_id === 'string' && r.result.session_id.length > 0);
      assert.ok(existsSync(r.result_path));
      started = alias;
      break;
    }
  }
  mergeNotes({ headless_alias_start: { started_with: started, tried } });
  if (started) verdict('T-H1-11', 'VERIFIED', `alias=${started}; tried ${JSON.stringify(tried)}`);
  else verdict('T-H1-11', 'IMPLEMENTED-NOT-VERIFIED', `no alias can start headless: ${JSON.stringify(tried)}`);
});

test('T-H1-12 headless start fails: HANDOFF_FAILED', { timeout: 60000 }, () => {
  const a = createAdapter({ workdir: scratch() });
  const r = a.continue({ run_id: 'r12', path: 'h.md', profileDir: '/nonexistent/alias', cwd: scratchRepo(), timeoutMs: 30000 });
  assert.equal(r.outcome, 'HANDOFF_FAILED', JSON.stringify(r));
  assert.equal(r.attempts, 1);
  assert.deepEqual(a.collect().results, []);
  assert.ok(!existsSync(join(a.workdir, 'continues')), 'adapter wrote no state');
  assert.equal(readdirSync(a.workdir).filter((f) => f !== 'secrets.log').length, 0);
  verdict('T-H1-12', 'VERIFIED', `real binary: ${r.reason}`);
});

test('T-H1-13 cap reached: ESCALATED', () => {
  const s = stubEnv('fail');
  const a = withEnv(s.env, () => createAdapter({ workdir: scratch() }));
  const out = withEnv(s.env, () => [1, 2, 3, 4, 5, 6].map(() => a.continue({ run_id: 'r13', path: 'h.md', cwd: scratch() })));
  assert.deepEqual(out.slice(0, 4).map((x) => [x.outcome, x.attempts]), [1, 2, 3, 4].map((n) => ['HANDOFF_FAILED', n]));
  assert.equal(out[4].outcome, 'ESCALATED');
  assert.equal(out[4].attempts, 5);
  assert.equal(out[5].outcome, 'ESCALATED');
  assert.equal(calls(s.log).length, 5, 'no sixth process');
});

// ---------------------------------------------------------------- ask
test('T-H1-14 three questions map to one native call', () => {
  const opts = (n) => Array.from({ length: n }, (_, i) => `o${i + 1}`);
  const pack = { questions: [2, 3, 4].map((n, i) => ({ n: i + 1, text: `q${i + 1}`, options: opts(n) })) };
  const m = mapPack(pack);
  assert.equal(m.channel, 'native');
  assert.equal(m.payload.tool, 'AskUserQuestion');
  assert.equal(m.payload.input.questions.length, 3);
  assert.deepEqual(m.payload.input.questions.map((q) => q.options.length), [2, 3, 4]);
  const a = createAdapter({ workdir: scratch() });
  const r = askPack(a, pack, scratch());
  assert.equal(r.channel, 'native');
  assert.equal(a.stats.nativeAsk, 1);
});

test('T-H1-15 over the cap falls back', () => {
  const o = (n) => Array.from({ length: n }, (_, i) => `o${i}`);
  const q = (i, n) => ({ n: i, text: `q${i}`, options: o(n) });
  const packs = {
    A: { questions: [1, 2, 3, 4, 5].map((i) => q(i, 2)) },
    B: { questions: [q(1, 2), q(2, 1), q(3, 2), q(4, 2)] },
    C: { questions: [q(1, 5)] },
  };
  const a = createAdapter({ workdir: scratch() });
  const res = Object.fromEntries(Object.entries(packs).map(([k, p]) => [k, askPack(a, p, scratch())]));
  for (const k of 'ABC') assert.equal(res[k].channel, 'html', k);
  assert.equal(a.stats.nativeAsk, 0);
  assert.match(res.C.reason, /options>4/);
  assert.match(res.A.reason, /questions>4/);
  assert.match(res.B.reason, /options<2/);
});

// ---------------------------------------------------------------- meter
test('T-H1-16 meter parses usage from the json result', () => {
  const row = parseResult(fixture('result-with-usage.json'));
  assert.deepEqual(row, { tokens_in: 1000, tokens_out: 200, cache_read: 5000, cache_write: 300, cost_usd: 0.12, estimated: false, source: 'provider' });
  const none = parseResult(fixture('result-no-usage.json'));
  assert.equal(none.source, 'unknown');
  assert.equal(none.tokens_in, null);
  assert.equal(none.tokens_out, null);
  assert.equal(none.cost_usd, null);
});

test('T-H1-17 meter against a real json result', { timeout: 180000 }, () => {
  const a = createAdapter({ workdir: scratch() });
  const r = a.continue({ run_id: 'r17', path: 'h.md', cwd: scratchRepo(), prompt: 'reply ok', timeoutMs: 150000 });
  if (r.outcome !== 'ok') {
    mergeNotes({ meter_real_result: { outcome: r.outcome, reason: r.reason } });
    verdict('T-H1-17', 'IMPLEMENTED-NOT-VERIFIED', `no paid call possible: ${r.reason}`);
    return;
  }
  const real = JSON.parse(readFileSync(r.result_path, 'utf8'));
  const row = parseResult(real);
  assert.equal(typeof row.tokens_in, 'number');
  assert.equal(typeof row.tokens_out, 'number');
  assert.equal(row.source, 'provider');
  const fx = fixture('result-with-usage.json');
  const mismatch = [
    ...missingPaths(real),
    ...Object.keys(fx.usage).filter((k) => !(k in real.usage)).map((k) => `usage.${k}`),
    ...['session_id', 'total_cost_usd', 'is_error', 'result'].filter((k) => !(k in real)).map((k) => `fixture field ${k} absent in real`),
  ];
  mergeNotes({ meter_real_result: { fixture_vs_real_field_mismatch: mismatch, real_top_level_keys: Object.keys(real).sort(), real_usage_keys: Object.keys(real.usage).sort() } });
  assert.deepEqual(mismatch, []);
  assert.deepEqual(a.meter(), { tokens_in: row.tokens_in, tokens_out: row.tokens_out, cache_read: row.cache_read, cache_write: row.cache_write, cost_usd: row.cost_usd });
  verdict('T-H1-17', 'VERIFIED', `tokens_in=${row.tokens_in} tokens_out=${row.tokens_out} cache_read=${row.cache_read} cache_write=${row.cache_write}`);
});

// ---------------------------------------------------------------- wake / recovery / probe
test('T-H1-18 wake uses ScheduleWakeup interactively and parks otherwise', () => {
  const at = new Date(Date.now() + 1800_000).toISOString();
  const i = buildWake(at, 'resume run r1', 'interactive');
  assert.equal(i.outcome, 'ok');
  assert.equal(i.tool, 'ScheduleWakeup');
  assert.equal(i.at, at);
  assert.equal(i.prompt, 'resume run r1');
  const h = buildWake(at, 'resume run r1', 'headless');
  assert.equal(h.outcome, 'PARKED');
  assert.equal(h.reason, 'wake unavailable outside interactive');
  assert.equal(createAdapter({ workdir: scratch(), context: 'headless' }).wake(at, 'p').outcome, 'PARKED');
});

test('T-H1-19 recovery after the claude child dies mid-spawn', () => {
  const s = stubEnv('partial-then-ok');
  const a = withEnv(s.env, () => createAdapter({ workdir: scratch() }));
  const sid = '99999999-2222-3333-4444-555555555555';
  const cwd = scratch();
  const first = withEnv(s.env, () => a.continue({ run_id: 'r19', path: 'h.md', cwd, session_id: sid }));
  assert.equal(first.outcome, 'HANDOFF_FAILED');
  const col = a.collect();
  assert.equal(col.results.length, 0);
  assert.equal(col.partial.length, 1, 'half a JSON line is reported as partial');
  const res = withEnv(s.env, () => a.resume({ run_id: 'r19', path: 'h.md', cwd, session_id: sid }));
  assert.equal(res.outcome, 'ok');
  const log = calls(s.log);
  assert.equal(log.length, 2, 'resume issued exactly one command');
  assert.deepEqual(log[1].argv, ['-p', '--output-format', 'json', '-r', sid]);
  const after = a.collect();
  assert.equal(after.results.length, 1);
  assert.deepEqual(after.partial, []);
  assert.deepEqual(readdirSync(dirname(after.results[0])), ['result.json']);
});

test('T-H1-20 adversarial verify: capabilities.json is re-probed against the real binary', () => {
  const real = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.match(/\d+\.\d+\.\d+/)[0];
  const dir = scratch('h1-caps-');
  const copy = join(dir, 'capabilities.json');
  writeFileSync(copy, JSON.stringify({ ...JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8')), version_probed: '0.0.0' }));
  const probe = join(HOST, 'probe.mjs');
  const bad = spawnSync(node, [probe, '--check', '--caps', copy], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /version_probed/);
  assert.ok(bad.stdout.includes('0.0.0') && bad.stdout.includes(real), bad.stdout);
  const committed = join(HOST, 'capabilities.json');
  const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
  const before = sha(committed);
  const good = spawnSync(node, [probe, '--check'], { encoding: 'utf8' });
  const declared = JSON.parse(readFileSync(committed, 'utf8')).version_probed;
  assert.equal(good.status, declared === real ? 0 : 1, good.stdout);
  assert.equal(sha(committed), before, 'committed file never rewritten');
  verdict('T-H1-20', 'VERIFIED', `real=${real} declared=${declared}`);
});
