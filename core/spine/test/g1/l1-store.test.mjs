import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  gateRowLine, gateStoreAppend, gateStoreFailureWrite, gateStoreMemoAppend, gateStoreMemoRead, gateStoreOpen, gateStoreSalt, gateStoreScan,
} from '../../src/gate-results.mjs';
import { FIX, H, NOW, SRC_DIR, cleanupTmp, finishRow, hex, iso, mkGitRepo, rid, sha, tmpDir, tmpStore } from './g1-helpers.mjs';

after(cleanupTmp);

const GR = path.join(SRC_DIR, 'gate-results.mjs');

function outcome(fn) {
  try { fn(); return null; } catch (e) { return e.outcome || e.code || e.message; }
}

test('T-L1-01 golden finish row: store created under the git common dir, canonical line, Python json.dumps and CRC byte-identical', () => {
  const repo = mkGitRepo();
  const store = gateStoreOpen({ cwd: repo.dir, env: repo.env });
  const common = fs.realpathSync(path.join(repo.dir, '.git'));
  assert.equal(store.dir, path.join(common, 'do-it', 'gate-results'));
  assert.equal(fs.existsSync(store.dir), false);
  const golden = JSON.parse(fs.readFileSync(path.join(FIX, 'golden-row.json'), 'utf8'));
  gateStoreAppend(store, golden);
  const file = path.join(store.dir, 'results.jsonl');
  const got = fs.readFileSync(file);
  const want = fs.readFileSync(path.join(FIX, 'golden-row.line'));
  assert.ok(got.equals(want), 'results.jsonl equals golden-row.line byte-for-byte');
  assert.equal(got.toString('utf8').split('\n').length, 2, '1 line, LF-terminated');
  const crc = fs.readFileSync(path.join(FIX, 'golden-row.crc'), 'utf8').trim();
  assert.equal(JSON.parse(got.toString('utf8')).crc, crc);
  // Python rebuild (stdlib only, isolated mode)
  const py = [
    'import hashlib, json, sys',
    'row = json.load(open(sys.argv[1], encoding="utf-8"))',
    'row.pop("crc", None)',
    'dump = lambda o: json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)',
    'row["crc"] = hashlib.sha256(dump(row).encode("utf-8")).hexdigest()[:16]',
    'sys.stdout.buffer.write((dump(row) + "\\n").encode("utf-8"))',
  ].join('\n');
  const pyFile = path.join(tmpDir('g1-py-'), 'row.py');
  fs.writeFileSync(pyFile, py);
  const pyOut = path.join(path.dirname(pyFile), 'py.line');
  fs.writeFileSync(pyOut, cp.execFileSync('python3', ['-I', pyFile, path.join(FIX, 'golden-row.json')]));
  const cmp = cp.spawnSync('cmp', [pyOut, file]);
  assert.equal(cmp.status, 0, 'cmp exit 0 (Python line equals Node line)');
  const scan = gateStoreScan(store);
  assert.equal(scan.items.length, 1);
  assert.equal(scan.items[0].ok, true);
  console.log('T-L1-01 store ' + path.relative(repo.dir, store.dir) + ' crc ' + crc + ' cmp exit 0, scan ok 1');
});

