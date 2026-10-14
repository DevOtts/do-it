// Reference gate for the reconcile-it catalog section: the state-file schema check and the apply approval gate.
// scan and plan are read-only; apply refuses without --approved (exit 2, nothing deleted).
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { validate } from './mini-schema.mjs';

export const PHASES = ['scan', 'plan', 'await_approval', 'apply', 'done'];
export const STATE_SCHEMA = {
  type: 'object',
  required: ['phase', 'inventory', 'dispositions', 'approved_at'],
  properties: {
    phase: { enum: PHASES },
    inventory: { type: 'array' },
    dispositions: { type: 'array', items: { type: 'object', required: ['ref', 'action'], properties: { ref: { type: 'string', minLength: 1 }, action: { enum: ['delete-landed', 'archive-superseded', 'keep-in-flight', 'rescue-wip', 'review'] } } } },
    approved_at: { type: ['string', 'null'] },
  },
};

export function checkState(state) {
  const errs = validate(STATE_SCHEMA, state);
  if (state && state.phase === 'apply' && !state.approved_at) errs.push('$.phase: apply requires approved_at (fail closed)');
  return errs;
}

// argv-style entry: apply(argv, statePath, deletable[]) -> {exit, deleted[]}
export function apply(argv, statePath, deletable) {
  if (!argv.includes('--approved')) return { exit: 2, deleted: [], message: 'apply requires --approved' };
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const errs = checkState({ ...state, phase: 'apply' });
  if (errs.length) return { exit: 2, deleted: [], message: errs.join('; ') };
  const deleted = [];
  for (const p of deletable) if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); deleted.push(p); }
  return { exit: 0, deleted };
}
