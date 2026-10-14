import crypto from 'node:crypto';

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Recursively sort object keys. Arrays keep their order (message history is order-sensitive).
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export const toolName = (t) => (t && (t.name || (t.function && t.function.name))) || '';

// Tools sorted by name (ties broken by canonical body so the result is total).
export function canonicalTools(tools) {
  return (tools || []).map(sortKeys).sort((a, b) => {
    const na = toolName(a); const nb = toolName(b);
    if (na !== nb) return na < nb ? -1 : 1;
    const sa = JSON.stringify(a); const sb = JSON.stringify(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

export function canonicalRequest(req) {
  const r = { ...req };
  if (Array.isArray(r.tools)) r.tools = canonicalTools(r.tools);
  return sortKeys(r);
}

export const canonical = (req) => JSON.stringify(canonicalRequest(req));
export const canonicalHash = (req) => sha256(canonical(req));
