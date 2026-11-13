import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateFold, gateStoreAppend, gateStoreCompact, gateStoreScan } from '../../src/gate-results.mjs';
import {
  D, H, NOW, SRC_DIR, cleanRow, cleanupTmp, comps, finishRow, hex, iso, prng, psStart, rid, runEndRow, runStartRow, sha,
  startRow, tmpStore, treeHash, walkFiles,
} from './g1-helpers.mjs';

after(cleanupTmp);

const GR = path.join(SRC_DIR, 'gate-results.mjs');
const NOWS = [NOW, NOW + H, NOW + 25 * H, NOW + 8 * D];
const quiet = () => {};

function folds(store, files, keys, nows, extra) {
  const out = {};
  for (const file of files) {
    const scan = gateStoreScan(store, { file, leg: 'unit' });
    for (const k of keys) for (const now of nows) for (const resume of [false, true]) {
      out[file + '|' + k + '|' + now + '|' + resume] = gateFold(scan, { key: hex(k), components: comps(k) }, now, { file, leg: 'unit', resume, liveRuns: new Set(), ...(extra || {}) });
    }
  }
  return out;
}

function mismatches(a, b) {
  let n = 0;
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) n++;
  return n;
}

function seedRun(store, run, at, rows, opts) {
  const o = opts || {};
  gateStoreAppend(store, runStartRow({ run: rid(run), at: iso(at), clean: !!o.clean }));
  for (const r of rows) gateStoreAppend(store, { ...r, run_id: rid(run), at: iso(at) });
  if (!o.open) gateStoreAppend(store, runEndRow({ run: rid(run), at: iso(at), tainted: !!o.tainted }));
  if (o.clean) gateStoreAppend(store, cleanRow({ run: rid(run), at: iso(at) }));
}

function fixtureStore() {
  const store = tmpStore();
  const F = (file, k, res, extra) => finishRow({ run: rid(0), at: iso(NOW), file, key: hex(k), components: comps(k), result: res, ...(extra || {}) });
  const S = (file, k) => startRow({ run: rid(0), at: iso(NOW), file, key: hex(k) });
  seedRun(store, 1, NOW - 3 * H, [S('a', 'k1'), F('a', 'k1', 'PASS'), F('b', 'k1', 'FAIL')]);
  const base0 = gateStoreCompact(store, { now: NOW, settleMs: 5, log: quiet });
  assert.equal(base0.outcome, 'COMPACTED');
  // a live (unabsorbed) segment: rows then the active file frozen by hand, as a crash after step 2 leaves it
  seedRun(store, 2, NOW - 2 * H, [F('a', 'k1', 'PASS'), F('b', 'k1', 'PASS'), F('c', 'k2', 'PASS')]);
  fs.appendFileSync(path.join(store.dir, 'results.jsonl'), '#### torn garbage\n');
  fs.renameSync(path.join(store.dir, 'results.jsonl'), path.join(store.dir, 'results.seg-7.jsonl'));
  // active file
  seedRun(store, 3, NOW - H, [S('c', 'k2'), F('c', 'k2', 'PASS'), F('a', 'k1', 'PASS', { retried: true }), S('b', 'k1')], { open: true });
  return store;
}

test('T-L1-12 M5 rollback: faults after the temp base and after the base rename roll back; a retry compacts; every fold is preserved', () => {
  const store = fixtureStore();
  const files = ['a', 'b', 'c'];
  const keys = ['k1', 'k2'];
  const before = folds(store, files, keys, NOWS);
  const baseFile = path.join(store.dir, 'results.base.jsonl');
  const baseSha = sha(baseFile);
  const segShas = Object.fromEntries(walkFiles(store.dir).filter((f) => /results\.seg-/.test(f)).map((f) => [f, sha(f)]));
  const r1 = gateStoreCompact(store, { now: NOW, settleMs: 5, log: quiet, env: { DO_IT_FAULT: 'compact_after_tmp' } });
  assert.deepEqual(r1.states, ['COMPACTING', 'COMPACTION_ABORTED', 'ROLLED_BACK']);
  assert.equal(sha(baseFile), baseSha, 'base unchanged');
  assert.equal(walkFiles(store.dir).filter((f) => /\.tmp-/.test(path.basename(f)) || /\/tmp\/base-/.test(f)).length, 0, '0 temp files');
  for (const [f, s] of Object.entries(segShas)) assert.equal(sha(f), s, 'segment unchanged ' + path.basename(f));
  assert.equal(fs.existsSync(path.join(store.dir, '.lock')), false);
  assert.equal(mismatches(before, folds(store, files, keys, NOWS)), 0);
  const r2 = gateStoreCompact(store, { now: NOW, settleMs: 5, log: quiet, env: { DO_IT_FAULT: 'compact_after_base_rename' } });
  assert.deepEqual(r2.states, ['COMPACTING', 'COMPACTION_ABORTED', 'ROLLED_BACK']);
  assert.equal(fs.existsSync(path.join(store.dir, '.lock')), false);
  // rows present twice on disk: in the new base and still in the segment it absorbed
  const seg7 = fs.readFileSync(path.join(store.dir, 'results.seg-7.jsonl'), 'utf8').split('\n').filter(Boolean);
  const baseNow = fs.readFileSync(baseFile, 'utf8');
  assert.ok(seg7.filter((l) => baseNow.includes(l)).length >= 3, 'rows duplicated on disk');
  assert.equal(mismatches(before, folds(store, files, keys, NOWS)), 0, 'every fold equals the pre-compaction fold');
  const r3 = gateStoreCompact(store, { now: NOW, settleMs: 5, log: quiet });
  assert.equal(r3.outcome, 'COMPACTED');
  assert.deepEqual(r3.states, ['COMPACTING', 'COMPACTED']);
  assert.equal(fs.existsSync(path.join(store.dir, '.lock')), false);
  assert.equal(mismatches(before, folds(store, files, keys, NOWS)), 0);
  console.log('T-L1-12 after_tmp ABORTED->ROLLED_BACK base unchanged; after_base_rename duplicated yet folds equal; retry COMPACTED');
});

