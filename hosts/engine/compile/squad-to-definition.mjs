#!/usr/bin/env node
// squad.yaml -> Engine pipeline_definition (D2, D3). Lossless: every field Engine has no slot for
// travels in the step's reserved `x_do_it` block. The Engine field names below are ASSUMED from
// research/06 section 1 until T-N1-18 reads a definition back from a real Engine.
// Usage: node squad-to-definition.mjs SQUAD.yaml [--out FILE]   exit 0 ok, 1 compile error
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../../../core/pipelines/yaml-lite.mjs';
import { canonical, canonicalJson } from './canon.mjs';
import { CompileError } from './errors.mjs';
import { assertGuards, PERSONA_DENY, TIERS } from './guards.mjs';
import { assertRosterMatches, deriveRoster } from './roster.mjs';

export const DEFINITION_SCHEMA = 'engine.pipeline_definition/1';
export const MIN_ROUTE_CONFIDENCE = 0.7;
const PASS = new Set(['id', 'type', 'persona', 'tier', 'needs', 'consumes_previous', 'eval_veto', 'eval_max_retries']);
const TOP = new Set(['squad', 'version', 'conductor', 'steps', 'routes', 'roster']);

export function loadSquad(file) {
  const text = readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
}

function compileStep(s) {
  const x = {};
  const out = { id: s.id };
  for (const [k, v] of Object.entries(s)) if (!PASS.has(k) && k !== 'capability' && k !== 'deny') x[k] = v;
  if (s.type === 'persona') out.type = 'persona';
  else if (s.type === 'decision') out.type = 'decision';
  else if (s.type === 'checkpoint') { out.type = 'checkpoint'; out.surface = 'mission_control_card'; }
  else { // code: render or publish through an installed capability
    out.type = s.capability === 'publish' ? 'publish' : 'render';
    x.capability = s.capability ?? null;
  }
  if (s.persona !== undefined) out.persona = s.persona;
  if (s.tier !== undefined) out.model_tier = TIERS[s.tier];
  if (s.needs !== undefined) out.needs = s.needs;
  if (s.consumes_previous !== undefined) out.consumes_previous = s.consumes_previous;
  if (s.eval_veto !== undefined || s.eval_max_retries !== undefined) {
    out.eval = {};
    if (s.eval_veto !== undefined) out.eval.veto = s.eval_veto;
    if (s.eval_max_retries !== undefined) out.eval.max_retries = s.eval_max_retries;
  }
  if (s.type === 'persona') {
    if (s.deny !== undefined) x.deny = s.deny;
    out.deny = [...new Set([...PERSONA_DENY, ...(s.deny || [])])].sort();
  }
  if (Object.keys(x).length) out.x_do_it = x;
  return out;
}

export function compileSquad(squad) {
  assertGuards(squad);
  assertRosterMatches(squad);
  const def = { schema: DEFINITION_SCHEMA, name: squad.squad, version: squad.version, conductor: squad.conductor, steps: (squad.steps || []).map(compileStep) };
  if (squad.routes) {
    def.router = { min_confidence: MIN_ROUTE_CONFIDENCE, work_types: squad.routes.map((r) => ({ ...r })) };
  }
  const extra = {};
  for (const [k, v] of Object.entries(squad)) if (!TOP.has(k)) extra[k] = v;
  if (Object.keys(extra).length) def.x_do_it = extra;
  for (const k of Object.keys(def)) if (def[k] === undefined) delete def[k];
  return canonical(def);
}

export { deriveRoster };

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  const oi = argv.indexOf('--out');
  try {
    if (!file) throw new CompileError('USAGE', 'squad file required');
    const def = compileSquad(loadSquad(file));
    const text = JSON.stringify(def, null, 2) + '\n';
    if (oi >= 0) { mkdirSync(dirname(argv[oi + 1]), { recursive: true }); writeFileSync(argv[oi + 1], text); } else process.stdout.write(text);
  } catch (e) {
    if (!(e instanceof CompileError)) throw e;
    console.error(e.message);
    process.exitCode = e.exit;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
