import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gateFold, gateStoreAppend, gateStoreOpen, gateStoreScan } from '../../src/gate-results.mjs';
import {
  D, FIX, H, NOW, SRC_DIR, cleanRow, cleanupTmp, comps, finishRow, hex, iso, mkGitRepo, mutantCopy, rid, rowsToItems, runEndRow,
  runStartRow, streamRows, tmpStore,
} from './g1-helpers.mjs';

after(cleanupTmp);

const K1 = hex('k1');
const key = (label) => ({ key: hex(label || 'k1'), components: comps(label || 'k1') });

function seed(store, rows) {
  for (const r of rows) gateStoreAppend(store, r);
}

test('T-L1-04 G-1: no store, unparseable line, CRC-bad copy and unattributable garbage all fold to no reuse; scan never throws', () => {
  let throws = 0;
  const scanSafe = (store, filter) => { try { return gateStoreScan(store, filter); } catch { throws++; return { items: [], source: 'unavailable' }; } };
  // (a) repository with no store directory
  const repo = mkGitRepo();
  const storeA = gateStoreOpen({ cwd: repo.dir, env: repo.env });
  assert.ok(storeA && !fs.existsSync(storeA.dir));
  const a = gateFold(scanSafe(storeA, { file: 'a.spec.ts' }), key(), NOW, { file: 'a.spec.ts' });
  assert.equal(a.state, 'NEVER_RUN');
  assert.equal(a.reuse, null);
  assert.equal(a.reason, 'no-store');
  // (b) the only line for a.spec.ts is unparseable JSON naming the file
  const sb = tmpStore();
  fs.mkdirSync(sb.dir, { recursive: true });
  fs.writeFileSync(path.join(sb.dir, 'results.jsonl'), '{"file":"a.spec.ts","type":"finish","result":"PASS",\n');
  const b = gateFold(scanSafe(sb, { file: 'a.spec.ts' }), key(), NOW, { file: 'a.spec.ts' });
  assert.equal(b.state, 'CORRUPT');
  assert.equal(b.reuse, null);
  // (c) a valid PASS for b.spec.ts followed by a CRC-bad copy of a row naming b.spec.ts
  const sc = tmpStore();
  const run = rid(1);
  const pass = finishRow({ run, at: iso(NOW - H), file: 'b.spec.ts', key: K1, components: comps('k1') });
  seed(sc, [runStartRow({ run, at: iso(NOW - H) }), pass, runEndRow({ run, at: iso(NOW - H) })]);
  const lines = fs.readFileSync(path.join(sc.dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean);
  const bad = lines[1].replace('"duration_ms":5', '"duration_ms":6');
  fs.appendFileSync(path.join(sc.dir, 'results.jsonl'), bad + '\n');
  const c = gateFold(scanSafe(sc, { file: 'b.spec.ts' }), key(), NOW, { file: 'b.spec.ts' });
  assert.equal(c.state, 'CORRUPT');
  assert.equal(c.reuse, null);
  // (d) a valid PASS for c.spec.ts followed by an unattributable garbage line
  const sd = tmpStore();
  const pass2 = finishRow({ run, at: iso(NOW - H), file: 'c.spec.ts', key: K1, components: comps('k1') });
  seed(sd, [runStartRow({ run, at: iso(NOW - H) }), pass2, runEndRow({ run, at: iso(NOW - H) })]);
  const control = gateFold(scanSafe(sd, { file: 'c.spec.ts' }), key(), NOW, { file: 'c.spec.ts' });
  assert.equal(control.reuse, 'PASS', 'control: before the garbage line the PASS is reusable');
  fs.appendFileSync(path.join(sd.dir, 'results.jsonl'), '\u0000\u0001 garbage ###\n');
  const d = gateFold(scanSafe(sd, { file: 'c.spec.ts' }), key(), NOW, { file: 'c.spec.ts' });
  assert.equal(d.reuse, null);
  assert.equal(d.reason, 'voided-by-corrupt');
  assert.equal(throws, 0, 'gateStoreScan threw');
  console.log('T-L1-04 a=' + a.reason + ' b=' + b.state + ' c=' + c.state + ' d=' + d.reason + ' scan throws 0 of 4');
});

test('T-L1-05 every M1 edge (18) plus 6 docs/03 rows fold to the listed state, reuse and flakyPasses', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, 'm1-transitions.json'), 'utf8'));
  assert.equal(fx.entries.length, 25);
  let ok = 0;
  for (const e of fx.entries) {
    const o = e.opts || {};
    const items = rowsToItems(streamRows(e.events, o));
    const live = new Set((o.live || []).map(rid));
    const f = gateFold(items, key(e.keyNow || 'k1'), NOW, { file: 'f.spec.ts', liveRuns: live, resume: !!o.resume });
    assert.equal(f.state, e.expect.state, e.id + ' ' + e.edge + ' state');
    assert.equal(f.reuse, e.expect.reuse, e.id + ' ' + e.edge + ' reuse');
    assert.equal(f.flakyPasses, e.expect.flakyPasses, e.id + ' ' + e.edge + ' flakyPasses');
    if (e.expect.reason) assert.equal(f.reason, e.expect.reason, e.id + ' reason');
    if (e.expect.kills !== undefined) assert.equal(f.kills, e.expect.kills, e.id + ' kills');
    ok++;
  }
  // H1 form of the PASS invariant (counts.failed > 0) as well as the H5 form in the fixture
  const h1 = gateFold(rowsToItems(streamRows([{ t: 'f', run: 1, res: 'PASS', inv: true }])), key(), NOW, { file: 'f.spec.ts' });
  assert.equal(h1.state, 'FAIL');
  assert.equal(h1.reason, 'pass-invariant');
  // L1-04 acceptance: the fold section performs no fs, child_process, process or clock call
  const src = fs.readFileSync(path.join(SRC_DIR, 'gate-results.mjs'), 'utf8');
  const region = src.slice(src.indexOf('// == fold: pure'), src.indexOf('// == end fold: pure =='));
  assert.ok(region.length > 2000);
  assert.doesNotMatch(region, /\bfs\.|\bcp\.|\bprocess\.|Date\.now|new Date\(\)/);
  console.log('T-L1-05 ' + ok + ' of 25 entries match; fold section has 0 fs/child_process/clock calls');
});

