import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CORE_DIR, BIN, SPINE_DIR, baseEnv, mkRepo, real, unit, readJson, readJsonl, runDirOf, sha, sha256Bytes, startRun, tmp, writeJson } from '../helpers.mjs';
import { validateSchema, loadSchemaFile } from '../../src/schema.mjs';

test('T-S1-01 G-1 tamper between write and read is detected [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  const stateFile = path.join(runDirOf(repo, runId), 'state.json');
  const script = path.join(tmp('dit-script-'), 'tamper.mjs');
  fs.writeFileSync(script, `import fs from 'node:fs';
const f = process.argv[2];
const s = JSON.parse(fs.readFileSync(f, 'utf8'));
s.status = 'BUILDING';
fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\\n');
`);
  cp.execFileSync(process.execPath, [script, stateFile]);
  const before = sha(stateFile);
  const r = real(repo, ['status']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'STATE_TAMPERED');
  assert.equal(sha(stateFile), before, 'spine must not repair the file');
  const events = readJsonl(path.join(runDirOf(repo, runId), 'events.jsonl'));
  assert.ok(events.some((e) => e.event === 'state_tamper_detected'));
});

test('T-S1-02 G-1 single writer, schema-valid state', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const state = readJson(path.join(runDirOf(repo, runId), 'state.json'));
  assert.deepEqual(validateSchema(loadSchemaFile('do-it-state.1.schema.json'), state), []);
  assert.equal(state.schema, 'do-it-state/1');
  for (const k of ['run_id', 'preset', 'request', 'status', 'size', 'host', 'stage', 'slices', 'gates', 'handoffs', 'stop_refusals', 'review', 'created_at', 'updated_at']) {
    assert.ok(Object.prototype.hasOwnProperty.call(state, k), 'missing ' + k);
  }
  const srcDir = path.join(SPINE_DIR, 'src');
  const writers = fs.readdirSync(srcDir).filter((f) => f.endsWith('.mjs')).filter((f) =>
    fs.readFileSync(path.join(srcDir, f), 'utf8').split('\n').some((l) => /state\.json/.test(l) && /(writeFile|atomicWrite|renameSync|appendFile|copyFile|createWriteStream)/.test(l)));
  assert.deepEqual(writers, ['state.mjs']);
});

test('T-S1-03 interrupted write leaves previous state valid [REAL]', () => {
  const repo = mkRepo();
  const runId = startRun(repo, real);
  const dir = runDirOf(repo, runId);
  const stateFile = path.join(dir, 'state.json');
  const copy = fs.readFileSync(stateFile);
  const r = real(repo, ['gate', 'advance', '--to', 'PLANNING'], { DO_IT_FAULT: 'after_tmp' });
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'FAULT_INJECTED');
  assert.ok(fs.readFileSync(stateFile).equals(copy));
  assert.equal(fs.readFileSync(path.join(dir, '.state.sha256'), 'utf8').trim(), sha256Bytes(copy));
  assert.ok(fs.readdirSync(dir).some((n) => /\.tmp-/.test(n)), 'a stale temp file is expected');
  const s = real(repo, ['status']);
  assert.equal(s.code, 0);
  assert.equal(s.out.status, 'INTAKE');
  assert.ok(!fs.readdirSync(dir).some((n) => /\.tmp-/.test(n)), 'status removes the stale temp file');
});

function twoSettings(repo, global, workspace) {
  writeJson(path.join(repo.home, '.do-it', 'settings.json'), global);
  writeJson(path.join(repo.doIt, 'settings.json'), workspace);
}

function entry(out, key) {
  return out.entries.find((e) => e.key === key);
}

