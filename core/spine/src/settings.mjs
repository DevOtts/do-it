import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { loadSchemaFile, schemaEscape, validateSchema } from './schema.mjs';

export const SETTINGS_DEFAULTS = {
  version: 1,
  interaction: { owner_pack: 'auto', fallback: ['native', 'html', 'markdown'] },
  host: { driver: 'auto', alias: null },
  isolation: { driver: 'worktree' },
  state: { backend: 'local' },
  secrets: { provider: 'file', ref: '.secrets/' },
  handoff: { mode: 'auto', max_per_run: 5 },
  review: { max_rounds: 3, cost_cap_tokens: 600000 },
  tiers: { T1: '', T2: '', T3: '' },
  ceilings: { warn_tokens: 150000, warn_pct: 40, block_tokens: 250000, block_pct: 60 },
  stop_gate: { patience: 3 },
  observability: { provider: 'none' },
};

// Host-owned settings: `state.<backend>` is one object keyed by the backend name. Core does not know its
// shape; the host that provides the backend declares it in the `state_store.settings_schema` entry of
// hosts/<name>/adapter.manifest.json. Returns { schema } | { absent: true } (no hosts folder reachable,
// e.g. the single file installed alone: accepted unchecked) | { error } (host or schema missing).
export function settingsHostsDirs(ctx) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cands = ctx.env.DO_IT_HOSTS_DIR ? [ctx.env.DO_IT_HOSTS_DIR] : [path.join(here, '..', '..', 'hosts'), path.join(here, '..', '..', '..', 'hosts')];
  return cands
    .filter(Boolean).map((d) => path.resolve(d)).filter((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());
}

export function settingsHostSchema(ctx, name) {
  const dirs = settingsHostsDirs(ctx);
  if (!dirs.length) return { absent: true };
  const dir = dirs.find((d) => fs.existsSync(path.join(d, name, 'adapter.manifest.json')));
  if (!dir) return { error: 'no host "' + name + '" is installed to validate state.' + name };
  let entry;
  try {
    entry = JSON.parse(fs.readFileSync(path.join(dir, name, 'adapter.manifest.json'), 'utf8')).state_store;
  } catch (e) {
    return { error: 'host "' + name + '" manifest is unreadable: ' + e.message };
  }
  if (!entry || !entry.settings_schema) return { error: 'host "' + name + '" declares no state_store.settings_schema for state.' + name };
  const file = path.join(dir, name, entry.settings_schema);
  try {
    return { schema: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: 'host "' + name + '" settings schema is unreadable: ' + e.message };
  }
}

// Errors for the host-owned part of `state`, with pointers under /state/<name>.
export function settingsHostErrors(ctx, data, keyed = true) {
  const state = data && data.state;
  if (!isPlainObject(state)) return [];
  const errors = [];
  const names = Object.keys(state).filter((k) => k !== 'backend' && isPlainObject(state[k]));
  if (names.length > 1) errors.push({ pointer: '/state', message: 'holds one object keyed by the backend name, found ' + names.join(', ') });
  for (const name of names) {
    if (keyed && typeof state.backend === 'string' && state.backend !== name) {
      errors.push({ pointer: '/state/' + schemaEscape(name), message: 'is keyed "' + name + '" but state.backend is "' + state.backend + '"' });
      continue;
    }
    const h = settingsHostSchema(ctx, name);
    if (h.absent) continue;
    if (h.error) { errors.push({ pointer: '/state/' + schemaEscape(name), message: h.error }); continue; }
    for (const e of validateSchema(h.schema, state[name], '/state/' + schemaEscape(name))) errors.push(e);
  }
  return errors;
}

export const SECRET_KEY_NAMES = /^(value|token|password|passwd|secret|api_?key|apikey|private_?key|access_?key)$/i;
export const SECRET_SHAPES = [
  /^AKIA[0-9A-Z]{16}$/,
  /^ASIA[0-9A-Z]{16}$/,
  /^(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}$/,
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}$/,
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*$/,
  /^[A-Fa-f0-9]{40,}$/,
];

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function settingsLooksSecret(keyName, value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (SECRET_KEY_NAMES.test(keyName)) return true;
  if (SECRET_SHAPES.some((re) => re.test(value))) return true;
  // long unbroken mixed token (no path separators, dots or spaces)
  if (value.length >= 32 && /^[A-Za-z0-9+_=-]+$/.test(value) && /[0-9]/.test(value) && /[A-Za-z]/.test(value)) return true;
  return false;
}

