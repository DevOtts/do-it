// Schema-to-defaults agreement for the `gates` block (T-S1-13). Pure: takes the defaults object, the schema
// and the validator, so the mutation test (T-S1-14) can run it against a mutated copy of the settings module.
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

export function gatesLeafPaths(defaults) {
  const out = [];
  const walk = (o, pre) => {
    for (const k of Object.keys(o)) {
      if (isObj(o[k])) walk(o[k], pre.concat(k)); else out.push(pre.concat(k));
    }
  };
  if (isObj(defaults && defaults.gates)) walk(defaults.gates, []);
  return out;
}

export function schemaLeafPaths(node) {
  const out = [];
  const walk = (n, pre) => {
    if (n && n.type === 'object' && n.properties) {
      for (const k of Object.keys(n.properties)) walk(n.properties[k], pre.concat(k));
    } else out.push(pre);
  };
  walk(node, []);
  return out;
}

// Returns a list of problems; empty means the two agree in both directions.
export function gatesAgreement(defaults, schema, validate) {
  const problems = [];
  const gSchema = schema.properties.gates;
  const dLeaves = gatesLeafPaths(defaults).map((p) => p.join('.'));
  const sLeaves = schemaLeafPaths(gSchema).map((p) => p.join('.'));
  for (const d of dLeaves) if (!sLeaves.includes(d)) problems.push('default leaf without schema property: ' + d);
  for (const s of sLeaves) if (!dLeaves.includes(s)) problems.push('schema property without default leaf: ' + s);
  for (const p of gatesLeafPaths(defaults)) {
    let node = gSchema; let val = defaults.gates;
    for (const k of p) { node = node && node.properties && node.properties[k]; val = val && val[k]; }
    if (!node) continue;
    for (const e of validate(node, val, '/gates/' + p.join('/'))) problems.push('default does not validate: ' + e.pointer + ' ' + e.message);
  }
  return problems;
}
