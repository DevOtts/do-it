import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { redactText } from './redact.mjs';

export const TMP_PATTERN = /\.tmp-\d+-[0-9a-f]{8}$/;

// temp file in the same directory, fsync, rename. opts.faultAfterTmp is the
// DO_IT_FAULT=after_tmp test hook: stop after the temp file is durable.
export function atomicWrite(file, data, opts) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, typeof data === 'string' ? redactText(data) : data);
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
  fs.appendFileSync(file, redactText(line) + '\n');
}

// CP-03 R5-S1-M10: a FIFO, a device or an endless file must never hang the spine. readRegularFile reads only a
// regular file, at most `cap` bytes. opts.noFollow refuses a symlink outright (lstat; the session registry
// never follows one); otherwise a symlink is followed but must still end at a regular file.
// Errors carry a code (ENOENT, ENOTREG, EFBIG, ...) and never quote the file's content.
export const REGISTRY_READ_CAP = 64 * 1024;
export const STATE_READ_CAP = 16 * 1024 * 1024;

function fileKind(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFIFO()) return 'fifo';
  if (st.isDirectory()) return 'directory';
  if (st.isSocket()) return 'socket';
  if (st.isCharacterDevice() || st.isBlockDevice()) return 'device';
  return 'other';
}

function codedError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export function readRegularFile(file, cap, opts) {
  const st = opts && opts.noFollow ? fs.lstatSync(file) : fs.statSync(file);
  if (!st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  if (st.size > cap) throw codedError('EFBIG', 'larger than ' + cap + ' bytes: ' + file);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0) | (opts && opts.noFollow ? (fs.constants.O_NOFOLLOW || 0) : 0);
  const fd = fs.openSync(file, flags);
  try {
    if (!fs.fstatSync(fd).isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    const buf = Buffer.alloc(Math.min(cap, Math.max(st.size, 0)) + 1);
    let n = 0;
    for (;;) {
      const got = fs.readSync(fd, buf, n, buf.length - n, null);
      if (!got) break;
      n += got;
      if (n > cap) throw codedError('EFBIG', 'larger than ' + cap + ' bytes: ' + file);
      if (n === buf.length) break;
    }
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

// JSON from a regular file; a parse error is reported without the file's content.
export function readJsonRegular(file, cap, opts) {
  let bytes;
  try { bytes = readRegularFile(file, cap, opts); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw codedError('EJSON', 'not valid JSON: ' + file); }
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
