#!/usr/bin/env node
// Engine pipeline_definition -> squad.yaml (inverse of squad-to-definition). Canonical key order so the
// round trip compares byte equal after canonicalisation (D3, T-N1-01).
// Usage: node definition-to-squad.mjs DEFINITION.json [--out FILE]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, toYaml } from './canon.mjs';

const BACK = { persona: 'persona', decision: 'decision', checkpoint: 'checkpoint', render: 'code', publish: 'code' };

function decompileStep(s) {
  const x = s.x_do_it || {};
  const out = { id: s.id, type: BACK[s.type] };
  if (s.persona !== undefined) out.persona = s.persona;
  if (s.model_tier !== undefined) out.tier = Object.entries({ T1: 'powerful', T2: 'balanced', T3: 'cheap' }).find(([, v]) => v === s.model_tier)?.[0];
  if (s.needs !== undefined) out.needs = s.needs;
  if (s.consumes_previous !== undefined) out.consumes_previous = s.consumes_previous;
  if (s.eval?.veto !== undefined) out.eval_veto = s.eval.veto;
  if (s.eval?.max_retries !== undefined) out.eval_max_retries = s.eval.max_retries;
  for (const [k, v] of Object.entries(x)) {
    if (k === 'capability') { if (v !== null) out.capability = v; } else out[k] = v;
  }
  return out;
}

export function decompileDefinition(def) {
  const squad = { squad: def.name, version: def.version, conductor: def.conductor, steps: def.steps.map(decompileStep) };
  if (def.router) squad.routes = def.router.work_types.map((r) => ({ ...r }));
  Object.assign(squad, def.x_do_it || {});
  for (const k of Object.keys(squad)) if (squad[k] === undefined) delete squad[k];
  return canonical(squad);
}
export const decompileToYaml = (def) => toYaml(decompileDefinition(def));

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  const oi = argv.indexOf('--out');
  const text = decompileToYaml(JSON.parse(readFileSync(file, 'utf8')));
  if (oi >= 0) { mkdirSync(dirname(argv[oi + 1]), { recursive: true }); writeFileSync(argv[oi + 1], text); } else process.stdout.write(text);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
