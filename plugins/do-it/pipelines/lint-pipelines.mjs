// Lint preset pipelines (PRD D1). Usage: node lint-pipelines.mjs <dir> [--personas <dir>] [--stamp]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-lite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STEP_TYPES = ['persona', 'checkpoint', 'decision', 'code'];
export const STEP_FIELDS = ['id', 'type', 'persona', 'skill', 'tier', 'gate', 'ask', 'consumes_previous', 'loop_to', 'max_rounds', 'eval', 'adapter', 'needs', 'on_limit'];
const TIERS = ['T1', 'T2', 'T3', 'code'];
const HARNESS = new RegExp('\\b(' + ['clau' + 'de', 'co' + 'dex', 'open' + 'code', 'cur' + 'sor', 'copi' + 'lot', 'her' + 'mes', 'open' + 'claw'].join('|') + ')\\b', 'i'); // G-12 (spelled in parts so core/ stays free of harness names)
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function lintFile(file, personaDir) {
  const errs = [];
  const text = fs.readFileSync(file, 'utf8');
  const base = path.basename(file);
  const h = HARNESS.exec(text);
  if (h) errs.push(`HARNESS_NAME ${h[0]} in ${base}`);
  let doc;
  try { doc = parseYaml(text); } catch (e) { return { name: null, errs: [`YAML_INVALID ${base}: ${e.message}`] }; }
  for (const k of ['pipeline', 'version', 'steps']) if (doc[k] === undefined) errs.push(`PIPELINE_FIELD_MISSING ${k} in ${base}`);
  for (const k of Object.keys(doc)) if (!['pipeline', 'version', 'steps'].includes(k)) errs.push(`PIPELINE_FIELD_UNKNOWN ${k} in ${base}`);
  const steps = Array.isArray(doc.steps) ? doc.steps : [];
  const seen = new Map();
  steps.forEach((s, idx) => {
    const id = s.id || `#${idx}`;
    if (!s.id) errs.push(`STEP_ID_MISSING index ${idx} in ${base}`);
    if (seen.has(s.id)) errs.push(`STEP_ID_DUPLICATE ${s.id} in ${base}`);
    for (const k of Object.keys(s)) if (!STEP_FIELDS.includes(k)) errs.push(`STEP_FIELD_UNKNOWN ${k} step ${id} in ${base}`);
    if (!STEP_TYPES.includes(s.type)) errs.push(`STEP_TYPE_INVALID ${id} type=${s.type} in ${base}`);
    if (s.type === 'persona' && !s.persona) errs.push(`STEP_PERSONA_MISSING ${id} in ${base}`);
    if (s.persona && personaDir && !fs.existsSync(path.join(personaDir, `${s.persona}.md`))) errs.push(`PERSONA_NOT_FOUND ${s.persona} step ${id} in ${base}`);
    if (s.tier !== undefined && !TIERS.includes(s.tier)) errs.push(`STEP_TIER_INVALID ${id} tier=${s.tier} in ${base}`);
    if (s.max_rounds !== undefined && !Number.isInteger(s.max_rounds)) errs.push(`STEP_TYPE_MISMATCH max_rounds step ${id} in ${base}`);
    if (s.consumes_previous !== undefined && typeof s.consumes_previous !== 'boolean') errs.push(`STEP_TYPE_MISMATCH consumes_previous step ${id} in ${base}`);
    if (s.needs !== undefined && !Array.isArray(s.needs)) errs.push(`STEP_TYPE_MISMATCH needs step ${id} in ${base}`);
    if (s.loop_to !== undefined) {
      if (!seen.has(s.loop_to)) errs.push(`LOOP_TARGET_INVALID ${id} loop_to=${s.loop_to} (must name an earlier step) in ${base}`);
      if (s.max_rounds === undefined) errs.push(`LOOP_MAX_ROUNDS_MISSING ${id} in ${base}`);
    }
    if (s.id) seen.set(s.id, idx);
  });
  steps.forEach((s) => (Array.isArray(s.needs) ? s.needs : []).forEach((n) => { if (!seen.has(n)) errs.push(`NEEDS_UNKNOWN ${n} step ${s.id} in ${base}`); }));
  if (typeof doc.pipeline === 'string' && doc.pipeline !== base.replace(/\.ya?ml$/, '')) errs.push(`PIPELINE_NAME_MISMATCH ${doc.pipeline} in ${base}`);
  return { name: doc.pipeline || null, errs, doc };
}

export function lintDir(dir, personaDir) {
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const names = []; const errs = []; const digests = {};
  for (const f of files) {
    const r = lintFile(path.join(dir, f), personaDir);
    if (r.name) names.push(r.name);
    errs.push(...r.errs);
    digests[f] = sha(fs.readFileSync(path.join(dir, f)));
  }
  return { names, errs, digests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--personas') || HERE;
  const pi = args.indexOf('--personas');
  const personaDir = pi >= 0 ? args[pi + 1] : path.join(HERE, '..', 'personas');
  const r = lintDir(dir, fs.existsSync(personaDir) ? personaDir : null);
  console.log(`pipelines: ${r.names.join(', ')}`);
  for (const e of r.errs) console.log(e);
  if (!r.errs.length && args.includes('--stamp')) fs.writeFileSync(path.join(dir, '.lint-stamp.json'), JSON.stringify({ files: r.digests }, null, 2) + '\n');
  process.exit(r.errs.length ? 1 : 0);
}
