import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, unit, readJson, readJsonl, runDirOf, sha, startRun, tmp, writeJson } from '../helpers.mjs';
import { cliMain } from '../../src/cli.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { loadState, writeState } from '../../src/state.mjs';

const EXIT = { ok: 0, failed: 1, needs_human: 2, blocked: 3, usage_limit: 3, context_reset: 3 };
const SENTINEL = 'SENTINEL_9f3a71c2e5';

function put(repo, rel, content) {
  const f = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

function script(body) {
  const dir = tmp('dit-hook-');
  const f = path.join(dir, 'hook.sh');
  fs.writeFileSync(f, '#!/bin/sh\n' + body + '\n');
  fs.chmodSync(f, 0o755);
  return f;
}

function result(runId, o) {
  const status = (o && o.status) || 'ok';
  return {
    schema: 'it-result/1', stage: 'build-it', run_id: runId, slice_id: null, version: '0.1.0', head_sha: null,
    status, exit_code: EXIT[status], verdicts: [], run_verdict: null, next: null, pending_human: null, artifacts: [],
    resume: { state_files: [], next_action: '' }, tokens: { meter: '', peak_ctx: 0, tier_mix: { T1: 0, T2: 0, T3: 0 }, estimated: false },
    ...(o || {}),
  };
}

function record(runner, repo, obj, name, env) {
  const rel = 'results/' + (name || 'r') + '.json';
  writeJson(path.join(repo.dir, rel), obj);
  return runner(repo, ['record', '--result', rel], env);
}

const ctxOf = (repo) => makeCtx({ cwd: repo.dir, env: repo.env });
const stateFile = (repo, id) => path.join(runDirOf(repo, id), 'state.json');
const stateOf = (repo, id) => readJson(stateFile(repo, id));
const eventsOf = (repo, id) => readJsonl(path.join(runDirOf(repo, id), 'events.jsonl'));
const flFile = (repo) => path.join(repo.doIt, 'finish-line.json');

function setState(repo, id, fn) {
  const ctx = ctxOf(repo);
  const st = loadState(ctx, id);
  fn(st);
  writeState(ctx, st);
}

function building(repo, runner, slices) {
  const id = startRun(repo, runner);
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), {
    decisions: [{ id: 'D1', state: 'RESOLVED' }], preflight: { passed: true }, credentials: [], owner_dependent_slices: 0,
    slices: slices || [{ id: 's1', tier: 'T2' }],
  });
  const g = runner(repo, ['gate', 'build']);
  assert.equal(g.code, 0, g.stdout);
  return id;
}

function flRow(id, o) {
  return { id, kind: 'package', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null, ...(o || {}) };
}

function ceiling(runner, repo, ctxTokens, window) {
  return runner(repo, ['gate', 'ceiling', '--ctx-tokens', String(ctxTokens), '--window', String(window)]);
}

test('T-S5-01 warn thresholds, absolute or percent (G-5, ruling D4)', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  for (const [tokens, window, outcome] of [[150000, 1000000, 'CEILING_WARN'], [90000, 200000, 'CEILING_WARN'], [100000, 1000000, 'CEILING_OK']]) {
    const r = ceiling(unit, repo, tokens, window);
    assert.equal(r.code, 0, outcome);
    assert.equal(r.out.outcome, outcome);
    assert.notEqual(stateOf(repo, id).ceiling, 'BLOCKED');
  }
  assert.equal(ceiling(unit, repo, 150000, 1000000).out.by, 'absolute');
  assert.equal(ceiling(unit, repo, 90000, 200000).out.by, 'percent');
});

