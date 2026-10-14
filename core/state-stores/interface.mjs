// StateStore interface (CONTRACT s3, docs/03 s10): get, put, append, list over runs/{run_id}/...
// Backends implement the underscore primitives; this base class owns the guard, blob addressing
// and integrity check so every backend behaves the same (D13, D15).
import { createHash } from 'node:crypto';
import { guardPath, guardList } from './path-guard.mjs';

export const ERR = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  PATH_REJECTED: 'PATH_REJECTED',
  HASH_MISMATCH: 'HASH_MISMATCH',
  TORN_LINE: 'TORN_LINE',
  DRIVER_UNCONFIGURED: 'DRIVER_UNCONFIGURED',
  DRIVER_UNKNOWN: 'DRIVER_UNKNOWN',
  BACKEND_UNKNOWN: 'BACKEND_UNKNOWN',
  SECRET_LITERAL_REJECTED: 'SECRET_LITERAL_REJECTED',
  SECRET_REF_INVALID: 'SECRET_REF_INVALID',
  RESULT_FILE_MISSING: 'RESULT_FILE_MISSING',
  REMOTE_UNREACHABLE: 'REMOTE_UNREACHABLE',
  BLOB_TOO_LARGE: 'BLOB_TOO_LARGE',
  BAD_LINE: 'BAD_LINE',
});

// Spine exit codes (CONTRACT s3): 0 ok, 1 failed, 2 needs human, 3 blocked.
export const EXIT = Object.freeze({ OK: 0, FAILED: 1, NEEDS_HUMAN: 2, BLOCKED: 3 });

export class StoreError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    Object.assign(this, detail);
  }
  toJSON() {
    const { name, message, stack, ...rest } = this;
    return rest.code ? { ...rest, message } : { message };
  }
}

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const toBytes = (x) => (Buffer.isBuffer(x) ? x : x instanceof Uint8Array ? Buffer.from(x) : Buffer.from(String(x), 'utf8'));
export const SHA_RE = /^[0-9a-f]{64}$/;

export class StateStore {
  constructor(backend) {
    this.backend = backend;
  }

  async get(path) {
    const g = guardPath(path);
    const b = await this._get(g.path);
    if (b == null) throw new StoreError(ERR.NOT_FOUND, `not found: ${g.path}`, { path: g.path });
    return b;
  }

  async put(path, bytes) {
    const g = guardPath(path);
    await this._put(g.path, toBytes(bytes));
  }

  async append(path, line) {
    const g = guardPath(path);
    let s = toBytes(line).toString('utf8');
    if (s.endsWith('\n')) s = s.slice(0, -1);
    if (s.includes('\n')) throw new StoreError(ERR.BAD_LINE, 'append takes exactly one line', { path: g.path });
    await this._append(g.path, Buffer.from(s + '\n', 'utf8'));
  }

  // prefix is a directory: 'runs/', 'runs/r1' or 'runs/r1/'. Returns immediate child names, dirs end with '/'.
  async list(prefix) {
    const g = guardList(prefix);
    return (await this._list(g)).sort();
  }

  async putBlob(runId, bytes) {
    const b = toBytes(bytes);
    const sha = sha256(b);
    const g = guardPath(`runs/${runId}/blobs/${sha}`);
    await this._putBlob(g.path, sha, b);
    return sha;
  }

  async getBlob(runId, sha) {
    if (!SHA_RE.test(String(sha))) throw new StoreError(ERR.PATH_REJECTED, 'blob key must be a sha256 hex', { path: String(sha) });
    const g = guardPath(`runs/${runId}/blobs/${sha}`);
    const b = await this._getBlob(g.path, sha);
    if (b == null) throw new StoreError(ERR.NOT_FOUND, `blob not found: ${sha}`, { path: g.path });
    const actual = sha256(b);
    if (actual !== sha) {
      const prov = this._provenance ? await this._provenance(g.path) : {};
      throw new StoreError(ERR.HASH_MISMATCH, `blob content does not match its key ${sha}`, { path: g.path, expected: sha, actual, ...prov });
    }
    return b;
  }

  // defaults: blobs are ordinary files at their blob path (no pointer indirection)
  async _putBlob(path, _sha, b) {
    if ((await this._getRaw(path)) != null) return;
    await this._putRaw(path, b);
  }
  async _getBlob(path) { return this._getRaw(path); }
  async _getRaw(path) { return this._get(path); }
  async _putRaw(path, b) { return this._put(path, b); }
  async recoverOrphans() { return 0; }
}
