// engine backend: small state in database rows (or interaction records) behind a transport;
// blobs in a driver chosen by settings `state.engine.blobs` (rows | r2 | fs-mirror, default rows) (D14, D19).
import { StateStore, StoreError, ERR } from './interface.mjs';
import { createRowsDriver } from './engine-drivers/rows.mjs';
import { createR2Driver } from './engine-drivers/r2.mjs';
import { createFsMirrorDriver } from './engine-drivers/fs-mirror.mjs';

export const BLOB_DRIVERS = ['rows', 'r2', 'fs-mirror'];

export class EngineStore extends StateStore {
  // transport: rowGet/rowPut/rowAppend/rowKeys (Engine API client or MemoryEngine); blobs: a blob driver
  constructor({ transport, blobs, config = {} }) {
    super('engine');
    if (!transport) throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'engine backend needs a transport');
    this.transport = transport;
    this.blobs = blobs ?? createRowsDriver({ transport });
    this.config = config;
  }
  async _get(p) { return this.transport.rowGet(p); }
  async _put(p, b) { await this.transport.rowPut(p, b); }
  async _append(p, l) { await this.transport.rowAppend(p, l); }
  async _list(g) {
    const prefix = g.path === 'runs' ? 'runs/' : g.path + '/';
    const names = new Set();
    for (const k of await this.transport.rowKeys(prefix)) {
      const rest = k.slice(prefix.length), i = rest.indexOf('/');
      names.add(i < 0 ? rest : rest.slice(0, i + 1));
    }
    return [...names];
  }
  async _putBlob(p, _sha, b) {
    if ((await this.blobs.get(p)) != null) return;
    await this.blobs.put(p, b);
  }
  async _getBlob(p) { return this.blobs.get(p); }
}

// settings.state.engine.blobs -> driver. Omitted resolves to rows; unknown fails DRIVER_UNKNOWN.
export function selectBlobDriver(settings, { transport, mirrorDir, r2Config, r2Transport } = {}) {
  const name = settings?.state?.engine?.blobs ?? 'rows';
  switch (name) {
    case 'rows': return createRowsDriver({ transport });
    case 'fs-mirror': return createFsMirrorDriver({ dir: mirrorDir ?? settings?.state?.engine?.mirror_dir ?? '.do-it/blob-mirror' });
    case 'r2': return createR2Driver({ config: r2Config ?? settings?.state?.engine?.r2, transport: r2Transport });
    default: throw new StoreError(ERR.DRIVER_UNKNOWN, `unknown blob driver ${JSON.stringify(String(name))}; expected one of ${BLOB_DRIVERS.join(', ')}`, { driver: String(name) });
  }
}

// Config reader: credentials are references only (G-7, D18). Messages never echo a value.
const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|credential|authorization)/i;
const SECRET_VALUE = /^(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|xox[abp]-[A-Za-z0-9-]{8,})/;
const REF_RE = /^(env|file|aws-sm|op):\S+$/;

export function loadEngineConfig(raw) {
  const out = {};
  const walk = (obj, trail, dest) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const where = [...trail, k].join('.');
      if (v && typeof v === 'object' && !Array.isArray(v)) { dest[k] = {}; walk(v, [...trail, k], dest[k]); continue; }
      if (k.endsWith('_ref')) {
        if (typeof v !== 'string' || !REF_RE.test(v)) throw new StoreError(ERR.SECRET_REF_INVALID, `${where} must look like env:NAME, file:PATH, aws-sm:ID or op:REF`, { key: where });
      } else if (typeof v === 'string' && v.length && (SECRET_KEY.test(k) || SECRET_VALUE.test(v))) {
        throw new StoreError(ERR.SECRET_LITERAL_REJECTED, `${where} holds a literal credential; use ${k}_ref with a reference instead`, { key: where });
      }
      dest[k] = v;
    }
  };
  walk(raw, [], out);
  return out;
}

// Resolve a reference at use time (never at load). Only env: and file: resolve in-process.
export async function resolveSecretRef(ref, env = process.env) {
  const [scheme, ...rest] = String(ref).split(':');
  const target = rest.join(':');
  if (scheme === 'env') {
    if (env[target] == null) throw new StoreError(ERR.DRIVER_UNCONFIGURED, `secret reference env:${target} is not set`, { ref });
    return env[target];
  }
  if (scheme === 'file') return (await (await import('node:fs/promises')).readFile(target, 'utf8')).trim();
  throw new StoreError(ERR.DRIVER_UNCONFIGURED, `secret scheme ${scheme} needs the secrets driver of the host`, { ref });
}
