// Tiny JSON-schema subset validator (no deps): type, enum, const, required, properties, items, minItems, minLength, minimum.
// validate(schema, value) -> string[] of errors, each naming the field path.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

export function validate(schema, value, path = '$') {
  const errs = [];
  if (schema.const !== undefined && value !== schema.const) errs.push(`${path}: expected ${JSON.stringify(schema.const)} got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in [${schema.enum.join(', ')}]`);
  if (schema.type) {
    const want = [].concat(schema.type);
    const t = typeOf(value);
    const ok = want.some((w) => w === t || (w === 'number' && t === 'integer'));
    if (!ok) { errs.push(`${path}: expected type ${want.join('|')} got ${t}`); return errs; }
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of schema.required ?? []) if (!(r in value)) errs.push(`${path}: missing required field ${r}`);
    for (const [k, s] of Object.entries(schema.properties ?? {})) if (k in value) errs.push(...validate(s, value[k], `${path}.${k}`));
  }
  return errs;
}
