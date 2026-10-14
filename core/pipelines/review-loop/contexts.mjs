// Author (reviewer), runner and builder must be three distinct contexts per round (PRD D22).
import { fail } from './errors.mjs';

export function assertSeparate(contexts) {
  const c = contexts || {};
  const roles = ['reviewer', 'runner', 'builder'];
  const ids = roles.map((r) => c[r]);
  if (ids.some((x) => typeof x !== 'string' || !x)) throw fail('CONTEXT_NOT_SEPARATE', 1, { reason: 'a context id is missing', contexts: c });
  if (new Set(ids).size !== ids.length) throw fail('CONTEXT_NOT_SEPARATE', 1, { reason: 'two roles share a context id', contexts: c });
  return true;
}
