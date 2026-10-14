// H2 Test Contract. Test names carry the case ID. [REAL] cases run the installed `codex` binary.
// T-H2-13 and T-H2-14 make paid model calls; they run only with DOIT_REAL_CALLS=1, else they print
// "VERDICT <id> IMPLEMENTED-NOT-VERIFIED <reason>" and pass without asserting a result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createAdapter from '../adapter.mjs';
import { buildSpawn } from '../lib/spawn.mjs';
import { buildContinue } from '../lib/continue.mjs';
import { parseJsonl, threadIdOf } from '../lib/jsonl.mjs';
import { chooseChannel, requestUserInputEnabled } from '../lib/ask.mjs';
import { usageFromEvents } from '../lib/meter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, '..');
const REPO = resolve(HOST, '..', '..');
const node = process.execPath;
const scratch = (p = 'h2-') => mkdtempSync(join(tmpdir(), p));
const fx = (n) => readFileSync(join(HERE, 'fixtures', n), 'utf8');
const verdict = (id, v, why = '') => console.log(`VERDICT ${id} ${v}${why ? ' ' + why : ''}`);
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const scratchRepo = () => { const d = scratch('h2-repo-'); spawnSync('git', ['init', '-q', d]); return d; };
const TIERS = { T1: 'M-test-1', T2: 'M-test', T3: 'M-test-3' };

// A directory with an executable `codex` running the stub; returns env with it first on PATH.
function stubEnv(mode, extra = {}) {
  const bin = scratch('h2-bin-');
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'codex'), `#!/bin/sh\nexec "${node}" "${join(HERE, 'stub-codex.mjs')}" "$@"\n`);
  chmodSync(join(bin, 'codex'), 0o755);
  return { bin, log, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_MODE: mode, STUB_LOG: log, ...extra } };
}
const calls = (log) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}
const execCalls = (log) => calls(log).filter((c) => c.argv[0] !== 'features');