test('T-S5-02 block thresholds, whichever fires first', () => {
  for (const [tokens, window, by] of [[250000, 1000000, 'absolute'], [125000, 200000, 'percent']]) {
    const repo = mkRepo();
    const id = startRun(repo, unit);
    const r = ceiling(unit, repo, tokens, window);
    assert.equal(r.code, 3);
    assert.equal(r.out.outcome, 'CEILING_BLOCKED');
    assert.equal(r.out.by, by);
    assert.equal(stateOf(repo, id).ceiling, 'BLOCKED');
  }
  const repo = mkRepo();
  startRun(repo, unit);
  const r = ceiling(unit, repo, 200000, 1000000);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'CEILING_WARN');
});

test('T-S5-03 G-5 next is blocked until a handoff exists [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real);
  assert.equal(ceiling(real, repo, 260000, 1000000).code, 3);
  const before = sha(stateFile(repo, id));
  const n1 = real(repo, ['next']);
  assert.equal(n1.code, 3);
  assert.equal(n1.out.outcome, 'CEILING_BLOCKED');
  assert.equal(sha(stateFile(repo, id)), before);
  const h = real(repo, ['handoff']);
  assert.equal(h.out.outcome, 'HANDOFF_ASK');
  assert.ok(fs.existsSync(path.join(runDirOf(repo, id), 'handoff.md')));
  assert.equal(real(repo, ['next']).code, 3);
  const r = real(repo, ['resume']);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'RESUMED');
  assert.equal(real(repo, ['next']).code, 0);
});

test('T-S5-04 handoff.md content and path validation [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real);
  writeJson(flFile(repo), { rows: [flRow('a'), flRow('b'), flRow('c')] });
  real(repo, ['gate', 'stop']);
  real(repo, ['gate', 'stop']);
  real(repo, ['gate', 'advance', '--to', 'VERIFYING']);
  real(repo, ['gate', 'advance', '--to', 'BUILDING']);
  const evFile = path.join(runDirOf(repo, id), 'events.jsonl');
  const pre = fs.readFileSync(evFile, 'utf8').split('\n').filter(Boolean);
  assert.ok(pre.length >= 6, 'need at least 6 events, have ' + pre.length);
  const h = real(repo, ['handoff']);
  assert.equal(h.out.outcome, 'HANDOFF_ASK');
  const md = fs.readFileSync(path.join(runDirOf(repo, id), 'handoff.md'), 'utf8');
  assert.ok(md.length <= 32000);
  assert.match(md, /^resume_prompt: /m);
  assert.match(md, /^next_action: /m);
  assert.match(md, /FINISH LINE/);
  for (const rid of ['a', 'b', 'c']) assert.ok(md.includes(rid));
  const lines = md.split('\n');
  const start = lines.indexOf('state_files:');
  const files = [];
  for (let i = start + 1; lines[i] && lines[i].startsWith('- '); i++) files.push(lines[i].slice(2));
  assert.ok(files.length >= 3);
  for (const f of files) assert.ok(fs.existsSync(f), f);
  const evStart = lines.findIndex((l) => l.startsWith('events (last'));
  const listed = [];
  for (let i = evStart + 1; lines[i] && lines[i].startsWith('- '); i++) listed.push(lines[i].slice(2));
  assert.deepEqual(listed, pre.slice(-5));

  const repo2 = mkRepo();
  const id2 = building(repo2, real);
  const rec = record(real, repo2, result(id2, { resume: { state_files: ['gone/missing.txt'], next_action: 'x' } }));
  assert.equal(rec.code, 0, rec.stdout);
  const bad = real(repo2, ['handoff']);
  assert.equal(bad.code, 1);
  assert.equal(bad.out.outcome, 'HANDOFF_PATH_INVALID');
  assert.ok(!fs.existsSync(path.join(runDirOf(repo2, id2), 'handoff.md')));
  assert.equal(stateOf(repo2, id2).handoffs, 0);
});

