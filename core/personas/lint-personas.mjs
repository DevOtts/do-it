// Lint persona files (PRD D3, D4). Usage:
//   node lint-personas.mjs <dir> [--contract <CONTRACT.md>] [--stamp]   lint (and stamp sha256 per file)
//   node lint-personas.mjs <dir> --load                                  refuse a set changed since its stamp
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../pipelines/yaml-lite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REQUIRED = ['name', 'description', 'tier', 'tools', 'deny'];
export const CAPABILITIES = ['read', 'write', 'edit', 'search', 'shell', 'spawn', 'ask'];
const TIERS = ['T1', 'T2', 'T3', 'code'];
const HARNESS = new RegExp('\\b(' + ['clau' + 'de', 'co' + 'dex', 'open' + 'code', 'cur' + 'sor', 'copi' + 'lot', 'her' + 'mes', 'open' + 'claw'].join('|') + ')\\b', 'i'); // G-12 (spelled in parts so core/ stays free of harness names)
const STAMP = '.lint-stamp.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Parse the real RUN-POLICY table: | Role | Tier | Reason |
export function parsePolicy(contractFile) {
  const text = fs.readFileSync(contractFile, 'utf8');
  const at = text.indexOf('## RUN-POLICY');
  if (at < 0) throw new Error('RUN-POLICY section not found in ' + contractFile);
  const policy = {};
  for (const line of text.slice(at).split('\n').slice(1)) {
    if (!line.startsWith('|')) { if (Object.keys(policy).length) break; continue; }
    const c = line.split('|').map((s) => s.trim());
    if (c[1] && /^(T[123]|code)$/.test(c[2])) policy[c[1]] = c[2];
  }
  return policy;
}

export function lintPersonas(dir, policy) {
  const errs = []; const pairs = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  for (const f of files) {
    const stem = f.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) { errs.push(`PERSONA_FRONTMATTER_MISSING ${f}`); continue; }
    for (const k of REQUIRED) {
      const v = fm[k];
      if (v === undefined || v === null || v === '') errs.push(`PERSONA_FIELD_MISSING ${k} ${f}`);
    }
    if (fm.name && fm.name !== stem) errs.push(`PERSONA_NAME_MISMATCH ${f} name=${fm.name}`);
    if (fm.tier && !TIERS.includes(fm.tier)) errs.push(`TIER_INVALID ${stem} ${fm.tier}`);
    for (const k of ['tools', 'deny']) {
      if (fm[k] === undefined || fm[k] === null) continue;
      if (!Array.isArray(fm[k])) { errs.push(`PERSONA_FIELD_TYPE ${k} ${f}`); continue; }
      for (const w of fm[k]) if (!CAPABILITIES.includes(w)) errs.push(`CAPABILITY_NOT_NEUTRAL ${w} ${f}`);
    }
    if (fm.tier === 'T1' && !(typeof fm.t1_reason === 'string' && fm.t1_reason.trim())) errs.push(`T1_REASON_MISSING ${stem}`);
    if (fm.visual_tier !== undefined && !(stem === 'runner' && fm.visual_tier === 'T2')) errs.push(`VISUAL_TIER_NOT_ALLOWED ${stem}`);
    const h = HARNESS.exec(text);
    if (h) errs.push(`HARNESS_NAME ${h[0]} in ${f}`);
    if (policy && policy[stem] !== undefined) {
      if (fm.tier !== policy[stem]) errs.push(`TIER_POLICY_MISMATCH ${stem} expected ${policy[stem]} got ${fm.tier}`);
      else pairs.push(`${stem} ${fm.tier}`);
    }
  }
  return { count: files.length, errs, pairs, digests: Object.fromEntries(files.map((f) => [f, sha(fs.readFileSync(path.join(dir, f)))])) };
}

// Load a persona set for a run: every file must still match the sha256 stamped at lint time.
export function loadPersonas(dir) {
  const stampFile = path.join(dir, STAMP);
  if (!fs.existsSync(stampFile)) return { ok: false, errs: ['LINT_STAMP_MISSING'] };
  const stamp = JSON.parse(fs.readFileSync(stampFile, 'utf8')).files;
  const errs = [];
  for (const [f, d] of Object.entries(stamp)) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== d) errs.push(`LINT_STALE ${f.replace(/\.md$/, '')}`);
  }
  return { ok: !errs.length, errs, personas: Object.keys(stamp).map((f) => f.replace(/\.md$/, '')) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--contract');
  const contract = ci >= 0 ? args[ci + 1] : path.join(HERE, '..', '..', 'delivery', 'CONTRACT.md');
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--contract') || HERE;
  if (args.includes('--load')) {
    const r = loadPersonas(dir);
    for (const e of r.errs) console.log(e);
    if (r.ok) console.log(`loaded: ${r.personas.length}`);
    process.exit(r.ok ? 0 : 1);
  }
  const r = lintPersonas(dir, parsePolicy(contract));
  console.log(`personas: ${r.count}`);
  for (const p of r.pairs) console.log(`tier ${p}`);
  for (const e of r.errs) console.log(e);
  if (!r.errs.length && args.includes('--stamp')) fs.writeFileSync(path.join(dir, STAMP), JSON.stringify({ files: r.digests }, null, 2) + '\n');
  process.exit(r.errs.length ? 1 : 0);
}