test('T-S1-04 settings precedence: workspace beats global [REAL]', () => {
  const repo = mkRepo();
  twoSettings(repo, { stop_gate: { patience: 4 } }, { stop_gate: { patience: 5 } });
  const r = real(repo, ['doctor']);
  assert.equal(r.code, 0);
  assert.deepEqual([entry(r.out, 'stop_gate.patience').value, entry(r.out, 'stop_gate.patience').source], [5, 'workspace']);
  assert.deepEqual([entry(r.out, 'ceilings.warn_tokens').value, entry(r.out, 'ceilings.warn_tokens').source], [150000, 'default']);
  fs.rmSync(path.join(repo.doIt, 'settings.json'));
  const g = real(repo, ['doctor']);
  assert.deepEqual([entry(g.out, 'stop_gate.patience').value, entry(g.out, 'stop_gate.patience').source], [4, 'global']);
});

test('T-S1-05 settings precedence: run flag beats workspace', () => {
  const repo = mkRepo();
  twoSettings(repo, { stop_gate: { patience: 4 } }, { stop_gate: { patience: 5 } });
  const a = unit(repo, ['doctor', '--set', 'stop_gate.patience=6']);
  assert.deepEqual([entry(a.out, 'stop_gate.patience').value, entry(a.out, 'stop_gate.patience').source], [6, 'run-flag']);
  const b = unit(repo, ['doctor']);
  assert.deepEqual([entry(b.out, 'stop_gate.patience').value, entry(b.out, 'stop_gate.patience').source], [5, 'workspace']);
  const c = unit(repo, ['doctor', '--set', 'unknown.key=1']);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'SETTINGS_UNKNOWN_KEY');
});

test('T-S1-06 defaults when no files exist', () => {
  const repo = mkRepo();
  const r = unit(repo, ['doctor']);
  assert.equal(r.code, 0);
  assert.ok(r.out.entries.every((e) => e.source === 'default'));
  const schema = loadSchemaFile('settings.schema.json');
  for (const k of Object.keys(schema.properties)) {
    assert.ok(r.out.entries.some((e) => e.key === k || e.key.startsWith(k + '.')), 'schema key without entry: ' + k);
  }
  assert.deepEqual(entry(r.out, 'interaction.fallback').value, ['native', 'html', 'markdown']);
  assert.equal(entry(r.out, 'handoff.max_per_run').value, 5);
  assert.equal(entry(r.out, 'review.max_rounds').value, 3);
  assert.equal(entry(r.out, 'stop_gate.patience').value, 3);
  assert.deepEqual(['warn_tokens', 'warn_pct', 'block_tokens', 'block_pct'].map((k) => entry(r.out, 'ceilings.' + k).value), [150000, 40, 250000, 60]);
  assert.equal(entry(r.out, 'host.driver').value, 'auto');
});

test('T-S1-07 invalid settings fail loudly', () => {
  const repo = mkRepo();
  writeJson(path.join(repo.doIt, 'settings.json'), { stop_gate: { patience: 'three' } });
  const globalFile = path.join(repo.home, '.do-it', 'settings.json');
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.writeFileSync(globalFile, '{ "stop_gate": { "patience": 2 } } trailing garbage');
  const r = unit(repo, ['doctor']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'SETTINGS_INVALID');
  assert.ok(r.out.errors.some((e) => e.pointer === '/stop_gate/patience' && e.file === path.join(repo.doIt, 'settings.json')));
  assert.ok(r.out.errors.some((e) => e.file === globalFile && /JSON parse error/.test(e.message)));
});

test('T-S1-08 init is idempotent and writes no secrets [REAL]', () => {
  const repo = mkRepo();
  const a = real(repo, ['init', '--secrets-provider', 'file', '--secrets-ref', '.secrets/']);
  assert.equal(a.code, 0);
  assert.notEqual(a.out.outcome, 'INIT_NOOP');
  const files = [path.join(repo.doIt, 'settings.json'), path.join(repo.doIt, '.env.example')];
  const first = files.map(sha);
  const b = real(repo, ['init', '--secrets-provider', 'file', '--secrets-ref', '.secrets/']);
  assert.equal(b.code, 0);
  assert.equal(b.out.outcome, 'INIT_NOOP');
  assert.deepEqual(files.map(sha), first);
  for (const p of ['.do-it/runs/x', '.secrets/x']) {
    const c = cp.spawnSync('git', ['check-ignore', p], { cwd: repo.dir, env: repo.env });
    assert.equal(c.status, 0, p + ' must be ignored');
  }
  assert.deepEqual(readJson(files[0]).secrets, { provider: 'file', ref: '.secrets/' });
});

