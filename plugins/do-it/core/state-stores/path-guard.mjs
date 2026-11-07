// Only runs/{run_id}/... is addressable (D13). Rejects '..', absolute paths, reserved names.
import { StoreError, ERR } from './interface.mjs';

const RUN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const reject = (p, why) => new StoreError(ERR.PATH_REJECTED, `path rejected (${why}): ${JSON.stringify(String(p))}`, { path: String(p), why });

function validRun(r) {
  return RUN_RE.test(r) && !r.includes('..') && !r.endsWith('.') && !r.endsWith('.lock');
}

function segments(p, allowTrailingSlash) {
  if (typeof p !== 'string' || p.length === 0) throw reject(p, 'empty');
  if (p.includes('\0')) throw reject(p, 'nul byte');
  if (p.includes('\\')) throw reject(p, 'backslash');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw reject(p, 'absolute');
  let s = p;
  if (allowTrailingSlash && s.endsWith('/')) s = s.slice(0, -1);
  const segs = s.split('/');
  for (const seg of segs) {
    if (seg === '' ) throw reject(p, 'empty segment');
    if (seg === '.' || seg === '..') throw reject(p, 'dot segment');
    if (seg === '.git' || seg.startsWith('.tmp-') || seg.endsWith('.pending')) throw reject(p, 'reserved name');
  }
  if (segs[0] !== 'runs') throw reject(p, 'outside runs/');
  return segs;
}

export function guardPath(p) {
  const segs = segments(p, false);
  if (segs.length < 3) throw reject(p, 'needs runs/{run_id}/{file}');
  if (!validRun(segs[1])) throw reject(p, 'bad run id');
  return { path: segs.join('/'), run: segs[1], rel: segs.slice(2).join('/') };
}

export function guardList(p) {
  const segs = segments(p, true);
  if (segs.length === 1) return { path: 'runs', run: null, rel: '' };
  if (!validRun(segs[1])) throw reject(p, 'bad run id');
  return { path: segs.join('/'), run: segs[1], rel: segs.slice(2).join('/') };
}
