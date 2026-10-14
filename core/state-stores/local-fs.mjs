// local-fs backend: temp file + atomic rename (D14). Big writes are two-phase (D16):
// phase 1 stages the bytes as a content-addressed blob (+ .pending marker), phase 2 publishes a
// small reference file by atomic rename. A crash between phases leaves the old file readable and
// one orphan blob that recovery sweeps.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { StateStore, StoreError, ERR, sha256 } from './interface.mjs';

export const BIG_PUT_BYTES = 256 * 1024;
const REF_MAGIC = 'DOIT-BLOB-REF/1 ';

export const refBytes = (sha, size) => Buffer.from(`${REF_MAGIC}${sha} ${size}\n`);
export function parseRef(buf) {
  if (buf.length > 200 || !buf.subarray(0, REF_MAGIC.length).equals(Buffer.from(REF_MAGIC))) return null;
  const m = /^DOIT-BLOB-REF\/1 ([0-9a-f]{64}) (\d+)\n$/.exec(buf.toString('utf8'));
  return m ? { sha: m[1], size: Number(m[2]) } : null;
}

const isBlobPath = (p) => /^runs\/[^/]+\/blobs\//.test(p);

export class LocalFsStore extends StateStore {
  constructor({ root }) {
    super('local-fs');
    if (!root) throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'local-fs needs a root directory');
    this.root = path.resolve(root);
  }

  abs(p) { return path.join(this.root, ...p.split('/')); }

  async _readFile(file) {
    try { return await fs.readFile(file); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; }
  }

  async _atomicWrite(p, bytes) {
    const file = this.abs(p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    const fh = await fs.open(tmp, 'w');
    try { await fh.writeFile(bytes); await fh.sync(); } finally { await fh.close(); }
    await fs.rename(tmp, file);
  }

  async _getRaw(p) { return this._readFile(this.abs(p)); }
  async _putRaw(p, b) { return this._atomicWrite(p, b); }

  async _get(p) {
    const raw = await this._readFile(this.abs(p));
    if (raw == null || isBlobPath(p)) return raw;
    const ref = parseRef(raw);
    if (!ref) return raw;
    const run = p.split('/')[1];
    const blobPath = `runs/${run}/blobs/${ref.sha}`;
    const b = await this._readFile(this.abs(blobPath));
    if (b == null) throw new StoreError(ERR.NOT_FOUND, `reference ${p} points at a missing blob ${ref.sha}`, { path: p });
    const actual = sha256(b);
    if (actual !== ref.sha) throw new StoreError(ERR.HASH_MISMATCH, `blob behind ${p} does not match its key`, { path: blobPath, expected: ref.sha, actual });
    return b;
  }

  async _put(p, bytes) {
    if (bytes.length <= BIG_PUT_BYTES || isBlobPath(p)) return this._atomicWrite(p, bytes);
    const run = p.split('/')[1];
    const sha = sha256(bytes);
    const blobPath = `runs/${run}/blobs/${sha}`;
    const existed = (await this._readFile(this.abs(blobPath))) != null;
    if (!existed) {
      await this._atomicWrite(`${blobPath}.pending`, Buffer.alloc(0));
      await this._atomicWrite(blobPath, bytes);
    }
    // test hook for the kill -9 case (T-N2-11): die between the two phases
    if (process.env.DO_IT_STORE_CRASH === 'after-blob') process.kill(process.pid, 'SIGKILL');
    await this._atomicWrite(p, refBytes(sha, bytes.length));
    if (!existed) await fs.rm(this.abs(`${blobPath}.pending`), { force: true });
  }

  async _append(p, lineBytes) {
    const file = this.abs(p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, lineBytes);
  }

  async _list(g) {
    const dir = g.path === 'runs' ? this.abs('runs') : this.abs(g.path);
    let ents;
    try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []; throw e; }
    return ents.filter((e) => !e.name.startsWith('.tmp-') && !e.name.endsWith('.pending')).map((e) => (e.isDirectory() ? e.name + '/' : e.name));
  }

  // Sweep staged blobs that no reference file points at (D16). Returns the count removed.
  async recoverOrphans(runId) {
    const runs = runId ? [runId] : (await this._list({ path: 'runs' })).map((n) => n.replace(/\/$/, ''));
    let orphans = 0;
    for (const run of runs) {
      const blobDir = this.abs(`runs/${run}/blobs`);
      let names;
      try { names = await fs.readdir(blobDir); } catch { continue; }
      const pending = names.filter((n) => n.endsWith('.pending')).map((n) => n.slice(0, -'.pending'.length));
      if (!pending.length) continue;
      const referenced = await this._referencedShas(run);
      for (const sha of pending) {
        if (!referenced.has(sha)) { await fs.rm(path.join(blobDir, sha), { force: true }); orphans++; }
        await fs.rm(path.join(blobDir, `${sha}.pending`), { force: true });
      }
    }
    return orphans;
  }

  async _referencedShas(run) {
    const out = new Set();
    const walk = async (dir) => {
      let ents;
      try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'blobs') await walk(f); continue; }
        if (e.name.startsWith('.tmp-')) continue;
        const st = await fs.stat(f);
        if (st.size > 200) continue;
        const ref = parseRef(await fs.readFile(f));
        if (ref) out.add(ref.sha);
      }
    };
    await walk(this.abs(`runs/${run}`));
    return out;
  }
}
