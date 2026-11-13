// Process-tree fixture for the Q2 cleanup cases (epics-4 Q2 Test Contract).
// argv: [outDir]. The root behaviour comes from env TREE_MODE so a decoy can run with an identical argv:
//   pass | fail      child (same group, open interval) + grandchild (detached: own group, idles); exit 0 | 1 after 3 s
//   hang             same tree; the root never exits
//   green-exit       child only; prints `Tests: 3 passed, 3 total`, exits 0 (jest hang-after-green, out-of-band handle)
//   green-hang       child only; prints the same line and never exits (in-band open handle)
//   stubborn         child ignores SIGTERM; the root exits 0
//   release-check    child traps SIGTERM, waits 2 s, checks the queue holder file, writes holder-present + death.txt
//   trap             child idles; the root writes the signal it gets (SIGINT/SIGHUP/SIGTERM) to got.txt and exits 0
//   decoy            idles, writes nothing (a non-descendant with the same argv)
// Every pid and start time goes to {outDir}/pids.json once the tree is up; the root writes root-exit.txt
// (Date.now()) just before it exits on its own.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateProcStart } from '../../../src/gate-signals.mjs';

const SELF = fileURLToPath(import.meta.url);
const out = process.argv[2];
const mode = process.env.TREE_MODE || 'pass';
const role = process.env.TREE_ROLE || 'root';
const idle = () => setInterval(() => {}, 1000);
const file = (n) => path.join(out, n);
const spawnRole = (r, extra, detached) => cp.spawn(process.execPath, [SELF, out], {
  detached: !!detached, stdio: 'ignore', env: { ...process.env, TREE_ROLE: r, ...(extra || {}) },
});

if (role === 'child') {
  if (process.env.TREE_CHILD === 'ignore-term') process.on('SIGTERM', () => {});
  if (process.env.TREE_CHILD === 'trap-check') {
    process.on('SIGTERM', () => {
      setTimeout(() => {
        const m = /^(\d+)-(\d+)$/.exec(process.env.DO_IT_GATE_HOLDER || '');
        const holder = m && path.join(process.env.HOME, '.do-it', 'queue', 'holders', m[1].padStart(10, '0') + '-' + m[2] + '.json');
        if (holder && fs.existsSync(holder)) fs.writeFileSync(file('holder-present'), holder);
        fs.writeFileSync(file('death.txt'), String(Date.now()));
        process.exit(0);
      }, 2000);
    });
  }
  if (process.env.TREE_GRANDCHILD === '1') {
    const g = spawnRole('grandchild', {}, true);
    g.unref();
    fs.writeFileSync(file('grandchild.pid'), String(g.pid));
  }
  fs.writeFileSync(file('child.ready'), String(process.pid));
  idle();
} else if (role === 'grandchild') {
  idle();
} else if (mode === 'decoy') {
  idle();
} else {
  const tree = mode === 'pass' || mode === 'fail' || mode === 'hang';
  const childEnv = { TREE_GRANDCHILD: tree ? '1' : '0' };
  if (mode === 'stubborn') childEnv.TREE_CHILD = 'ignore-term';
  if (mode === 'release-check') childEnv.TREE_CHILD = 'trap-check';
  const child = spawnRole('child', childEnv, false);
  child.unref();
  if (mode === 'trap') {
    for (const s of ['SIGINT', 'SIGHUP', 'SIGTERM']) process.on(s, () => { fs.writeFileSync(file('got.txt'), s); process.exit(0); });
  }
  const keep = idle();
  const ready = () => fs.existsSync(file('child.ready')) && (!tree || fs.existsSync(file('grandchild.pid')));
  const waitReady = () => {
    if (!ready()) return setTimeout(waitReady, 20);
    const pids = { root: process.pid, child: child.pid };
    if (tree) pids.grandchild = Number(fs.readFileSync(file('grandchild.pid'), 'utf8'));
    const starts = {};
    for (const [k, v] of Object.entries(pids)) starts[k] = gateProcStart(v);
    fs.writeFileSync(file('pids.json.tmp'), JSON.stringify({ pids, starts }));
    fs.renameSync(file('pids.json.tmp'), file('pids.json'));
    const end = (code) => { fs.writeFileSync(file('root-exit.txt'), String(Date.now())); clearInterval(keep); process.exit(code); };
    if (mode === 'pass') setTimeout(() => end(0), 3000);
    else if (mode === 'fail') setTimeout(() => end(1), 3000);
    else if (mode === 'green-exit') { process.stderr.write('Tests: 3 passed, 3 total\n'); setTimeout(() => end(0), 1500); }
    else if (mode === 'green-hang') process.stderr.write('Tests: 3 passed, 3 total\n');
    else if (mode === 'stubborn' || mode === 'release-check') setTimeout(() => end(0), 1500);
  };
  waitReady();
}
