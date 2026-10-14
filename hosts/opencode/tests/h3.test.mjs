// H3 Test Contract. Test names carry the case ID. [REAL] cases run the installed `opencode` binary.
// T-H3-15 makes a model call (a free-tier model); it runs only with DOIT_REAL_CALLS=1, else it prints
// "VERDICT <id> IMPLEMENTED-NOT-VERIFIED <reason>" and passes without asserting a result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createAdapter from '../adapter.mjs';
import { buildSpawn, listModels } from '../lib/spawn.mjs';
import { parseEvents } from '../lib/events.mjs';
import { combine } from '../lib/meter.mjs';
import { generate, parseModels } from '../lib/tiers.mjs';
import { preflight } from '../lib/preflight.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, '..');
const REPO = resolve(HOST, '..', '..');
const node = process.execPath;
const scratch = (p = 'h3-') => mkdtempSync(join(tmpdir(), p));
const fx = (n) => readFileSync(join(HERE, 'fixtures', n), 'utf8');
const verdict = (id, v, why = '') => console.log(`VERDICT ${id} ${v}${why ? ' ' + why : ''}`);
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const scratchRepo = () => { const d = scratch('h3-repo-'); spawnSync('git', ['init', '-q', d]); return d; };

function stubEnv(mode, extra = {}) {
  const bin = scratch('h3-bin-');
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'opencode'), `#!/bin/sh\nexec "${node}" "${join(HERE, 'stub-opencode.mjs')}" "$@"\n`);
  chmodSync(join(bin, 'opencode'), 0o755);
  return { bin, log, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_MODE: mode, STUB_LOG: log, ...extra } };
}
const calls = (log) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}
const runCalls = (log) => calls(log).filter((c) => c.argv[0] === 'run');

// ---------------------------------------------------------------- [REAL] probe cases
test('T-H3-01 capabilities.json is re-probed against the real binary', () => {
  const real = spawnSync('opencode', ['--version'], { encoding: 'utf8' }).stdout.match(/\d+\.\d+\.\d+/)[0];
  const caps = join(HOST, 'capabilities.json');
  const before = sha(caps);
  const copy = join(scratch(), 'capabilities.json');
  writeFileSync(copy, JSON.stringify({ ...JSON.parse(readFileSync(caps, 'utf8')), version_probed: '0.0.0' }));
  const r = spawnSync(node, [join(HOST, 'probe.mjs'), '--check', '--caps', copy], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /version_probed/);
  assert.ok(r.stdout.includes('0.0.0') && r.stdout.includes(real), r.stdout);
  assert.equal(sha(caps), before);
  assert.equal(spawnSync(node, [join(HOST, 'probe.mjs'), '--check'], { encoding: 'utf8' }).status, 0);
});