test('T-L1-06 killed runs: finished work survives the kill under --resume, a live run is never reused, two kills => SUSPECT_KILLER', () => {
  const x = 'x.spec.ts';
  const y = 'y.spec.ts';
  const r1 = [
    { row: runStartRow({ run: rid(1), at: iso(NOW - 3 * H) }) },
    { row: startRow2(1, y, 3) }, { row: finishRow({ run: rid(1), at: iso(NOW - 3 * H), file: y, key: K1 }) },
    { row: startRow2(1, x, 2.9) },
  ];
  const fx = (rows, file, opts) => gateFold(rowsToItems(rows), key(), NOW, { file, ...opts });
  // R1 dead
  let fxr = fx(r1, x, { liveRuns: new Set() });
  assert.equal(fxr.state, 'KILLED');
  assert.equal(fxr.kills, 1);
  assert.equal(fxr.reuse, null);
  assert.equal(fx(r1, y, { liveRuns: new Set(), resume: true }).reuse, 'PASS');
  const yNo = fx(r1, y, { liveRuns: new Set() });
  assert.equal(yNo.reuse, null);
  assert.equal(yNo.reason, 'interrupted-run');
  // R1 alive
  const live = new Set([rid(1)]);
  assert.equal(fx(r1, x, { liveRuns: live }).state, 'RUNNING');
  const yLive = fx(r1, y, { liveRuns: live, resume: true });
  assert.equal(yLive.reuse, null);
  assert.equal(yLive.reason, 'live-run');
  // R2 killed on x with the same key
  const r2 = [...r1, { row: runStartRow({ run: rid(2), at: iso(NOW - 2 * H) }) }, { row: startRow2(2, x, 2) }];
  fxr = fx(r2, x, { liveRuns: new Set() });
  assert.equal(fxr.state, 'SUSPECT_KILLER');
  assert.equal(fxr.kills, 2);
  assert.equal(fxr.reuse, null);
  // R3 finishes x PASS
  const r3 = [...r2, { row: runStartRow({ run: rid(3), at: iso(NOW - H) }) }, { row: startRow2(3, x, 1) },
    { row: finishRow({ run: rid(3), at: iso(NOW - H), file: x, key: K1 }) }, { row: runEndRow({ run: rid(3), at: iso(NOW - H) }) }];
  fxr = fx(r3, x, { liveRuns: new Set() });
  assert.equal(fxr.state, 'PASS');
  assert.equal(fxr.kills, 0);
  assert.equal(fxr.reuse, 'PASS');
  console.log('T-L1-06 R1 KILLED/1, live RUNNING, R2 SUSPECT_KILLER/2, R3 PASS/0');
});

