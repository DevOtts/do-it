// The ratchet (PRD D23): every attended FAIL becomes an existing regression test or a written reason.
// Usage: node ratchet.mjs --rows <file.json> --root <repo> [--out <result.json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluate(rows, repoRoot) {
  const root = fs.realpathSync(repoRoot);
  const open = []; const closed = [];
  for (const r of rows) {
    let ok = false; let by = null;
    if (typeof r.test_path === 'string' && r.test_path.trim()) {
      const p = path.resolve(root, r.test_path);
      if (p.startsWith(root + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile()) { ok = true; by = 'test'; }
    }
    if (!ok && typeof r.cannot_automate === 'string' && r.cannot_automate.trim()) { ok = true; by = 'reason'; }
    (ok ? closed : open).push(ok ? { id: r.id, by } : r.id);
  }
  return { open, closed, ratchet: open.length ? 'RATCHET_OPEN' : 'CLOSED', conclude: open.length ? 'refuse' : 'ok' };
}

export function writeResult(file, result) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
  const res = evaluate(JSON.parse(fs.readFileSync(opt('rows'), 'utf8')), opt('root') || process.cwd());
  if (opt('out')) writeResult(opt('out'), res);
  if (res.open.length) console.log(`RATCHET_OPEN ${res.open.join(' ')}`);
  process.exit(res.open.length ? 1 : 0);
}
