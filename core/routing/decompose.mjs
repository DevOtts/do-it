import { POLICY } from './tier-policy.mjs';

// plan: { slices: [{ id, paths: [...] }], estimated_saving_tokens }
// Returns { decision: inline|merged|split, reason, slices }. One writer per path (research/07 lesson 1).
export function decide(plan, opts) {
  const spawnCost = (opts && opts.spawn_cost_tokens !== undefined) ? opts.spawn_cost_tokens : POLICY.spawn_cost_tokens;
  const slices = (plan && plan.slices) || [];
  if (slices.length <= 1) {
    const paths = new Set(slices.flatMap((s) => s.paths || []));
    return { decision: 'inline', reason: paths.size <= 1 ? 'one_file' : 'single_slice', slices };
  }
  // union slices that share any path
  const parent = slices.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map();
  slices.forEach((s, i) => {
    for (const p of s.paths || []) {
      if (owner.has(p)) parent[find(i)] = find(owner.get(p));
      else owner.set(p, i);
    }
  });
  const groups = new Map();
  slices.forEach((s, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, { id: s.id, ids: [], paths: [] });
    const g = groups.get(k);
    g.ids.push(s.id);
    for (const p of s.paths || []) if (!g.paths.includes(p)) g.paths.push(p);
  });
  const merged = [...groups.values()];
  const mergedAny = merged.length < slices.length;
  if (merged.length === 1) {
    return { decision: 'merged', reason: 'single_writer', slices: merged };
  }
  const saving = plan.estimated_saving_tokens === undefined ? 0 : plan.estimated_saving_tokens;
  if (saving < spawnCost) {
    return { decision: 'inline', reason: 'saving_below_spawn_cost', spawn_cost_tokens: spawnCost, estimated_saving_tokens: saving, slices };
  }
  return { decision: 'split', reason: mergedAny ? 'disjoint_after_single_writer_merge' : 'disjoint_saving_above_spawn_cost', spawn_cost_tokens: spawnCost, estimated_saving_tokens: saving, slices: merged };
}
