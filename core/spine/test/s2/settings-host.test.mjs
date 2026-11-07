// E1-02: host-owned settings. Core accepts one object keyed by the backend name under `state`;
// the host's own schema (hosts/<name>/state-store/settings.schema.json) validates it. No new top-level key (G-8).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { mkRepo, real, unit, tmp, writeJson } from '../helpers.mjs';
import { loadSchemaFile } from '../../src/schema.mjs';
import { SPINE_DIR } from '../helpers.mjs';

const entry = (out, key) => out.entries.find((e) => e.key === key);
// The settings keys at d38cedb, before this package. G-8: this list does not grow.
const KEYS_AT_BASELINE = ['ceilings', 'handoff', 'host', 'interaction', 'isolation', 'observability', 'review', 'secrets', 'state', 'stop_gate', 'tiers', 'version'];
const made = [];
const track = (d) => { made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const newRepo = () => { const r = mkRepo(); track(r.dir); track(r.home); return r; };
const withSettings = (settings) => { const repo = newRepo(); writeJson(path.join(repo.doIt, 'settings.json'), settings); return repo; };

// Core suites must pass with any host folder deleted, so the structural cases run against a fixture host in a
// temp hosts folder (DO_IT_HOSTS_DIR). Only the case named in the contract reads the real hosts/engine, and it
// skips with a reason when that folder is absent.
const REAL_HOSTS = path.resolve(SPINE_DIR, '..', '..', 'hosts');
const FX = 'fxhost';
function fixtureHosts() {
  const dir = track(tmp('dit-fxhosts-'));
  writeJson(path.join(dir, FX, 'adapter.manifest.json'), { host: FX, state_store: { module: 'state-store/index.mjs', settings_schema: 'state-store/settings.schema.json' } });
  writeJson(path.join(dir, FX, 'state-store', 'settings.schema.json'), { type: 'object', additionalProperties: false, properties: { blobs: { enum: ['rows', 'r2', 'fs-mirror'] } } });
  return dir;
}

function validatesThroughHost(name, hostsEnv) {
  for (const run of [unit, real]) {
    const ok = withSettings({ state: { backend: name, [name]: { blobs: 'r2' } } });
    const a = run(ok, ['doctor'], hostsEnv);
    assert.equal(a.code, 0, a.stdout);
    assert.deepEqual([entry(a.out, 'state.' + name + '.blobs').value, entry(a.out, 'state.' + name + '.blobs').source], ['r2', 'workspace']);
    assert.equal(entry(a.out, 'state.backend').value, name);

    const bad = withSettings({ state: { backend: name, [name]: { blobs: 'bogus' } } });
    const b = run(bad, ['doctor'], hostsEnv);
    assert.equal(b.code, 1);
    assert.equal(b.out.outcome, 'SETTINGS_INVALID');
    const e = b.out.errors.find((x) => x.pointer === '/state/' + name + '/blobs');
    assert.ok(e, JSON.stringify(b.out.errors));
    assert.match(e.message, /must be one of "rows", "r2", "fs-mirror"|must be one of rows, r2, fs-mirror/);
    assert.equal(e.file, path.join(bad.doIt, 'settings.json'));
  }
}

test('T-E1-04 settings: the real engine host schema validates state.engine (skips when hosts/engine is absent)', (t) => {
  if (!fs.existsSync(path.join(REAL_HOSTS, 'engine', 'adapter.manifest.json'))) return t.skip('hosts/engine is absent: core suites must not need it (R3)');
  validatesThroughHost('engine', {});
});

test('T-E1-04 settings: state.<backend> validated by the host schema, no new core key (G-8)', () => {
  const schema = loadSchemaFile('settings.schema.json');
  assert.deepEqual(Object.keys(schema.properties).sort(), KEYS_AT_BASELINE);
  assert.deepEqual(Object.keys(schema.properties.state.properties), ['backend']);
  assert.ok(!JSON.stringify(schema).includes('fs-mirror'), 'the core schema knows no engine blob driver');

  validatesThroughHost(FX, { DO_IT_HOSTS_DIR: fixtureHosts() });
});

test('T-E1-04 existing state.<backend>.blobs files stay valid; the engine default is gone', (t) => {
  const env = { DO_IT_HOSTS_DIR: fixtureHosts() };
  const legacy = withSettings({ state: { [FX]: { blobs: 'fs-mirror' } } });
  const a = unit(legacy, ['doctor'], env);
  assert.equal(a.code, 0, a.stdout);
  assert.equal(entry(a.out, 'state.' + FX + '.blobs').value, 'fs-mirror');
  assert.equal(entry(a.out, 'state.backend').source, 'default');

  const fresh = unit(newRepo(), ['doctor']);
  assert.equal(fresh.code, 0);
  assert.ok(!fresh.out.entries.some((e) => e.key.startsWith('state.') && e.key !== 'state.backend'), 'no host default in core');
  assert.equal(entry(fresh.out, 'state.backend').value, 'local');

  // the real shape of an existing file: state.engine.blobs with no backend key
  if (!fs.existsSync(path.join(REAL_HOSTS, 'engine', 'adapter.manifest.json'))) return t.skip('hosts/engine is absent');
  const old = withSettings({ state: { engine: { blobs: 'fs-mirror' } } });
  const b = unit(old, ['doctor']);
  assert.equal(b.code, 0, b.stdout);
  assert.equal(entry(b.out, 'state.engine.blobs').value, 'fs-mirror');
});

test('T-E1-04 one object, keyed by the selected backend', () => {
  const env = { DO_IT_HOSTS_DIR: fixtureHosts() };
  const mismatch = withSettings({ state: { backend: 'local-fs', [FX]: { blobs: 'rows' } } });
  const a = unit(mismatch, ['doctor'], env);
  assert.equal(a.code, 1);
  assert.ok(a.out.errors.some((x) => x.pointer === '/state/' + FX && /state\.backend/.test(x.message)));
  const two = withSettings({ state: { [FX]: { blobs: 'rows' }, other: {} } });
  assert.ok(unit(two, ['doctor'], env).out.errors.some((x) => x.pointer === '/state' && /one object/.test(x.message)));
  const notObject = withSettings({ state: { [FX]: 'r2' } });
  assert.equal(unit(notObject, ['doctor'], env).code, 1);
});

test('T-E1-04 --set reaches the host schema', () => {
  const env = { DO_IT_HOSTS_DIR: fixtureHosts() };
  const repo = newRepo();
  const key = 'state.' + FX + '.blobs';
  const ok = unit(repo, ['doctor', '--set', key + '=r2'], env);
  assert.equal(ok.code, 0, ok.stdout);
  assert.deepEqual([entry(ok.out, key).value, entry(ok.out, key).source], ['r2', 'run-flag']);
  const bad = unit(repo, ['doctor', '--set', key + '=bogus'], env);
  assert.equal(bad.code, 1);
  assert.equal(bad.out.outcome, 'SETTINGS_INVALID');
  assert.ok(bad.out.errors.some((x) => x.pointer === '/state/' + FX + '/blobs'));
  assert.equal(unit(repo, ['doctor', '--set', 'state.nohost.x=1'], env).out.outcome, 'SETTINGS_UNKNOWN_KEY');
});

test('T-E1-04 without the host folder the key is refused naming the host; an override folder that does not exist falls back to the own hosts of the bundle and refuses too', () => {
  const repo = withSettings({ state: { backend: FX, [FX]: { blobs: 'r2' } } });
  const empty = track(tmp('dit-hosts-'));
  fs.mkdirSync(path.join(empty, 'some-other-host'));
  const a = unit(repo, ['doctor'], { DO_IT_HOSTS_DIR: empty });
  assert.equal(a.code, 1);
  assert.ok(a.out.errors.some((x) => x.pointer === '/state/' + FX && x.message.includes('host "' + FX + '"')), JSON.stringify(a.out.errors));
  const gone = unit(repo, ['doctor'], { DO_IT_HOSTS_DIR: path.join(empty, 'nope') });
  assert.equal(gone.code, 1, gone.stdout);
  assert.ok(gone.out.errors.some((x) => x.pointer === '/state/' + FX && x.message.includes('host "' + FX + '"')), JSON.stringify(gone.out.errors));
});
