import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { atomicWrite } from './fs-atomic.mjs';
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
