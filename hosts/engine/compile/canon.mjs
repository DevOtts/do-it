// Canonical forms for the round trip (D3): sorted keys, stable JSON, sha256, and a YAML writer for the
// yaml-lite subset (top-level scalars, lists of flat maps, inline lists) so decompile output re-parses equal.
import { createHash } from 'node:crypto';

export function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canonical(v[k]);
    return o;
  }
  return v;
}
export const canonicalJson = (v) => JSON.stringify(canonical(v));
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const canonicalHash = (v) => sha256(canonicalJson(v));

const PLAIN = /^[A-Za-z_][\w./@-]*$/;
function yScalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return '[' + v.map(yScalar).join(', ') + ']';
  const s = String(v);
  if (typeof v === 'object') throw new Error('yaml writer: nested map not supported in the squad subset');
  if (['true', 'false', 'null', '~'].includes(s) || !PLAIN.test(s)) return s.includes('"') ? `'${s}'` : `"${s}"`;
  return s;
}
const orderKeys = (o) => Object.keys(o).sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a < b ? -1 : a > b ? 1 : 0));

export function toYaml(doc) {
  const out = [];
  for (const k of Object.keys(doc).sort()) {
    const v = doc[k];
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      out.push(`${k}:`);
      for (const item of v) {
        orderKeys(item).forEach((ik, i) => out.push(`${i === 0 ? '  - ' : '    '}${ik}: ${yScalar(item[ik])}`));
      }
    } else out.push(`${k}: ${yScalar(v)}`);
  }
  return out.join('\n') + '\n';
}
