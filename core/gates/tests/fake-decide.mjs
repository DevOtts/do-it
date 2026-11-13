#!/usr/bin/env node
// Stand-in for `do-it gate decide --run-dir D` (CONTRACT §11 A1) until the verdict lane's real command is wired in.
// Built over L1's gateFold and F1's gateKeyFor, so the selection it makes is the spine's own fold, not a copy.
//   argv:   gate decide --run-dir D          (cwd = the repository, as the jest adapter runs it)
//   reads:  D/manifest.json, D/keys.json, the store named by manifest.store_dir
//   writes: D/run-list.json {schema, files:[{file, key, components, lines, reason}]} and D/decision.json
//   exit:   0 on success; any other exit, a timeout or a missing run-list.json means "run every file" to the adapter.
// Test switches (env): FAKE_DECIDE_COUNT_FILE (one line appended per call), FAKE_DECIDE_RESUME=1 (fold with resume),
// FAKE_DECIDE_MODE = exit1 | sleep | malformed | nofile | fixed (+ FAKE_DECIDE_SLEEP_MS, FAKE_DECIDE_RUNLIST file).
import fs from 'node:fs';
import path from 'node:path';
import { gateKeyFor, gateNeverCompile, gateReuseDecision } from '../../spine/src/gate-fingerprint.mjs';
import { gateFold, gateStoreLiveRuns, gateStoreScan } from '../../spine/src/gate-results.mjs';

const argv = process.argv.slice(2);
const dir = argv[argv.indexOf('--run-dir') + 1];
const env = process.env;
if (env.FAKE_DECIDE_COUNT_FILE) fs.appendFileSync(env.FAKE_DECIDE_COUNT_FILE, 'call\n');
const mode = env.FAKE_DECIDE_MODE || '';
if (mode === 'exit1') process.exit(1);
if (mode === 'sleep') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(env.FAKE_DECIDE_SLEEP_MS) || 60000);
if (mode === 'malformed') { fs.writeFileSync(path.join(dir, 'run-list.json'), 'not json{'); process.exit(0); }
if (mode === 'nofile') process.exit(0);
if (mode === 'fixed') {
  fs.writeFileSync(path.join(dir, 'run-list.json'), fs.readFileSync(env.FAKE_DECIDE_RUNLIST));
  process.exit(0);
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const manifest = readJson(path.join(dir, 'manifest.json'));
const keys = readJson(path.join(dir, 'keys.json'));
const repo = fs.realpathSync(process.cwd());
const lines = manifest.lines.map((t) => t.split('\t'));
const core = lines.find((l) => l[0] === 'core');
const spine = {
  repo, runner: manifest.runner, reason: null,
  table: { hashes: manifest.hashes, wide: {}, dirty: manifest.dirty },
  wideHits: new Set(manifest.wide_hits), wideAll: manifest.wide_all, tree: manifest.tree, lines, core: { digest: core[1] },
  envFileTokens: new Map(lines.filter((l) => l[0] === 'env' && l[1].startsWith('file:')).map((l) => [l[1].slice(5), l[2]])),
  never: gateNeverCompile(manifest.never, { log: () => {} }),
};
const store = manifest.store_dir ? { backend: 'local', dir: manifest.store_dir } : null;
const scan = store && !manifest.clean ? gateStoreScan(store, {}) : { items: [], source: 'none' };
const live = gateStoreLiveRuns(scan.items);
const now = Date.now();
const out = [];
const decision = [];
for (const f of keys.files) {
  const keyNow = f.unknown ? { key: null, reason: 'closure-unknown' } : gateKeyFor(spine, {
    file: f.file,
    runner: { name: 'jest', version: keys.runner.version, argv: keys.runner.argv },
    deps: (f.deps || []).map((d) => [d.path, d.sha256]),
    unresolved: f.unresolved || 0,
    wide: f.class === 'WIDE',
  });
  let reuse = false;
  let reason = keyNow.reason || 'no-row';
  let source = null;
  if (keyNow.key && !manifest.clean) {
    const fold = gateFold(scan.items, { key: keyNow.key, components: keyNow.components }, now, {
      file: f.file, leg: manifest.leg, resume: env.FAKE_DECIDE_RESUME === '1', liveRuns: live, source: scan.source,
    });
    const d = gateReuseDecision({ fold, never: spine.never.match(f.file) });
    reuse = d.reuse === 'PASS';
    reason = d.reason;
    source = fold.passRow;
  } else if (manifest.clean) reason = 'clean';
  decision.push({ file: f.file, decision: reuse ? 'reuse' : 'run', why: reason, key_now: keyNow.key, source });
  if (!reuse) out.push({ file: f.file, key: keyNow.key, components: keyNow.components, lines: keyNow.lines, reason });
}
fs.writeFileSync(path.join(dir, 'decision.json'), JSON.stringify({ schema: 'rtg-decision/1', files: decision }));
fs.writeFileSync(path.join(dir, 'run-list.json'), JSON.stringify({ schema: 'rtg-run-list/1', files: out.map((o) => (o.key ? o : { file: o.file, reason: o.reason })) }));