test('T-L1-02 one bounded write per row: 4094-byte row in 1 writeSync, 4095 bytes refused, torn tail prefixed by LF', () => {
  const store = tmpStore();
  const lineLen = (row) => Buffer.byteLength(gateRowLine(row));
  const build = (target) => {
    let row = finishRow({ run: rid(1), at: iso(NOW), file: 'a', key: hex('k') });
    const diff = target - lineLen(row);
    row = { ...row, file: 'a'.repeat(1 + diff) };
    assert.equal(lineLen(row), target);
    return row;
  };
  const r4094 = build(4094);
  const r4095 = build(4095);
  const file = path.join(store.dir, 'results.jsonl');
  const orig = fs.writeSync;
  const calls = [];
  fs.writeSync = function spy(fd, buf, ...rest) { calls.push(Buffer.isBuffer(buf) ? buf.length : String(buf).length); return orig.call(fs, fd, buf, ...rest); };
  try {
    gateStoreAppend(store, r4094);
  } finally {
    fs.writeSync = orig;
  }
  assert.equal(calls.length, 1, 'exactly 1 writeSync');
  assert.ok(calls[0] <= 4096, 'buffer length at most 4096');
  const size = fs.statSync(file).size;
  assert.equal(outcome(() => gateStoreAppend(store, r4095)), 'GATE_ROW_TOO_LARGE');
  assert.equal(fs.statSync(file).size, size, 'file length unchanged');
  // torn tail
  const s2 = tmpStore();
  fs.mkdirSync(s2.dir, { recursive: true });
  const f2 = path.join(s2.dir, 'results.jsonl');
  fs.writeFileSync(f2, '{"schema":"do-it-gate');
  const calls2 = [];
  fs.writeSync = function spy(fd, buf, ...rest) { calls2.push(1); return orig.call(fs, fd, buf, ...rest); };
  try {
    gateStoreAppend(s2, finishRow({ run: rid(2), at: iso(NOW), file: 'b.spec.ts', key: hex('k') }));
  } finally {
    fs.writeSync = orig;
  }
  assert.equal(calls2.length, 1);
  assert.equal(fs.readFileSync(f2, 'utf8').indexOf('{"schema":"do-it-gate\n{'), 0, 'new row prefixed by LF');
  const scan = gateStoreScan(s2);
  assert.equal(scan.items.filter((i) => !i.ok).length, 1);
  assert.equal(scan.items.filter((i) => i.ok).length, 1);
  console.log('T-L1-02 writeSync calls 1 (' + calls[0] + ' bytes), 4095 GATE_ROW_TOO_LARGE, torn tail: corrupt 1 ok 1');
});

test('T-L1-03 G-2 defence in depth: 7 planted invalid rows are refused and write 0 bytes', () => {
  const store = tmpStore();
  const ok = () => finishRow({ run: rid(1), at: iso(NOW - H), file: 'a.spec.ts', key: hex('k') });
  const planted = [
    { ...ok(), foo: 1 },
    { ...ok(), run_id: 'g-1' },
    { ...ok(), exec_error: true },
    { ...ok(), counts: { passed: 0, failed: 0, skipped: 3, pending: 0 } },
    { ...ok(), counts: { passed: 4, failed: 1, skipped: 0, pending: 0 } },
    (() => { const r = ok(); delete r.key; return r; })(),
    { ...ok(), file: 'a\tb.spec.ts' },
  ];
  let rejected = 0;
  for (const r of planted) if (outcome(() => gateStoreAppend(store, r)) === 'GATE_ROW_INVALID') rejected++;
  assert.equal(rejected, 7);
  const file = path.join(store.dir, 'results.jsonl');
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  assert.equal(size, 0);
  // control: a valid row is accepted (the rejections are not a broken writer)
  gateStoreAppend(store, ok());
  assert.ok(fs.statSync(file).size > 0);
  console.log('T-L1-03 rejected 7 of 7, results.jsonl 0 bytes before the control row');
});

test('T-L1-11 [REAL] README T-10: two worktrees, 4 processes x 500 concurrent appends, no torn or lost row', async () => {
  const repo = mkGitRepo();
  const wt = path.join(tmpDir('g1-wt-'), 'wt2');
  repo.git('worktree', 'add', '-q', wt, '-b', 'side');
  const s1 = gateStoreOpen({ cwd: repo.dir, env: repo.env });
  const s2 = gateStoreOpen({ cwd: wt, env: repo.env });
  assert.equal(s1.dir, s2.dir, 'both worktrees resolve the same store');
  const child = `
    import { gateStoreAppend, gateStoreOpen } from ${JSON.stringify(GR)};
    const [cwd, run, n] = process.argv.slice(1);
    const store = gateStoreOpen({ cwd });
    const key = 'a'.repeat(64);
    for (let i = 0; i < Number(n); i++) {
      gateStoreAppend(store, { schema: 'do-it-gate-result/1', type: 'finish', run_id: run, at: new Date().toISOString(), file: 'src/f' + i + '.spec.ts', leg: 'unit', scope: 'push', key, result: 'PASS', retried: false, counts: { passed: 1, failed: 0, skipped: 0, pending: 0 }, exec_error: false, duration_ms: 1, failure_ref: null, clean: false, tree_dirty: false });
    }
  `;
  const runs = [rid(0xa1), rid(0xa2), rid(0xb1), rid(0xb2)];
  const cwds = [repo.dir, repo.dir, wt, wt];
  await Promise.all(runs.map((run, i) => new Promise((resolve, reject) => {
    const p = cp.spawn(process.execPath, ['--input-type=module', '-e', child, cwds[i], run, '500'], { env: repo.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('child ' + run + ' exit ' + code + ': ' + err))));
  })));
  const scan = gateStoreScan(s1);
  const ok = scan.items.filter((i) => i.ok);
  assert.equal(scan.corrupt, 0);
  assert.equal(ok.length, 2000);
  const pairs = new Map();
  for (const it of ok) pairs.set(it.row.run_id + ' ' + it.row.file, (pairs.get(it.row.run_id + ' ' + it.row.file) || 0) + 1);
  let missing = 0;
  let dup = 0;
  for (const run of runs) for (let i = 0; i < 500; i++) {
    const n = pairs.get(run + ' src/f' + i + '.spec.ts') || 0;
    if (n === 0) missing++;
    if (n > 1) dup++;
  }
  assert.equal(missing, 0);
  assert.equal(dup, 0);
  repo.git('worktree', 'remove', '--force', wt);
  console.log('T-L1-11 same store dir, ok 2000 corrupt 0 missing 0 duplicated 0');
});

