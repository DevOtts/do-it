// Backend factory: openStore({backend, ...}). local-fs and git-branch are built in; any other
// backend comes from a host: the `state_store` entry of hosts/<name>/adapter.manifest.json
// ({ backend, module, settings_schema?, conformance? }, paths relative to the host folder).
// Host modules are preloaded once at import so openStore stays synchronous.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StoreError, ERR } from './interface.mjs';
import { LocalFsStore } from './local-fs.mjs';
import { GitBranchStore } from './git-branch.mjs';

export * from './interface.mjs';
export { recover } from './recovery.mjs';
export { resume } from './resume.mjs';
export { LocalFsStore, GitBranchStore };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN = new Set(['local-fs', 'git-branch']);

export function hostsDir(env = process.env) {
  return env.DO_IT_HOSTS_DIR ? path.resolve(env.DO_IT_HOSTS_DIR) : path.resolve(HERE, '..', '..', 'hosts');
}

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'adapter.manifest.json'), 'utf8')); } catch { return null; }
}

// Every host folder that declares a state_store: { host, dir, backend, module, ... }
export function hostStateStores(env = process.env) {
  const root = hostsDir(env);
  let names = [];
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort(); } catch { return []; }
  const out = [];
  for (const host of names) {
    const dir = path.join(root, host);
    const entry = readManifest(dir)?.state_store;
    if (entry && typeof entry.module === 'string') out.push({ host, dir, backend: entry.backend ?? host, ...entry });
  }
  return out;
}

const loaded = new Map();
const broken = new Map();
for (const s of hostStateStores()) {
  if (BUILTIN.has(s.backend) || loaded.has(s.backend)) continue;
  try {
    loaded.set(s.backend, { ...s, mod: await import(pathToFileURL(path.join(s.dir, s.module)).href) });
  } catch (e) {
    broken.set(s.backend, `host "${s.host}" state_store module failed to load: ${e.message}`);
  }
}

export function hostBackend(name) {
  return loaded.get(name) ?? null;
}

export function openStore(opts) {
  switch (opts.backend) {
    case 'local-fs': return new LocalFsStore({ root: opts.root });
    case 'git-branch': return new GitBranchStore({ repo: opts.repo, remote: opts.remote });
    default: {
      const name = String(opts.backend);
      const h = loaded.get(name);
      if (h) return h.mod.open(opts);
      if (broken.has(name)) throw new StoreError(ERR.DRIVER_UNCONFIGURED, `backend ${JSON.stringify(name)}: ${broken.get(name)}`, { host: name });
      const dir = path.join(hostsDir(), name);
      const why = !fs.existsSync(dir)
        ? `host "${name}" is not installed (${path.join('hosts', name)} is missing)`
        : `host "${name}" has no state_store entry in ${path.join('hosts', name, 'adapter.manifest.json')}`;
      throw new StoreError(ERR.DRIVER_UNKNOWN, `unknown backend ${JSON.stringify(name)}: ${why}`, { host: name });
    }
  }
}