test('T-H3-02 the v2 flags the adapter uses exist in the real help', () => {
  const r = spawnSync(node, [join(HOST, 'probe.mjs'), '--flags'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { bin } = stubEnv('ok');
  writeFileSync(join(bin, 'opencode'), '#!/bin/sh\necho "no flags here"\n'); chmodSync(join(bin, 'opencode'), 0o755);
  const bad = spawnSync(node, [join(HOST, 'probe.mjs'), '--flags', '--bin', join(bin, 'opencode')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  for (const f of ['--format', '-m', '--auto', '--standalone', '-s']) assert.ok(bad.stdout.includes(f), bad.stdout);
});

test('T-H3-03 real cost listing parses', () => {
  const r = spawnSync(node, [join(HOST, 'lib/meter.mjs'), '--stats'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const row = JSON.parse(r.stdout);
  assert.equal(typeof row.cost_usd, 'number');
  assert.equal(row.cost_source, 'stats');
});

test('T-H3-04 tier routing is built from the real model list', () => {
  const listing = listModels();
  assert.ok(listing.length > 0);
  const out = join(scratch(), 'tiers.json');
  const r = spawnSync(node, [join(HOST, 'lib/tiers.mjs'), '--generate', '--out', out], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  for (const v of Object.values(doc.tiers)) { assert.match(v, /^[^/]+\/.+/); assert.ok(listing.includes(v), v); }
  assert.ok(Object.keys(doc.tiers).length > 0);
  // a deepseek/ model is mapped only when listed
  const out2 = join(scratch(), 'tiers.json');
  const r2 = spawnSync(node, [join(HOST, 'lib/tiers.mjs'), '--generate', '--out', out2, '--prefer', 'T3=deepseek'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  const d2 = JSON.parse(readFileSync(out2, 'utf8'));
  const listed = listing.find((m) => m.startsWith('deepseek/'));
  if (listed) assert.equal(d2.tiers.T3, listed);
  else { assert.ok(d2.unknown.includes('deepseek-not-listed')); assert.equal(d2.tiers.T3, undefined); }
  // fixture listings
  assert.equal(generate(parseModels(fx('models-with-deepseek.txt')), { T3: 'deepseek' }).tiers.T3, 'deepseek/deepseek-chat');
  assert.ok(generate(parseModels(fx('models-without-deepseek.txt')), { T3: 'deepseek' }).unknown.includes('deepseek-not-listed'));
  // the committed tiers.json was generated from the listing, not hard-coded
  const committed = JSON.parse(readFileSync(join(HOST, 'tiers.json'), 'utf8'));
  assert.equal(committed.source, 'generated');
});

// ---------------------------------------------------------------- unit
test('T-H3-05 spawn builds the exact opencode command', () => {
  const dir = scratchRepo();
  const a = createAdapter({ workdir: scratch(), tiers: { T3: 'testprov/testmodel' } });
  const r = a.spawn({ role: 'builder', tier: 'T3', brief: 'do the thing', dir, dryRun: true });
  assert.deepEqual(r.argv, ['opencode', 'run', '--format', 'json', '-m', 'testprov/testmodel', '--auto', '--standalone', 'do the thing']);
  assert.equal(r.cwd, dir);
  assert.ok(!r.argv.some((x) => /^--(cwd|dir|workdir)$/.test(x)));
  assert.equal(a.stats.spawns, 0);
  assert.equal(a.spawn({ role: 'builder', brief: 'x' }).outcome, 'UNTIERED_SPAWN');
});

test('T-H3-06 DeepSeek routes when listed, fails clearly when not', () => {
  const A = parseModels(fx('models-with-deepseek.txt'));
  const B = parseModels(fx('models-without-deepseek.txt'));
  const tiers = { tiers: { T3: 'testprov/testmodel' } };
  const ra = buildSpawn({ role: 'builder', tier: 'T3', brief: 'x', provider: 'deepseek' }, tiers, A);
  assert.equal(ra.argv[ra.argv.indexOf('-m') + 1], 'deepseek/deepseek-chat');
  const rb = buildSpawn({ role: 'builder', tier: 'T3', brief: 'x', provider: 'deepseek' }, tiers, B);
  assert.equal(rb.outcome, 'TIER_UNROUTED');
  const wd = scratch();
  const ad = createAdapter({ workdir: wd, tiers: tiers.tiers, models: B });
  const r = ad.spawn({ role: 'builder', tier: 'T3', brief: 'x', provider: 'deepseek' });
  assert.equal(r.outcome, 'TIER_UNROUTED');
  assert.equal(ad.stats.spawns, 0); assert.equal(existsSync(join(wd, 'spawns')), false);
  const mf = join(scratch(), 'models.txt'); writeFileSync(mf, fx('models-without-deepseek.txt'));
  const cli = spawnSync(node, [join(HOST, 'lib/spawn.mjs'), '--tier', 'T3', '--provider', 'deepseek', '--models', mf, '--tiers', join(HERE, 'fixtures', 'tiers-test.json')], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stdout).outcome, 'TIER_UNROUTED');
});

test('T-H3-07 JS plugin records events and never blocks', async () => {
  const dir = scratch();
  const file = join(dir, 'events.jsonl');
  const { DoItEvents } = await import(join(HOST, 'plugin/do-it-events.js'));
  const hooks = await DoItEvents({ directory: dir, eventsFile: file });
  const r1 = await hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1' }, { args: { command: 'echo secret-arg' } });
  const r2 = await hooks['session.idle']({ sessionID: 's1' });
  assert.equal(r1, undefined); assert.equal(r2, undefined);
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((x) => x.type), ['tool.execute.before', 'session.idle']);
  assert.ok(!readFileSync(file, 'utf8').includes('secret-arg'), 'tool arguments are not recorded');
  // never throws even when the target is unwritable
  const bad = await DoItEvents({ eventsFile: '/proc/definitely/not/writable/events.jsonl' });
  await assert.doesNotReject(async () => { await bad['tool.execute.before']({ tool: 'x' }); await bad['session.idle']({}); });
  const src = readFileSync(join(HOST, 'plugin/do-it-events.js'), 'utf8');
  assert.deepEqual(preflight(JSON.stringify({ plugin: src })).inline, []);
  assert.ok(!/Bearer\s|sk-[A-Za-z0-9]|ghp_/.test(src));
});

test('T-H3-08 stop-gate is a conductor checklist', () => {
  const caps = JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8'));
  assert.equal(caps.hooks.stop_gate, false);
  const items = readFileSync(join(HOST, 'checklist/stop-gate.md'), 'utf8').split('\n').filter((l) => /^\d+\. /.test(l));
  assert.equal(items.length, 5);
  for (const it of items) assert.match(it, /`do-it /);
  const { env } = stubEnv('ok');
  const r = spawnSync(node, [join(REPO, 'hosts/_interface/conformance/run.mjs'), '--adapter', join(HOST, 'adapter.mjs'), '--json'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const skip = JSON.parse(r.stdout).skipped.find((s) => s.case === 'stop-gate-hook');
  assert.ok(skip && skip.reason === 'hooks.stop_gate=false', JSON.stringify(skip));
});

test('T-H3-09 ask is markdown', () => {
  const mk = (n) => ({ questions: Array.from({ length: n }, (_, i) => ({ n: i + 1, text: `q${i + 1}` })) });
  const a = createAdapter({ workdir: scratch() });
  assert.equal(a.ask(mk(2)).channel, 'markdown');
  assert.equal(a.ask(mk(2)).outcome, 'NOT_SUPPORTED');
  assert.equal(a.ask(mk(5)).channel, 'html');
  assert.equal(a.stats.nativeAsk, 0);
  assert.ok(a.capabilities.unknown.includes('question-tool-unconfirmed'));
  assert.equal(a.capabilities.ask.native, false);
});

test('T-H3-10 no scheduler: park', () => {
  const wd = scratch();
  const a = createAdapter({ workdir: wd });
  const before = readdirSync(wd);
  const r = a.wake('2026-10-15T00:00:00Z', 'resume');
  assert.equal(r.outcome, 'PARKED'); assert.equal(r.reason, 'wake.native=false');
  assert.deepEqual(readdirSync(wd), before);
});

test('T-H3-11 meter combines stats cost and exported tokens', () => {
  const row = combine({ stats: JSON.parse(fx('stats-cost.json')), exported: JSON.parse(fx('export-tokens.json')) });
  assert.equal(row.tokens_in, 700); assert.equal(row.tokens_out, 120);
  assert.equal(row.cache_read, 500); assert.equal(row.cache_write, 60);
  assert.equal(row.source, 'provider'); assert.equal(row.estimated, false);
  assert.equal(row.cost_usd, 0.05);
  assert.equal(row.extra.reasoning, 40);
});

test('T-H3-12 missing usage is unknown, never zero', () => {
  const none = combine({ exported: JSON.parse(fx('export-no-tokens.json')) });
  assert.equal(none.source, 'unknown'); assert.equal(none.tokens_in, null); assert.equal(none.tokens_out, null);
  assert.equal(none.cost_usd, null);
  const est = combine({ exported: JSON.parse(fx('export-no-tokens.json')), text: 'x'.repeat(400) });
  assert.equal(est.estimated, true); assert.equal(est.source, 'estimate'); assert.equal(est.tokens_in, 100);
});

test('T-H3-13 config preflight reports key paths, not values', () => {
  const dir = scratch();
  const cfg = join(dir, 'opencode.jsonc');
  writeFileSync(cfg, `{
  // comment
  "mcp": { "notion": { "type": "remote", "url": "https://example.invalid/mcp", "headers": { "Authorization": "Bearer zz-canary-5521" } },
           "ok": { "headers": { "Authorization": "Bearer {env:NOTION_TOKEN}" } } },
}`);
  const r = spawnSync(node, [join(HOST, 'lib/preflight.mjs'), cfg], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('mcp.notion.headers.Authorization') && r.stdout.includes('inline'));
  assert.ok(!r.stdout.includes('mcp.ok'), 'env references are not inline');
  assert.ok(!(r.stdout + r.stderr).includes('zz-canary-5521'));
  for (const f of readdirSync(dir)) if (f !== 'opencode.jsonc') assert.ok(!readFileSync(join(dir, f), 'utf8').includes('zz-canary-5521'));
});

// ---------------------------------------------------------------- [REAL] failure on the real binary
test('T-H3-14 headless start fails on the real binary: HANDOFF_FAILED', () => {
  const a = createAdapter({ workdir: scratch() });
  const r = a.continue({ run_id: 'real-fail', path: 'h.md', model: 'nonexistent/none', cwd: scratchRepo(), timeoutMs: 30000 });
  assert.equal(r.outcome, 'HANDOFF_FAILED', JSON.stringify(r));
  assert.equal(r.attempts, 1);
  // the private (--standalone) server may take a moment to wind down after the CLI exits: poll up to 10 s
  let left = '';
  for (let i = 0; i < 20; i++) {
    left = spawnSync('pgrep', ['-fl', '^\\S*opencode\\S* run .*-m nonexistent/none'], { encoding: 'utf8' }).stdout.trim();
    if (!left) break;
    spawnSync('sleep', ['0.5']);
  }
  assert.equal(left, '', `leftover process: ${left}`);
});

const REAL = process.env.DOIT_REAL_CALLS === '1';
test('T-H3-15 real spawn of a trivial prompt', () => {
  if (!REAL) { verdict('T-H3-15', 'IMPLEMENTED-NOT-VERIFIED', 'model call; set DOIT_REAL_CALLS=1'); return; }
  const free = 'opencode/mimo-v2.6-flash-free';
  assert.ok(listModels().includes(free), 'model must come from the real listing');
  const a = createAdapter({ workdir: scratch(), tiers: { T3: free } });
  const r = a.spawn({ role: 'builder', tier: 'T3', brief: 'reply ok', dir: scratchRepo(), timeoutMs: 150000 });
  assert.equal(r.outcome, 'ok', JSON.stringify(r));
  const raw = readFileSync(r.events_path, 'utf8');
  const { events } = parseEvents(raw);
  assert.ok(events.length > 0);
  const carries = /"tokens"|"cost"|"usage"/.test(raw);
  const row = a.meter();
  const notes = join(HOST, 'PROBE-NOTES.json');
  const cur = existsSync(notes) ? JSON.parse(readFileSync(notes, 'utf8')) : {};
  writeFileSync(notes, JSON.stringify({ ...cur, run_json_carries_usage: carries, run_event_types: [...new Set(events.map((e) => e.type))], export_tokens_numeric: typeof row.tokens_in === 'number', version: '2.0.18' }, null, 2) + '\n');
  verdict('T-H3-15', 'VERIFIED', `session ${r.session_id}; run json carries usage: ${carries}; export tokens_in ${row.tokens_in}`);
});

// ---------------------------------------------------------------- stub-driven recovery and cap
test('T-H3-16 recovery after the opencode child dies mid-spawn', () => {
  const { env, log } = stubEnv('partial-then-ok');
  withEnv(env, () => {
    const a = createAdapter({ workdir: scratch(), tiers: { T3: 'testprov/testmodel' } });
    const first = a.spawn({ role: 'builder', tier: 'T3', brief: 'x', dir: scratchRepo() });
    assert.equal(first.outcome, 'HANDOFF_FAILED');
    assert.equal(first.session_id, 'ses-16');
    const col = a.collect();
    assert.equal(col.partial.length, 1); assert.equal(col.results.length, 0);
    assert.equal(parseEvents(readFileSync(col.partial[0], 'utf8')).truncated, 1);
    const dir = dirname(col.partial[0]);
    const r = a.respawn(dir);
    assert.equal(r.outcome, 'ok');
    const resumes = runCalls(log).filter((c) => c.argv.includes('-s'));
    assert.equal(resumes.length, 1);
    assert.deepEqual(resumes[0].argv.slice(0, 3), ['run', '-s', 'ses-16']);
    const after = a.collect();
    assert.equal(after.results.length, 1); assert.deepEqual(after.partial, []);
    assert.equal(readdirSync(dir).filter((f) => f === 'result.json').length, 1);
  });
});

test('T-H3-17 cap reached: ESCALATED', () => {
  const { env, log } = stubEnv('fail');
  withEnv(env, () => {
    const a = createAdapter({ workdir: scratch() });
    const out = [];
    for (let i = 0; i < 6; i++) out.push(a.continue({ run_id: 'cap', path: 'h.md', cwd: scratchRepo() }));
    assert.deepEqual(out.slice(0, 4).map((x) => `${x.outcome}:${x.attempts}`), [1, 2, 3, 4].map((n) => `HANDOFF_FAILED:${n}`));
    assert.equal(out[4].outcome, 'ESCALATED'); assert.equal(out[4].attempts, 5);
    assert.equal(runCalls(log).length, 5, 'no sixth process');
  });
});

test('T-H3-18 conformance suite on the opencode adapter', () => {
  const { env, log } = stubEnv('ok');
  const r = spawnSync(node, [join(REPO, 'hosts/_interface/conformance/run.mjs'), '--adapter', join(HOST, 'adapter.mjs'), '--json'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.failed, 0);
  const caps = JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8'));
  const falseCaps = new Set(['wake.native', 'hooks.stop_gate', 'ask.native', 'spawn.native'].filter((p) => p.split('.').reduce((o, k) => o[k], caps) === false));
  assert.ok(rep.skipped.length > 0);
  for (const s of rep.skipped) assert.ok(falseCaps.has(s.reason.replace(/=false$/, '')), JSON.stringify(s));
  assert.ok(runCalls(log).length > 0, 'the stub, not the real binary, served the run');
});