test('T-L1-15 salt (8 concurrent first-writers, rotation), redacted write-once failure file, memo skips a corrupt line', async () => {
  const store = tmpStore();
  const child = `
    import { gateStoreSalt } from ${JSON.stringify(GR)};
    process.stdout.write(gateStoreSalt({ backend: 'local', dir: process.argv[1] }).toString('hex'));
  `;
  const outs = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
    const p = cp.spawn(process.execPath, ['--input-type=module', '-e', child, store.dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error('salt child exit ' + code))));
  })));
  const saltFile = path.join(store.dir, '.salt');
  assert.equal(fs.statSync(saltFile).size, 32);
  assert.equal(fs.statSync(saltFile).mode & 0o777, 0o600);
  assert.equal(new Set(outs).size, 1, 'all 8 writers return identical bytes');
  assert.equal(outs[0], fs.readFileSync(saltFile).toString('hex'));
  // truncated to 31 bytes => rotated
  fs.writeFileSync(saltFile, fs.readFileSync(saltFile).subarray(0, 31));
  const logs = [];
  const rotated = gateStoreSalt(store, { log: (m) => logs.push(m) });
  assert.equal(rotated.length, 32);
  assert.notEqual(rotated.toString('hex'), outs[0]);
  assert.deepEqual(logs, ['[gate-results] salt rotated']);
  assert.equal(fs.statSync(saltFile).mode & 0o777, 0o600);
  // failure side file
  const secret = 's3cr3t-value-123';
  const text = 'Error: auth failed with ' + secret + '\n  at x (a.spec.ts:1)\nretry with token=' + secret + '\n';
  const ref = gateStoreFailureWrite(store, text, { API_TOKEN: secret });
  assert.match(ref, /^failures\/[0-9a-f]{64}\.txt$/);
  const ff = path.join(store.dir, ref);
  const bytes = fs.readFileSync(ff);
  assert.equal(path.basename(ff, '.txt'), sha(ff), 'file name equals the SHA-256 of its bytes');
  assert.ok(bytes.toString('utf8').includes('[REDACTED:API_TOKEN]'));
  assert.equal(bytes.toString('utf8').split(secret).length - 1, 0);
  const m1 = fs.statSync(ff).mtimeMs;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gateStoreFailureWrite(store, text, { API_TOKEN: secret }), ref);
  assert.equal(fs.statSync(ff).mtimeMs, m1, 'second write leaves mtime unchanged');
  // memo
  gateStoreMemoAppend(store, [{ b: hex('blob1').slice(0, 40), s: hex('s1'), w: {} }]);
  fs.appendFileSync(path.join(store.dir, 'blobmemo.jsonl'), '{"b":"' + hex('blob2').slice(0, 40) + '","s":"zz","crc":"0"}\n');
  gateStoreMemoAppend(store, [{ b: hex('blob3').slice(0, 40), s: hex('s3'), w: {} }]);
  const memo = gateStoreMemoRead(store);
  assert.equal(memo.size, 2);
  console.log('T-L1-15 salt 32 bytes mode 600, 8 writers identical, rotated, failure redacted + write-once, memo entries 2');
});

