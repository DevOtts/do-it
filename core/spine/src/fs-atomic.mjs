import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { redactJsonValues, redactText } from './redact.mjs';

export const TMP_PATTERN = /\.tmp-\d+-[0-9a-f]{8}$/;

// temp file in the same directory, fsync, rename. opts.faultAfterTmp is the
// DO_IT_FAULT=after_tmp test hook: stop after the temp file is durable.
// CP-03 R7-S1-M14: opts.cap refuses, before anything touches disk, a write the spine could not read back
// through its own capped reader. The previous file stays intact and the error is STATE_TOO_LARGE.
export function atomicWrite(file, data, opts) {
  const buf = typeof data === 'string' ? Buffer.from(redactText(data), 'utf8') : data;
  assertWithinCap(file, buf.length, opts && opts.cap);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'w', (opts && opts.mode) || 0o666);
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
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

// JSON is redacted value by value (keys untouched, R5-S1-L3), then written as bytes so it is not redacted again.
export function jsonBytes(value) {
  return Buffer.from(JSON.stringify(redactJsonValues(value), null, 2) + '\n', 'utf8');
}

// Every JSON file the spine writes is read back through readJsonIfExists/readJsonRegular, capped at
// STATE_READ_CAP unless the caller names a tighter cap (the session registry: REGISTRY_READ_CAP).
export function atomicWriteJson(file, value, opts) {
  atomicWrite(file, jsonBytes(value), { cap: STATE_READ_CAP, ...(opts || {}) });
}

export function assertWithinCap(file, size, cap) {
  if (cap && size > cap) {
    throw fail('STATE_TOO_LARGE', 1, { file, bytes: size, cap, message: path.basename(file) + ' would be ' + size + ' bytes, above the ' + cap + '-byte read cap; nothing was written' });
  }
}

// CP-03 R6-S1-M13: every append goes through appendRegular. Opening a FIFO for writing blocks until a reader
// appears, which no timer inside the spine can break; O_NONBLOCK makes a reader-less FIFO fail with ENXIO at
// once, and anything that is not a regular file (FIFO, device, socket, directory, symlink) is refused.
export function appendRegular(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let st = null;
  try { st = fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st && !st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  const c = fs.constants;
  const flags = c.O_WRONLY | c.O_APPEND | c.O_CREAT | (c.O_NONBLOCK || 0) | (c.O_NOFOLLOW || 0);
  const fd = fs.openSync(file, flags, 0o666);
  try {
    if (!fs.fstatSync(fd).isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    const buf = Buffer.from(text, 'utf8');
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
  } finally {
    fs.closeSync(fd);
  }
}

// RTG L1 (PRD-1 D4): one O_APPEND write per record, no redaction (the bytes carry a CRC computed by the caller).
// The file must be a regular file (FIFO-safe as appendRegular). When the file's last byte is not LF (a torn tail
// left by a crash) the buffer is prefixed with LF inside the SAME write, so the fragment cannot swallow the record.
// The caller bounds the buffer size; this returns { written, expected } and never retries a short write, except
// that a short write is followed by a lone LF so the next record starts on a fresh line.
export function appendRecord(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let st = null;
  try { st = fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st && !st.isFile()) throw codedError('ENOTREG', 'not a regular file (' + fileKind(st) + '): ' + file);
  const c = fs.constants;
  const flags = c.O_RDWR | c.O_APPEND | c.O_CREAT | (c.O_NONBLOCK || 0) | (c.O_NOFOLLOW || 0);
  let fd;
  let readable = true;
  try {
    fd = fs.openSync(file, flags, 0o666);
  } catch (e) {
    // RTG V2 (T-V2-03): a write-only file (mode 0200) still takes appends; its tail cannot be read, so the torn-tail
    // repair is skipped (a torn fragment then voids at most the next line's parse, which the scan reports as corrupt).
    if (!e || e.code !== 'EACCES') throw e;
    fd = fs.openSync(file, c.O_WRONLY | c.O_APPEND | (c.O_NONBLOCK || 0) | (c.O_NOFOLLOW || 0));
    readable = false;
  }
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile()) throw codedError('ENOTREG', 'not a regular file: ' + file);
    let out = buf;
    let prefixed = false;
    if (readable && fst.size > 0) {
      const last = Buffer.alloc(1);
      const got = fs.readSync(fd, last, 0, 1, fst.size - 1);
      if (got === 1 && last[0] !== 0x0a) { out = Buffer.concat([Buffer.from('\n'), buf]); prefixed = true; }
    }
    const written = fs.writeSync(fd, out, 0, out.length);
    if (written !== out.length) { try { fs.writeSync(fd, Buffer.from('\n'), 0, 1); } catch { /* best effort */ } }
    return { written, expected: out.length, prefixed };
  } finally {
    fs.closeSync(fd);
  }
}

// RTG L1 (PRD-1 D7, D8): create `file` exactly once with `buf`: temp file (exclusive, `mode`), fsync, then link(2)
// onto the final name, so a reader never sees partial bytes and concurrent first-writers converge on one winner.
// Returns true when this call created the file, false when it already existed (left untouched).
export function writeFileOnce(file, buf, mode) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  const fd = fs.openSync(tmp, 'wx', mode === undefined ? 0o644 : mode);
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

export function appendLine(file, line) {
  appendRegular(file, redactText(line) + '\n');
}

export function appendJsonLine(file, value) {
  appendRegular(file, JSON.stringify(redactJsonValues(value)) + '\n');
}

// CP-03 R5-S1-M10: a FIFO, a device or an endless file must never hang the spine. readRegularFile reads only a
// regular file, at most `cap` bytes. opts.noFollow refuses a symlink outright (lstat; the session registry
// never follows one); otherwise a symlink is followed but must still end at a regular file.
// Errors carry a code (ENOENT, ENOTREG, EFBIG, ...) and never quote the file's content.
export const REGISTRY_READ_CAP = 64 * 1024;
export const STATE_READ_CAP = 16 * 1024 * 1024;
// CP-03 R8-S1-M15: what the spine ACCEPTS into a state (or board) it seeds leaves 1 MiB of headroom under the
// read cap, so the run's own later bookkeeping (stop refusals, signatures, statuses) never meets the cap.
// Sizes are measured as written: jsonBytes, after redaction.
export const STATE_HEADROOM = 1024 * 1024;
export const STATE_ACCEPT_CAP = STATE_READ_CAP - STATE_HEADROOM;
// files the spine hashes or copies whole (results, evidence, migrated files) and append-only logs
export const BULK_READ_CAP = 256 * 1024 * 1024;

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

// CP-03 R6-S1-M13: the spine reads no file but through readRegularFile (a source lint holds this).
export function readText(file, cap) {
  return readRegularFile(file, cap || STATE_READ_CAP).toString('utf8');
}

// null when absent; a parse error is a SyntaxError as before; a FIFO or a device is ENOTREG, never a hang.
export function readJsonIfExists(file) {
  let text;
  try {
    text = readText(file, STATE_READ_CAP);
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
