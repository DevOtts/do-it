// Epic N2 test contract. Test names carry the case ID. [REAL] cases use the real fs and real git.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore, recover, resume, selectBlobDriver, loadEngineConfig, GitBranchStore } from '../index.mjs';
import { MemoryEngine } from '../engine-drivers/memory-engine.mjs';
import { createFsMirrorDriver } from '../engine-drivers/fs-mirror.mjs';
import { createR2Driver } from '../engine-drivers/r2.mjs';
import { createRowsDriver } from '../engine-drivers/rows.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SS = path.resolve(HERE, '..');
const CLI = path.join(SS, 'cli.mjs');
const RUNNER = path.join(SS, 'conformance', 'run.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'n2-'));
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
const cli = (args, opts) => node([CLI, ...args], opts);
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();

async function gitRepo() {
  const repo = await tmpdir();
  execFileSync('git', ['init', '-q', repo]);
  return repo;
}
async function allBackends() {
  const root = await tmpdir(), repo = await gitRepo();
  const mem = new MemoryEngine();
  return [
    ['local-fs', openStore({ backend: 'local-fs', root }), { root }],
    ['git-branch', openStore({ backend: 'git-branch', repo }), { repo }],
    ['engine', openStore({ backend: 'engine', transport: mem, settings: {} }), { mem }],
  ];
}
const rejectCode = async (fn, code) => assert.rejects(fn, (e) => { assert.equal(e.code, code); return true; });

test('T-N2-01 [REAL] shared conformance suite on local-fs', async () => {
  const r = node([RUNNER, '--backend', 'local-fs']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PASS 12\/12$/m);
  assert.match(r.stdout, /real: true/);
  // files really exist under runs/{run_id}/ on disk
  const root = await tmpdir();
  const s = openStore({ backend: 'local-fs', root });
  await s.put('runs/r1/state.json', '{}');
  assert.ok((await fs.stat(path.join(root, 'runs', 'r1', 'state.json'))).isFile());
});

test('T-N2-02 [REAL] shared conformance suite on git-branch, one commit per write batch', async () => {
  const r = node([RUNNER, '--backend', 'git-branch']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PASS 12\/12$/m);
  const repo = await gitRepo();
  const s = openStore({ backend: 'git-branch', repo });
  await s.put('runs/r1/state.json', 'a');                      // batch 1
  await s.batch('three writes', async () => {                  // batch 2
    await s.put('runs/r1/ledger.json', 'b'); await s.append('runs/r1/events.jsonl', 'e1'); await s.append('runs/r1/events.jsonl', 'e2');
  });
  await s.append('runs/r1/events.jsonl', 'e3');                // batch 3
  const log = git(repo, 'log', '--format=%s', 'do-it/runs/r1').split('\n');
  assert.equal(log.length, 3);
  assert.match(log[1], /three writes \(2 files\)/);
  assert.equal(await s.get('runs/r1/events.jsonl').then(String), 'e1\ne2\ne3\n');
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

test('T-N2-05 interface semantics on every backend', async () => {
  for (const [name, s] of await allBackends()) {
    await s.append('runs/r1/events.jsonl', 'one');
    await s.append('runs/r1/events.jsonl', 'two');
    assert.deepEqual(await s.list('runs/r1/'), ['events.jsonl'], name);
    assert.equal(String(await s.get('runs/r1/events.jsonl')), 'one\ntwo\n', name);
    await rejectCode(() => s.get('runs/r1/missing'), 'NOT_FOUND');
  }
  const root = await tmpdir();
  const r = cli(['get', 'runs/r1/missing', '--backend', 'local-fs', '--root', root]);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stderr).error.code, 'NOT_FOUND');
});

test('T-N2-06 path guard rejects traversal and creates nothing', async () => {
  const bad = ['runs/r1/../r2/state.json', '/etc/x'];
  for (const [name, s, h] of await allBackends()) {
    for (const p of bad) await rejectCode(() => s.put(p, 'x'), 'PATH_REJECTED');
    await rejectCode(() => s.get('other/state.json'), 'PATH_REJECTED');
    if (h.root) assert.deepEqual(await fs.readdir(h.root), [], name);
    if (h.repo) assert.equal(git(h.repo, 'for-each-ref'), '', name);
    if (h.mem) assert.equal(h.mem.rows.size, 0, name);
  }
  const root = await tmpdir();
  const r = cli(['put', 'runs/r1/../r2/state.json', '--data', 'x', '--backend', 'local-fs', '--root', root]);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stderr).error.code, 'PATH_REJECTED');
  assert.deepEqual(await fs.readdir(root), []);
});