test('T-S5-05 auto handoff succeeds through the continue hook', () => {
  const repo = mkRepo();
  const id = building(repo, unit);
  const marker = path.join(tmp('dit-mark-'), 'marker.txt');
  const hook = script('printf "%s" "$1" > "' + marker + '"\nexit 0');
  const r = unit(repo, ['handoff'], { DO_IT_HOST_CONTINUE: hook });
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'HANDOFF_STARTED');
  assert.equal(fs.readFileSync(marker, 'utf8'), path.join(runDirOf(repo, id), 'handoff.md'));
  assert.equal(stateOf(repo, id).handoffs, 1);
  assert.ok(eventsOf(repo, id).some((e) => e.event === 'handoff_started'));
});

test('T-S5-06 HANDOFF_FAILED is an outcome and retry is allowed', () => {
  const repo = mkRepo();
  const id = building(repo, unit);
  const bad = script('exit 7');
  const r = unit(repo, ['handoff'], { DO_IT_HOST_CONTINUE: bad });
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'HANDOFF_FAILED');
  assert.equal(stateOf(repo, id).handoffs, 1);
  assert.ok(fs.existsSync(path.join(runDirOf(repo, id), 'handoff.md')));
  const good = script('exit 0');
  const r2 = unit(repo, ['handoff'], { DO_IT_HOST_CONTINUE: good });
  assert.equal(r2.code, 0);
  assert.equal(stateOf(repo, id).handoffs, 2);
});

test('T-S5-07 handoff cap of 5 ends in ESCALATED [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real);
  const marker = path.join(tmp('dit-mark-'), 'marker.txt');
  const hook = script('echo x >> "' + marker + '"\nexit 1');
  const env = { DO_IT_HOST_CONTINUE: hook };
  for (let i = 1; i <= 4; i++) {
    const r = real(repo, ['handoff'], env);
    assert.equal(r.code, 1, 'call ' + i);
    assert.equal(r.out.outcome, 'HANDOFF_FAILED');
  }
  const r5 = real(repo, ['handoff'], env);
  assert.equal(r5.code, 2);
  assert.equal(r5.out.outcome, 'ESCALATED');
  assert.equal(stateOf(repo, id).status, 'ESCALATED');
  const q = readJson(path.join(runDirOf(repo, id), 'owner-pack.json')).questions[0];
  assert.match(q.text, /cap of 5/);
  const r6 = real(repo, ['handoff'], env);
  assert.equal(r6.code, 2);
  assert.equal(r6.out.outcome, 'ESCALATED');
  assert.equal(fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).length, 5);
  assert.equal(stateOf(repo, id).handoffs, 5);
});

test('T-S5-08 no continue hook falls back to ask', () => {
  const repo = mkRepo();
  const id = building(repo, unit);
  const r = unit(repo, ['handoff']);
  assert.equal(r.code, 2);
  assert.equal(r.out.outcome, 'HANDOFF_ASK');
  assert.equal(r.out.mode, 'ask');
  assert.equal(stateOf(repo, id).handoffs, 1);
  assert.ok(fs.existsSync(path.join(runDirOf(repo, id), 'handoff.md')));
  const human = cliMain(['handoff', '--run', id], { cwd: repo.dir, env: repo.env });
  const runLines = human.stdout.split('\n').filter((l) => l.startsWith('Run:'));
  assert.equal(runLines.length, 1);
  assert.match(runLines[0], /do-it resume --run /);
});

test('T-S5-09 park on usage limit schedules a wake [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real);
  const log = path.join(tmp('dit-wake-'), 'args.txt');
  const hook = script('echo "$@" > "' + log + '"\necho wake-123');
  const r = real(repo, ['park', '--reason', 'usage_limit', '--reset-at', '2026-10-15T03:00:00Z'], { DO_IT_HOST_WAKE: hook });
  assert.equal(r.code, 3);
  assert.equal(r.out.outcome, 'PARKED');
  assert.equal(stateOf(repo, id).status, 'PARKED');
  const park = readJson(path.join(runDirOf(repo, id), 'park.json'));
  assert.equal(park.reset_at, '2026-10-15T03:00:00Z');
  assert.ok(park.resume.state_files.length >= 1);
  for (const f of park.resume.state_files) assert.ok(fs.existsSync(f), f);
  assert.ok(park.resume.next_action);
  const wake = readJson(path.join(runDirOf(repo, id), 'wake.json'));
  assert.equal(wake.status, 'scheduled');
  assert.equal(wake.id, 'wake-123');
  const args = fs.readFileSync(log, 'utf8').trim().split(' ');
  assert.equal(args[0], '2026-10-15T03:00:00Z');
  assert.ok(fs.existsSync(args[1]));
});

