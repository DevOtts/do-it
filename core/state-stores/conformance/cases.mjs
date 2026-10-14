// The one shared suite every backend must pass (12 cases). Each case gets a fresh run id.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const text = (b) => b.toString('utf8');
const rejects = async (fn, code) => {
  await assert.rejects(fn, (e) => { assert.equal(e.code, code); return true; });
};

export const cases = [
  ['put then get returns the bytes', async (s, r) => {
    await s.put(`runs/${r}/state.json`, '{"a":1}');
    assert.equal(text(await s.get(`runs/${r}/state.json`)), '{"a":1}');
  }],
  ['put overwrites with the latest whole version', async (s, r) => {
    await s.put(`runs/${r}/state.json`, 'v1');
    await s.put(`runs/${r}/state.json`, 'v2-longer');
    assert.equal(text(await s.get(`runs/${r}/state.json`)), 'v2-longer');
  }],
  ['append creates the file and keeps order', async (s, r) => {
    await s.append(`runs/${r}/events.jsonl`, '{"n":1}');
    await s.append(`runs/${r}/events.jsonl`, '{"n":2}');
    assert.equal(text(await s.get(`runs/${r}/events.jsonl`)), '{"n":1}\n{"n":2}\n');
  }],
  ['list returns immediate children, dirs end with a slash', async (s, r) => {
    await s.put(`runs/${r}/state.json`, 'x');
    await s.append(`runs/${r}/events.jsonl`, 'l');
    await s.put(`runs/${r}/results/build-S1.json`, '{}');
    assert.deepEqual(await s.list(`runs/${r}/`), ['events.jsonl', 'results/', 'state.json']);
    assert.deepEqual(await s.list(`runs/${r}/results`), ['build-S1.json']);
    assert.ok((await s.list('runs/')).includes(`${r}/`));
  }],
  ['list of an unknown run is empty', async (s, r) => {
    assert.deepEqual(await s.list(`runs/${r}-none/`), []);
  }],
  ['get of a missing path throws NOT_FOUND', async (s, r) => {
    await rejects(() => s.get(`runs/${r}/missing.json`), 'NOT_FOUND');
  }],
  ['path guard rejects dot-dot, absolute and outside paths', async (s, r) => {
    for (const p of [`runs/${r}/../x/state.json`, '/etc/x', 'other/state.json', `runs/${r}`, 'runs/../a/b', `runs/${r}/a//b`]) {
      await rejects(() => s.put(p, 'x'), 'PATH_REJECTED');
      await rejects(() => s.get(p), 'PATH_REJECTED');
    }
    await rejects(() => s.list('../runs/'), 'PATH_REJECTED');
  }],
  ['runs are isolated from each other', async (s, r) => {
    await s.put(`runs/${r}/state.json`, 'mine');
    await rejects(() => s.get(`runs/${r}-other/state.json`), 'NOT_FOUND');
  }],
  ['binary bytes round trip untouched', async (s, r) => {
    const b = randomBytes(2048);
    await s.put(`runs/${r}/bin`, b);
    assert.ok(b.equals(await s.get(`runs/${r}/bin`)));
  }],
  ['a 1 MB put reads back whole', async (s, r) => {
    const b = randomBytes(1 << 20);
    await s.put(`runs/${r}/big.json`, b);
    assert.ok(b.equals(await s.get(`runs/${r}/big.json`)));
  }],
  ['blob addressing: same bytes, one object; key is the sha256', async (s, r) => {
    const a = randomBytes(1000), b = randomBytes(1000);
    const k1 = await s.putBlob(r, a), k2 = await s.putBlob(r, a), k3 = await s.putBlob(r, b);
    assert.equal(k1, k2); assert.notEqual(k1, k3);
    assert.equal(k1, createHash('sha256').update(a).digest('hex'));
    assert.ok(a.equals(await s.getBlob(r, k1)));
    assert.ok(b.equals(await s.getBlob(r, k3)));
    assert.equal((await s.list(`runs/${r}/blobs/`)).length, 2);
  }],
  ['getBlob of an unknown or malformed key fails closed', async (s, r) => {
    await rejects(() => s.getBlob(r, 'f'.repeat(64)), 'NOT_FOUND');
    await rejects(() => s.getBlob(r, 'nothex'), 'PATH_REJECTED');
  }],
];
