// Host tables for the README and the root SKILL.md, generated from hosts/*/adapter.manifest.json
// (`display`, `level`, `server_side`, `status_label`, `note`). Names no host: every name comes from the manifests (G-9).
import fs from 'node:fs';
import path from 'node:path';

export const LEVELS = { native: 'Native', supported: 'Supported', experimental: 'Experimental' };
const RANK = { native: 0, supported: 1, experimental: 2 };
export const TABLE_BEGIN = '<!-- hosts:begin -->';
export const TABLE_END = '<!-- hosts:end -->';

// One record per host folder (folders starting with "_" hold shared interface files, not a host).
export function readHosts(root) {
  const dir = path.join(root, 'hosts');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue;
    const file = path.join(dir, e.name, 'adapter.manifest.json');
    let m = null;
    try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { m = null; }
    out.push({
      id: e.name,
      manifest: m,
      display: (m && m.display) || e.name,
      level: (m && m.level) || null,
      serverSide: (m && m.server_side) || null,
      statusLabel: (m && m.status_label) || null,
      note: (m && m.note) || '',
      readme: fs.existsSync(path.join(dir, e.name, 'README.md')) ? path.join('hosts', e.name, 'README.md') : null,
    });
  }
  return out.sort((a, b) => (RANK[a.level] ?? 9) - (RANK[b.level] ?? 9) || a.display.localeCompare(b.display));
}

export const levelLabel = (h) => LEVELS[h.level] || String(h.level);
// The Level cell: the label, or the host's own status sentence when it carries a caveat.
export const levelCell = (h) => h.statusLabel || levelLabel(h);

export function renderReadmeTable(hosts) {
  return [
    '| Platform | Level | Notes |',
    '|---|---|---|',
    ...hosts.map((h) => `| ${h.display} | ${levelCell(h)} | ${h.note} |`),
  ].join('\n');
}

export function renderSkillTable(hosts) {
  const idW = Math.max(4, ...hosts.map((h) => h.id.length));
  const lvW = Math.max(5, ...hosts.map((h) => levelLabel(h).length));
  const row = (a, b) => `| ${a.padEnd(idW)} | ${b.padEnd(lvW)} |`;
  return [row('Host', 'Level'), `|${'-'.repeat(idW + 2)}|${'-'.repeat(lvW + 2)}|`, ...hosts.map((h) => row(h.id, levelLabel(h)))].join('\n');
}

// Rewrites the generated block of the README in place. Usage: node scripts/hosts-table.mjs [--root DIR] --write
function main(argv) {
  const root = path.resolve(argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
  const file = path.join(root, 'README.md');
  const text = fs.readFileSync(file, 'utf8');
  const block = `${TABLE_BEGIN}\n${renderReadmeTable(readHosts(root))}\n${TABLE_END}`;
  const a = text.indexOf(TABLE_BEGIN), b = text.indexOf(TABLE_END);
  if (a === -1 || b === -1) { console.log('README has no generated hosts block'); return 1; }
  const next = text.slice(0, a) + block + text.slice(b + TABLE_END.length);
  if (argv.includes('--write')) fs.writeFileSync(file, next); else process.stdout.write(block + '\n');
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exitCode = main(process.argv.slice(2));
