// Recovery (D16): sweep orphan blobs, quarantine torn append lines, never drop silently.
// A failed pass is retried once; a second failure ends ESCALATED with a question in the owner pack (M1).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { StoreError, EXIT } from './interface.mjs';

async function quarantineTorn(store, run) {
  let count = 0;
  for (const name of await store.list(`runs/${run}/`)) {
    if (!name.endsWith('.jsonl')) continue;
    const p = `runs/${run}/${name}`;
    const buf = await store.get(p);
    if (!buf.length || buf[buf.length - 1] === 0x0a) continue;
    const cut = buf.lastIndexOf(0x0a);
    const whole = buf.subarray(0, cut + 1), torn = buf.subarray(cut + 1);
    let prev = Buffer.alloc(0);
    try { prev = await store.get(`${p}.torn`); } catch { /* none yet */ }
    await store.put(`${p}.torn`, Buffer.concat([prev, torn, Buffer.from('\n')])); // keep the bytes first,
    await store.put(p, whole);                                                    // then truncate
    count++;
  }
  return count;
}

async function onePass(store, run) {
  const runs = run ? [run] : (await store.list('runs/')).map((n) => n.replace(/\/$/, ''));
  const rec = { orphan_blobs: 0, TORN_LINE: 0 };
  if (store.syncRemote) await store.syncRemote();
  for (const r of runs) {
    rec.orphan_blobs += await store.recoverOrphans(r);
    rec.TORN_LINE += await quarantineTorn(store, r);
  }
  return rec;
}

export function ownerPackFor(runId, err) {
  return {
    pack_id: `recovery-${runId || 'all'}`,
    run_id: runId || null,
    questions: [{
      n: 1, kind: 'escalation',
      text: `State recovery failed twice (${err.code || 'ERROR'}: ${err.message}). How should the run proceed?`,
      options: ['retry after fixing the remote', 'continue on the local copy only', 'stop the run'],
      recommendation: 'retry after fixing the remote', default: 'retry after fixing the remote', reversible: true,
    }],
  };
}

export async function recover(store, { runId = null, retries = 1, ownerPackDir = null } = {}) {
  const attempts = [];
  let last;
  for (let n = 1; n <= 1 + retries; n++) {
    try {
      const recovered = await onePass(store, runId);
      attempts.push({ n, status: 'RECOVERED' });
      return { status: 'RECOVERED', exit: EXIT.OK, recovered, attempts };
    } catch (e) {
      last = e;
      attempts.push({ n, status: 'FAILED', code: e.code || 'ERROR', message: e.message });
    }
  }
  const owner_pack = ownerPackFor(runId, last instanceof StoreError ? last : { code: 'ERROR', message: String(last?.message) });
  let owner_pack_path = null;
  if (ownerPackDir) {
    owner_pack_path = path.join(path.resolve(ownerPackDir), 'runs', runId || '_all', 'owner-pack.json');
    await fs.mkdir(path.dirname(owner_pack_path), { recursive: true });
    const tmp = `${owner_pack_path}.tmp-${randomBytes(4).toString('hex')}`;
    await fs.writeFile(tmp, JSON.stringify(owner_pack, null, 2) + '\n');
    await fs.rename(tmp, owner_pack_path);
  }
  return { status: 'ESCALATED', exit: EXIT.NEEDS_HUMAN, attempts, owner_pack, owner_pack_path };
}
