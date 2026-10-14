import { fail } from './errors.mjs';

// YAML subset for pipeline presets (D10): block maps, block lists, scalars,
// flow lists of scalars, comments. Anything else is PIPELINE_UNSUPPORTED_YAML.
export function yamlUnsupported(line, reason) {
  return fail('PIPELINE_UNSUPPORTED_YAML', 1, { line, reason });
}

export function yamlStripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:\[,-]/.test(raw[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

export function yamlLines(text) {
  const out = [];
  const raw = String(text).split(/\r?\n/);
  let docs = 0;
  for (let i = 0; i < raw.length; i++) {
    const line = yamlStripComment(raw[i]).replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^ *\t/.test(line)) throw yamlUnsupported(i + 1, 'tab indentation');
    if (line.trim() === '---') {
      docs++;
      if (docs > 1 || out.length) throw yamlUnsupported(i + 1, 'multiple documents');
      continue;
    }
    if (line.trim() === '...') throw yamlUnsupported(i + 1, 'document end marker');
    out.push({ indent: line.match(/^ */)[0].length, text: line.trim(), n: i + 1 });
  }
  return out;
}

export function yamlSplitFlow(inner, n) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += inner[++i] || ''; } else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") { quote = c; cur += c; }
    else if (c === ',') { parts.push(cur); cur = ''; }
    else if (c === '[' || c === '{') throw yamlUnsupported(n, 'nested flow collection');
    else cur += c;
  }
  if (quote) throw yamlUnsupported(n, 'unterminated quote');
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => yamlScalar(p.trim(), n));
}

export function yamlScalar(s, n) {
  if (s === '') return null;
  const first = s[0];
  if (first === '&' || first === '*') throw yamlUnsupported(n, 'anchors and aliases');
  if (first === '!') throw yamlUnsupported(n, 'tags');
  if (first === '|' || first === '>') throw yamlUnsupported(n, 'block scalars');
  if (first === '{') {
    if (s === '{}') return {};
    throw yamlUnsupported(n, 'flow map');
  }
  if (first === '[') {
    if (s[s.length - 1] !== ']') throw yamlUnsupported(n, 'multi-line flow list');
    return yamlSplitFlow(s.slice(1, -1), n);
  }
  if (first === '"') {
    if (s.length < 2 || s[s.length - 1] !== '"') throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  if (first === "'") {
    if (s.length < 2 || s[s.length - 1] !== "'") throw yamlUnsupported(n, 'unterminated quote');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}

export function yamlKeyOf(text) {
  const m = /^("[^"]*"|'[^']*'|[^\s:"'\[\]{},#&*!|>-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!m) return null;
  let key = m[1];
  if (key[0] === '"' || key[0] === "'") key = key.slice(1, -1);
  return { key, rest: m[2] === undefined ? '' : m[2].trim() };
}

export function yamlIsItem(text) {
  return text === '-' || text.startsWith('- ');
}

export function yamlParseNode(lines, pos, indent) {
  return yamlIsItem(lines[pos.i].text) ? yamlParseList(lines, pos, indent) : yamlParseMap(lines, pos, indent);
}

export function yamlChild(lines, pos, indent, allowSameIndentList) {
  const nxt = lines[pos.i];
  if (!nxt) return null;
  if (nxt.indent > indent) return yamlParseNode(lines, pos, nxt.indent);
  if (allowSameIndentList && nxt.indent === indent && yamlIsItem(nxt.text)) return yamlParseList(lines, pos, indent);
  return null;
}

export function yamlParseMap(lines, pos, indent) {
  const out = {};
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (yamlIsItem(line.text)) break;
    const kv = yamlKeyOf(line.text);
    if (!kv) throw yamlUnsupported(line.n, 'not a key: value line');
    if (Object.prototype.hasOwnProperty.call(out, kv.key)) throw yamlUnsupported(line.n, 'duplicate key ' + kv.key);
    pos.i++;
    out[kv.key] = kv.rest === '' ? yamlChild(lines, pos, indent, true) : yamlScalar(kv.rest, line.n);
  }
  return out;
}

export function yamlParseList(lines, pos, indent) {
  const out = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw yamlUnsupported(line.n, 'unexpected indentation');
    if (!yamlIsItem(line.text)) break;
    const body = line.text === '-' ? '' : line.text.slice(2).trim();
    if (body === '') {
      pos.i++;
      out.push(yamlChild(lines, pos, indent, false));
    } else if (yamlIsItem(body)) {
      throw yamlUnsupported(line.n, 'nested inline list');
    } else if (yamlKeyOf(body) && body[0] !== '[' && body[0] !== '"' && body[0] !== "'") {
      const offset = line.text.length - body.length;
      lines[pos.i] = { indent: indent + offset, text: body, n: line.n };
      out.push(yamlParseMap(lines, pos, indent + offset));
    } else {
      pos.i++;
      out.push(yamlScalar(body, line.n));
    }
  }
  return out;
}

export function parseYamlLite(text) {
  const lines = yamlLines(text);
  if (!lines.length) return {};
  const pos = { i: 0 };
  const value = yamlParseNode(lines, pos, lines[0].indent);
  if (pos.i < lines.length) throw yamlUnsupported(lines[pos.i].n, 'unexpected content');
  return value;
}
