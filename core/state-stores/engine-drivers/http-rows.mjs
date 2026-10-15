// Engine run-rows transport (Engine PR #727, /api/run-rows): rowGet/rowPut/rowAppend/rowKeys/rowDelete over HTTP.
// Auth is the service key header x-service-api-key; the key is read from the environment at construction and is
// never logged or put into an error message. One write is capped at 3 MiB by the Engine (413 write_too_large).
import { StoreError, ERR } from '../interface.mjs';

export const ENGINE_WRITE_CAP = 3 * 1024 * 1024;

export function createHttpRowsTransport({ baseUrl, apiKey, spaceId, fetchImpl = globalThis.fetch, maxWriteBytes = ENGINE_WRITE_CAP, keyBlockLimit = 1000 }) {
  if (!baseUrl) throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'engine rows transport needs a baseUrl');
  if (!apiKey) throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'engine rows transport needs a service key (read it from the environment)');
  const url = (route, params) => {
    const u = new URL(route, baseUrl);
    for (const [k, v] of Object.entries({ ...params, ...(spaceId ? { space_id: spaceId } : {}) })) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    return u;
  };
  const call = async (method, route, params, body) => {
    const res = await fetchImpl(url(route, params), { method, headers: { 'content-type': 'application/json', 'x-service-api-key': apiKey }, body: body === undefined ? undefined : JSON.stringify({ ...body, ...(spaceId ? { space_id: spaceId } : {}) }) });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    return { status: res.status, ok: res.ok, json };
  };
  const fail = (what, r) => new StoreError(ERR.DRIVER_UNCONFIGURED, `engine ${what} -> ${r.status} ${r.json?.code ?? ''} ${r.json?.reason ?? ''}`.trim(), { status: r.status, code: r.json?.code });
  const checkSize = (key, bytes) => {
    if (bytes.length > maxWriteBytes) throw new StoreError(ERR.BLOB_TOO_LARGE, `write of ${bytes.length} bytes exceeds the Engine row write cap of ${maxWriteBytes}; use the r2 or fs-mirror blob driver`, { path: key });
  };
  return {
    id: 'engine-http-rows', real: true, maxWriteBytes,
    async rowGet(key) {
      const r = await call('GET', '/api/run-rows', { key });
      if (r.status === 404 && r.json?.code === 'row_not_found') return null;
      if (!r.ok) throw fail('rowGet', r);
      return Buffer.from(r.json.content_b64, 'base64');
    },
    async rowPut(key, bytes) {
      checkSize(key, bytes);
      const r = await call('PUT', '/api/run-rows', { key }, { content_b64: Buffer.from(bytes).toString('base64') });
      if (!r.ok) throw fail('rowPut', r);
    },
    async rowAppend(key, bytes) {
      checkSize(key, bytes);
      const r = await call('POST', '/api/run-rows/append', { key }, { content_b64: Buffer.from(bytes).toString('base64') });
      if (!r.ok) throw fail('rowAppend', r);
    },
    async rowKeys(prefix) {
      const keys = [];
      let after;
      for (;;) {
        const r = await call('GET', '/api/run-rows/keys', { prefix, after, limit: keyBlockLimit });
        if (!r.ok) throw fail('rowKeys', r);
        keys.push(...r.json.keys);
        if (!r.json.next) break;
        after = r.json.next;
      }
      return keys;
    },
    async rowDelete(key) {
      const r = await call('DELETE', '/api/run-rows', { key });
      if (!r.ok && r.status !== 404) throw fail('rowDelete', r);
    },
  };
}