// Returns key paths only; the value never leaves this function.
export function settingsScanSecrets(obj, prefix, out) {
  if (!isPlainObject(obj)) return out;
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) settingsScanSecrets(v, keyPath, out);
    else if (Array.isArray(v)) v.forEach((item, i) => { if (settingsLooksSecret(key, item)) out.push(keyPath + '.' + i); });
    else if (settingsLooksSecret(key, v)) out.push(keyPath);
  }
  return out;
}

export function flattenSettings(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const keyPath = prefix ? prefix + '.' + key : key;
    const v = obj[key];
    if (isPlainObject(v)) flattenSettings(v, keyPath, out);
    else out[keyPath] = v;
  }
  return out;
}

export function settingsClone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function settingsMerge(base, over) {
  for (const key of Object.keys(over)) {
    if (isPlainObject(over[key]) && isPlainObject(base[key])) settingsMerge(base[key], over[key]);
    else base[key] = settingsClone(over[key]);
  }
  return base;
}

export function settingsSetPath(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

export function settingsPaths(ctx) {
  return {
    global: path.join(ctx.userHome, '.do-it', 'settings.json'),
    workspace: path.join(ctx.home, 'settings.json'),
  };
}

export function parseSetValue(raw, defaultValue) {
  try {
    return JSON.parse(raw);
  } catch {
    if (Array.isArray(defaultValue)) return raw === '' ? [] : raw.split(',').map((s) => s.trim());
    return raw;
  }
}

// Layers: defaults, global, workspace, run flag. Every leaf keeps its source.
export function loadSettings(ctx, setFlags) {
  const schema = loadSchemaFile('settings.schema.json');
  const paths = settingsPaths(ctx);
  const layers = [];
  const parseErrors = [];
  const files = [];
  const seen = new Set();
  for (const name of ['global', 'workspace']) {
    const file = paths[name];
    const real = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (seen.has(real)) {
      files.push({ layer: name, path: file, exists: fs.existsSync(file), shadowed: true });
      continue;
    }
    seen.add(real);
    const exists = fs.existsSync(file);
    files.push({ layer: name, path: file, exists });
    if (!exists) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      parseErrors.push({ file, pointer: '', message: 'JSON parse error: ' + e.message });
      continue;
    }
    layers.push({ name, file, data: parsed });
  }
  const secretHits = [];
  for (const layer of layers) {
    for (const keyPath of settingsScanSecrets(layer.data, '', [])) secretHits.push({ file: layer.file, key: keyPath });
  }
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, {
      errors: secretHits.map((h) => ({ file: h.file, key: h.key, pointer: '/' + h.key.split('.').join('/'), message: 'looks like a credential value; settings hold references only' })),
    });
  }
  const errors = parseErrors.slice();
  for (const layer of layers) {
    for (const e of validateSchema(schema, layer.data)) errors.push({ file: layer.file, pointer: e.pointer, message: e.message });
    for (const e of settingsHostErrors(ctx, layer.data)) errors.push({ file: layer.file, pointer: e.pointer, message: e.message });
  }
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors });

  const defaultLeaves = flattenSettings(SETTINGS_DEFAULTS, '', {});
  const merged = settingsClone(SETTINGS_DEFAULTS);
  const sources = {};
  for (const k of Object.keys(defaultLeaves)) sources[k] = 'default';
  for (const layer of layers) {
    settingsMerge(merged, layer.data);
    for (const k of Object.keys(flattenSettings(layer.data, '', {}))) sources[k] = layer.name;
  }
  for (const pair of setFlags || []) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const hostKey = /^state\.[^.]+\.[^.]+/.test(key) && key.split('.')[1] !== 'backend' && !settingsHostSchema(ctx, key.split('.')[1]).error;
    if (eq === -1 || !(Object.prototype.hasOwnProperty.call(defaultLeaves, key) || hostKey)) {
      throw fail('SETTINGS_UNKNOWN_KEY', 1, { key });
    }
    settingsSetPath(merged, key, parseSetValue(pair.slice(eq + 1), defaultLeaves[key]));
    sources[key] = 'run-flag';
  }
  if (setFlags && setFlags.length) {
    const flagErrors = validateSchema(schema, merged).concat(settingsHostErrors(ctx, merged, false)).map((e) => ({ file: 'run-flag', pointer: e.pointer, message: e.message }));
    if (flagErrors.length) throw fail('SETTINGS_INVALID', 1, { errors: flagErrors });
  }
  const leaves = flattenSettings(merged, '', {});
  const entries = Object.keys(leaves).sort().map((key) => ({ key, value: leaves[key], source: sources[key] || 'default' }));
  return { values: merged, entries, files };
}
