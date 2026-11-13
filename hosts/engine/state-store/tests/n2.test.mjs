// Engine state-store cases (moved from core/state-stores/tests/n2.test.mjs, epic E1). Test names keep their N2 ids.
// The backend is reached the way core reaches it: openStore({backend:'engine'}) loads it through the
// `state_store` entry of hosts/engine/adapter.manifest.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore, recover } from '../../../../core/state-stores/index.mjs';
import { selectBlobDriver, loadEngineConfig } from '../index.mjs';
import { MemoryEngine } from '../engine-drivers/memory-engine.mjs';
import { createFsMirrorDriver } from '../engine-drivers/fs-mirror.mjs';
import { createR2Driver } from '../engine-drivers/r2.mjs';
import { createRowsDriver } from '../engine-drivers/rows.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SS = path.resolve(HERE, '..');
const CORE_SS = path.resolve(HERE, '..', '..', '..', '..', 'core', 'state-stores');
const CLI = path.join(SS, 'cli.mjs');
const RUNNER = path.join(CORE_SS, 'conformance', 'run.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'n2e-'));
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
const cli = (args, opts) => node([CLI, ...args], opts);
const rejectCode = async (fn, code) => assert.rejects(fn, (e) => { assert.equal(e.code, code); return true; });
const engine = () => { const mem = new MemoryEngine(); return { mem, s: openStore({ backend: 'engine', transport: mem, settings: {} }) }; };

// Conformance pass count measured on the pre-move tree (d38cedb): 12 of 12 on every backend.
const CONFORMANCE_AT_BASELINE = 12;

test('T-E1-03 conformance against the engine store from hosts/engine/state-store: same pass count as at d38cedb', () => {
  const r = node([RUNNER, '--backend', 'engine', '--driver', 'memory-engine']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, new RegExp(`^PASS ${CONFORMANCE_AT_BASELINE}/${CONFORMANCE_AT_BASELINE}$`, 'm'));
  assert.equal((r.stdout.match(/^ok /gm) || []).length, CONFORMANCE_AT_BASELINE);
  assert.doesNotMatch(r.stdout, /^FAIL/m);
});

test('T-E1-03 openStore({backend:"engine"}) loads the store through the manifest, not through core', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(HERE, '..', '..', 'adapter.manifest.json'), 'utf8'));
  assert.equal(manifest.state_store.backend, 'engine');
  assert.equal(manifest.state_store.module, 'state-store/index.mjs');
  const { s } = engine();
  assert.equal(s.constructor.name, 'EngineStore');
  await s.put('runs/r1/state.json', '{"ok":true}');
  assert.equal(String(await s.get('runs/r1/state.json')), '{"ok":true}');
  const coreIndex = await fs.readFile(path.join(CORE_SS, 'index.mjs'), 'utf8');
  assert.doesNotMatch(coreIndex, /engine/i, 'core/state-stores/index.mjs names no engine');
  await assert.rejects(fs.stat(path.join(CORE_SS, ['eng', 'ine'].join('') + '.mjs')), 'the store left core');
});

test('T-N2-05 interface semantics on the engine backend', async () => {
  const { s } = engine();
  await s.append('runs/r1/events.jsonl', 'one');
  await s.append('runs/r1/events.jsonl', 'two');
  assert.deepEqual(await s.list('runs/r1/'), ['events.jsonl']);
  assert.equal(String(await s.get('runs/r1/events.jsonl')), 'one\ntwo\n');
  await rejectCode(() => s.get('runs/r1/missing'), 'NOT_FOUND');
});

test('T-N2-06 path guard rejects traversal and creates nothing on the engine backend', async () => {
  const { s, mem } = engine();
  for (const p of ['runs/r1/../r2/state.json', '/etc/x']) await rejectCode(() => s.put(p, 'x'), 'PATH_REJECTED');
  await rejectCode(() => s.get('other/state.json'), 'PATH_REJECTED');
  assert.equal(mem.rows.size, 0);
});

test('T-N2-07 blob addressing is content addressed and deduplicated on the engine backend', async () => {
  const { s } = engine();
  const a = randomBytes(1000), b = randomBytes(1000);
  const k1 = await s.putBlob('r1', a), k2 = await s.putBlob('r1', a), k3 = await s.putBlob('r1', b);
  assert.equal(k1, k2); assert.notEqual(k1, k3);
  assert.equal((await s.list('runs/r1/blobs/')).length, 2);
  for (const k of [k1, k3]) assert.equal(sha(await s.getBlob('r1', k)), k);
});

test('T-N2-12 torn append line is quarantined, not dropped, on the engine backend', async () => {
  const { s } = engine();
  await s.put('runs/r1/events.jsonl', '{"n":1}\n{"n":2}\n{"n":3}\n{"n":4,"cut');
  const r = await recover(s, { runId: 'r1' });
  assert.equal(r.recovered.TORN_LINE, 1);
  assert.equal(String(await s.get('runs/r1/events.jsonl')), '{"n":1}\n{"n":2}\n{"n":3}\n');
  assert.equal(String(await s.get('runs/r1/events.jsonl.torn')), '{"n":4,"cut\n');
  await s.append('runs/r1/events.jsonl', '{"n":4}');
  assert.equal((await recover(s, { runId: 'r1' })).recovered.TORN_LINE, 0);
});