test('T-L1-13 live-owner lock: dead PID, PID reuse and a stale ownerless lock are reclaimed; a live owner is BUSY; a stolen lock aborts', async () => {
  const deadPid = await new Promise((resolve) => {
    const p = cp.spawn(process.execPath, ['-e', '0']);
    p.on('exit', () => resolve(p.pid));
  });
  const mkLock = (store, owner, ageS) => {
    const lock = path.join(store.dir, '.lock');
    fs.mkdirSync(lock, { recursive: true });
    if (owner) fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify(owner));
    if (ageS) { const t = (Date.now() - ageS * 1000) / 1000; fs.utimesSync(lock, t, t); }
  };
  const fresh = () => { const s = tmpStore(); seedRun(s, 1, NOW - H, [finishRow({ run: rid(0), at: iso(NOW), file: 'a', key: hex('k1') })]); return s; };
  const myStart = psStart(process.pid);
  assert.ok(myStart, 'ps reports this process start time');
  const opts = { now: NOW, settleMs: 5, log: quiet, procStart: psStart };
  const a = fresh();
  mkLock(a, { pid: deadPid, pid_start: 'x', cwd: '/', at: iso(NOW), nonce: 'n-a' });
  assert.equal(gateStoreCompact(a, opts).outcome, 'COMPACTED');
  const b = fresh();
  mkLock(b, { pid: process.pid, pid_start: 'Thu Jan  1 00:00:00 1970', cwd: '/', at: iso(NOW), nonce: 'n-b' });
  assert.equal(gateStoreCompact(b, opts).outcome, 'COMPACTED');
  const c = fresh();
  mkLock(c, { pid: process.pid, pid_start: myStart, cwd: '/', at: iso(NOW), nonce: 'n-c' });
  const cBefore = treeHash(c.dir);
  assert.equal(gateStoreCompact(c, opts).outcome, 'COMPACTION_BUSY');
  assert.equal(treeHash(c.dir), cBefore, '0 store bytes changed');
  const d = fresh();
  mkLock(d, null, 120);
  assert.equal(gateStoreCompact(d, opts).outcome, 'COMPACTED');
  const e = fresh();
  gateStoreCompact(e, opts);
  seedRun(e, 2, NOW - H / 2, [finishRow({ run: rid(0), at: iso(NOW), file: 'b', key: hex('k1') })]);
  const eBase = sha(path.join(e.dir, 'results.base.jsonl'));
  const re = gateStoreCompact(e, { ...opts, env: { DO_IT_FAULT: 'compact_steal_lock' } });
  assert.deepEqual(re.states, ['COMPACTING', 'COMPACTION_ABORTED', 'ROLLED_BACK']);
  assert.equal(sha(path.join(e.dir, 'results.base.jsonl')), eBase, 'base unchanged');
  console.log('T-L1-13 dead/reused/stale reclaimed COMPACTED; live owner COMPACTION_BUSY 0 bytes; stolen lock ABORTED->ROLLED_BACK');
});

