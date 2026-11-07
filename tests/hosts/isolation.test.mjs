// E1 / R3 / G-9: deleting a host folder leaves every core suite green, and a backend that lived in that host
// fails cleanly. Runs against a temp copy of the repo with hosts/engine/ removed.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = ['eng', 'ine'].join('');
const SKIP = new Set(['.git', '.worktrees', 'node_modules']);
let copy;
// A child `node --test` inside a running test must not inherit the runner's reporter channel.
const cleanEnv = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };

before(() => {
  copy = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'e1-iso-')));
  fs.cpSync(ROOT, copy, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) || src === ROOT });
  fs.rmSync(path.join(copy, 'hosts', HOST), { recursive: true, force: true });
});
after(() => fs.rmSync(copy, { recursive: true, force: true }));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (e.name.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

test('T-E1-02 the copy has no engine host folder and still has the others', () => {
  assert.ok(!fs.existsSync(path.join(copy, 'hosts', HOST)));
  for (const h of ['claude-code', 'codex', 'opencode', '_interface']) assert.ok(fs.existsSync(path.join(copy, 'hosts', h)), h);
  assert.ok(!fs.existsSync(path.join(copy, 'core', 'state-stores', HOST + '.mjs')));
});

test('T-E1-02 openStore({backend:"engine"}) fails with DRIVER_UNKNOWN naming the missing host, no crash', () => {
  const script = `import { openStore } from ${JSON.stringify(path.join(copy, 'core/state-stores/index.mjs'))};
    openStore({ backend: 'local-fs', root: '/tmp' });
    try { openStore({ backend: ${JSON.stringify(HOST)} }); console.log(JSON.stringify({ threw: false })); }
    catch (e) { console.log(JSON.stringify({ threw: true, code: e.code, name: e.name, message: e.message, host: e.host })); }`;
  const r = cp.spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'the process must not crash: ' + r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.threw, true);
  assert.equal(out.code, 'DRIVER_UNKNOWN');
  assert.equal(out.name, 'StoreError');
  assert.equal(out.host, HOST);
  assert.ok(out.message.includes('host "' + HOST + '"') && /not installed/.test(out.message), out.message);

  const c = cp.spawnSync(process.execPath, [path.join(copy, 'core/state-stores/cli.mjs'), 'list', 'runs/r1/', '--backend', HOST], { encoding: 'utf8' });
  assert.equal(c.status, 1);
  assert.equal(JSON.parse(c.stderr).error.code, 'DRIVER_UNKNOWN');
  const k = cp.spawnSync(process.execPath, [path.join(copy, 'core/state-stores/conformance/run.mjs'), '--backend', HOST], { encoding: 'utf8' });
  assert.equal(k.status, 1);
  assert.equal(JSON.parse(k.stderr).error.code, 'DRIVER_UNKNOWN');
});

test('T-E1-02 every core suite still passes without the engine host', () => {
  const files = walk(path.join(copy, 'core')).map((f) => path.relative(copy, f)).sort();
  assert.ok(files.length >= 15, 'found ' + files.length + ' core test files');
  assert.ok(files.includes('core/state-stores/tests/n2.test.mjs') && files.includes('core/spine/test/s2/settings-host.test.mjs'));
  const r = cp.spawnSync(process.execPath, ['--test', ...files], { cwd: copy, encoding: 'utf8', maxBuffer: 1 << 28, env: cleanEnv() });
  const tail = (r.stdout || '').split('\n').filter((l) => /^# (tests|pass|fail|skipped)/.test(l)).join(' ');
  assert.equal(r.status, 0, tail + '\n' + (r.stdout || '').split('\n').filter((l) => /^\s*not ok/.test(l)).slice(0, 8).join('\n'));
  assert.match(tail, /# fail 0/);
});

test('T-E1-02 a settings file keyed to the missing host is refused naming the host; the other settings still load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e1-iso-ws-'));
  try {
    cp.execFileSync('git', ['init', '-q', dir]);
    fs.mkdirSync(path.join(dir, '.do-it'));
    fs.writeFileSync(path.join(dir, '.do-it', 'settings.json'), JSON.stringify({ state: { backend: HOST, [HOST]: { blobs: 'r2' } } }));
    const bin = path.join(copy, 'core', 'spine', 'do-it.mjs');
    const env = { ...process.env, HOME: dir };
    for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
    const r = cp.spawnSync(process.execPath, [bin, 'doctor', '--json'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(out.outcome, 'SETTINGS_INVALID');
    assert.ok(out.errors.some((e) => e.pointer === '/state/' + HOST && e.message.includes('"' + HOST + '"')), r.stdout);
    fs.writeFileSync(path.join(dir, '.do-it', 'settings.json'), JSON.stringify({ stop_gate: { patience: 4 } }));
    const ok = cp.spawnSync(process.execPath, [bin, 'doctor', '--json'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
