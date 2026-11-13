import path from 'node:path';
import { REGISTRY_READ_CAP, readRegularFile } from '../../spine/src/fs-atomic.mjs';

// Secrets driver `file` (D16): one file per credential under the ref directory
// (default `.secrets/`). Returns { ok, value, length } or { ok: false, detail }.
// The value is for the in-memory redaction set only and is never written.
export function secretsFileResolve(name, ref, ctx) {
  const dir = path.resolve(ctx.repo, typeof ref === 'string' && ref ? ref : '.secrets/');
  const file = path.resolve(dir, name);
  const rel = path.relative(dir, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, detail: 'name_outside_ref' };
  let text;
  // CP-03 R7-S1-L6: a FIFO or a device at .secrets/<name> is refused at once, never read (a raw read hung)
  try { text = readRegularFile(file, REGISTRY_READ_CAP).toString('utf8'); } catch (e) {
    return { ok: false, detail: e && e.code && e.code !== 'ENOENT' ? 'file_unreadable' : 'file_missing' };
  }
  const value = text.replace(/\r?\n$/, '');
  if (!value) return { ok: false, detail: 'file_empty' };
  return { ok: true, value, length: value.length };
}
