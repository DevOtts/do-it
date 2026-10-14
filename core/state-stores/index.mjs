// Backend factory: openStore({backend, ...}) for local-fs | git-branch | engine.
import { StoreError, ERR } from './interface.mjs';
import { LocalFsStore } from './local-fs.mjs';
import { GitBranchStore } from './git-branch.mjs';
import { EngineStore, selectBlobDriver } from './engine.mjs';

export * from './interface.mjs';
export { recover } from './recovery.mjs';
export { resume } from './resume.mjs';
export { selectBlobDriver, loadEngineConfig, resolveSecretRef } from './engine.mjs';
export { LocalFsStore, GitBranchStore, EngineStore };

export function openStore(opts) {
  switch (opts.backend) {
    case 'local-fs': return new LocalFsStore({ root: opts.root });
    case 'git-branch': return new GitBranchStore({ repo: opts.repo, remote: opts.remote });
    case 'engine': {
      const blobs = opts.blobs ?? selectBlobDriver(opts.settings, { transport: opts.transport, ...opts.driverOpts });
      return new EngineStore({ transport: opts.transport, blobs, config: opts.config });
    }
    default: throw new StoreError(ERR.BACKEND_UNKNOWN, `unknown backend ${JSON.stringify(String(opts.backend))}`);
  }
}