test('T-N2-07 blob addressing is content addressed and deduplicated', async () => {
  for (const [name, s] of await allBackends()) {
    const a = randomBytes(1000), b = randomBytes(1000);
    const k1 = await s.putBlob('r1', a), k2 = await s.putBlob('r1', a), k3 = await s.putBlob('r1', b);
    assert.equal(k1, k2, name); assert.notEqual(k1, k3, name);
    assert.equal((await s.list('runs/r1/blobs/')).length, 2, name);
    for (const k of [k1, k3]) assert.equal(sha(await s.getBlob('r1', k)), k, name);
  }
});

test('T-N2-08 [REAL] adversarial verify on local-fs: tampered blob is refused', async () => {
  const root = await tmpdir();
  const s = openStore({ backend: 'local-fs', root });
  const k1 = await s.putBlob('r1', Buffer.from('evidence one'));
  const k2 = await s.putBlob('r1', Buffer.from('evidence two'));
  const f = path.join(root, 'runs', 'r1', 'blobs', k1);
  const bytes = await fs.readFile(f); bytes[0] ^= 0xff; await fs.writeFile(f, bytes);
  await assert.rejects(() => s.getBlob('r1', k1), (e) => {
    assert.equal(e.code, 'HASH_MISMATCH'); assert.equal(e.expected, k1); assert.equal(e.actual, sha(bytes)); return true;
  });
  assert.equal(String(await s.getBlob('r1', k2)), 'evidence two');
  const r = cli(['get-blob', 'r1', k1, '--backend', 'local-fs', '--root', root]);
  assert.equal(r.status, 1); assert.equal(r.stdout, '');
  assert.equal(JSON.parse(r.stderr).error.code, 'HASH_MISMATCH');
});

test('T-N2-09 [REAL] adversarial verify on git-branch: blob rewritten and committed under the same path', async () => {
  const repo = await gitRepo();
  const s = openStore({ backend: 'git-branch', repo });
  const k = await s.putBlob('r1', Buffer.from('honest evidence'));
  const wt = path.join(await tmpdir(), 'wt');
  git(repo, 'worktree', 'add', '-q', wt, 'do-it/runs/r1');
  await fs.writeFile(path.join(wt, 'runs', 'r1', 'blobs', k), 'forged evidence');
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'tamper');
  const tampered = git(wt, 'rev-parse', 'HEAD');
  await assert.rejects(() => s.getBlob('r1', k), (e) => {
    assert.equal(e.code, 'HASH_MISMATCH'); assert.equal(e.expected, k); assert.equal(e.commit, tampered); return true;
  });
  const r = cli(['get-blob', 'r1', k, '--backend', 'git-branch', '--repo', repo]);
  assert.equal(r.status, 1); assert.equal(r.stdout, '');
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

test('T-N2-11 [REAL] kill -9 between blob write and reference rename, then recovery', async () => {
  const root = await tmpdir();
  const s = openStore({ backend: 'local-fs', root });
  const v1 = randomBytes(5 * 1024 * 1024), v2 = randomBytes(5 * 1024 * 1024);
  await s.put('runs/r1/state.json', v1);
  const v2file = path.join(await tmpdir(), 'v2.bin');
  await fs.writeFile(v2file, v2);
  const script = `import { openStore } from ${JSON.stringify(pathToFileURL(path.join(SS, 'index.mjs')).href)};
    const s = openStore({ backend: 'local-fs', root: process.argv[1] });
    await s.put('runs/r1/state.json', await (await import('node:fs/promises')).readFile(process.argv[2]));
    console.log('SURVIVED');`;
  const child = node(['--input-type=module', '-e', script, root, v2file], { env: { ...process.env, DO_IT_STORE_CRASH: 'after-blob' }, maxBuffer: 1 << 28 });
  assert.equal(child.signal, 'SIGKILL'); assert.doesNotMatch(child.stdout, /SURVIVED/);
  const before = await s.get('runs/r1/state.json');
  assert.equal(sha(before), sha(v1), 'previous whole version, never truncated');
  const blobs = () => fs.readdir(path.join(root, 'runs', 'r1', 'blobs'));
  assert.ok((await blobs()).includes(sha(v2)), 'orphan blob present before recovery');
  const r1 = await recover(s, { runId: 'r1' });
  assert.equal(r1.recovered.orphan_blobs, 1);
  assert.ok(!(await blobs()).some((n) => n.startsWith(sha(v2))));
  assert.equal(sha(await s.get('runs/r1/state.json')), sha(v1));
  assert.equal((await recover(s, { runId: 'r1' })).recovered.orphan_blobs, 0);
});

test('T-N2-12 torn append line is quarantined, not dropped', async () => {
  for (const [name, s] of await allBackends()) {
    await s.put('runs/r1/events.jsonl', '{"n":1}\n{"n":2}\n{"n":3}\n{"n":4,"cut');
    const r = await recover(s, { runId: 'r1' });
    assert.equal(r.recovered.TORN_LINE, 1, name);
    assert.equal(String(await s.get('runs/r1/events.jsonl')), '{"n":1}\n{"n":2}\n{"n":3}\n', name);
    assert.equal(String(await s.get('runs/r1/events.jsonl.torn')), '{"n":4,"cut\n', name);
    await s.append('runs/r1/events.jsonl', '{"n":4}');
    assert.equal(String(await s.get('runs/r1/events.jsonl')).split('\n').filter(Boolean).length, 4, name);
    assert.equal((await recover(s, { runId: 'r1' })).recovered.TORN_LINE, 0, name);
  }
  const root = await tmpdir();
  await openStore({ backend: 'local-fs', root }).put('runs/r1/events.jsonl', 'a\nb');
  const r = cli(['recover', '--run', 'r1', '--backend', 'local-fs', '--root', root]);
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).recovered.TORN_LINE, 1);
});

