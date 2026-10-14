// Minimal YAML subset reader for pipeline presets and persona frontmatter. Zero dependencies.
// Supports: `key: scalar`, `key:` + nested list of maps (`- k: v`), inline lists `[a, b]`,
// quoted strings, integers, booleans, null, and `#` comments.
export class YamlError extends Error {}

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function scalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : splitInline(inner).map(scalar);
  }
  if ((s.startsWith('"') && s.endsWith('"') && s.length > 1) || (s.startsWith("'") && s.endsWith("'") && s.length > 1)) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function splitInline(s) {
  const out = []; let cur = ''; let q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; } else if (c === '"' || c === "'") { q = c; cur += c; } else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function kv(text, lineNo) {
  const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(text.trim());
  if (!m) throw new YamlError(`line ${lineNo}: expected "key: value"`);
  return [m[1], m[2] === undefined ? undefined : scalar(m[2])];
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/).map((l, i) => ({ raw: stripComment(l).replace(/\s+$/, ''), n: i + 1 })).filter((l) => l.raw.trim() !== '');
  const doc = {};
  let i = 0;
  while (i < lines.length) {
    const { raw, n } = lines[i];
    if (/^\s/.test(raw)) throw new YamlError(`line ${n}: unexpected indent`);
    const [k, v] = kv(raw, n);
    i++;
    if (v !== undefined) { doc[k] = v; continue; }
    const list = [];
    let cur = null;
    while (i < lines.length && /^\s/.test(lines[i].raw)) {
      const t = lines[i].raw.trim();
      if (t.startsWith('- ')) {
        const [ik, iv] = kv(t.slice(2), lines[i].n);
        cur = { [ik]: iv === undefined ? null : iv };
        list.push(cur);
      } else {
        if (!cur) throw new YamlError(`line ${lines[i].n}: map entry outside a list item`);
        const [ik, iv] = kv(t, lines[i].n);
        cur[ik] = iv === undefined ? null : iv;
      }
      i++;
    }
    doc[k] = list;
  }
  return doc;
}

// Frontmatter between the first two `---` lines, flat keys only.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const l of m[1].split(/\r?\n/)) {
    const t = stripComment(l).trim();
    if (!t) continue;
    const [k, v] = kv(t, 0);
    out[k] = v === undefined ? null : v;
  }
  return out;
}
