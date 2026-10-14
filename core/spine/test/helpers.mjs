import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliMain } from '../src/cli.mjs';
import { sha256Bytes } from '../src/hash.mjs';

export const SPINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE_DIR = path.resolve(SPINE_DIR, '..');
export const BIN = path.join(SPINE_DIR, 'do-it.mjs');
export { sha256Bytes };

// Always test the freshly built single file.
cp.execFileSync(process.execPath, [path.join(SPINE_DIR, 'build.mjs')], { stdio: 'ignore' });

export function tmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function baseEnv(home, extra) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
  env.HOME = home;
  env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  return { ...env, ...(extra || {}) };
}

export function mkRepo(opts) {
  const dir = tmp('dit-repo-');
  const home = tmp('dit-home-');
  cp.execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  const env = baseEnv(home);
  cp.execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir, env });
  cp.execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, env });
  if (opts && opts.commit) {
    fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
    cp.execFileSync('git', ['add', '-A'], { cwd: dir, env });
    cp.execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env });
  }
  return { dir, home, env, doIt: path.join(dir, '.do-it') };
}

function parseLast(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

// REAL: spawn the built single file.
export function real(repo, argv, extraEnv, cwd) {
  const r = cp.spawnSync(process.execPath, [BIN, ...argv, '--json'], {
    cwd: cwd || repo.dir,
    env: { ...repo.env, ...(extraEnv || {}) },
    encoding: 'utf8',
  });
  return { code: r.status, out: parseLast(r.stdout), stdout: r.stdout, stderr: r.stderr };
}

// Unit: call the source entry in-process.
export function unit(repo, argv, extraEnv, cwd) {
  const r = cliMain([...argv, '--json'], { cwd: cwd || repo.dir, env: { ...repo.env, ...(extraEnv || {}) } });
  return { code: r.exit, out: parseLast(r.stdout), stdout: r.stdout, stderr: '' };
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function sha(file) {
  return sha256Bytes(fs.readFileSync(file));
}

export function startRun(repo, runner, extra) {
  const r = (runner || real)(repo, ['start', '--preset', 'feature', '--request', 'ship W0', ...(extra || [])]);
  if (r.code !== 0) throw new Error('start failed: ' + r.stdout);
  return r.out.run_id;
}

export function runDirOf(repo, runId) {
  return path.join(repo.doIt, 'runs', runId);
}
