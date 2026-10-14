// Scan an opencode config (jsonc) for inline credentials and report KEY PATHS only, never values (G-7).
// A value counts as inline when its key looks like a credential, or it holds a bearer/api-key looking string,
// and it is not a reference ({env:...}, {file:...}, ${...}, $NAME).
import { readFileSync } from 'node:fs';

const KEY_RE = /^(authorization|proxy-authorization|x-api-key|api[-_]?key|apikey|token|access[-_]?token|secret|client[-_]?secret|password|bearer)$/i;
const VALUE_RE = /(bearer\s+\S{6,}|\bsk-[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9]{8,})/i;
const REF_RE = /^\s*(\{env:[^}]+\}|\{file:[^}]+\}|\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*)\s*$|Bearer\s+(\{env:[^}]+\}|\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*)\s*$/i;

// Strip // and /* */ comments and trailing commas outside strings.
export function stripJsonc(src) {
  let out = '', i = 0, inStr = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inStr) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function scan(obj, path = '', found = []) {
  if (Array.isArray(obj)) { obj.forEach((v, i) => scan(v, `${path}[${i}]`, found)); return found; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) scan(v, path ? `${path}.${k}` : k, found);
    return found;
  }
  if (typeof obj === 'string' && obj.length) {
    const key = path.split('.').pop().replace(/\[\d+\]$/, '');
    if (!REF_RE.test(obj) && (KEY_RE.test(key) || VALUE_RE.test(obj))) found.push(path);
  }
  return found;
}

export function preflight(text) {
  return { inline: scan(JSON.parse(stripJsonc(text))) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: preflight.mjs CONFIG_FILE'); process.exit(2); }
  let r;
  try { r = preflight(readFileSync(file, 'utf8')); } catch (e) { console.error(`preflight failed: ${e.message.split('\n')[0]}`); process.exit(2); }
  for (const p of r.inline) console.log(`inline credential at ${p} (value not shown)`);
  if (!r.inline.length) console.log('no inline credentials found');
  process.exit(r.inline.length ? 1 : 0);
}
