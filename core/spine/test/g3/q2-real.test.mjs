// Q2 [REAL] cases: a real `git push` through a pre-push hook (T-Q2-10) and a real jest 29.7 leak after green
// (T-Q2-15). Memory signals stay on the DO_IT_GATE_SIGNALS fixture (determinism); git, the hook, jest and the
// leaked process are real. The jest install comes only from DO_IT_REAL_JEST and is used read-only.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BIN, tmp } from '../helpers.mjs';
import { DRIVER, alive, sandbox } from './q1-helpers.mjs';

// The queue entry the hook calls: the built CLI once it serves `gate queue` (V1's subcommand table), else the
// test driver that calls the same gateQueueCmd. The case says which one it used.
function queueEntry(sb) {
  const r = cp.spawnSync(process.execPath, [BIN, 'gate', 'queue', '--status'], { cwd: sb.work, env: sb.env(), encoding: 'utf8', timeout: 30000 });
  if (r.status === 0 && /\[gate-queue\] budget /.test(r.stderr || '')) return { via: 'cli', argv: [process.execPath, BIN, 'gate', 'queue'] };
  return { via: 'driver', argv: [process.execPath, DRIVER] };
}

const sh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

test('T-Q2-10 [REAL] one entry point, pre-push: a failing gate blocks the push; a passing gate lets it through', { timeout: 120000 }, async (t) => {
  const sb = sandbox(t);
  const entry = queueEntry(sb);
  t.diagnostic('queue entry: ' + entry.via + (entry.via === 'driver' ? ' (re-run after V1 integration to go through the CLI)' : ''));
  const repo = path.join(sb.work, 'repo');
  const remote = path.join(sb.work, 'remote.git');
  const env = sb.env();
  const git = (args, opts) => cp.spawnSync('git', args, { cwd: repo, env, encoding: 'utf8', ...(opts || {}) });
  cp.execFileSync('git', ['init', '-q', '--bare', remote], { env });
  cp.execFileSync('git', ['init', '-q', '-b', 'main', repo], { env });
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(repo, 'gate.mjs'), "import fs from 'node:fs';\nprocess.exit(Number(fs.readFileSync('gate-exit.txt', 'utf8')));\n");
  fs.writeFileSync(path.join(repo, '.gitignore'), 'gate-exit.txt\n');
  git(['add', '-A']);
  assert.equal(git(['commit', '-q', '-m', 'init']).status, 0);
  git(['remote', 'add', 'origin', remote]);
  const hook = path.join(repo, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(hook, '#!/bin/sh\nexec ' + entry.argv.map(sh).join(' ') + ' --label push --peak-mb 100 -- ' + sh(process.execPath) + ' gate.mjs\n');
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(repo, 'gate-exit.txt'), '1');
  const p1 = git(['push', 'origin', 'main']);
  assert.notEqual(p1.status, 0, p1.stderr);
  assert.match(p1.stderr, /\[gate-queue\] admitted seq=1 /);
  assert.match(p1.stderr, /\[gate-queue\] released seq=1 exit=1 /);
  assert.equal(git(['ls-remote', 'origin']).stdout.trim(), '', 'the remote got a branch from a failed gate');
  fs.writeFileSync(path.join(repo, 'gate-exit.txt'), '0');
  const p2 = git(['push', 'origin', 'main']);
  assert.equal(p2.status, 0, p2.stderr);
  assert.match(p2.stderr, /\[gate-queue\] released seq=2 exit=0 /);
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  const remoteSha = git(['ls-remote', 'origin', 'refs/heads/main']).stdout.split(/\s/)[0];
  assert.equal(remoteSha, head);
  assert.deepEqual(sb.ls('holders'), []);
  t.diagnostic('push 1: ' + p1.stderr.split('\n').filter((l) => l.includes('released')).join(' ') + ' | push 2 remote ' + remoteSha.slice(0, 12) + ' = HEAD');
});

test('T-Q2-15 [REAL] jest 29.7 leak after green: the leak is real without the queue and gone under it', { timeout: 180000 }, async (t) => {
  const jest = process.env.DO_IT_REAL_JEST;
  if (!jest || !fs.existsSync(jest)) {
    t.diagnostic('IMPLEMENTED-NOT-VERIFIED: DO_IT_REAL_JEST ' + (jest ? 'does not exist' : 'not set') + ' (jest unreachable)');
    t.skip();
    return;
  }
  const jestJs = fs.realpathSync(jest);
  const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(jestJs), '..', 'package.json'), 'utf8'));
  if (pkg.name !== 'jest' || !/^29\.7\./.test(pkg.version)) {
    t.diagnostic('IMPLEMENTED-NOT-VERIFIED: DO_IT_REAL_JEST is ' + pkg.name + ' ' + pkg.version + ', the case needs jest 29.7');
    t.skip();
    return;
  }
  t.diagnostic('jest ' + pkg.version + ' (version from its package.json)');
  const sb = sandbox(t);
  const proj = tmp('dit-q2-jest-');
  const leaked = [];
  t.after(() => {
    for (const p of leaked) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    fs.rmSync(proj, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'leak-fixture', private: true, jest: { testEnvironment: 'node' } }));
  fs.writeFileSync(path.join(proj, 'leak.test.js'), [
    "const cp = require('child_process');",
    "const fs = require('fs');",
    "test('leaks a detached idle process, then runs 3 s more', async () => {",
    "  const c = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
    '  c.unref();',
    '  fs.writeFileSync(process.env.LEAK_FILE, String(c.pid));',
    '  await new Promise((r) => setTimeout(r, 3000));',
    '  expect(1).toBe(1);',
    '});',
    '',
  ].join('\n'));
  const jestArgv = [process.execPath, jestJs, '--rootDir', proj, '--ci', '--watchman=false', '--cacheDirectory', path.join(proj, '.cache')];
  // control: plain jest
  const ctlLeak = path.join(proj, 'leak-control.txt');
  const ctl = cp.spawnSync(jestArgv[0], jestArgv.slice(1), { cwd: proj, env: { ...sb.env(), LEAK_FILE: ctlLeak }, encoding: 'utf8', timeout: 120000 });
  assert.equal(ctl.status, 0, ctl.stderr);
  const ctlPid = Number(fs.readFileSync(ctlLeak, 'utf8'));
  leaked.push(ctlPid);
  assert.equal(alive(ctlPid), true, 'control: the leaked pid should outlive plain jest');
  process.kill(ctlPid, 'SIGKILL');
  // under the queue
  const qLeak = path.join(proj, 'leak-queue.txt');
  const g = sb.gate(['--peak-mb', '1000', '--label', 'jest'], null, { argv: jestArgv, cwd: proj, env: sb.env({ LEAK_FILE: qLeak }) });
  await g.done;
  const qPid = Number(fs.readFileSync(qLeak, 'utf8'));
  leaked.push(qPid);
  assert.equal(g.code, 0, g.err);
  assert.equal(g.result().outcome, 'GATE_QUEUE_RAN');
  assert.match(g.err, /Tests:\s+1 passed, 1 total/);
  assert.match(g.err, /\[gate-queue\] released seq=1 exit=0 cleaned=1/);
  assert.equal(alive(qPid), false, 'under the queue the leaked pid must answer ESRCH');
  t.diagnostic('control leaked pid ' + ctlPid + ' was alive after jest; under the queue pid ' + qPid + ' answers ESRCH; ' + g.lines().find((l) => l.includes('released')));
});