function startRow2(run, file, agoH) {
  return { schema: 'do-it-gate-result/1', type: 'start', run_id: rid(run), at: iso(NOW - agoH * H), file, leg: 'unit', scope: 'push', key: K1 };
}

test('T-L1-07 R9 age: 24 h TTL, the last clean run as horizon, and a future timestamp', () => {
  const one = (agoH, extra) => gateFold(rowsToItems(streamRows([{ t: 'f', run: 1, res: 'PASS', ago: agoH }, ...(extra || [])])), key(), NOW, { file: 'f.spec.ts' });
  const a = one(23 + 59 / 60);
  assert.equal(a.reuse, 'PASS');
  const b = one(24 + 1 / 60);
  assert.equal(b.state, 'EXPIRED');
  assert.equal(b.reuse, null);
  // PASS at now-2h, then a clean run whose run_start is at now-1h and whose own PASS is at now-30min
  const rows = [
    { row: runStartRow({ run: rid(1), at: iso(NOW - 2 * H) }) },
    { row: finishRow({ run: rid(1), at: iso(NOW - 2 * H), file: 'f.spec.ts', key: K1 }) },
    { row: runEndRow({ run: rid(1), at: iso(NOW - 2 * H) }) },
    { row: runStartRow({ run: rid(2), at: iso(NOW - H), clean: true }) },
    { row: finishRow({ run: rid(2), at: iso(NOW - 0.5 * H), file: 'g.spec.ts', key: K1, clean: true }) },
    { row: runEndRow({ run: rid(2), at: iso(NOW - 0.4 * H) }) },
    { row: cleanRow({ run: rid(2), at: iso(NOW - 0.4 * H) }) },
  ];
  const c = gateFold(rowsToItems(rows), key(), NOW, { file: 'f.spec.ts' });
  assert.equal(c.state, 'EXPIRED');
  assert.equal(c.reuse, null);
  const d = gateFold(rowsToItems(rows), key(), NOW, { file: 'g.spec.ts' });
  assert.equal(d.reuse, 'PASS');
  // the horizon is per leg: the same clean run marked for leg real-mongo never expires leg unit
  const otherLeg = rows.map((r) => (r.row.type === 'clean' ? { row: { ...r.row, leg: 'real-mongo' } } : r));
  const g = gateFold(rowsToItems(otherLeg), key(), NOW, { file: 'f.spec.ts' });
  assert.equal(g.state, 'PASS');
  assert.equal(g.reuse, 'PASS');
  const e = one(-5 / 60);
  assert.equal(e.reuse, null);
  assert.equal(e.reason, 'future-timestamp');
  console.log('T-L1-07 23h59 PASS, 24h01 EXPIRED, before-clean EXPIRED, clean PASS reuse, +5min future-timestamp');
});

