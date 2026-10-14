import { notImplemented } from './cli.mjs';
import { cmdInstall } from './install.mjs';
import { cmdMigrate } from './migrate.mjs';
import { loadSettings } from './settings.mjs';
import { DO_IT_VERSION } from './version.mjs';
export function cmdDoctor(ctx, args) {
  const f = args.flags;
  if (f.install) return cmdInstall(ctx);
  if (f.migrate) return cmdMigrate(ctx);
  if (f.secrets) return notImplemented('S5', 'doctor --secrets');
  const loaded = loadSettings(ctx, args.sets);
  const settings = {};
  for (const e of loaded.entries) settings[e.key] = { value: e.value, source: e.source };
  return {
    outcome: 'DOCTOR_OK',
    exit: 0,
    version: DO_IT_VERSION,
    node: process.version,
    root: ctx.root,
    home: ctx.home,
    repo: ctx.repo,
    files: loaded.files,
    entries: loaded.entries,
    settings,
  };
}
