// Offline cases for the Engine run-rows HTTP transport (stub fetch; the live run is T-N2-04).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpRowsTransport } from '../engine-drivers/http-rows.mjs';
import { createRowsDriver } from '../engine-drivers/rows.mjs';

const stub = (routes) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const r = routes.shift();
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body ?? null) };
  };
  return { calls, fetchImpl };
};

test('rowGet maps 404 row_not_found to null and decodes base64; key goes in the header only', async () => {
  const s = stub([{ status: 404, body: { code: 'row_not_found' } }, { status: 200, body: { content_b64: Buffer.from('hi').toString('base64') } }]);
  const t = createHttpRowsTransport({ baseUrl: 'http://e', apiKey: 'k-secret', fetchImpl: s.fetchImpl });
  assert.equal(await t.rowGet('runs/r1/a'), null);
  assert.equal(String(await t.rowGet('runs/r1/a')), 'hi');
  assert.equal(s.calls[0].init.headers['x-service-api-key'], 'k-secret');
  assert.ok(!s.calls[0].url.href.includes('k-secret'));
});

test('rowKeys follows next until exhausted', async () => {
  const s = stub([{ status: 200, body: { keys: ['runs/r/a'], next: 'runs/r/a' } }, { status: 200, body: { keys: ['runs/r/b'], next: null } }]);
  const t = createHttpRowsTransport({ baseUrl: 'http://e', apiKey: 'k', fetchImpl: s.fetchImpl });
  assert.deepEqual(await t.rowKeys('runs/r/'), ['runs/r/a', 'runs/r/b']);
  assert.equal(s.calls[1].url.searchParams.get('after'), 'runs/r/a');
});

test('writes over the 3 MiB cap fail before any request; rows driver adopts the cap; errors never echo the key', async () => {
  const s = stub([{ status: 500, body: { code: 'boom', reason: 'x' } }]);
  const t = createHttpRowsTransport({ baseUrl: 'http://e', apiKey: 'k-secret', fetchImpl: s.fetchImpl });
  await assert.rejects(t.rowPut('runs/r/a', Buffer.alloc(3 * 1024 * 1024 + 1)), (e) => e.code === 'BLOB_TOO_LARGE');
  await assert.rejects(createRowsDriver({ transport: t }).put('runs/r/b', Buffer.alloc(3 * 1024 * 1024 + 1)), (e) => e.code === 'BLOB_TOO_LARGE');
  assert.equal(s.calls.length, 0);
  await assert.rejects(t.rowAppend('runs/r/a', Buffer.from('x')), (e) => !String(e.message).includes('k-secret') && /500/.test(e.message));
});