async function seedRun(repo, { withResult = true } = {}) {
  const s = openStore({ backend: 'git-branch', repo });
  const state = JSON.stringify({ run_id: 'r1', status: 'BUILDING' });
  await s.batch('seed', async () => {
    await s.put('runs/r1/state.json', state);
    await s.append('runs/r1/events.jsonl', '{"event":"start"}');
    if (withResult) await s.put('runs/r1/results/build-S1.json', JSON.stringify({ schema: 'it-result/1', stage: 'build-it', status: 'context_reset', resume: { state_files: ['state.json'], next_action: 'verify S1' } }));
  });
  return { s, state };
}

test('T-N2-13 [REAL] cold-start resume in an empty directory from a git ref and the result file', async () => {
  const repo = await gitRepo();
  const { state } = await seedRun(repo);
  const wd = path.join(await tmpdir(), 'fresh');
  await fs.mkdir(wd);
  assert.deepEqual(await fs.readdir(wd), []);
  const r = cli(['resume', '--repo', repo, '--run', 'r1', '--result', 'results/build-S1.json', '--workdir', wd]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'RESUMED'); assert.equal(out.next_action, 'verify S1'); assert.equal(out.had_local_state, false);
  const rebuilt = await fs.readFile(path.join(wd, '.do-it', 'runs', 'r1', 'state.json'));
  assert.equal(sha(rebuilt), sha(state)); assert.equal(out.state_sha256, out.stored_state_sha256);
  assert.ok(await fs.stat(path.join(wd, '.do-it', 'runs', 'r1', 'events.jsonl')));
});

test('T-N2-14 resume without the previous result file is BLOCKED, nothing written', async () => {
  const repo = await gitRepo();
  await seedRun(repo, { withResult: false });
  const tipBefore = git(repo, 'rev-parse', 'do-it/runs/r1');
  const wd = path.join(await tmpdir(), 'fresh');
  const r = cli(['resume', '--repo', repo, '--run', 'r1', '--result', 'results/build-S1.json', '--workdir', wd]);
  assert.equal(r.status, 3);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'BLOCKED'); assert.equal(out.reason, 'RESULT_FILE_MISSING'); assert.equal(out.path, 'runs/r1/results/build-S1.json');
  await assert.rejects(fs.stat(path.join(wd, '.do-it')));
  assert.equal(git(repo, 'rev-parse', 'do-it/runs/r1'), tipBefore);
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

test('T-N2-16 failed recovery retries once then escalates with an owner-pack question', async () => {
  const repo = await gitRepo();
  const gone = path.join(await tmpdir(), 'no-such-remote');
  const packDir = await tmpdir();
  const s = new GitBranchStore({ repo, remote: gone });
  await s.put('runs/r1/state.json', '{}');
  const r = await recover(s, { runId: 'r1', ownerPackDir: packDir });
  assert.deepEqual(r.attempts.map((a) => a.status), ['FAILED', 'FAILED']);
  assert.equal(r.status, 'ESCALATED'); assert.equal(r.exit, 2);
  const pack = JSON.parse(await fs.readFile(r.owner_pack_path, 'utf8'));
  assert.equal(pack.questions[0].kind, 'escalation'); assert.equal(pack.run_id, 'r1');
  const c = cli(['recover', '--run', 'r1', '--backend', 'git-branch', '--repo', repo, '--remote', gone, '--owner-pack-dir', packDir]);
  assert.equal(c.status, 2); assert.equal(JSON.parse(c.stdout).status, 'ESCALATED');
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

test('T-N2-18 core/state-stores names no harness (G-12)', async () => {
  const words = [['cla', 'ude'], ['co', 'dex'], ['open', 'code']].map((w) => w.join(''));
  const g = spawnSync('grep', ['-rniE', words.join('|'), SS]);
  assert.equal(g.status, 1, `unexpected matches:\n${g.stdout}`);
  assert.equal(String(g.stdout), '');
});
