import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from './errors.mjs';
import { POLICY } from './tier-policy.mjs';

// Fixed section order: this ordering is what the cache lane relies on (stable prefix first).
export const SECTIONS = ['preamble', 'run_constant', 'slice'];
const estimateTokens = (chars) => Math.ceil(chars / 4);

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveRef(root, ref) {
  const abs = path.resolve(root, ref);
  let real;
  try {
    real = fs.realpathSync(abs); // follows symlinks; throws on missing or dangling
  } catch {
    throw fail('BRIEF_REF_INVALID', 1, { path: ref, message: 'path does not exist' });
  }
  if (!isInside(root, real)) throw fail('BRIEF_REF_OUTSIDE_ROOT', 1, { path: ref, resolved: real });
  return real;
}

function ledgerIds(file) {
  try {
    const l = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (l.rows || []).map((r) => r.row);
  } catch { return []; }
}

function finishLineIds(file) {
  try {
    const l = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (l.rows || []).map((r) => r.id);
  } catch { return []; }
}

function contractHas(file, id) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return false; }
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^\\|\\s*' + esc + '\\s*\\|', 'm').test(txt);
}

function listEpicFiles(root) {
  const dir = path.join(root, 'delivery', 'epics');
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f)); } catch { return []; }
}

// spec: { run_id, slice_id, root, home?, preamble?, run_constant?, slice?, refs: { paths: [], ids: [] },
//         sources?: { ledger, finish_line, contracts: [] }, limit? }
// Writes whole-or-nothing: every check passes before any byte is written (G-11).
export function buildBrief(spec) {
  const root = fs.realpathSync(path.resolve(spec.root || process.cwd()));
  const home = path.resolve(spec.home || root);
  const limit = spec.limit || POLICY.brief_limit_tokens;
  if (!spec.run_id || !spec.slice_id) throw fail('BRIEF_SPEC_INVALID', 1, { message: 'run_id and slice_id are required' });
  const refs = spec.refs || {};
  const src = spec.sources || {};

  const validatedPaths = (refs.paths || []).map((p) => ({ ref: p, real: resolveRef(root, p) }));

  const ledger = ledgerIds(src.ledger || path.join(home, 'runs', spec.run_id, 'ledger.json'));
  const finish = finishLineIds(src.finish_line || path.join(home, '.do-it', 'finish-line.json'));
  const contracts = (src.contracts || listEpicFiles(root)).map((f) => path.resolve(root, f));
  const validatedIds = (refs.ids || []).map((id) => {
    const where = ledger.includes(id) ? 'ledger' : finish.includes(id) ? 'finish_line' : contracts.find((f) => contractHas(f, id));
    if (!where) throw fail('BRIEF_REF_INVALID', 1, { id, message: 'id not in ledger, finish line or a test contract' });
    return { id, where: where === 'ledger' || where === 'finish_line' ? where : path.relative(root, where) };
  });

  const texts = { preamble: spec.preamble || '', run_constant: spec.run_constant || '', slice: spec.slice || '' };
  const refLines = [
    ...validatedPaths.map((p) => '- path: ' + p.ref),
    ...validatedIds.map((i) => '- id: ' + i.id)
  ];
  const sizes = {};
  for (const s of SECTIONS) sizes[s] = texts[s].length;
  sizes.references = refLines.join('\n').length;
  const chars = Object.values(sizes).reduce((a, b) => a + b, 0);
  const estimate = estimateTokens(chars);
  if (estimate > limit) {
    const largest = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0][0];
    throw fail('BRIEF_TOO_LARGE', 1, { estimate_tokens: estimate, limit_tokens: limit, estimated: true, largest_section: largest, sizes });
  }

  const body = [
    '## preamble\n' + texts.preamble,
    '## run-constant\n' + texts.run_constant,
    '## slice ' + spec.slice_id + '\n' + texts.slice,
    '## references\n' + refLines.join('\n')
  ].join('\n\n') + '\n';
  const dir = path.join(home, 'runs', spec.run_id, 'briefs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, spec.slice_id + '.md');
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  return {
    outcome: 'BRIEF_WRITTEN',
    file,
    estimate_tokens: estimate,
    estimated: true,
    limit_tokens: limit,
    validated_references: validatedPaths.length + validatedIds.length,
    validated: { paths: validatedPaths.map((p) => p.ref), ids: validatedIds }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const a = process.argv.slice(2);
    const get = (n) => { const i = a.indexOf('--' + n); return i === -1 ? undefined : a[i + 1]; };
    const specFile = get('spec');
    if (!specFile) throw fail('USAGE', 1, { message: 'brief-builder --spec file.json [--root dir] [--home dir]' });
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    if (get('root')) spec.root = get('root');
    if (get('home')) spec.home = get('home');
    return buildBrief(spec);
  });
}
