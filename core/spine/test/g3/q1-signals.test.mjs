// Q1 unit cases: darwin parse and decision (T-Q1-01), Linux fixture root (T-Q1-09), bundle rules (T-Q1-17).
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BIN, SPINE_DIR, tmp } from '../helpers.mjs';
import {
  gateSignalsDecide, gateSignalsParseDarwin, gateSignalsReadLinux, gateSignalsSample, gateSignalsSwapRate,
} from '../../src/gate-signals.mjs';
import { gateQueueBudgetMb, gateQueueSignalReporter } from '../../src/gate-queue.mjs';

// Captured live reading 2026-11-06T13:36:51Z (PRD-4 D4).
const VMSTAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                4520.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         9000.
Pages throttled:                              0.
Pages wired down:                        163400.
Pages purgeable:                          16000.
"Translation faults":                1962482388.
File-backed pages:                        98308.
Anonymous pages:                         469011.
Pages stored in compressor:             1898456.
Pages occupied by compressor:            314342.
Swapins:                               73332470.
Swapouts:                              78274563.
`;

test('T-Q1-01 darwin parse: compressor-aware estimate admits where Pages free would refuse; swap-out rate over the 5 s window', () => {
  const sig = gateSignalsParseDarwin({
    pressureText: '1\n',
    swapText: 'total = 5120.00M  used = 4602.81M  free = 517.19M  (encrypted)\n',
    memsizeText: '19327352832\n',
    pagesizeText: '16384\n',
    vmstatText: VMSTAT,
  });
  assert.equal(sig.pressure, 'normal');
  assert.equal(sig.total_mb, 18432);
  assert.equal(sig.avail_est_bytes, 3815751680);
  assert.equal(sig.avail_mb, 3639);
  assert.equal(sig.swap_used_mb, 4602.81);
  // Pages free alone is ~70 MB: a 3000 MB gate would be refused on it
  assert.ok(Math.round(4520 * 16384 / 1048576) === 71 && 71 < 3000);
  const budgetMb = gateQueueBudgetMb(60, sig.total_mb);
  const q = { peakMb: 3000, heldMb: 0, budgetMb, swapUsedMaxMb: null };
  assert.equal(gateSignalsDecide({ ...sig, swapout_mb_per_s: null }, q).admit, true);

  const r1 = gateSignalsSwapRate({ at_ms: 0, pages: 1000, pagesize: 16384 }, { at_ms: 5000, pages: 1320, pagesize: 16384 });
  const r2 = gateSignalsSwapRate({ at_ms: 0, pages: 1000, pagesize: 16384 }, { at_ms: 5000, pages: 1640, pagesize: 16384 });
  const r3 = gateSignalsSwapRate({ at_ms: 0, pages: 1000, pagesize: 16384 }, { at_ms: 2000, pages: 1320, pagesize: 16384 });
  assert.equal(r1, 1.0);
  assert.equal(r2, 2.0);
  assert.equal(r3, null);
  assert.equal(gateSignalsDecide({ ...sig, swapout_mb_per_s: r1 }, q).admit, true);
  const d2 = gateSignalsDecide({ ...sig, swapout_mb_per_s: r2 }, q);
  assert.equal(d2.admit, false);
  assert.equal(d2.reason, 'swap-out to stop (2.0 MB/s)');

  // the rolling sampler yields no rate until two samples are >= 5 s apart, then uses the newest old-enough one
  const st = {};
  assert.equal(gateSignalsSample(st, { at_ms: 0, pages: 1000, pagesize: 16384 }).rate, null);
  const early = gateSignalsSample(st, { at_ms: 2000, pages: 1100, pagesize: 16384 });
  assert.equal(early.rate, null);
  assert.equal(early.pending_ms, 3000);
  const ok = gateSignalsSample(st, { at_ms: 5000, pages: 1320, pagesize: 16384 });
  assert.equal(ok.rate, 1.0);
  assert.equal(ok.window_ms, 5000);

  const src = fs.readFileSync(path.join(SPINE_DIR, 'src', 'gate-signals.mjs'), 'utf8') + fs.readFileSync(path.join(SPINE_DIR, 'src', 'gate-queue.mjs'), 'utf8');
  assert.doesNotMatch(src, /freemem/);
  assert.doesNotMatch(src, /Pages free/);
});

test('T-Q1-09 Linux signals on a fixture root: cgroup limit, PSI pressure, PSI missing warns once', () => {
  const root = tmp('dit-g3-linux-');
  try {
    const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    w('proc/meminfo', 'MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    8192000 kB\nSwapTotal:       2097152 kB\nSwapFree:        2097152 kB\n');
    w('proc/vmstat', 'pgpgin 1\npswpin 0\npswpout 1000\n');
    w('proc/pressure/memory', 'some avg10=12.50 avg60=3.00 avg300=1.00 total=123\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n');
    w('sys/fs/cgroup/memory.max', '4294967296\n');
    w('sys/fs/cgroup/memory.current', '1073741824\n');
    const a = gateSignalsReadLinux(root, {});
    assert.equal(a.source, 'linux');
    assert.equal(a.total_mb, 4096);
    assert.equal(a.avail_mb, 3072);
    assert.equal(a.pressure, 'warn');
    w('sys/fs/cgroup/memory.max', 'max\n');
    const b = gateSignalsReadLinux(root, {});
    assert.equal(b.total_mb, 16000);
    assert.equal(b.avail_mb, 8000);
    fs.rmSync(path.join(root, 'proc/pressure/memory'));
    const lines = [];
    const say = gateQueueSignalReporter((l) => lines.push(l));
    const st = {};
    const c1 = gateSignalsReadLinux(root, st);
    say(c1);
    say(gateSignalsReadLinux(root, st));
    assert.equal(c1.pressure, null);
    assert.equal(c1.total_mb, 16000);
    assert.deepEqual(lines.filter((l) => l === '[gate-queue] signal unavailable: pressure'), ['[gate-queue] signal unavailable: pressure']);
    assert.equal(lines.length, 1, lines.join('\n'));
    // the other signals still decide: budget and available memory are read without PSI
    const d = gateSignalsDecide({ ...c1, swapout_mb_per_s: null }, { peakMb: 9000, heldMb: 0, budgetMb: 9600, swapUsedMaxMb: null });
    assert.equal(d.admit, false);
    assert.match(d.reason, /^8\.8 GB free \(7\.8 GB now\)$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T-Q1-17 bundle builds with both modules; node:/relative imports only; lane-prefixed unique names', () => {
  const r = cp.spawnSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const bundle = fs.readFileSync(BIN, 'utf8');
  for (const name of ['gateQueueCmd', 'gateSignalsRead', 'gateProcStart']) {
    const n = (bundle.match(new RegExp('^(?:async\\s+)?function\\s+' + name + '\\(', 'gm')) || []).length;
    assert.equal(n, 1, name + ' defined ' + n + ' times');
  }
  const DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)(\w+)/gm;
  for (const f of ['gate-queue.mjs', 'gate-signals.mjs']) {
    const text = fs.readFileSync(path.join(SPINE_DIR, 'src', f), 'utf8');
    for (const m of text.matchAll(/^import\s[\s\S]*?\sfrom\s+(['"])([^'"]+)\1/gm)) {
      assert.ok(m[2].startsWith('node:') || m[2].startsWith('./'), f + ' imports ' + m[2]);
    }
    const names = [...text.matchAll(DECL_RE)].map((m) => m[1]);
    assert.ok(names.length > 5);
    const bad = names.filter((n) => !/^(gateQueue|gateSignals|gateProc)/.test(n));
    assert.deepEqual(bad, [], f + ' has unprefixed top-level names');
  }
});
