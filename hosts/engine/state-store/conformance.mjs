// Conformance target for the engine backend, called by core/state-stores/conformance/run.mjs
// through the manifest's state_store.conformance entry.
import { openStore } from '../../../core/state-stores/index.mjs';
import { MemoryEngine } from './engine-drivers/memory-engine.mjs';
import { createHttpRowsTransport } from './engine-drivers/http-rows.mjs';
import { selectBlobDriver } from './engine.mjs';

// G-3: never pass on a mock. Returns a record naming what is missing, or null when URL and key are configured.
export function probeEngine(driver) {
  if (!process.env.DO_IT_ENGINE_URL) return { driver, error: 'DO_IT_ENGINE_URL is unset: no reachable Engine staging with a card' };
  if (!process.env.DO_IT_ENGINE_TOKEN) return { driver, error: 'DO_IT_ENGINE_TOKEN is unset: the Engine rows API needs a service key (x-service-api-key)' };
  return null;
}

export async function makeTarget({ backend, driver: asked }) {
  const driver = asked === 'default' ? 'rows' : asked;
  if (driver === 'memory-engine') {
    const transport = new MemoryEngine();
    return { store: openStore({ backend, transport, settings: {} }), meta: { backend, driver: 'memory-engine', real: false }, rootLabel: () => 'memory' };
  }
  const miss = probeEngine(driver);
  if (miss) return { unreachable: miss };
  const transport = createHttpRowsTransport({ baseUrl: process.env.DO_IT_ENGINE_URL, apiKey: process.env.DO_IT_ENGINE_TOKEN, spaceId: process.env.DO_IT_ENGINE_SPACE_ID });
  const reach = await transport.rowKeys('runs/conf-probe/').then(() => null, (e) => ({ driver, error: `${new URL(process.env.DO_IT_ENGINE_URL).host} not reachable or rows API off: ${e.message}` }));
  if (reach) return { unreachable: reach };
  const blobs = driver === 'rows' ? undefined : selectBlobDriver({ state: { engine: { blobs: driver } } }, { transport });
  return { store: openStore({ backend, transport, blobs, settings: {} }), meta: { backend, driver, real: true }, rootLabel: () => 'engine-run-rows' };
}
