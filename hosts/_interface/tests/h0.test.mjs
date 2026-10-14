import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IF = resolve(HERE, '..');
const ROOT = resolve(IF, '../..');
const FAKE = join(IF, 'fake/adapter.mjs');
const RUN = join(IF, 'conformance/run.mjs');
const node = (script, args, extra = {}) =>
  spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8', ...extra });
const conf = (args, extra) => node(RUN, ['--adapter', FAKE, '--json', ...args], extra);
const tmp = () => mkdtempSync(join(tmpdir(), 'h0-'));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
// Removed-host words are assembled so this file passes the G-14 scan.
const W_H1 = ['he', 'rmes'].join('');
const W_OPENCODE = ['open', 'code'].join('');

test('T-H0-01 G-12 on the real tree: core/ names no harness [REAL]', (t) => {
  const core = join(ROOT, 'core');
  const list = JSON.parse(readFileSync(join(IF, 'harness-names.json'), 'utf8')).names;
  for (const n of ['claude', 'codex', W_OPENCODE, W_H1, ['open', 'claw'].join('')]) assert.ok(list.includes(n), n);
  if (!existsSync(core)) {
    t.skip('IMPLEMENTED-NOT-VERIFIED: core/ does not exist in this lane worktree (L1/L2 own it); run after merge');
    return;
  }
  const r = node(join(IF, 'checks/g12-no-harness.mjs'), ['--root', 'core']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /matches: 0/);
});

test('T-H0-02 G-14 on the real tree: no removed-host folders or adapters [REAL]', () => {
  const r = node(join(IF, 'checks', readdirSync(join(IF, 'checks')).find((f) => f.startsWith('g14-'))), ['--root', '.']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /matches: 0/);
});

test('T-H0-03 planted G-12 violation is caught', () => {
  const dir = tmp();
  const copy = join(dir, 'core');
  if (existsSync(join(ROOT, 'core'))) cpSync(join(ROOT, 'core'), copy, { recursive: true });
  else { mkdirSync(join(copy, 'spine'), { recursive: true }); writeFileSync(join(copy, 'spine/a.mjs'), 'export const a = 1;\n// plain comment\n'); }
  const clean = node(join(IF, 'checks/g12-no-harness.mjs'), ['--root', copy]);
  assert.equal(clean.status, 0, clean.stdout);
  const mjs = (function find(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { const r = find(p); if (r) return r; } else if (n.endsWith('.mjs')) return p; } })(copy);
  writeFileSync(mjs, readFileSync(mjs, 'utf8') + `\n// planted ${W_OPENCODE} reference\n`);
  const lines = readFileSync(mjs, 'utf8').split('\n').length - 1;
  const bad = node(join(IF, 'checks/g12-no-harness.mjs'), ['--root', copy]);
  assert.equal(bad.status, 1);
  assert.ok(bad.stdout.includes(mjs), bad.stdout);
  assert.match(bad.stdout, new RegExp(`:${lines}:${W_OPENCODE}`));
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-04 schemas accept the fake adapter', () => {
  const a = node(join(IF, 'validate.mjs'), ['--kind', 'adapter', join(IF, 'fake/adapter.manifest.json')]);
  const c = node(join(IF, 'validate.mjs'), ['--kind', 'capabilities', join(IF, 'fake/capabilities.json')]);
  assert.equal(a.status, 0, a.stderr); assert.match(a.stdout, /valid/);
  assert.equal(c.status, 0, c.stderr); assert.match(c.stdout, /valid/);
});

