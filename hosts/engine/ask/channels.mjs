// Owner-pack fan-out (D5, D12). A transport is { send(message) -> Promise }. The three Engine channels are
// Control Tower (ask card), chat/p2p and WhatsApp; the real transports wrap an Engine API client whose routes are
// ASSUMED until a live Engine confirms them (T-N1-16/17). Tests inject recording sinks.
export const CHANNELS = ['controlTower', 'chatP2p', 'whatsapp'];

export function packMessage(pack, channel) {
  return {
    channel, pack_id: pack.pack_id, run_id: pack.run_id ?? null,
    questions: pack.questions.map((q) => ({ n: q.n, kind: q.kind ?? 'default', text: q.text, options: q.options ?? [], recommendation: q.recommendation ?? null, default: q.default ?? null, reversible: q.reversible ?? true })),
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

// Real transports (Engine PR #727 /api/ask-cards): thin wrappers over an Engine client { post, get }. Engine keeps ONE
// pack row per pack_id and is the arbiter of replies, so every channel's send is the same idempotent open (the
// first creates, the rest replay) and `replies` reads that channel's recorded replies back.
export const ENGINE_CHANNEL = { controlTower: 'control_tower', chatP2p: 'chat_p2p', whatsapp: 'whatsapp' };

// Engine's DTO whitelist: drop the do-it-only `channel` key and every null/undefined optional.
export function toEnginePack(message, extra = {}) {
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
  return clean({ pack_id: message.pack_id, run_id: message.run_id, ...extra, questions: message.questions.map((q) => clean({ ...q, options: q.options?.length ? q.options : undefined })) });
}

export function engineTransports(client, linked = CHANNELS, extra = {}) {
  const out = {};
  for (const ch of linked) {
    out[ch] = {
      send: (message) => client.post('/api/ask-cards', toEnginePack(message, extra)),
      replies: async (packId) => (await client.get(`/api/ask-cards/${encodeURIComponent(packId)}/replies?channel=${ENGINE_CHANNEL[ch]}`)).replies,
    };
  }
  return out;
}

// Deliver a reply the channel received to Engine; reply_id (the channel message id) makes it idempotent.
export const postReply = (client, packId, channel, text, replyId, from) =>
  client.post(`/api/ask-cards/${encodeURIComponent(packId)}/replies`, { channel: ENGINE_CHANNEL[channel] ?? channel, text, ...(replyId ? { reply_id: replyId } : {}), ...(from ? { from } : {}) });
export const readPack = (client, packId) => client.get(`/api/ask-cards/${encodeURIComponent(packId)}`);
export const closePack = (client, packId) => client.post(`/api/ask-cards/${encodeURIComponent(packId)}/close`, {});

// Minimal Engine HTTP client. Base URL from DO_IT_ENGINE_URL; token resolved from a reference at use (G-7).
export function createEngineClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  const h = () => ({ 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}`, 'x-service-api-key': token } : {}) }); // Engine DualAuthGuard reads x-service-api-key (verified live 2026-10-14)
  const call = async (method, route, body) => {
    const res = await fetchImpl(new URL(route, baseUrl), { method, headers: h(), body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) { const e = new Error(`engine ${method} ${route} -> ${res.status}`); e.status = res.status; e.body = await res.json().catch(() => null); throw e; }
    return res.status === 204 ? null : res.json();
  };
  return { post: (r, b) => call('POST', r, b), get: (r) => call('GET', r), put: (r, b) => call('PUT', r, b), del: (r) => call('DELETE', r) };
}
