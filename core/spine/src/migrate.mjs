import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { atomicWrite } from './fs-atomic.mjs';
import { sha256Bytes, sha256File } from './hash.mjs';
import { listRunIds, peekRunStatus } from './state.mjs';

// Legacy folder -> destination folder under .do-it/ (copy only, ruling D12).
export const MIGRATION_MAP = [
  { legacy: '.build-it-reports', dest: 'build/build-it-reports' },
  { legacy: '.fable-it-reports', dest: 'build/fable-it-reports' },
  { legacy: '.plan-it', dest: 'plan/plan-it' },
];
export const TERMINAL_RUN_STATUSES = ['DONE', 'ESCALATED', 'FAILED'];

export function migrateWalk(dir, rel, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) migrateWalk(abs, r, out);
    else if (e.isFile()) out.push({ abs, rel: r });
  }
  return out;
}

export function cmdMigrate(ctx) {
  const inFlight = listRunIds(ctx).filter((id) => !TERMINAL_RUN_STATUSES.includes(peekRunStatus(ctx, id)));
  if (inFlight.length) {
    throw fail('MIGRATE_REFUSED', 1, { run_id: inFlight[0], runs: inFlight, message: 'a run is in flight; finish or close it first' });
  }
  const manifestFile = path.join(ctx.home, 'migration.json');
  let manifest = { schema: 'do-it-migration/1', files: [] };
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { /* first migration */ }
  const known = new Map(manifest.files.map((x) => [x.source, x]));
  const copied = [];
  for (const m of MIGRATION_MAP) {
    const base = path.join(ctx.repo, m.legacy);
    if (!fs.existsSync(base)) continue;
    for (const file of migrateWalk(base, '', [])) {
      const source = m.legacy + '/' + file.rel;
      const dest = '.do-it/' + m.dest + '/' + file.rel;
      const bytes = fs.readFileSync(file.abs);
      const sha = sha256Bytes(bytes);
      const prior = known.get(source);
      const destAbs = path.join(ctx.home, m.dest, file.rel);
      if (prior && prior.sha256 === sha && fs.existsSync(destAbs) && sha256File(destAbs) === sha) continue;
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.writeFileSync(destAbs, bytes);
      const row = { source, dest, sha256: sha };
      known.set(source, row);
      copied.push(row);
    }
  }
  if (!copied.length) return { outcome: 'MIGRATE_NOOP', exit: 0, copied: [] };
  manifest.files = Array.from(known.values()).sort((a, b) => (a.source < b.source ? -1 : 1));
  atomicWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { outcome: 'MIGRATED', exit: 0, copied, manifest: manifestFile };
}