test('T-S1-09 doctor --migrate refuses with a run in flight (ruling D12)', () => {
  const repo = mkRepo();
  fs.mkdirSync(path.join(repo.dir, '.build-it-reports'));
  fs.writeFileSync(path.join(repo.dir, '.build-it-reports', 'a.md'), 'legacy\n');
  const runId = startRun(repo, unit);
  const r = unit(repo, ['doctor', '--migrate']);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'MIGRATE_REFUSED');
  assert.equal(r.out.run_id, runId);
  assert.ok(!fs.existsSync(path.join(repo.doIt, 'build')));
});

test('T-S1-10 doctor --migrate copies, never moves [REAL]', () => {
  const repo = mkRepo();
  const bytes = Buffer.from([0, 1, 2, 250, 10, 13, 65]);
  fs.mkdirSync(path.join(repo.dir, '.fable-it-reports'));
  fs.writeFileSync(path.join(repo.dir, '.fable-it-reports', 'r1.md'), bytes);
  fs.mkdirSync(path.join(repo.dir, '.plan-it'));
  fs.writeFileSync(path.join(repo.dir, '.plan-it', 'x.json'), '{"a":1}\n');
  const r = real(repo, ['doctor', '--migrate']);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'MIGRATED');
  const manifest = readJson(path.join(repo.doIt, 'migration.json'));
  assert.equal(manifest.files.length, 2);
  for (const f of manifest.files) {
    const orig = path.join(repo.dir, f.source);
    const copy = path.join(repo.dir, f.dest);
    assert.ok(fs.existsSync(orig) && fs.existsSync(copy));
    assert.equal(f.sha256, sha(orig));
    assert.equal(sha(copy), f.sha256);
  }
  assert.ok(fs.readFileSync(path.join(repo.dir, '.fable-it-reports', 'r1.md')).equals(bytes));
  const again = real(repo, ['doctor', '--migrate']);
  assert.equal(again.code, 0);
  assert.equal(again.out.outcome, 'MIGRATE_NOOP');
});

test('T-S1-11 doctor --install places the single file [REAL]', () => {
  const repo = mkRepo();
  const bin = tmp('dit-bin-');
  const r = real(repo, ['doctor', '--install'], { DO_IT_BIN_DIR: bin });
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'INSTALLED');
  const dest = path.join(bin, 'do-it');
  assert.ok(fs.statSync(dest).mode & 0o111, 'executable bit');
  assert.equal(sha(dest), sha(BIN));
  const v = cp.spawnSync(dest, ['--version'], { env: repo.env, encoding: 'utf8' });
  assert.equal(v.status, 0);
  assert.equal(v.stdout.trim(), r.out.version);
  assert.deepEqual(fs.readdirSync(bin), ['do-it']);
  assert.ok(!fs.existsSync(path.join(repo.home, '.do-it')), 'nothing written under HOME');
});

