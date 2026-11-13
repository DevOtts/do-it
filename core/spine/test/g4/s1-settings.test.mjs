import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { test } from 'node:test';
import { BIN, CORE_DIR, mkRepo, real, tmp, unit, writeJson } from '../helpers.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { loadSchemaFile, validateSchema } from '../../src/schema.mjs';
import { SECRET_KEY_NAMES, SETTINGS_DEFAULTS, gatesQueueSettings, gatesStage, loadSettings, settingsScanSecrets } from '../../src/settings.mjs';
import { gatesAgreement, gatesLeafPaths } from './agreement.mjs';

const schema = loadSchemaFile('settings.schema.json');
const gatesOf = (out) => out.entries.filter((e) => e.key.startsWith('gates.'));
const entry = (out, key) => out.entries.find((e) => e.key === key);
const FULL = {
  on_push: 'bash scripts/gate.sh --scope push',
  on_train_complete: 'bash scripts/gate.sh --scope train',
  nightly: 'bash scripts/gate.sh --scope nightly --clean',
  peak_mb: 3000,
  reuse: { core: ['jest.config.js'], always_run: ['a.spec.ts'], never_reuse: ['b.spec.ts'], env: ['MONGO_URL'], env_files: ['.env.test'] },
  queue: { budget_pct: 60, timeout_s: 14400, swap_used_max_mb: null },
};
const NULL_BLOCK = { on_push: null, on_train_complete: null, nightly: null, peak_mb: null, reuse: { core: [], always_run: [], never_reuse: [], env: [], env_files: [] }, queue: { budget_pct: null, timeout_s: null, swap_used_max_mb: null } };

test('T-S1-01 no gates block: doctor lists three [skip] stages and exits 0', () => {
  const repo = mkRepo();
  writeJson(path.join(repo.doIt, 'settings.json'), { version: 1 });
  const r = unit(repo, ['doctor']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out.gate_stages.map((s) => s.stage), ['on_push', 'on_train_complete', 'nightly']);
  for (const s of r.out.gate_stages) {
    assert.equal(s.declared, false);
    assert.equal(s.line, '[skip] ' + s.stage + ': no gate declared');
  }
});

test('T-S1-02 the docs/03 gates example validates', () => {
  assert.deepEqual(validateSchema(schema, { version: 1, gates: FULL }), []);
});

test('T-S1-03 unknown gates keys are rejected with pointers', () => {
  const e = validateSchema(schema, { version: 1, gates: { tiers: {}, queue: { mode: 'x' } } });
  assert.deepEqual(e.map((x) => [x.pointer, x.message]).sort(), [['/gates/queue/mode', 'is not an allowed property'], ['/gates/tiers', 'is not an allowed property']]);
});

test('T-S1-04 each invalid leaf yields exactly one error', () => {
  const cases = [
    [{ on_push: 5 }, /string\|null/],
    [{ on_push: '' }, /at least 1 characters/],
    [{ queue: { budget_pct: 95 } }, /at most 90/],
    [{ queue: { budget_pct: 0 } }, /at least 1/],
    [{ queue: { timeout_s: 0 } }, /at least 1/],
    [{ peak_mb: 0 }, /at least 1/],
    [{ reuse: { core: 'a' } }, /type array/],
  ];
  for (const [gates, re] of cases) {
    const e = validateSchema(schema, { version: 1, gates });
    assert.equal(e.length, 1, JSON.stringify(gates) + ' -> ' + JSON.stringify(e));
    assert.match(e[0].message, re);
  }
});

test('T-S1-05 --set reaches every gates leaf kind', () => {
  const repo = mkRepo();
  const r = unit(repo, ['doctor', '--set', 'gates.on_push=bash scripts/gate.sh --scope push', '--set', 'gates.reuse.always_run=a.spec.ts,b.spec.ts', '--set', 'gates.peak_mb=3000', '--set', 'gates.on_train_complete=null']);
  assert.equal(r.code, 0);
  assert.deepEqual([entry(r.out, 'gates.on_push').value, entry(r.out, 'gates.on_push').source], ['bash scripts/gate.sh --scope push', 'run-flag']);
  assert.deepEqual(entry(r.out, 'gates.reuse.always_run').value, ['a.spec.ts', 'b.spec.ts']);
  assert.equal(entry(r.out, 'gates.peak_mb').value, 3000);
  assert.equal(entry(r.out, 'gates.on_train_complete').value, null);
});

