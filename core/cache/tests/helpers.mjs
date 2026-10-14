import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CACHE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(CACHE, '..', '..');
export const lib = (f) => path.join(CACHE, f);
export const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p || 'dit-p3-'));

export function cli(file, args) {
  const r = cp.spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* not json */ }
  return { code: r.status, out, stdout: r.stdout, stderr: r.stderr };
}

export function writeJson(obj, name) {
  const f = path.join(tmp(), name || 'x.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}