function randomStream(store, rnd) {
  const files = ['f0', 'f1', 'f2', 'f3'];
  const keys = ['k0', 'k1', 'k2'];
  const nRuns = 3 + Math.floor(rnd() * 8);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let t = NOW - 10 * D;
  for (let r = 1; r <= nRuns; r++) {
    t += Math.floor(rnd() * 2.2 * D);
    if (t > NOW) t = NOW - Math.floor(rnd() * H);
    const clean = rnd() < 0.2;
    const tainted = rnd() < 0.1;
    const open = rnd() < 0.15;
    const interrupted = !open && rnd() < 0.1;
    gateStoreAppend(store, runStartRow({ run: rid(r), at: iso(t), clean }));
    const n = 1 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const file = pick(files);
      const k = pick(keys);
      const at = iso(t + i * 1000);
      if (rnd() < 0.5) try { gateStoreAppend(store, startRow({ run: rid(r), at, file, key: hex(k) })); } catch { /* dup ok */ }
      if (rnd() < 0.15) continue; // kill: start without finish
      const x = rnd();
      const result = x < 0.55 ? 'PASS' : x < 0.85 ? 'FAIL' : x < 0.95 ? 'SKIPPED' : 'DESELECTED';
      gateStoreAppend(store, finishRow({ run: rid(r), at, file, key: hex(k), components: comps(k), result, retried: result === 'PASS' && rnd() < 0.15, clean }));
      if (rnd() < 0.05) {
        // duplicate finish of the same (run, file, leg)
        gateStoreAppend(store, finishRow({ run: rid(r), at, file, key: hex(k), components: comps(k), result: 'PASS', clean }));
      }
      if (rnd() < 0.05) fs.appendFileSync(path.join(store.dir, 'results.jsonl'), rnd() < 0.5 ? '{"file":"' + file + '","torn\n' : 'garbage ' + i + '\n');
    }
    if (!open) gateStoreAppend(store, runEndRow({ run: rid(r), at: iso(t + 60000), tainted, verdict: interrupted ? 'GATE_INTERRUPTED' : 'GATE_PASS_FRESH' }));
    if (clean && !open) gateStoreAppend(store, cleanRow({ run: rid(r), at: iso(t + 60000) }));
    if (rnd() < 0.2) gateStoreCompact(store, { now: NOW, settleMs: 0, log: quiet });
  }
  return { files, keys };
}

test('T-L1-14 property: fold(compact(rows)) == fold(rows) over 300 seeded streams; stress: 2 appenders x 1000 rows across 5 compactions lose 0', async () => {
  const seed = Number(process.env.G1_SEED || 0x5eed1234);
  console.log('T-L1-14 seed ' + seed);
  const rnd = prng(seed);
  let mism = 0;
  let checked = 0;
  for (let s = 0; s < 300; s++) {
    const store = tmpStore();
    const { files, keys } = randomStream(store, rnd);
    const before = folds(store, files, keys, NOWS);
    const res = gateStoreCompact(store, { now: NOW, settleMs: 0, log: quiet });
    assert.equal(res.outcome, 'COMPACTED');
    const afterF = folds(store, files, keys, NOWS);
    const m = mismatches(before, afterF);
    if (m) console.log('T-L1-14 mismatch in stream ' + s + ': ' + m);
    mism += m;
    checked += Object.keys(before).length;
    fs.rmSync(path.dirname(store.dir), { recursive: true, force: true });
  }
  assert.equal(mism, 0, 'mismatches');
  // stress
  const store = tmpStore();
  fs.mkdirSync(store.dir, { recursive: true });
  const child = `
    import { gateStoreAppend } from ${JSON.stringify(GR)};
    const [dir, run] = process.argv.slice(1);
    const store = { backend: 'local', dir };
    for (let i = 0; i < 1000; i++) gateStoreAppend(store, { schema: 'do-it-gate-result/1', type: 'finish', run_id: run, at: new Date().toISOString(), file: 's/' + i + '.spec.ts', leg: 'unit', key: 'b'.repeat(64), result: 'PASS', retried: false, counts: { passed: 1, failed: 0, skipped: 0, pending: 0 }, exec_error: false, duration_ms: 1, failure_ref: null, clean: false, tree_dirty: false });
  `;
  const runs = [rid(0xc1), rid(0xc2)];
  const exits = runs.map((run) => new Promise((resolve, reject) => {
    const p = cp.spawn(process.execPath, ['--input-type=module', '-e', child, store.dir, run], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
  }));
  const outcomes = [];
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 30));
    outcomes.push(gateStoreCompact(store, { now: Date.now(), log: quiet }).outcome);
  }
  await Promise.all(exits);
  const scan = gateStoreScan(store);
  const got = new Set(scan.items.filter((i) => i.ok).map((i) => i.row.run_id + ' ' + i.row.file));
  let lost = 0;
  for (const run of runs) for (let i = 0; i < 1000; i++) if (!got.has(run + ' s/' + i + '.spec.ts')) lost++;
  assert.equal(outcomes.filter((o) => o === 'COMPACTED').length, 5);
  assert.equal(lost, 0);
  assert.equal(got.size, 2000);
  console.log('T-L1-14 streams 300, folds compared ' + checked + ', mismatches 0; stress rows 2000 lost 0 across 5 compactions');
});
