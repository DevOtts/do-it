// Build an Agent tool request with a per-spawn model from tiers.json (G-4). The Agent tool is only
// callable by the conductor model, so the adapter builds the request; it never runs the child itself.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TIERS_PATH = join(HERE, '..', 'tiers.json');
export const loadTiers = (path = TIERS_PATH) => JSON.parse(readFileSync(path, 'utf8'));

export function buildSpawn({ role, tier, brief = '', reason = '' } = {}, tiers = loadTiers()) {
  const map = tiers.tiers || {};
  if (!tier || !map[tier]) return { outcome: 'UNTIERED_SPAWN', reason: tier ? `unknown tier ${tier}` : 'no tier named' };
  let effective = tier;
  const event = { type: 'spawn', role };
  if (tier === 'T1' && !String(reason).trim()) {
    effective = 'T2';
    event.downgraded_from = 'T1';
  }
  const model = map[effective];
  event.tier = effective;
  event.model = model;
  return {
    outcome: 'ok',
    tier: effective,
    model,
    request: { tool: 'Agent', input: { description: role, subagent_type: 'general-purpose', model, prompt: brief } },
    event,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const r = buildSpawn({ role: get('--role'), tier: get('--tier'), reason: get('--reason') || '', brief: get('--brief') || '' },
    loadTiers(get('--tiers') || TIERS_PATH));
  console.log(JSON.stringify(r));
  process.exit(r.outcome === 'ok' ? 0 : 1);
}