test('T-N2-03 shared conformance suite on the engine backend with the in-memory driver', () => {
  const r = node([RUNNER, '--backend', 'engine', '--driver', 'memory-engine']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PASS 12\/12$/m);
  assert.match(r.stdout, /driver: memory-engine, real: false/);
});

test('T-N2-04 [REAL] engine backend on a real Engine environment: IMPLEMENTED-NOT-VERIFIED when unreachable', () => {
  const r = node([RUNNER, '--backend', 'engine', '--driver', 'rows'], { env: { ...process.env, DO_IT_ENGINE_URL: '' } });
  // No reachable Engine staging: must NOT print PASS and must say so with the probe error and the blob driver.
  assert.doesNotMatch(r.stdout, /PASS/);
  assert.match(r.stdout, /^IMPLEMENTED-NOT-VERIFIED backend: engine, driver: rows, real: true, probe: .+/m);
  assert.equal(r.status, 3);
});

test('T-N2-10 adversarial verify on engine backend: rows, fs-mirror and r2 (stub transport)', async () => {
  const mirror = await tmpdir();
  const mem = new MemoryEngine();
  const variants = {
    rows: [createRowsDriver({ transport: mem }), async (key) => mem.rows.set(key, Buffer.from('forged'))],
    'fs-mirror': [createFsMirrorDriver({ dir: mirror }), async (key) => fs.writeFile(createFsMirrorDriver({ dir: mirror }).file(key), 'forged')],
    r2: [createR2Driver({ config: { bucket: 'b', endpoint: 'https://stub', token_ref: 'env:X' }, transport: mem }), async (key) => mem.objects.set(`b/${key}`, Buffer.from('forged'))],
  };
  for (const [name, [blobs, tamper]] of Object.entries(variants)) {
    const s = openStore({ backend: 'engine', transport: mem, blobs });
    const k = await s.putBlob('r1', Buffer.from('payload ' + name));
    assert.equal(String(await s.getBlob('r1', k)), 'payload ' + name);
    await tamper(`runs/r1/blobs/${k}`);
    await rejectCode(() => s.getBlob('r1', k), 'HASH_MISMATCH');
  }
});

test('T-N2-15 blob driver selection', async () => {
  const t = new MemoryEngine();
  const pick = (blobs, extra = {}) => selectBlobDriver({ state: { engine: blobs === undefined ? {} : { blobs } } }, { transport: t, mirrorDir: os.tmpdir(), ...extra });
  assert.equal(pick('rows').id, 'rows');
  assert.equal(pick('fs-mirror').id, 'fs-mirror');
  assert.equal(pick(undefined).id, 'rows');
  assert.throws(() => pick('r2'), (e) => e.code === 'DRIVER_UNCONFIGURED');
  assert.throws(() => pick('bogus'), (e) => e.code === 'DRIVER_UNKNOWN');
  for (const [blobs, code] of [['r2', 'DRIVER_UNCONFIGURED'], ['bogus', 'DRIVER_UNKNOWN']]) {
    const r = cli(['driver', '--blobs', blobs]);
    assert.equal(r.status, 1); assert.equal(JSON.parse(r.stderr).error.code, code);
  }
  assert.equal(JSON.parse(cli(['driver']).stdout).driver, 'rows');
  assert.equal(JSON.parse(cli(['driver', '--blobs', 'fs-mirror', '--mirror-dir', os.tmpdir()]).stdout).driver, 'fs-mirror');
});

test('T-N2-17 secrets are references only and never echoed', () => {
  const literal = 'sk-live-abc123';
  const bad = cli(['config', '--data', JSON.stringify({ base_url: 'https://e.example', token: literal })]);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'SECRET_LITERAL_REJECTED');
  assert.ok(!bad.stdout.includes(literal) && !bad.stderr.includes(literal));
  const ok = cli(['config', '--data', JSON.stringify({ base_url: 'https://e.example', token_ref: 'env:ENGINE_TOKEN' })]);
  assert.equal(ok.status, 0); assert.ok(!ok.stdout.includes(literal));
  assert.throws(() => loadEngineConfig({ nested: { api_key: literal } }), (e) => e.code === 'SECRET_LITERAL_REJECTED' && !e.message.includes(literal));
  assert.throws(() => loadEngineConfig({ token_ref: literal }), (e) => e.code === 'SECRET_REF_INVALID' && !e.message.includes(literal));
});

test('T-E1-03 the engine settings schema is the one the manifest names', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(HERE, '..', '..', 'adapter.manifest.json'), 'utf8'));
  const schema = JSON.parse(await fs.readFile(path.join(HERE, '..', '..', manifest.state_store.settings_schema), 'utf8'));
  assert.deepEqual(schema.properties.blobs.enum, ['rows', 'r2', 'fs-mirror']);
});
