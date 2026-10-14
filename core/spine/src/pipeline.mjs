import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { parseYamlLite } from './yaml-lite.mjs';

export function pipelineDirs(ctx) {
  const dirs = [];
  if (ctx.env.DO_IT_PIPELINES) dirs.push(path.resolve(ctx.cwd, ctx.env.DO_IT_PIPELINES));
  const here = path.dirname(fileURLToPath(import.meta.url));
  dirs.push(path.join(here, '..', 'pipelines'), path.join(here, '..', '..', 'pipelines'));
  return dirs;
}

export function pipelineFile(ctx, preset) {
  for (const dir of pipelineDirs(ctx)) {
    for (const ext of ['.yaml', '.yml']) {
      const file = path.join(dir, preset + ext);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

// Preset steps in declaration order: { id, type, persona, tier, class, needs, ... }.
// Returns null when no preset file exists (the host may not ship pipelines).
export function loadPipeline(ctx, preset) {
  if (!preset) return null;
  const file = pipelineFile(ctx, preset);
  if (!file) return null;
  const doc = parseYamlLite(fs.readFileSync(file, 'utf8'));
  const raw = doc && Array.isArray(doc.steps) ? doc.steps : null;
  if (!raw) throw fail('PIPELINE_INVALID', 1, { file, message: 'a preset needs a steps list' });
  const ids = new Set();
  const steps = raw.map((s, i) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + i + ' has no id' });
    if (ids.has(s.id)) throw fail('PIPELINE_INVALID', 1, { file, message: 'duplicate step id ' + s.id });
    ids.add(s.id);
    const needs = s.needs === undefined || s.needs === null ? [] : (Array.isArray(s.needs) ? s.needs.map(String) : [String(s.needs)]);
    return { ...s, needs };
  });
  for (const s of steps) {
    for (const n of s.needs) if (!ids.has(n)) throw fail('PIPELINE_INVALID', 1, { file, message: 'step ' + s.id + ' needs unknown step ' + n });
  }
  return { file, name: doc.name || preset, steps };
}
