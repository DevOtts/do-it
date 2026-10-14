import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from './hash.mjs';

export function normalizeRel(p) {
  return path.normalize(String(p)).replace(/^\.\//, '');
}

export function insideDir(real, base) {
  const rel = path.relative(base, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Evidence forms (D15): a path under the repo, `result:<file>` under runs/<id>/results/,
// or `sha256:<hex>` naming an entry in the result's artifacts[] whose file hashes to it.
// The spine re-reads the file; it never trusts mtime or the model's claim.
export function resolveEvidence(ctx, runId, evidence, artifacts) {
  if (typeof evidence !== 'string' || !evidence.trim()) return { ok: false, reason: 'empty' };
  const ev = evidence.trim();
  const arts = Array.isArray(artifacts) ? artifacts : [];
  if (ev.startsWith('sha256:')) {
    const hex = ev.slice(7).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) return { ok: false, reason: 'bad_sha256' };
    const art = arts.find((a) => a && typeof a.sha256 === 'string' && a.sha256.toLowerCase().replace(/^sha256:/, '') === hex && a.path);
    if (!art) return { ok: false, reason: 'no_matching_artifact' };
    const inner = resolveEvidence(ctx, runId, art.path, []);
    if (!inner.ok) return { ok: false, reason: 'artifact_file_' + inner.reason };
    if (inner.sha256 !== hex) return { ok: false, reason: 'artifact_hash_differs' };
    return { ...inner, kind: art.kind || null };
  }
  let abs;
  let bases;
  let stored = ev;
  if (ev.startsWith('result:')) {
    const resultsDir = path.join(ctx.home, 'runs', runId, 'results');
    abs = path.resolve(resultsDir, ev.slice(7));
    bases = [resultsDir];
  } else {
    abs = path.resolve(ctx.repo, ev);
    bases = [ctx.repo, ctx.home];
    stored = normalizeRel(ev);
  }
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  const baseReals = bases.map((b) => { try { return fs.realpathSync(b); } catch { return b; } });
  if (!baseReals.some((b) => insideDir(real, b))) return { ok: false, reason: 'outside_repo' };
  let st;
  try { st = fs.statSync(real); } catch { return { ok: false, reason: 'missing' }; }
  if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  const art = arts.find((a) => a && a.path && normalizeRel(a.path) === stored);
  return { ok: true, path: stored, abs: real, sha256: sha256File(real), mtime_ms: st.mtimeMs, kind: art ? art.kind || null : null };
}
