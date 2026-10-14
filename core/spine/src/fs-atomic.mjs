import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';

export const TMP_PATTERN = /\.tmp-\d+-[0-9a-f]{8}$/;

// temp file in the same directory, fsync, rename. opts.faultAfterTmp is the
// DO_IT_FAULT=after_tmp test hook: stop after the temp file is durable.
export function atomicWrite(file, data, opts) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (opts && opts.faultAfterTmp) throw fail('FAULT_INJECTED', 1, { fault: 'after_tmp' });
  fs.renameSync(tmp, file);
  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch {
    // directory fsync is best effort
  }
}

export function atomicWriteJson(file, value, opts) {
  atomicWrite(file, JSON.stringify(value, null, 2) + '\n', opts);
}

export function appendLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n');
}

export function readJsonIfExists(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text);
}

export function cleanStaleTmp(dir) {
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    if (TMP_PATTERN.test(name)) {
      try { fs.unlinkSync(path.join(dir, name)); removed++; } catch { /* ignore */ }
    }
  }
  return removed;
}
