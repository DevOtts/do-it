// Q1 [REAL] cases against this machine's live kernel (no fixture): memory signals (T-Q1-15) and process start
// time (T-Q1-16). Read-only: nothing here writes outside a temp dir. Off darwin (or on an unknown OS) the
// cases report IMPLEMENTED-NOT-VERIFIED and skip; they never pass on a mock.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmp } from '../helpers.mjs';
import { gateProcAlive, gateProcStart, gateSignalsParseVmStat, gateSignalsReadSettled } from '../../src/gate-signals.mjs';

const C = { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } };

test('T-Q1-15 [REAL] live darwin signals match an independent sysctl/vm_stat read; swap-out window >= 5 s', { timeout: 60000 }, async (t) => {
  if (process.platform !== 'darwin') {
    t.diagnostic('IMPLEMENTED-NOT-VERIFIED: live darwin signals need a darwin host (this is ' + process.platform + ')');
    t.skip();
    return;
  }
  const env = { ...process.env };
  delete env.DO_IT_GATE_SIGNALS;
  const state = {};
  const sig = await gateSignalsReadSettled({ env, platform: 'darwin' }, state);
  const readAt = Date.now();
  // independent read, within 1 s
  const level = Number(cp.execFileSync('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], C).trim());
  const memsize = Number(cp.execFileSync('/usr/sbin/sysctl', ['-n', 'hw.memsize'], C).trim());
  const vm = gateSignalsParseVmStat(cp.execFileSync('/usr/bin/vm_stat', [], C));
  const indepAt = Date.now();
  assert.ok(indepAt - readAt <= 1000, 'independent read took ' + (indepAt - readAt) + ' ms');
  const ps = vm.pagesize;
  const c = vm.counters;
  const indepAvailMb = (Math.floor(memsize / ps) - c['Anonymous pages'] - c['Pages wired down'] - c['Pages occupied by compressor']) * ps / 1048576;
  const map = { 1: 'normal', 2: 'warn', 4: 'critical' };
  assert.equal(sig.source, 'darwin');
  assert.equal(sig.pressure, map[level] || 'level ' + level);
  assert.equal(sig.total_mb, memsize / 1048576);
  const diff = Math.abs(sig.avail_mb - indepAvailMb) / Math.max(1, indepAvailMb);
  assert.ok(diff <= 0.10, 'avail_mb ' + sig.avail_mb + ' vs independent ' + indepAvailMb.toFixed(0) + ' (' + (diff * 100).toFixed(1) + ' %)');
  assert.ok(sig.swapout_window_ms >= 5000, 'swap-out window ' + sig.swapout_window_ms + ' ms');
  assert.equal(typeof sig.swapout_mb_per_s, 'number');
  const evidence = {
    case: 'T-Q1-15', at_utc: new Date(readAt).toISOString(), gate: sig,
    independent: { pressure_level: level, hw_memsize: memsize, pagesize: ps, avail_mb: Math.round(indepAvailMb), anonymous: c['Anonymous pages'], wired: c['Pages wired down'], compressor: c['Pages occupied by compressor'] },
  };
  const dir = tmp('dit-g3-evidence-');
  const file = path.join(dir, 'T-Q1-15.json');
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
  t.diagnostic('evidence ' + JSON.stringify(evidence));
  assert.match(JSON.parse(fs.readFileSync(file, 'utf8')).at_utc, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('T-Q1-16 [REAL] live process start time: darwin lstart text; alive while running, false on mismatch and after exit', { timeout: 30000 }, async (t) => {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    t.diagnostic('IMPLEMENTED-NOT-VERIFIED: no start-time source on ' + process.platform);
    t.skip();
    return;
  }
  const child = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const exited = new Promise((r) => child.on('exit', r));
  let start = null;
  try {
    await new Promise((r) => setTimeout(r, 300));
    start = gateProcStart(child.pid);
    if (process.platform === 'darwin') {
      const lstart = cp.execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(child.pid)], C).trim();
      assert.equal(start, 'darwin:' + lstart);
    } else {
      assert.match(start, /^linux:\d+$/);
    }
    t.diagnostic('gateProcStart(' + child.pid + ') = ' + start);
    assert.equal(gateProcAlive(child.pid, start), true);
    assert.equal(gateProcAlive(child.pid, process.platform === 'darwin' ? 'darwin:Thu Jan  1 00:00:00 1970' : 'linux:1'), false);
  } finally {
    child.kill('SIGKILL');
  }
  await exited;
  assert.equal(gateProcAlive(child.pid, start), false);
});