test('T-S1-12 events and meter trace fields are frozen (ruling D17)', () => {
  const repo = mkRepo();
  const runId = startRun(repo, unit);
  const dir = runDirOf(repo, runId);
  const events = readJsonl(path.join(dir, 'events.jsonl'));
  assert.ok(events.length >= 1);
  const eventKeys = ['ts', 'run_id', 'slice_id', 'stage', 'persona', 'tier', 'model', 'host', 'event', 'parent_id', 'verdict'];
  for (const e of events) assert.deepEqual(Object.keys(e).sort(), eventKeys.slice().sort());
  const bad = unit(repo, ['meter', '--append', '--row', JSON.stringify({ tokens_in: 10, tokens_out: 5 })]);
  assert.equal(bad.code, 1);
  assert.equal(bad.out.outcome, 'METER_SOURCE_REQUIRED');
  assert.ok(!fs.existsSync(path.join(dir, 'token-meter.jsonl')));
  const ok = unit(repo, ['meter', '--append', '--row', JSON.stringify({ tokens_in: 10, tokens_out: 5, cache_read: 1, cache_write: 0, estimated: true, source: 'estimate' })]);
  assert.equal(ok.code, 0);
  const rows = readJsonl(path.join(dir, 'token-meter.jsonl'));
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [...eventKeys, 'tokens_in', 'tokens_out', 'cache_read', 'cache_write', 'estimated', 'source'].sort());
  assert.equal(Object.keys(rows[0]).length, 17);
  assert.equal(rows[0].source, 'estimate');
  assert.equal(rows[0].estimated, true);
});

test('T-S1-13 G-12 core names no harness', () => {
  const words = /\b(claude|codex|opencode|hermes|openclaw)\b/i;
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (p === path.join(SPINE_DIR, 'test') || e.name === 'node_modules') continue;
        walk(p);
      } else if (e.isFile() && words.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(CORE_DIR, p));
    }
  };
  walk(CORE_DIR);
  assert.deepEqual(hits, []);
  assert.ok(fs.existsSync(BIN), 'built file is part of the scan');
  const host = loadSchemaFile('settings.schema.json').properties.host.properties.driver;
  assert.equal(host.type, 'string');
  assert.equal(host.enum, undefined);
});

test('T-S1-14 worktree resolves the main checkout (home rule D7) [REAL]', () => {
  const repo = mkRepo({ commit: true });
  const runId = startRun(repo, real);
  const wt = path.join(tmp('dit-wt-parent-'), 'wt');
  cp.execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: repo.dir, env: repo.env });
  const r = real(repo, ['status'], {}, wt);
  assert.equal(r.code, 0);
  assert.equal(r.out.root, fs.realpathSync(repo.dir));
  assert.equal(r.out.run_id, runId);
  const third = tmp('dit-third-');
  const o = real(repo, ['status'], { DO_IT_HOME: third }, wt);
  assert.equal(o.out.root, third);
});

test('T-S1-15 secret-looking values are rejected in settings (G-7)', () => {
  const token = 'Zk3f9Qw7Lm2Xv8Rt5Yb1Nc6Hd4Js0Pa9Ue3GxTqA';
  assert.equal(token.length, 40);
  for (const settings of [{ secrets: { value: token } }, { secrets: { ref: 'AKIAABCDEFGHIJKLMNOP' } }]) {
    const repo = mkRepo();
    writeJson(path.join(repo.doIt, 'settings.json'), settings);
    const r = unit(repo, ['doctor']);
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'SETTINGS_SECRET_VALUE');
    assert.ok(!r.stdout.includes(token));
    assert.ok(!r.stdout.includes('AKIAABCDEFGHIJKLMNOP'));
    assert.ok(r.out.errors.every((e) => e.key.startsWith('secrets.')));
  }
});

test('build is deterministic and imports only node: builtins', () => {
  const out1 = path.join(tmp('dit-build-'), 'a.mjs');
  const out2 = path.join(path.dirname(out1), 'b.mjs');
  cp.execFileSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs'), out1], { stdio: 'ignore' });
  cp.execFileSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs'), out2], { stdio: 'ignore' });
  assert.equal(sha(out1), sha(out2));
  assert.equal(sha(out1), sha(BIN));
  const text = fs.readFileSync(out1, 'utf8');
  const specs = [...text.matchAll(/^import\s[^\n]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0 && specs.every((s) => s.startsWith('node:')), specs.join(','));
});