test('T-S5-10 park without a wake capability says so', () => {
  const repo = mkRepo();
  const id = building(repo, unit);
  const r = unit(repo, ['park', '--reason', 'usage_limit']);
  assert.equal(r.code, 3);
  assert.equal(r.out.outcome, 'PARKED');
  assert.equal(readJson(path.join(runDirOf(repo, id), 'wake.json')).status, 'unavailable');
  const repo2 = mkRepo();
  const id2 = building(repo2, unit);
  const human = cliMain(['park', '--run', id2], { cwd: repo2.dir, env: repo2.env });
  assert.ok(human.stdout.includes('no wake: parked; run do-it resume after the reset'));
});

test('T-S5-11 resume from state in a fresh process [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real, [{ id: 's1', tier: 'T2' }, { id: 's2', tier: 'T2' }]);
  setState(repo, id, (st) => { st.slices[0].status = 'RUNNING'; st.slices[0].attempts = 1; });
  const hook = script('echo wake-9');
  const p = real(repo, ['park', '--reason', 'usage_limit', '--reset-at', '2020-01-01T00:00:00Z'], { DO_IT_HOST_WAKE: hook });
  assert.equal(p.out.outcome, 'PARKED');
  assert.equal(readJson(path.join(runDirOf(repo, id), 'wake.json')).status, 'scheduled');
  const r = real(repo, ['resume']);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'RESUMED');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'BUILDING');
  assert.deepEqual([st.slices[0].status, st.slices[0].attempts], ['READY', 1]);
  assert.equal(readJson(path.join(runDirOf(repo, id), 'wake.json')).status, 'consumed');
  assert.equal(real(repo, ['next']).out.slice_id, 's1');
});

test('T-S5-12 resume re-reads evidence (adversarial) [REAL]', () => {
  const repo = mkRepo();
  const id = building(repo, real);
  put(repo, 'proof/out.txt', 'original bytes');
  const rec = record(real, repo, result(id, { slice_id: 's1', verdicts: [{ row: 's1', verdict: 'VERIFIED', evidence: 'proof/out.txt', real: true }] }));
  assert.equal(rec.code, 0, rec.stdout);
  assert.equal(stateOf(repo, id).slices[0].status, 'DONE');
  assert.equal(real(repo, ['park', '--reason', 'usage_limit']).out.outcome, 'PARKED');
  put(repo, 'proof/out.txt', 'other bytes entirely');
  const r = real(repo, ['resume']);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'RESUMED');
  assert.equal(r.out.warnings, 1);
  const ledger = readJson(path.join(runDirOf(repo, id), 'ledger.json'));
  assert.equal(ledger.rows.find((x) => x.row === 's1').verdict, 'IMPLEMENTED-NOT-VERIFIED');
  assert.equal(readJson(flFile(repo)).rows.find((x) => x.id === 's1').state, 'OPEN');
  assert.ok(eventsOf(repo, id).some((e) => e.event === 'evidence_changed'));
  assert.equal(real(repo, ['next']).out.slice_id, 's1');
});

test('T-S5-13 resume before the reset time stays parked', () => {
  const repo = mkRepo();
  const id = building(repo, unit);
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  unit(repo, ['park', '--reason', 'usage_limit', '--reset-at', future]);
  const r = unit(repo, ['resume']);
  assert.equal(r.code, 3);
  assert.equal(r.out.outcome, 'STILL_PARKED');
  assert.equal(r.out.reset_at, future);
  assert.equal(stateOf(repo, id).status, 'PARKED');
  const f = unit(repo, ['resume', '--force']);
  assert.equal(f.code, 0);
  assert.equal(f.out.outcome, 'RESUMED');
});

