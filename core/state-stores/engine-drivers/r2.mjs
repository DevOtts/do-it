// Blob driver `r2` (S3-compatible object store). UNVERIFIED in Engine (D14), so it is never a default
// and fails closed: without a full config AND an injected transport it throws DRIVER_UNCONFIGURED.
// This build ships no network client; production wiring injects `transport` {objPut, objGet}.
import { StoreError, ERR } from '../interface.mjs';

export function createR2Driver({ config, transport } = {}) {
  const need = ['bucket', 'endpoint', 'token_ref'];
  const missing = need.filter((k) => !config || !config[k]);
  if (missing.length) throw new StoreError(ERR.DRIVER_UNCONFIGURED, `r2 blob driver is not configured (missing: ${missing.join(', ')}); no silent fallback`, { missing });
  if (!transport || typeof transport.objPut !== 'function' || typeof transport.objGet !== 'function') {
    throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'r2 blob driver has no transport in this build; no silent fallback', { missing: ['transport'] });
  }
  const k = (key) => `${config.bucket}/${key}`;
  return {
    id: 'r2',
    async put(key, bytes) { await transport.objPut(k(key), bytes); },
    async get(key) { return transport.objGet(k(key)); },
  };
}
