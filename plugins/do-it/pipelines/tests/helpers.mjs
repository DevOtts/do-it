import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIPELINES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE = path.resolve(PIPELINES, '..');
export const REPO = path.resolve(CORE, '..');
export const tmp = (p = 'dit-p1-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
export function run(file, args, opts = {}) {
  const r = cp.spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
