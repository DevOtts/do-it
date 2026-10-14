#!/usr/bin/env node
// Thin CLI over the stores. Persistent backends only (local-fs, git-branch).
// node core/state-stores/cli.mjs <get|put|append|list|put-blob|get-blob|recover|resume> --backend local-fs --root DIR ...
// Exit: 0 ok, 1 failed (JSON error on stderr), 2 escalated (needs human), 3 blocked.
import { openStore, recover, resume, selectBlobDriver, loadEngineConfig, StoreError, EXIT } from './index.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {}, pos = [];
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]);
}
const stdin = async () => { const c = []; for await (const d of process.stdin) c.push(d); return Buffer.concat(c); };
const fail = (e) => {
  const code = e instanceof StoreError ? e.code : 'ERROR';
  process.stderr.write(JSON.stringify({ ok: false, error: { ...(e instanceof StoreError ? e.toJSON() : {}), code, message: e.message } }) + '\n');
  process.exitCode = EXIT.FAILED;
};

try {
  const backend = flags.backend ?? 'local-fs';
  if (cmd === 'driver') {
    // resolve settings.state.engine.blobs the way the engine backend would; prints the driver id
    const settings = { state: { engine: flags.blobs === undefined ? {} : { blobs: flags.blobs } } };
    const d = selectBlobDriver(settings, { transport: {}, mirrorDir: flags['mirror-dir'] });
    process.stdout.write(JSON.stringify({ driver: d.id }) + '\n');
  } else if (cmd === 'config') {
    process.stdout.write(JSON.stringify({ ok: true, keys: Object.keys(loadEngineConfig(JSON.parse(flags.data))) }) + '\n');
  } else if (cmd === 'resume') {
    const r = await resume({ repo: flags.repo, runId: flags.run, resultPath: flags.result, workdir: flags.workdir });
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exitCode = r.exit;
  } else {
    const store = openStore({ backend, root: flags.root, repo: flags.repo, remote: flags.remote });
    if (cmd === 'get') process.stdout.write(await store.get(pos[0]));
    else if (cmd === 'put') await store.put(pos[0], flags.data ?? (await stdin()));
    else if (cmd === 'append') await store.append(pos[0], pos[1]);
    else if (cmd === 'list') process.stdout.write((await store.list(pos[0])).join('\n') + '\n');
    else if (cmd === 'put-blob') process.stdout.write((await store.putBlob(pos[0], flags.data ?? (await stdin()))) + '\n');
    else if (cmd === 'get-blob') process.stdout.write(await store.getBlob(pos[0], pos[1]));
    else if (cmd === 'recover') {
      const r = await recover(store, { runId: flags.run ?? null, ownerPackDir: flags['owner-pack-dir'] ?? null });
      process.stdout.write(JSON.stringify(r) + '\n');
      process.exitCode = r.exit;
    } else throw new StoreError('USAGE', `unknown command ${cmd}`);
  }
} catch (e) { fail(e); }
