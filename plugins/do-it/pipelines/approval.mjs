// Reconcile approval guard (PRD D2, T-P1-18). Apply needs an approval record; the pipeline order is checked too.
// Usage: node approval.mjs check-order <reconcile.yaml> | node approval.mjs apply --approval <file>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-lite.mjs';

// A decision step with an owner ask must precede the first code step whose id is apply.
export function checkOrder(file) {
  const steps = parseYaml(fs.readFileSync(file, 'utf8')).steps || [];
  const apply = steps.findIndex((s) => s.type === 'code' && /apply/.test(s.id));
  if (apply < 0) return { ok: false, reason: 'no apply code step' };
  const dec = steps.findIndex((s) => s.type === 'decision' && s.ask);
  return dec >= 0 && dec < apply ? { ok: true, decision: steps[dec].id, apply: steps[apply].id } : { ok: false, reason: 'no owner decision before apply' };
}

export function requireApproval(file) {
  if (!file || !fs.existsSync(file)) return false;
  try { const a = JSON.parse(fs.readFileSync(file, 'utf8')); return a.approved === true && typeof a.by === 'string' && a.by.length > 0; } catch { return false; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === 'check-order') {
    const r = checkOrder(a[1]); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1);
  } else if (a[0] === 'apply') {
    const i = a.indexOf('--approval');
    if (!requireApproval(i >= 0 ? a[i + 1] : null)) { console.log('APPROVAL_REQUIRED'); process.exit(3); }
    console.log('apply: approved'); process.exit(0);
  } else process.exit(1);
}