// ---------------------------------------------------------------- [REAL] probe cases
test('T-H2-01 capabilities.json is re-probed against the real binary', () => {
  const real = spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.match(/\d+\.\d+\.\d+/)[0];
  const caps = join(HOST, 'capabilities.json');
  const before = sha(caps);
  const copy = join(scratch(), 'capabilities.json');
  writeFileSync(copy, JSON.stringify({ ...JSON.parse(readFileSync(caps, 'utf8')), version_probed: '0.0.0' }));
  const r = spawnSync(node, [join(HOST, 'probe.mjs'), '--check', '--caps', copy], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /version_probed/);
  assert.ok(r.stdout.includes('0.0.0') && r.stdout.includes(real), r.stdout);
  assert.equal(sha(caps), before);
  const ok = spawnSync(node, [join(HOST, 'probe.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
});

test('T-H2-02 the flags the adapter uses exist in the real help', () => {
  const r = spawnSync(node, [join(HOST, 'probe.mjs'), '--flags'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // negative: a binary whose help lacks the flags names each missing one
  const { bin } = stubEnv('ok');
  writeFileSync(join(bin, 'codex'), '#!/bin/sh\necho "no flags here"\n'); chmodSync(join(bin, 'codex'), 0o755);
  const bad = spawnSync(node, [join(HOST, 'probe.mjs'), '--flags', '--bin', join(bin, 'codex')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  for (const f of ['-C', '--json', '-m', '-s', 'resume']) assert.ok(bad.stdout.includes(f), bad.stdout);
});

test('T-H2-03 the question feature flag is read from the real binary', () => {
  const r = spawnSync(node, [join(HOST, 'lib/ask.mjs'), '--detect'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^request_user_input:false$/m);
  assert.equal(requestUserInputEnabled(fx('features-enabled.txt')), true);
  assert.equal(requestUserInputEnabled(fx('features-disabled.txt')), false);
});

// ---------------------------------------------------------------- unit
test('T-H2-04 spawn builds the exact codex command', () => {
  const dir = scratchRepo();
  const b = buildSpawn({ role: 'builder', tier: 'T2', brief: 'do the thing', dir }, { tiers: TIERS });
  assert.deepEqual(b.argv, ['codex', 'exec', '--json', '-C', dir, '-m', 'M-test', '-s', 'workspace-write', '-']);
  assert.equal(b.stdin, 'do the thing');
  assert.ok(!b.argv.some((x) => /dangerously|bypass/.test(x)));
  const a = createAdapter({ workdir: scratch(), tiers: TIERS });
  const d = a.spawn({ role: 'builder', tier: 'T2', brief: 'x', dir, dryRun: true });
  assert.deepEqual(d.argv, b.argv);
  assert.equal(a.stats.spawns, 0);
  assert.equal(a.spawn({ role: 'builder', brief: 'x' }).outcome, 'UNTIERED_SPAWN');
});

test('T-H2-05 read-only roles get a read-only sandbox', () => {
  for (const role of ['verifier', 'reviewer']) {
    const b = buildSpawn({ role, tier: 'T2', brief: 'x', dir: '/tmp/x' }, { tiers: TIERS });
    assert.equal(b.argv[b.argv.indexOf('-s') + 1], 'read-only');
    assert.ok(!b.argv.includes('workspace-write'));
  }
});

test('T-H2-06 continue builds resume with the captured session id', () => {
  const sid = threadIdOf(parseJsonl(fx('thread-42.jsonl')).events);
  assert.equal(sid, 'thr-42');
  assert.deepEqual(buildContinue({ sessionId: sid }).argv, ['codex', 'exec', 'resume', 'thr-42', '--json']);
  const last = buildContinue({ resume: true, allowLast: true }).argv;
  assert.equal(last.slice(-3).join(' '), 'resume --last --json'.split(' ').join(' '));
  assert.deepEqual(last.slice(0, 4), ['codex', 'exec', 'resume', '--last']);
  const none = buildContinue({ resume: true });
  assert.equal(none.outcome, 'HANDOFF_FAILED');
  assert.equal(none.reason, 'no session id');
  const a = createAdapter({ workdir: scratch(), tiers: TIERS });
  const r = a.continue({ run_id: 'r', path: 'h.md', resume: true });
  assert.equal(r.outcome, 'HANDOFF_FAILED'); assert.equal(r.reason, 'no session id');
});

test('T-H2-07 ask is markdown unless the flag is on', () => {
  const two = { questions: [{ n: 1, text: 'a' }, { n: 2, text: 'b' }] };
  const five = { questions: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, text: `q${i}` })) };
  const A = createAdapter({ workdir: scratch(), featuresText: fx('features-disabled.txt') });
  const B = createAdapter({ workdir: scratch(), featuresText: fx('features-enabled.txt') });
  assert.equal(A.ask(two).channel, 'markdown');
  assert.equal(B.ask(two).channel, 'native');
  assert.equal(B.ask(two).outcome, 'ok');
  assert.equal(A.ask(five).channel, 'html');
  assert.equal(B.ask(five).channel, 'html');
  assert.equal(chooseChannel(two, false).channel, 'markdown');
});

test('T-H2-08 stop-gate is a conductor checklist', () => {
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

test('T-H2-09 meter parses codex usage', () => {
  const row = usageFromEvents(parseJsonl(fx('usage-turn.jsonl')).events, { prices: null });
  assert.equal(row.tokens_in, 800); assert.equal(row.tokens_out, 150);
  assert.equal(row.cache_read, 600); assert.equal(row.cache_write, 0);
  assert.equal(row.estimated, true); assert.equal(row.source, 'provider');
  assert.equal(row.extra.reasoning_output_tokens, 90);
  assert.ok(row.unknown.includes('reasoning-included-in-output'));
  assert.ok(JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8')).unknown.includes('reasoning-included-in-output'));
});

test('T-H2-10 cost is estimated and flagged, never invented', () => {
  const events = parseJsonl(fx('usage-turn.jsonl')).events;
  const none = usageFromEvents(events, { prices: null });
  assert.equal(none.cost_usd, null); assert.equal(none.cost_source, 'unknown');
  const priced = usageFromEvents(events, { prices: { default: { input_usd_per_mtok: 2 } } });
  assert.equal(priced.cost_usd, 0.0016); assert.equal(priced.estimated, true);
  // even with a complete real-shape usage block, a derived cost is flagged
  const full = [{ type: 'turn.completed', usage: { input_tokens: 800, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1 } }];
  assert.equal(usageFromEvents(full, { prices: { default: { input_usd_per_mtok: 2 } } }).estimated, true);
  assert.equal(existsSync(join(HOST, 'prices.json')), false, 'prices.json is owner-supplied, absent by default');
});

test('T-H2-11 no wake: park', () => {
  const wd = scratch();
  const a = createAdapter({ workdir: wd });
  const before = readdirSync(wd);
  const r = a.wake('2026-10-15T00:00:00Z', 'resume');
  assert.equal(r.outcome, 'PARKED'); assert.equal(r.reason, 'wake.native=false');
  assert.deepEqual(readdirSync(wd), before);
  assert.equal(existsSync(join(wd, '.codex')), false);
});

// ---------------------------------------------------------------- [REAL] failure on the real binary
test('T-H2-12 headless start fails on the real binary: HANDOFF_FAILED', () => {
  const a = createAdapter({ workdir: scratch() });
  const r = a.continue({ run_id: 'real-fail', path: 'h.md', dir: '/nonexistent/dir', timeoutMs: 30000 });
  assert.equal(r.outcome, 'HANDOFF_FAILED', JSON.stringify(r));
  assert.equal(r.attempts, 1);
});

const REAL = process.env.DOIT_REAL_CALLS === '1';
let realSession = null;
test('T-H2-13 real spawn of a trivial prompt', { skip: false }, () => {
  if (!REAL) { verdict('T-H2-13', 'IMPLEMENTED-NOT-VERIFIED', 'paid model call; set DOIT_REAL_CALLS=1'); return; }
  const a = createAdapter({ workdir: scratch() });
  const r = a.spawn({ role: 'reviewer', tier: 'T3', brief: 'reply ok', dir: scratchRepo() });
  assert.equal(r.outcome, 'ok', JSON.stringify(r));
  const ev = parseJsonl(readFileSync(r.events_path, 'utf8')).events;
  assert.ok(ev.some((e) => e.type === 'thread.started') && ev.some((e) => e.type === 'turn.completed'));
  assert.equal(typeof r.usage.tokens_in, 'number');
  realSession = r.session_id;
  verdict('T-H2-13', 'VERIFIED', `session ${realSession} tokens_in ${r.usage.tokens_in}`);
});

test('T-H2-14 real resume of the T-H2-13 session', () => {
  if (!REAL || !realSession) { verdict('T-H2-14', 'IMPLEMENTED-NOT-VERIFIED', REAL ? 'T-H2-13 produced no session' : 'depends on T-H2-13 (paid call)'); return; }
  const a = createAdapter({ workdir: scratch() });
  const r = a.continue({ run_id: 'real-resume', path: 'h.md', session_id: realSession, prompt: 'reply ok again', timeoutMs: 120000 });
  assert.equal(r.outcome, 'ok', JSON.stringify(r));
  assert.equal(r.session_id, realSession);
  const ev = parseJsonl(readFileSync(join(a.workdir, 'continues', r.session_id, 'events.jsonl'), 'utf8')).events;
  assert.equal(threadIdOf(ev), realSession);
  verdict('T-H2-14', 'VERIFIED', `same session ${realSession}`);
});

// ---------------------------------------------------------------- stub-driven recovery and cap
test('T-H2-15 recovery after the codex child dies mid-spawn', () => {
  const { env, log } = stubEnv('partial-then-ok');
  withEnv(env, () => {
    const a = createAdapter({ workdir: scratch(), tiers: TIERS });
    const first = a.spawn({ role: 'builder', tier: 'T2', brief: 'x', dir: scratchRepo() });
    assert.equal(first.outcome, 'HANDOFF_FAILED');
    assert.equal(first.session_id, 'thr-15');
    const col = a.collect();
    assert.equal(col.partial.length, 1); assert.equal(col.results.length, 0);
    assert.equal(parseJsonl(readFileSync(col.partial[0], 'utf8')).truncated, 1, 'truncated line is detected and ignored');
    const dir = dirname(col.partial[0]);
    const r = a.respawn(dir);
    assert.equal(r.outcome, 'ok');
    const resumes = execCalls(log).filter((c) => c.argv.includes('resume'));
    assert.equal(resumes.length, 1);
    assert.deepEqual(resumes[0].argv.slice(0, 4), ['exec', 'resume', 'thr-15', '--json']);
    const after = a.collect();
    assert.equal(after.results.length, 1); assert.deepEqual(after.partial, []);
    assert.equal(readdirSync(dir).filter((f) => f === 'result.json').length, 1);
  });
});

test('T-H2-16 cap reached: ESCALATED', () => {
  const { env, log } = stubEnv('fail');
  withEnv(env, () => {
    const a = createAdapter({ workdir: scratch() });
    const out = [];
    for (let i = 0; i < 6; i++) out.push(a.continue({ run_id: 'cap', path: 'h.md', dir: scratchRepo() }));
    assert.deepEqual(out.slice(0, 4).map((x) => `${x.outcome}:${x.attempts}`), Array(4).fill(0).map((_, i) => `HANDOFF_FAILED:${i + 1}`));
    assert.equal(out[4].outcome, 'ESCALATED'); assert.equal(out[4].attempts, 5);
    assert.equal(execCalls(log).length, 5, 'no sixth process');
  });
});

test('T-H2-17 conformance suite on the codex adapter', () => {
  const { env, log } = stubEnv('ok');
  const r = spawnSync(node, [join(REPO, 'hosts/_interface/conformance/run.mjs'), '--adapter', join(HOST, 'adapter.mjs'), '--json'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.failed, 0);
  const caps = JSON.parse(readFileSync(join(HOST, 'capabilities.json'), 'utf8'));
  const falseCaps = new Set(['wake.native', 'hooks.stop_gate', 'ask.native', 'spawn.native'].filter((p) => p.split('.').reduce((o, k) => o[k], caps) === false));
  assert.ok(rep.skipped.length > 0);
  for (const s of rep.skipped) assert.ok(falseCaps.has(s.reason.replace(/=false$/, '')), JSON.stringify(s));
  assert.ok(execCalls(log).length > 0, 'the stub, not the real binary, served the run');
});
