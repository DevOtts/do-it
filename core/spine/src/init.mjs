import fs from 'node:fs';
import path from 'node:path';
import { fail } from './errors.mjs';
import { atomicWrite } from './fs-atomic.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { SETTINGS_DEFAULTS, isPlainObject, settingsClone, settingsScanSecrets } from './settings.mjs';

export const ENV_EXAMPLE_TEXT = [
  '# Credential NAMES only. Values live in the secrets provider named in',
  '# .do-it/settings.json (references only), never in this file.',
  '# Add one NAME= line per credential the project needs, with no value.',
  '',
].join('\n');

export const GITIGNORE_LINES = ['.do-it/runs/', '.secrets/'];

export function writeIfDifferent(file, text) {
  let current = null;
  try { current = fs.readFileSync(file, 'utf8'); } catch { /* absent */ }
  if (current === text) return false;
  atomicWrite(file, text);
  return true;
}

export function cmdInit(ctx, args) {
  const f = args.flags;
  const provider = f['secrets-provider'];
  const ref = f['secrets-ref'];
  const schema = loadSchemaFile('settings.schema.json');
  fs.mkdirSync(ctx.home, { recursive: true });
  const settingsFile = path.join(ctx.home, 'settings.json');
  let settings;
  let existed = fs.existsSync(settingsFile);
  if (existed) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) {
      throw fail('SETTINGS_INVALID', 1, { errors: [{ file: settingsFile, pointer: '', message: 'JSON parse error: ' + e.message }] });
    }
  } else {
    settings = settingsClone(SETTINGS_DEFAULTS);
  }
  if (!isPlainObject(settings.secrets)) settings.secrets = settingsClone(SETTINGS_DEFAULTS.secrets);
  if (provider !== undefined) settings.secrets.provider = provider;
  if (ref !== undefined) settings.secrets.ref = ref;
  const secretHits = settingsScanSecrets(settings, '', []);
  if (secretHits.length) {
    throw fail('SETTINGS_SECRET_VALUE', 1, { errors: secretHits.map((k) => ({ file: settingsFile, key: k, pointer: '/' + k.split('.').join('/') })) });
  }
  const errors = validateSchema(schema, settings);
  if (errors.length) throw fail('SETTINGS_INVALID', 1, { errors: errors.map((e) => ({ file: settingsFile, pointer: e.pointer, message: e.message })) });

  const changed = [];
  if (writeIfDifferent(settingsFile, JSON.stringify(settings, null, 2) + '\n')) changed.push(settingsFile);
  const envExample = path.join(ctx.home, '.env.example');
  if (!fs.existsSync(envExample) && writeIfDifferent(envExample, ENV_EXAMPLE_TEXT)) changed.push(envExample);

  const ignoreFile = path.join(ctx.repo, '.gitignore');
  let ignoreText = '';
  try { ignoreText = fs.readFileSync(ignoreFile, 'utf8'); } catch { /* absent */ }
  const present = new Set(ignoreText.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !present.has(l));
  if (missing.length) {
    const prefix = ignoreText.length && !ignoreText.endsWith('\n') ? '\n' : '';
    atomicWrite(ignoreFile, ignoreText + prefix + missing.join('\n') + '\n');
    changed.push(ignoreFile);
  }
  return {
    outcome: changed.length ? 'INIT_OK' : 'INIT_NOOP',
    exit: 0,
    root: ctx.root,
    home: ctx.home,
    changed,
    secrets: settings.secrets,
  };
}
