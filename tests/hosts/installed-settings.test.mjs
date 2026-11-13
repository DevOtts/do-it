// T-E1-04 / G-8 in the INSTALLED plugin: the marketplace installs plugins/do-it alone (no hosts/ folder next
// to it), so the host manifests and settings schemas travel inside the plugin (mirror-manifest.json).
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = ['eng', 'ine'].join('');
let cache, ws;
const cleanEnv = () => {
  const env = { ...process.env, HOME: ws };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  return env;
};
const doctor = (settings) => {
  fs.writeFileSync(path.join(ws, '.do-it', 'settings.json'), JSON.stringify(settings));
  const r = cp.spawnSync(process.execPath, [path.join(cache, 'scripts', 'do-it.mjs'), 'doctor', '--json'], { cwd: ws, env: cleanEnv(), encoding: 'utf8' });
  return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()), raw: r.stdout };
};

before(() => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'e1-inst-')));
  // Laid out like the marketplace cache: <cache>/<marketplace>/<plugin>/<version>/, with nothing but the plugin in it.
  cache = path.join(base, 'plugins', 'cache', 'devotts', 'do-it', '1.1.0');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.cpSync(path.join(ROOT, 'plugins', 'do-it'), cache, { recursive: true });
  ws = path.join(base, 'ws');
  fs.mkdirSync(path.join(ws, '.do-it'), { recursive: true });
  cp.execFileSync('git', ['init', '-q', ws]);
});
after(() => fs.rmSync(path.resolve(cache, '..', '..', '..', '..', '..'), { recursive: true, force: true }));

test('T-E1-04 installed plugin: no hosts/ folder beside the plugin, the mirror is inside it', () => {
  assert.ok(!fs.existsSync(path.join(cache, '..', '..', 'hosts')));
  assert.ok(fs.existsSync(path.join(cache, 'hosts', HOST, 'state-store', 'settings.schema.json')));
  assert.ok(fs.existsSync(path.join(cache, 'hosts', HOST, 'state-store', 'engine-drivers', 'r2.mjs')));
  for (const h of ['claude-code', 'codex', 'opencode', HOST]) assert.ok(fs.existsSync(path.join(cache, 'hosts', h, 'adapter.manifest.json')), h);
});

test('T-E1-04 installed plugin: state.<host>.blobs "bogus" is SETTINGS_INVALID (as in 1.0.5)', () => {
  const r = doctor({ state: { backend: HOST, [HOST]: { blobs: 'bogus' } } });
  assert.equal(r.code, 1, r.raw);
  assert.equal(r.out.outcome, 'SETTINGS_INVALID');
  assert.ok(r.out.errors.some((e) => e.pointer === '/state/' + HOST + '/blobs'), r.raw);
});

test('T-E1-04 installed plugin: state.<host>.blobs "r2" validates; an unknown state.<x> object is refused', () => {
  const ok = doctor({ state: { backend: HOST, [HOST]: { blobs: 'r2' } } });
  assert.equal(ok.code, 0, ok.raw);
  const typo = doctor({ state: { backend: 'nohost', nohost: { x: 1 } } });
  assert.equal(typo.code, 1, typo.raw);
  assert.equal(typo.out.outcome, 'SETTINGS_INVALID');
});

test('N1 installed plugin: the 1.0.5 shape (backend local + dormant state.<host> block) is valid; bad dormant block and unknown host are refused', () => {
  const ok = doctor({ state: { backend: 'local', [HOST]: { blobs: 'fs-mirror' } } });
  assert.equal(ok.code, 0, ok.raw);
  const bad = doctor({ state: { backend: 'local', [HOST]: { blobs: 'bogus' } } });
  assert.equal(bad.code, 1, bad.raw);
  assert.ok(bad.out.errors.some((e) => e.pointer === '/state/' + HOST + '/blobs'), bad.raw);
  const unk = doctor({ state: { backend: 'local', nohost: { x: 1 } } });
  assert.equal(unk.code, 1, unk.raw);
  assert.ok(unk.out.errors.some((e) => e.pointer === '/state/nohost' && e.message.includes('"nohost"')), unk.raw);
});

test('T-E1-04 installed plugin: the mirrored engine store loads and opens from the cache', async () => {
  const mod = await import(path.join(cache, 'core', 'state-stores', 'index.mjs'));
  assert.ok(mod.hostBackend(HOST), 'host backend preloaded from <plugin>/hosts');
  assert.equal(typeof mod.openStore, 'function');
});
