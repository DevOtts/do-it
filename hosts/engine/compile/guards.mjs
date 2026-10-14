// Compile-time guards (D8, D9): flat squad, one router level, only code publishes, closed step-type set.
import { CompileError } from './errors.mjs';

export const STEP_TYPES = ['persona', 'checkpoint', 'decision', 'code'];
export const NESTED_TYPES = ['delegate_squad', 'spawn_squad', 'squad'];
export const PERSONA_DENY = ['spawn_squad', 'deploy'];
export const CODE_CAPABILITIES = ['render', 'publish'];
export const TIERS = { T1: 'powerful', T2: 'balanced', T3: 'cheap' };

const publishes = (s) => s.capability === 'publish' || (Array.isArray(s.capabilities) && s.capabilities.includes('publish'));

export function assertGuards(squad) {
  const steps = squad.steps || [];
  for (const s of steps) {
    if (NESTED_TYPES.includes(s.type) || s.squad !== undefined || s.delegate_squad !== undefined) {
      throw new CompileError('NESTED_SQUAD_FORBIDDEN', `step ${s.id} spawns a squad`, { step: s.id });
    }
  }
  for (const r of squad.routes || []) {
    if (r.router !== undefined || r.routes !== undefined) {
      throw new CompileError('ROUTER_DEPTH_EXCEEDED', `route ${r.work_type} holds another router`, { work_type: r.work_type });
    }
  }
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    if (!STEP_TYPES.includes(s.type)) throw new CompileError('UNKNOWN_STEP_TYPE', `step ${s.id} has type ${JSON.stringify(s.type)}`, { step: s.id, type: s.type });
    if (s.type !== 'code' && s.type !== 'checkpoint' && publishes(s)) {
      throw new CompileError('PERSONA_CANNOT_PUBLISH', `step ${s.id} (${s.type}) lists a publish capability; only a code step publishes`, { step: s.id });
    }
    if (s.type === 'checkpoint' && publishes(s)) throw new CompileError('PERSONA_CANNOT_PUBLISH', `checkpoint ${s.id} cannot publish`, { step: s.id });
    if (s.type === 'code' && s.capability !== undefined && !CODE_CAPABILITIES.includes(s.capability)) {
      throw new CompileError('UNKNOWN_CAPABILITY', `code step ${s.id} capability ${JSON.stringify(s.capability)}`, { step: s.id });
    }
    if (s.tier !== undefined && !TIERS[s.tier]) throw new CompileError('UNKNOWN_TIER', `step ${s.id} tier ${JSON.stringify(s.tier)}`, { step: s.id });
  }
  for (const r of squad.routes || []) {
    for (const id of r.steps || []) if (!ids.has(id)) throw new CompileError('UNKNOWN_ROUTE_STEP', `route ${r.work_type} names step ${id}`, { work_type: r.work_type, step: id });
  }
}
