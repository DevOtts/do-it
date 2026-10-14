// Owner-pack fan-out (D5, D12). A transport is { send(message) -> Promise }. The three Engine channels are
// Control Tower (ask card), chat/p2p and WhatsApp; the real transports wrap an Engine API client whose routes are
// ASSUMED until a live Engine confirms them (T-N1-16/17). Tests inject recording sinks.
export const CHANNELS = ['controlTower', 'chatP2p', 'whatsapp'];

export function packMessage(pack, channel) {
  return {
    channel, pack_id: pack.pack_id, run_id: pack.run_id ?? null,
    questions: pack.questions.map((q) => ({ n: q.n, text: q.text, options: q.options ?? [], recommendation: q.recommendation ?? null })),
  };
}

// Fan out one pack to every linked channel. Delivery to at least one channel is success with a recorded
// warning per failed channel; zero delivered is returned as-is for the caller to fall back to disk (D12).
export async function ask(pack, transports, { emit = () => {} } = {}) {
  const delivered = [], failed = [];
  for (const channel of CHANNELS) {
    const t = transports[channel];
    if (!t) continue;
    try {
      await t.send(packMessage(pack, channel));
      delivered.push(channel);
    } catch (e) {
      failed.push({ channel, error: String(e?.message ?? e) });
      emit({ event: 'channel_failed', channel, error: String(e?.message ?? e) });
    }
  }
  return { delivered, failed };
}

// Real transports: thin wrappers over an Engine client { post(route, body), get(route) }.
const ROUTES = { controlTower: '/api/ask-cards', chatP2p: '/api/chat/p2p/messages', whatsapp: '/api/whatsapp/messages' };
export function engineTransports(client, linked = CHANNELS) {
  const out = {};
  for (const ch of linked) {
    out[ch] = {
      send: (message) => client.post(ROUTES[ch], message),
      replies: (packId) => client.get(`${ROUTES[ch]}?pack_id=${encodeURIComponent(packId)}`),
    };
  }
  return out;
}

// Minimal Engine HTTP client. Base URL from DO_IT_ENGINE_URL; token resolved from a reference at use (G-7).
export function createEngineClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  const h = () => ({ 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}`, 'x-service-api-key': token } : {}) }); // Engine DualAuthGuard reads x-service-api-key (verified live 2026-10-14)
  const call = async (method, route, body) => {
    const res = await fetchImpl(new URL(route, baseUrl), { method, headers: h(), body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) { const e = new Error(`engine ${method} ${route} -> ${res.status}`); e.status = res.status; throw e; }
    return res.status === 204 ? null : res.json();
  };
  return { post: (r, b) => call('POST', r, b), get: (r) => call('GET', r), put: (r, b) => call('PUT', r, b) };
}