test('T-S5-14 file and env secret drivers resolve [REAL]', () => {
  const repo = mkRepo();
  startRun(repo, real);
  put(repo, '.secrets/API_KEY', SENTINEL + '\n');
  const a = real(repo, ['doctor', '--secrets', '--name', 'API_KEY']);
  assert.equal(a.code, 0);
  assert.deepEqual(a.out.secrets, [{ name: 'API_KEY', status: 'ok', length: SENTINEL.length }]);
  const b = real(repo, ['doctor', '--secrets', '--name', 'DB_URL', '--set', 'secrets.provider=env'], { DB_URL: 'postgres://u:pw@h/db' });
  assert.equal(b.code, 0);
  assert.equal(b.out.secrets[0].status, 'ok');
  const c = real(repo, ['doctor', '--secrets', '--name', 'API_KEY,MISSING_ONE']);
  assert.equal(c.code, 3);
  assert.equal(c.out.outcome, 'CREDENTIAL_MISSING');
  assert.equal(c.out.secrets.find((s) => s.name === 'MISSING_ONE').status, 'missing');
  for (const r of [a, b, c]) {
    assert.ok(!r.stdout.includes(SENTINEL));
    assert.ok(!r.stdout.includes('pw@h'));
  }
});

test('T-S5-15 missing credential is a plan-time blocker [REAL]', () => {
  const repo = mkRepo();
  const id = startRun(repo, real);
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), {
    decisions: [{ id: 'D1', state: 'RESOLVED' }], preflight: { passed: true }, credentials: ['STRIPE_KEY'], owner_dependent_slices: 0, slices: [{ id: 's1' }],
  });
  const g = real(repo, ['gate', 'build']);
  assert.equal(g.code, 3);
  assert.equal(g.out.outcome, 'BLOCKED');
  const st = stateOf(repo, id);
  assert.equal(st.status, 'BLOCKED');
  assert.ok(!st.slices.some((s) => s.status === 'RUNNING'));
  const row = readJson(flFile(repo)).rows.find((r) => r.state === 'BLOCKED');
  assert.match(row.reason, /STRIPE_KEY/);
  assert.match(row.reason, /file/);
  put(repo, '.secrets/STRIPE_KEY', 'sk_live_fake_value_123456');
  const g2 = real(repo, ['gate', 'build']);
  assert.equal(g2.code, 0);
  assert.equal(g2.out.outcome, 'READINESS_OK');
  assert.equal(stateOf(repo, id).status, 'BUILDING');
  assert.ok(!readJson(flFile(repo)).rows.some((r) => r.state === 'BLOCKED'));
});

test('T-S5-16 aws-secrets-manager driver invokes the user CLI', () => {
  const repo = mkRepo();
  startRun(repo, unit);
  const dir = tmp('dit-aws-');
  const log = path.join(dir, 'argv.txt');
  fs.writeFileSync(path.join(dir, 'aws'), '#!/bin/sh\necho "$@" > "' + log + '"\necho aws-secret-value-1234\n', { mode: 0o755 });
  const sets = ['--set', 'secrets.provider=aws-secrets-manager', '--set', 'secrets.ref=prod/app'];
  const r = unit(repo, ['doctor', '--secrets', '--name', 'TOKEN', ...sets], { PATH: dir + path.delimiter + process.env.PATH });
  assert.equal(r.code, 0);
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'secretsmanager get-secret-value --secret-id prod/app/TOKEN --query SecretString --output text');
  assert.deepEqual(r.out.secrets, [{ name: 'TOKEN', status: 'ok', length: 'aws-secret-value-1234'.length }]);
  assert.ok(!r.stdout.includes('aws-secret-value-1234'));
  const none = unit(repo, ['doctor', '--secrets', '--name', 'TOKEN', ...sets], { PATH: tmp('dit-empty-') });
  assert.equal(none.code, 3);
  assert.equal(none.out.outcome, 'CREDENTIAL_MISSING');
  assert.equal(none.out.secrets[0].detail, 'cli_not_found');
});

