import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './fs-atomic.mjs';
import { canonicalJson, sha256Bytes } from './hash.mjs';

export function packPath(ctx, runId) {
  return path.join(ctx.home, 'runs', runId, 'owner-pack.json');
}

// Stages only append questions; numbering is stable and duplicates by text are ignored (ruling D7).
export function packAppend(ctx, runId, questions) {
  const file = packPath(ctx, runId);
  const pack = readJsonIfExists(file) || { pack_id: null, run_id: runId, questions: [], created_at: ctx.now() };
  const added = [];
  for (const q of questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) continue;
    if (pack.questions.some((x) => x.text === q.text)) continue;
    const n = pack.questions.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    const row = {
      n,
      kind: q.kind || 'default',
      text: q.text,
      options: Array.isArray(q.options) ? q.options : [],
      recommendation: q.recommendation === undefined ? null : q.recommendation,
      default: q.default === undefined ? null : q.default,
      reversible: q.reversible === undefined ? true : !!q.reversible,
    };
    pack.questions.push(row);
    added.push(row);
  }
  if (added.length || !fs.existsSync(file)) {
    pack.pack_id = sha256Bytes(canonicalJson(pack.questions));
    atomicWriteJson(file, pack);
  }
  return added;
}