test('T-L1-08 tainted runs and duplicate finishes cannot launder a FAIL', () => {
  // run R tainted with one PASS (file p) and one FAIL (file q)
  const base = [
    { row: runStartRow({ run: rid(1), at: iso(NOW - 3 * H) }) },
    { row: finishRow({ run: rid(1), at: iso(NOW - 3 * H), file: 'p.spec.ts', key: K1 }) },
    { row: finishRow({ run: rid(1), at: iso(NOW - 3 * H), file: 'q.spec.ts', key: K1, result: 'FAIL' }) },
    { row: runEndRow({ run: rid(1), at: iso(NOW - 3 * H), tainted: true }) },
  ];
  const p = gateFold(rowsToItems(base), key(), NOW, { file: 'p.spec.ts' });
  assert.equal(p.reuse, null);
  assert.equal(p.reason, 'tainted-run');
  const later = [...base, { row: runStartRow({ run: rid(2), at: iso(NOW - H) }) },
    { row: finishRow({ run: rid(2), at: iso(NOW - H), file: 'q.spec.ts', key: K1 }) }, { row: runEndRow({ run: rid(2), at: iso(NOW - H) }) }];
  const q = gateFold(rowsToItems(later), key(), NOW, { file: 'q.spec.ts' });
  assert.equal(q.state, 'FLAKY');
  assert.equal(q.flakyPasses, 1);
  // FAIL(R1), PASS(R2), the byte-identical duplicate of PASS(R2), and a second distinct PASS finish for (R2, file, leg)
  const passR2 = finishRow({ run: rid(2), at: iso(NOW - H), file: 'f.spec.ts', key: K1 });
  const passR2b = { ...passR2, duration_ms: 77, at: iso(NOW - 0.5 * H) };
  const dup = [
    { row: runStartRow({ run: rid(1), at: iso(NOW - 2 * H) }) },
    { row: finishRow({ run: rid(1), at: iso(NOW - 2 * H), file: 'f.spec.ts', key: K1, result: 'FAIL' }) },
    { row: runEndRow({ run: rid(1), at: iso(NOW - 2 * H) }) },
    { row: runStartRow({ run: rid(2), at: iso(NOW - H) }) },
    { row: passR2 }, { row: { ...passR2 } }, { row: passR2b },
    { row: runEndRow({ run: rid(2), at: iso(NOW - 0.5 * H) }) },
  ];
  const f = gateFold(rowsToItems(dup), key(), NOW, { file: 'f.spec.ts' });
  assert.equal(f.state, 'FLAKY');
  assert.equal(f.flakyPasses, 1);
  assert.equal(f.reuse, null);
  console.log('T-L1-08 tainted PASS ignored, tainted FAIL counts (FLAKY n1), duplicates fold to FLAKY n1');
});

