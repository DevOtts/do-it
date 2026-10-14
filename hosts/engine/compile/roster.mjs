// Roster is derived, never stored (D4): conductor persona, then distinct step personas in first-use order.
import { CompileError } from './errors.mjs';

export function deriveRoster(squad) {
  const out = [];
  const add = (p) => { if (typeof p === 'string' && p && !out.includes(p)) out.push(p); };
  add(squad.conductor);
  for (const s of squad.steps || []) add(s.persona);
  return out;
}

// A squad that carries its own roster is accepted only when it equals the derived one.
export function assertRosterMatches(squad) {
  if (squad.roster === undefined) return;
  const derived = deriveRoster(squad);
  const stored = Array.isArray(squad.roster) ? squad.roster : [];
  const same = stored.length === derived.length && stored.every((p) => derived.includes(p)) && derived.every((p) => stored.includes(p));
  if (!same) throw new CompileError('ROSTER_DRIFT', `stored roster [${stored.join(', ')}] differs from derived [${derived.join(', ')}]`, { stored, derived });
}
