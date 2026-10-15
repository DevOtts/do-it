// Compiled do-it definition <-> the real Engine pipeline definition wire shape (verified against Engine PR #727).
// Engine's step DTO is a closed whitelist (n, type, question, task, persona, label, model_tier, consumes_previous, ...);
// everything else (id, needs, deny, surface, eval, x_do_it, router, schema, ...) rides in the opaque `x_do_it` blocks
// Engine stores and returns verbatim. The definition block nests as { meta, extra } and the step block as
// { id, needs, deny, surface, eval, native, x } so a do-it key can never collide with a bookkeeping key.
const NATIVE_STEP = ['type', 'persona', 'model_tier', 'consumes_previous'];
const STEP_CARRY = ['id', 'needs', 'deny', 'surface', 'eval'];
const DEF_META = ['schema', 'name', 'version', 'conductor', 'router'];

export function toNativeDefinition(def) {
  const steps = def.steps.map((s, i) => {
    const out = { n: i + 1 };
    for (const k of NATIVE_STEP) if (s[k] !== undefined) out[k] = s[k];
    out.label = s.id;
    if (s.type === 'checkpoint') out.question = s.x_do_it?.ask || s.question || s.id;
    if (s.type === 'decision') { // Engine requires a structured decision block; the do-it gate semantics stay in x_do_it
      const ask = s.x_do_it?.ask || s.question || s.id;
      out.decision = { state: ask, questions: [{ id: 'approve', kind: 'choice', prompt: ask, options: ['approve', 'reject'] }] };
    }
    const carry = {};
    const sent = {};
    for (const k of NATIVE_STEP) if (s[k] !== undefined) sent[k] = s[k];
    carry.native = sent; // Engine fills defaults (consumes_previous:false); the read-back restores what do-it sent
    for (const k of STEP_CARRY) if (s[k] !== undefined) carry[k] = s[k];
    if (s.x_do_it !== undefined) carry.x = s.x_do_it;
    out.x_do_it = carry;
    return out;
  });
  const meta = {};
  for (const k of DEF_META) if (def[k] !== undefined) meta[k] = def[k];
  const x_do_it = { meta };
  if (def.x_do_it !== undefined) x_do_it.extra = def.x_do_it;
  return { steps, x_do_it };
}

// Inverse of toNativeDefinition on a definition read back from Engine (server-added fields are ignored).
export function fromNativeDefinition(back) {
  const blk = back.x_do_it || {};
  const def = { ...(blk.meta || {}) };
  def.steps = [...(back.steps || [])].sort((a, b) => a.n - b.n).map((s) => {
    const c = s.x_do_it || {};
    const out = {};
    for (const k of STEP_CARRY) if (c[k] !== undefined) out[k] = c[k];
    Object.assign(out, c.native ?? Object.fromEntries(NATIVE_STEP.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
    if (c.x !== undefined) out.x_do_it = c.x;
    return out;
  });
  if (blk.extra !== undefined) def.x_do_it = blk.extra;
  return def;
}
