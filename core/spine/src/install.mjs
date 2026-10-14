import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { atomicWrite, atomicWriteJson } from './fs-atomic.mjs';
import { sha256File } from './hash.mjs';
import { DO_IT_VERSION } from './version.mjs';

export function installSource() {
  const self = fileURLToPath(import.meta.url);
  if (path.basename(self) === 'do-it.mjs') return self;
  return path.join(path.dirname(self), '..', 'do-it.mjs');
}

export function cmdInstall(ctx) {
  const source = installSource();
  if (!fs.existsSync(source)) throw fail('INSTALL_NO_BUILD', 1, { message: 'run node core/spine/build.mjs first', source });
  const binDir = ctx.env.DO_IT_BIN_DIR ? path.resolve(ctx.cwd, ctx.env.DO_IT_BIN_DIR) : path.join(ctx.userHome, '.do-it', 'bin');
  const dest = path.join(binDir, 'do-it');
  fs.mkdirSync(binDir, { recursive: true });
  atomicWrite(dest, fs.readFileSync(source));
  fs.chmodSync(dest, 0o755);
  let printed = '';
  try {
    printed = cp.execFileSync(process.execPath, [dest, '--version'], { encoding: 'utf8', env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw fail('INSTALL_VERIFY_FAILED', 1, { dest, message: 'installed file did not run: ' + e.message });
  }
  if (printed !== DO_IT_VERSION) throw fail('INSTALL_VERIFY_FAILED', 1, { dest, printed, expected: DO_IT_VERSION });
  return { outcome: 'INSTALLED', exit: 0, bin_dir: binDir, path: dest, version: printed, sha256: sha256File(dest) };
}

function loadCompanions(ctx) {
  const candidates = [
    path.join(path.dirname(installSource()), '..', 'companions.json'),
    path.join(ctx.root, 'core', 'companions.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  throw fail('INSTALL_NO_COMPANIONS', 1, { message: 'core/companions.json not found', tried: candidates });
}

// Fallback for hosts without a plugin manifest: one `npx skills add` per
// required companion, in order, recorded per host so a re-run installs only the
// missing ones. Stops at the first failure (PARTIAL_FAILURE).
export function cmdInstallCompanions(ctx, args) {
  const host = args.flags.host;
  const dry = !!args.flags['dry-run'];
  const required = loadCompanions(ctx).companions.filter((c) => c.required);
  const stateFile = path.join(ctx.home, 'companions-installed.json');
  let done = {};
  try { done = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { done = {}; }
  const have = new Set(done[host] || []);
  const cmdOf = (c) => ['skills', 'add', c.repo, '-a', host];
  const todo = required.filter((c) => !have.has(c.name));
  const finished = required.filter((c) => have.has(c.name)).map((c) => c.name);
  if (dry) {
    return { outcome: 'INSTALL_DRY_RUN', exit: 0, host, lines: todo.map((c) => 'npx ' + cmdOf(c).join(' ')) };
  }
  for (const c of todo) {
    const r = cp.spawnSync('npx', cmdOf(c), { encoding: 'utf8', env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) {
      return {
        outcome: 'PARTIAL_FAILURE',
        exit: 1,
        host,
        failed: c.name,
        finished,
        missing: todo.slice(todo.indexOf(c)).map((x) => x.name),
        message: ((r.stderr || '') + (r.error ? String(r.error.message) : '')).trim(),
      };
    }
    finished.push(c.name);
    done[host] = finished.slice();
    atomicWriteJson(stateFile, done);
  }
  return { outcome: 'INSTALLED_COMPANIONS', exit: 0, host, finished, missing: [] };
}