test('T-S1-06 unknown and invalid --set values fail loudly', () => {
  const repo = mkRepo();
  const a = unit(repo, ['doctor', '--set', 'gates.nope=1']);
  assert.equal(a.code, 1);
  assert.equal(a.out.outcome, 'SETTINGS_UNKNOWN_KEY');
  assert.equal(a.out.key, 'gates.nope');
  const b = unit(repo, ['doctor', '--set', 'gates.on_push=5']);
  assert.equal(b.code, 1);
  assert.equal(b.out.outcome, 'SETTINGS_INVALID');
  assert.equal(b.out.errors[0].pointer, '/gates/on_push');
});

test('T-S1-07 a fresh repository has twelve null/empty default gates leaves', () => {
  const repo = mkRepo();
  const r = unit(repo, ['doctor']);
  assert.equal(r.code, 0);
  const g = gatesOf(r.out);
  assert.equal(g.length, 12);
  assert.ok(g.every((e) => e.source === 'default'));
  for (const k of ['on_push', 'on_train_complete', 'nightly', 'peak_mb', 'queue.budget_pct', 'queue.timeout_s', 'queue.swap_used_max_mb']) assert.equal(entry(r.out, 'gates.' + k).value, null, k);
  for (const k of ['core', 'always_run', 'never_reuse', 'env', 'env_files']) assert.deepEqual(entry(r.out, 'gates.reuse.' + k).value, [], k);
});