test('T-S5-17 1password driver invokes the user CLI and never echoes its stderr', () => {
  const repo = mkRepo();
  const id = startRun(repo, unit);
  const sets = ['--set', 'secrets.provider=1password', '--set', 'secrets.ref=op://vault/item'];
  const bad = tmp('dit-op-bad-');
  fs.writeFileSync(path.join(bad, 'op'), '#!/bin/sh\necho ' + SENTINEL + ' >&2\nexit 1\n', { mode: 0o755 });
  const r = unit(repo, ['doctor', '--secrets', '--name', 'TOKEN', ...sets], { PATH: bad + path.delimiter + process.env.PATH });
  assert.equal(r.code, 3);
  assert.equal(r.out.outcome, 'CREDENTIAL_MISSING');
  assert.ok(!r.stdout.includes(SENTINEL));
  assert.ok(!fs.readFileSync(path.join(runDirOf(repo, id), 'events.jsonl'), 'utf8').includes(SENTINEL));
  const good = tmp('dit-op-good-');
  const log = path.join(good, 'argv.txt');
  fs.writeFileSync(path.join(good, 'op'), '#!/bin/sh\necho "$@" > "' + log + '"\necho op-secret-value-5678\n', { mode: 0o755 });
  const ok = unit(repo, ['doctor', '--secrets', '--name', 'TOKEN', ...sets], { PATH: good + path.delimiter + process.env.PATH });
  assert.equal(ok.code, 0);
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'read op://vault/item/TOKEN');
});

function walk(dir, out) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}

test('T-S5-18 G-7 values never reach any file or output (proof by grep) [REAL]', () => {
  const repo = mkRepo();
  put(repo, '.secrets/API_KEY', SENTINEL + '\n');
  const env = { API_KEY: SENTINEL, DO_IT_DEBUG: '1' };
  const captured = [];
  const run = (argv) => { const r = real(repo, argv, env); captured.push(r.stdout, r.stderr); return r; };
  assert.equal(run(['init']).code, 0);
  const id = run(['start', '--preset', 'feature', '--request', 'ship W0']).out.run_id;
  writeJson(path.join(repo.doIt, 'plan', 'READINESS.json'), {
    decisions: [{ id: 'D1', state: 'RESOLVED' }], preflight: { passed: true }, credentials: ['API_KEY'], owner_dependent_slices: 0, slices: [{ id: 's1' }],
  });
  assert.equal(run(['gate', 'build']).code, 0);
  const rec = record(real, repo, result(id, { next: { stage: 'review-it', input: '', launch_prompt: 'run the review with token ' + SENTINEL + ' now' } }), 'leak', env);
  captured.push(rec.stdout, rec.stderr);
  assert.equal(rec.code, 0, rec.stdout);
  run(['handoff']);
  run(['park', '--reason', 'usage_limit']);
  run(['answer', '--render', 'html']);
  run(['doctor', '--secrets']);
  for (const text of captured) assert.ok(!String(text).includes(SENTINEL), 'sentinel in captured output');
  const files = walk(repo.doIt, []);
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(!fs.readFileSync(f).includes(SENTINEL), 'sentinel in ' + f);
  const stored = walk(path.join(runDirOf(repo, id), 'results'), []);
  assert.ok(stored.some((f) => fs.readFileSync(f, 'utf8').includes('[REDACTED:API_KEY]')));
  const ev = eventsOf(repo, id);
  assert.ok(ev.some((e) => e.event === 'secret_redacted' && e.detail.name === 'API_KEY'));
  assert.ok(ev.some((e) => e.event === 'result_recorded' && JSON.stringify(e).includes('[REDACTED:API_KEY]')));
});
