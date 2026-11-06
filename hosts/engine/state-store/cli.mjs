#!/usr/bin/env node
// Engine-only commands that used to live in core/state-stores/cli.mjs.
//   node hosts/engine/state-store/cli.mjs driver [--blobs rows|r2|fs-mirror] [--mirror-dir DIR]
//   node hosts/engine/state-store/cli.mjs config --data JSON
// Exit: 0 ok, 1 failed (JSON error on stderr).
import { StoreError } from '../../../core/state-stores/interface.mjs';
import { selectBlobDriver, loadEngineConfig } from './index.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
const fail = (e) => {
  const code = e instanceof StoreError ? e.code : 'ERROR';
  process.stderr.write(JSON.stringify({ ok: false, error: { ...(e instanceof StoreError ? e.toJSON() : {}), code, message: e.message } }) + '\n');
  process.exitCode = 1;
};

try {
  if (cmd === 'driver') {
    // resolve settings.state.engine.blobs the way the backend would; prints the driver id
    const settings = { state: { engine: flags.blobs === undefined ? {} : { blobs: flags.blobs } } };
    const d = selectBlobDriver(settings, { transport: {}, mirrorDir: flags['mirror-dir'] });
    process.stdout.write(JSON.stringify({ driver: d.id }) + '\n');
  } else if (cmd === 'config') {
    process.stdout.write(JSON.stringify({ ok: true, keys: Object.keys(loadEngineConfig(JSON.parse(flags.data))) }) + '\n');
  } else throw new StoreError('USAGE', `unknown command ${cmd}`);
} catch (e) { fail(e); }