test('T-L1-09 UNSTABLE_UNDER_REUSE window and FLAKY carry-over across a key change', () => {
  const u = NOW - 8 * D;
  const ev = (run, res, at, clean) => [
    { row: runStartRow({ run: rid(run), at: iso(at), clean: !!clean }) },
    { row: finishRow({ run: rid(run), at: iso(at), file: 'f.spec.ts', key: K1, result: res, clean: !!clean }) },
    { row: runEndRow({ run: rid(run), at: iso(at) }) },
    ...(clean ? [{ row: cleanRow({ run: rid(run), at: iso(at) }) }] : []),
  ];
  const head = [...ev(1, 'PASS', u - H), ...ev(2, 'FAIL', u, true)];
  const s0 = gateFold(rowsToItems(head), key(), u + 1000, { file: 'f.spec.ts' });
  assert.equal(s0.state, 'UNSTABLE_UNDER_REUSE');
  assert.equal(s0.unstableUntil, u + 7 * D);
  const s1rows = [...head, ...ev(3, 'PASS', u + D)];
  const s1 = gateFold(rowsToItems(s1rows), key(), u + D + 1000, { file: 'f.spec.ts' });
  assert.equal(s1.state, 'UNSTABLE_UNDER_REUSE');
  assert.equal(s1.reuse, null);
  const at8 = u + 8 * D;
  const two = [...s1rows, ...ev(4, 'PASS', at8 - 2 * H, true), ...ev(5, 'PASS', at8 - H, true)];
  const s2 = gateFold(rowsToItems(two), key(), at8, { file: 'f.spec.ts' });
  assert.equal(s2.state, 'PASS');
  assert.equal(s2.reuse, 'PASS');
  const oneClean = [...s1rows, ...ev(5, 'PASS', at8 - H, true)];
  const s3 = gateFold(rowsToItems(oneClean), key(), at8, { file: 'f.spec.ts' });
  assert.equal(s3.state, 'UNSTABLE_UNDER_REUSE');
  // carry-over: a flaky event (PASS then FAIL) on k1 at f, the key changes to k2, one PASS on k2
  const f = NOW - 10 * D;
  const K2 = hex('k2');
  const flaky = [
    { row: runStartRow({ run: rid(1), at: iso(f - H) }) },
    { row: finishRow({ run: rid(1), at: iso(f - H), file: 'f.spec.ts', key: K1 }) },
    { row: runEndRow({ run: rid(1), at: iso(f - H) }) },
    { row: runStartRow({ run: rid(2), at: iso(f) }) },
    { row: finishRow({ run: rid(2), at: iso(f), file: 'f.spec.ts', key: K1, result: 'FAIL' }) },
    { row: runEndRow({ run: rid(2), at: iso(f) }) },
  ];
  const passK2 = (at) => [
    { row: runStartRow({ run: rid(3), at: iso(at) }) },
    { row: finishRow({ run: rid(3), at: iso(at), file: 'f.spec.ts', key: K2, components: comps('k2') }) },
    { row: runEndRow({ run: rid(3), at: iso(at) }) },
  ];
  const c1 = gateFold(rowsToItems([...flaky, ...passK2(f + D - H)]), key('k2'), f + D, { file: 'f.spec.ts' });
  assert.equal(c1.state, 'FLAKY');
  assert.equal(c1.flakyPasses, 1);
  assert.equal(c1.reuse, null);
  assert.equal(c1.reason, 'flaky-carry');
  const c8 = gateFold(rowsToItems([...flaky, ...passK2(f + 8 * D - H)]), key('k2'), f + 8 * D, { file: 'f.spec.ts' });
  assert.equal(c8.state, 'PASS');
  assert.equal(c8.reuse, 'PASS');
  console.log('T-L1-09 UNSTABLE until u+7d; 2 clean passes clear, 1 does not; carry FLAKY n1 at f+1d, PASS at f+8d');
});

test('T-L1-16 adversarial: a FAIL row tampered on disk to PASS is CORRUPT; a build without the CRC check is caught reusing it', async () => {
  const store = tmpStore();
  const run = rid(1);
  const failRow = finishRow({ run, at: iso(NOW - H), file: 't.spec.ts', key: K1, result: 'FAIL', counts: { passed: 2, failed: 0, skipped: 0, pending: 0 } });
  seed(store, [runStartRow({ run, at: iso(NOW - H) }), failRow, runEndRow({ run, at: iso(NOW - H) })]);
  const file = path.join(store.dir, 'results.jsonl');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('"result":"FAIL"'));
  fs.writeFileSync(file, text.replace('"result":"FAIL"', '"result":"PASS"'));
  const real1 = gateFold(gateStoreScan(store, { file: 't.spec.ts' }), key(), NOW, { file: 't.spec.ts' });
  assert.equal(real1.state, 'CORRUPT');
  assert.equal(real1.reuse, null);
  // mutant: the CRC guard line removed
  let removed = 0;
  const m = mutantCopy((name, t) => {
    if (name !== 'gate-results.mjs') return t;
    return t.split('\n').filter((l) => { if (l.includes('// CRC-GUARD')) { removed++; return false; } return true; }).join('\n');
  });
  assert.equal(removed, 1, 'the CRC guard marker must exist exactly once');
  const mod = await import(pathToFileURL(path.join(m.src, 'gate-results.mjs')).href);
  const mutant = mod.gateFold(mod.gateStoreScan(store, { file: 't.spec.ts' }), key(), NOW, { file: 't.spec.ts' });
  assert.equal(mutant.reuse, 'PASS', 'the mutant must reuse the tampered row (proves the guard can fail)');
  console.log('TAMPER-UNDETECTED (mutant without CRC check reused the tampered FAIL as PASS)');
  const real2 = gateFold(gateStoreScan(store, { file: 't.spec.ts' }), key(), NOW, { file: 't.spec.ts' });
  assert.equal(real2.state, 'CORRUPT');
  console.log('T-L1-16 real CORRUPT, mutant reuse PASS, real again CORRUPT');
});
