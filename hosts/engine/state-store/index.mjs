// Engine state-store backend. Core loads this through the `state_store` entry of
// hosts/engine/adapter.manifest.json; nothing in core/ imports it.
import { EngineStore, selectBlobDriver, loadEngineConfig, resolveSecretRef, BLOB_DRIVERS } from './engine.mjs';

export { EngineStore, selectBlobDriver, loadEngineConfig, resolveSecretRef, BLOB_DRIVERS };

// Factory the core openStore() calls: open({ backend, transport, blobs, settings, driverOpts, config }).
export function open(opts) {
  const blobs = opts.blobs ?? selectBlobDriver(opts.settings, { transport: opts.transport, ...opts.driverOpts });
  return new EngineStore({ transport: opts.transport, blobs, config: opts.config });
}