test('T-S1-08 init writes the null block, is idempotent, and leaves an older file untouched', () => {
  const repo = mkRepo();
  const a = unit(repo, ['init']);
  assert.equal(a.code, 0);
  const file = path.join(repo.doIt, 'settings.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).gates, NULL_BLOCK);
  const b = unit(repo, ['init']);
  assert.equal(b.out.outcome, 'INIT_NOOP');
  assert.deepEqual(b.out.changed, []);
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete old.gates;
  const text = JSON.stringify(old, null, 2) + '\n';
  fs.writeFileSync(file, text);
  const c = unit(repo, ['init']);
  assert.equal(c.code, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.deepEqual(validateSchema(schema, JSON.parse(text)), []);
});

function queueFixture(ws, gl) {
  const repo = mkRepo();
  if (ws !== undefined) writeJson(path.join(repo.doIt, 'settings.json'), { version: 1, gates: { queue: ws } });
  if (gl !== undefined) writeJson(path.join(repo.home, '.do-it', 'settings.json'), { version: 1, gates: { queue: gl } });
  const ctx = makeCtx({ cwd: repo.dir, env: repo.env });
  return { repo, ctx };
}

test('T-S1-09 workspace queue values are ignored and listed; the global value wins', () => {
  const { repo, ctx } = queueFixture({ timeout_s: 5 }, { timeout_s: 7200 });
  const loaded = loadSettings(ctx, []);
  assert.equal(loaded.values.gates.queue.timeout_s, 5);
  const q = gatesQueueSettings(ctx, loaded);
  assert.equal(q.timeout_s, 7200);
  assert.deepEqual(q.ignored, [{ key: 'queue.timeout_s', source: 'workspace' }]);
  assert.deepEqual(validateSchema(schema, JSON.parse(fs.readFileSync(path.join(repo.doIt, 'settings.json'), 'utf8'))), []);
});

test('T-S1-10 queue defaults, run-flag ignored, global honoured', () => {
  const a = queueFixture();
  const qa = gatesQueueSettings(a.ctx, loadSettings(a.ctx, []));
  assert.deepEqual(qa, { budget_pct: 60, timeout_s: 14400, swap_used_max_mb: null, ignored: [] });
  const qb = gatesQueueSettings(a.ctx, loadSettings(a.ctx, ['gates.queue.budget_pct=90']));
  assert.equal(qb.budget_pct, 60);
  assert.deepEqual(qb.ignored, [{ key: 'queue.budget_pct', source: 'run-flag' }]);
  const c = queueFixture(undefined, { budget_pct: 40 });
  const qc = gatesQueueSettings(c.ctx, loadSettings(c.ctx, []));
  assert.equal(qc.budget_pct, 40);
  assert.deepEqual(qc.ignored, []);
});

test('T-S1-11 a spaceless token in a gate command is a secret; a command line is not', () => {
  const repo = mkRepo();
  const secret = 'Abcdefghijklmnop0123456789ABCDEFG';
  assert.equal(secret.length >= 32, true);
  const file = path.join(repo.doIt, 'settings.json');
  writeJson(file, { version: 1, gates: { on_push: secret } });
  const r = real(repo, ['doctor']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'SETTINGS_SECRET_VALUE');
  assert.equal(r.out.errors[0].key, 'gates.on_push');
  assert.ok(!r.stdout.includes(secret) && !r.stderr.includes(secret));
  writeJson(file, { version: 1, gates: { on_push: 'bash scripts/gate.sh --scope push' } });
  assert.equal(real(repo, ['doctor']).code, 0);
});

test('T-S1-12 no gates leaf name looks like a secret key; the sample block scans clean', () => {
  for (const p of gatesLeafPaths(SETTINGS_DEFAULTS)) for (const part of p) assert.ok(!SECRET_KEY_NAMES.test(part), part);
  assert.equal(gatesLeafPaths(SETTINGS_DEFAULTS).length, 12);
  const block = { gates: { ...FULL, reuse: { ...FULL.reuse, env: ['MONGO_URL', 'NODE_ENV'], core: ['jest.config.js', 'src/**/*.ts'] } } };
  assert.deepEqual(settingsScanSecrets(block, '', []), []);
});

test('T-S1-13 schema and defaults agree for every gates leaf (both directions)', () => {
  assert.deepEqual(gatesAgreement(SETTINGS_DEFAULTS, schema, validateSchema), []);
  assert.equal(gatesLeafPaths(SETTINGS_DEFAULTS).length, 12);
});

test('T-S1-15 a hand edit to a bad value is a loud failure, not a skip; fixing it recovers', () => {
  const repo = mkRepo();
  assert.equal(unit(repo, ['init']).code, 0);
  assert.equal(unit(repo, ['doctor']).code, 0);
  const file = path.join(repo.doIt, 'settings.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.gates.on_push = 5;
  fs.writeFileSync(file, JSON.stringify(s));
  const bad = unit(repo, ['doctor']);
  assert.equal(bad.code, 1);
  assert.equal(bad.out.outcome, 'SETTINGS_INVALID');
  assert.equal(bad.out.errors[0].pointer, '/gates/on_push');
  s.gates.on_push = null;
  fs.writeFileSync(file, JSON.stringify(s));
  assert.equal(unit(repo, ['doctor']).code, 0);
});

test('T-S1-16 [REAL] build, mirror check, and the built bundle reports gates.on_push null', () => {
  const root = path.resolve(CORE_DIR, '..');
  cp.execFileSync(process.execPath, [path.join(root, 'core/spine/build.mjs')], { cwd: root, stdio: 'ignore' });
  cp.execFileSync(process.execPath, [path.join(root, 'scripts/sync-mirror.mjs'), '--check'], { cwd: root, stdio: 'ignore' });
  const repo = mkRepo();
  const r = cp.spawnSync(process.execPath, [BIN, 'doctor', '--json'], { cwd: repo.dir, env: repo.env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.entries.find((e) => e.key === 'gates.on_push').value, null);
  assert.equal(out.gate_stages.length, 3);
});

test('gatesStage declared stage returns its command and no skip line', () => {
  const g = gatesStage({ gates: { nightly: 'x y' } }, 'nightly');
  assert.deepEqual(g, { stage: 'nightly', declared: true, command: 'x y', line: null });
  void tmp;
});