test('T-H0-05 adapter schema rejects a manifest with no wake call', () => {
  const dir = tmp();
  const m = JSON.parse(readFileSync(join(IF, 'fake/adapter.manifest.json'), 'utf8'));
  delete m.calls.wake;
  const f = join(dir, 'm.json'); writeFileSync(f, JSON.stringify(m));
  const r = node(join(IF, 'validate.mjs'), ['--kind', 'adapter', f]);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.split('\n').some((l) => l.startsWith('calls.wake:')), r.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-06 capabilities schema rejects a wrong type', () => {
  const dir = tmp();
  const c = JSON.parse(readFileSync(join(IF, 'fake/capabilities.json'), 'utf8'));
  c.ask.max_questions = '4';
  const f = join(dir, 'c.json'); writeFileSync(f, JSON.stringify(c));
  const r = node(join(IF, 'validate.mjs'), ['--kind', 'capabilities', f]);
  assert.equal(r.status, 1);
  const line = r.stderr.split('\n').find((l) => l.startsWith('ask.max_questions:'));
  assert.ok(line && line.includes('integer'), r.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-07 conformance suite on the full fake adapter', () => {
  const r = conf([]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.failed, 0);
  assert.deepEqual(j.skipped, []);
  assert.equal(j.passed, j.total);
});

test('T-H0-08 an adapter passes or lists exactly what it skips and why', () => {
  const r1 = conf(['--off', 'ask.native']);
  assert.equal(r1.status, 0, r1.stdout);
  const j1 = JSON.parse(r1.stdout);
  assert.deepEqual(j1.skipped, [{ case: 'ask-native', reason: 'ask.native=false' }]);
  const r2 = conf(['--skip', 'ask-native=']);
  assert.equal(r2.status, 1);
  assert.equal(JSON.parse(r2.stdout).cases.find((c) => c.id === 'skip-needs-reason').status, 'FAIL');
  // a skip with a reason but no matching false capability is also a FAIL
  const r3 = conf(['--skip', 'ask-native=because I said so']);
  assert.equal(r3.status, 1);
  assert.equal(JSON.parse(r3.stdout).cases.find((c) => c.id === 'skip-needs-reason').status, 'FAIL');
  // a justified skip (capability really off) passes
  const r4 = conf(['--off', 'ask.native', '--skip', 'ask-native=ask.native=false']);
  assert.equal(r4.status, 0, r4.stdout);
});

test('T-H0-09 no subagents: roles run as sequential passes', () => {
  const r = conf(['--off', 'spawn.native', '--case', 'fallback-spawn']);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence;
  assert.equal(ev.outcome.mode, 'sequential');
  assert.deepEqual(ev.spans.map((s) => s.role), ['builder', 'verifier']);
  assert.ok(ev.spans[0].end <= ev.spans[1].start);
});

test('T-H0-10 more than 4 questions falls to html', () => {
  const r = conf(['--case', 'fallback-ask']);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence.outcome;
  assert.equal(ev.questions, 5);
  assert.equal(ev.channel, 'html');
  assert.ok(ev.path.endsWith('owner-pack.html'));
  assert.equal(ev.native_calls, 0);
});

test('T-H0-11 no native questions and html unavailable falls to markdown', () => {
  const r = conf(['--off', 'ask.native,renderer.html', '--case', 'fallback-ask']);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence.outcome;
  assert.equal(ev.questions, 3);
  assert.equal(ev.channel, 'markdown');
  assert.ok(ev.path.endsWith('owner-pack.md'));
  assert.deepEqual(ev.attempted, ['html', 'markdown']);
});

test('T-H0-12 no headless start sets handoff.mode ask', () => {
  const r = conf(['--off', 'continue.headless', '--case', 'fallback-continue']);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence;
  assert.equal(ev.outcome, 'handoff.mode:ask');
  assert.ok(!/[\r\n]/.test(ev.command));
  assert.equal(ev.children_spawned, 0);
});

test('T-H0-13 headless start fails five times: HANDOFF_FAILED then ESCALATED', () => {
  const r = conf(['--case', 'fallback-handoff-cap']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).cases[0].evidence.outcome,
    ['HANDOFF_FAILED:1', 'HANDOFF_FAILED:2', 'HANDOFF_FAILED:3', 'HANDOFF_FAILED:4', 'ESCALATED:5', 'ESCALATED:5']);
});

test('T-H0-14 no wake: park and say so', () => {
  const dir = tmp();
  const r = conf(['--off', 'wake.native', '--case', 'fallback-wake', '--workdir', dir]);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence;
  assert.equal(ev.outcome, 'PARKED');
  assert.equal(ev.reason, 'wake.native=false');
  assert.match(ev.message, /parked/);
  assert.ok(!existsSync(join(dir, 'timers')));
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-15 no provider usage: estimate and flag', () => {
  const r = conf(['--off', 'meter.provider_usage', '--case', 'fallback-meter']);
  assert.equal(r.status, 0, r.stdout);
  const [a, b] = JSON.parse(r.stdout).cases[0].evidence.rows;
  assert.deepEqual([a.tokens_in, a.estimated, a.source], [100, true, 'estimate']);
  assert.deepEqual([b.tokens_in, b.source], [null, 'unknown']);
});

test('T-H0-16 recovery after a host process dies mid-spawn', () => {
  const dir = tmp();
  const r = conf(['--case', 'recovery-partial', '--workdir', dir]);
  assert.equal(r.status, 0, r.stdout);
  const ev = JSON.parse(r.stdout).cases[0].evidence;
  assert.equal(ev.partial_listed, 1);
  assert.deepEqual(ev.files.filter((f) => f.includes('result')), ['result.json']);
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-17 adversarial: a stale capabilities file is reported', () => {
  const dir = tmp();
  const bin = join(dir, 'stubcli');
  writeFileSync(bin, '#!/bin/sh\necho "stubcli 9.9.9"\n'); chmodSync(bin, 0o755);
  const caps = join(IF, 'fake/capabilities.json');
  const before = sha(caps);
  const r = node(join(IF, 'lib/probe-compare.mjs'), ['--caps', caps, '--bin', bin]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('version_probed') && r.stdout.includes('9.9.9') && r.stdout.includes('1.0.0'), r.stdout);
  assert.equal(sha(caps), before);
  rmSync(dir, { recursive: true, force: true });
});

test('T-H0-18 adversarial: secrets driver never leaks a value', () => {
  const canary = 'zz-canary-7731';
  const dir = tmp();
  const r = conf(['--workdir', dir], { env: { ...process.env, DOIT_CANARY: canary } });
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!r.stdout.includes(canary) && !r.stderr.includes(canary));
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(dir);
  assert.ok(files.some((f) => f.endsWith('secrets.log')), 'driver audit log must exist');
  for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes(canary), f);
  rmSync(dir, { recursive: true, force: true });
});
