import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from '../routing/errors.mjs';
import { canonicalTools, sortKeys, toolName } from './canonical.mjs';

const VOLATILE = [
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
  /\b\d{2}:\d{2}:\d{2}\b/,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /\b1[5-9]\d{8}(\d{3})?\b/
];
export const findVolatile = (s) => { for (const re of VOLATILE) { const m = re.exec(s); if (m) return m; } return null; };
export const hasVolatile = (s) => findVolatile(s) !== null;

const RULE_OF = {
  volatile_content: 'stable-prefix',
  tool_order: 'deterministic-serialization',
  key_order: 'deterministic-serialization',
  tool_set_changed: 'no-tool-change',
  model_changed: 'no-model-change'
};

// First differing byte offset between two buffers, or -1 when identical.
export function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

const ser = (v) => (typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v));

function changedSpan(a, b, off) {
  let ea = a.length; let eb = b.length;
  while (ea > off && eb > off && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return [a.subarray(off, ea).toString('utf8'), b.subarray(off, eb).toString('utf8')];
}

function report(cls, block, offset, extra) {
  return { outcome: 'PREFIX_CHANGED', block, offset, class: cls, rule: RULE_OF[cls] || null, ...extra };
}

function diffBlock(block, va, vb) {
  const sa = Buffer.from(ser(va)); const sb = Buffer.from(ser(vb));
  const off = firstDiff(sa, sb);
  if (off === -1) return null;
  if (JSON.stringify(sortKeys(va)) === JSON.stringify(sortKeys(vb))) return report('key_order', block, off);
  const [ca, cb] = changedSpan(sa, sb, off);
  const cls = hasVolatile(ca) || hasVolatile(cb) ? 'volatile_content' : 'unknown';
  return report(cls, block, off);
}

function diffTools(ta, tb) {
  const sa = Buffer.from(ser(ta)); const sb = Buffer.from(ser(tb));
  const off = firstDiff(sa, sb);
  if (off === -1) return null;
  const na = ta.map(toolName); const nb = tb.map(toolName);
  const setA = JSON.stringify([...na].sort()); const setB = JSON.stringify([...nb].sort());
  if (setA !== setB || JSON.stringify(canonicalTools(ta)) !== JSON.stringify(canonicalTools(tb))) return report('tool_set_changed', 'tools', off);
  if (JSON.stringify(na) !== JSON.stringify(nb)) return report('tool_order', 'tools', off);
  return report('key_order', 'tools', off);
}

const isRequest = (o) => o && typeof o === 'object' && !Array.isArray(o) && ('messages' in o || 'system' in o || 'tools' in o || 'model' in o);

// a, b: parsed request prefixes {model, tools, system, messages}. Compared in cache order.
export function diffRequests(a, b) {
  if (a.model !== b.model) return report('model_changed', 'model', firstDiff(Buffer.from(String(a.model)), Buffer.from(String(b.model))));
  const t = diffTools(a.tools || [], b.tools || []);
  if (t) return t;
  const s = diffBlock('system', a.system, b.system);
  if (s) return s;
  const ma = a.messages || []; const mb = b.messages || [];
  const n = Math.min(ma.length, mb.length);
  return diffBlock('messages', ma.slice(0, n), mb.slice(0, n));
}

// Raw buffers or parsed requests. Returns null when identical.
export function diffPrefix(a, b) {
  if (isRequest(a) && isRequest(b)) return diffRequests(a, b);
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a)); const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  const off = firstDiff(ba, bb);
  if (off === -1) return null;
  const [ca, cb] = changedSpan(ba, bb, off);
  return report(hasVolatile(ca) || hasVolatile(cb) ? 'volatile_content' : 'unknown', 'raw', off);
}

function load(file) {
  const buf = fs.readFileSync(file);
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    if (isRequest(parsed)) return parsed;
  } catch { /* raw bytes */ }
  return buf;
}

export function comparePrefixFiles(fa, fb) {
  const d = diffPrefix(load(fa), load(fb));
  if (!d) return { outcome: 'PREFIX_STABLE' };
  throw fail('PREFIX_CHANGED', 1, (({ outcome, ...rest }) => rest)(d));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const [fa, fb] = process.argv.slice(2);
    if (!fa || !fb) throw fail('USAGE', 1, { message: 'prefix-diff <prefix-a> <prefix-b>' });
    return comparePrefixFiles(fa, fb);
  });
}
