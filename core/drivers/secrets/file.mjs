import fs from 'node:fs';
import path from 'node:path';

// Secrets driver `file` (D16): one file per credential under the ref directory
// (default `.secrets/`). Returns { ok, value, length } or { ok: false, detail }.
// The value is for the in-memory redaction set only and is never written.
export function secretsFileResolve(name, ref, ctx) {
  const dir = path.resolve(ctx.repo, typeof ref === 'string' && ref ? ref : '.secrets/');
  const file = path.resolve(dir, name);
  const rel = path.relative(dir, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, detail: 'name_outside_ref' };
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, detail: 'file_missing' }; }
  const value = text.replace(/\r?\n$/, '');
  if (!value) return { ok: false, detail: 'file_empty' };
  return { ok: true, value, length: value.length };
}
