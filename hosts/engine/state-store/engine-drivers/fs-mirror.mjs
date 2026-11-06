// Blob driver `fs-mirror`: blobs mirrored to a plain directory (shared volume or local cache).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function createFsMirrorDriver({ dir }) {
  const file = (key) => path.join(path.resolve(dir), ...key.split('/'));
  return {
    id: 'fs-mirror',
    dir: path.resolve(dir),
    file,
    async put(key, bytes) {
      const f = file(key);
      await fs.mkdir(path.dirname(f), { recursive: true });
      const tmp = `${f}.tmp-${randomBytes(4).toString('hex')}`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, f);
    },
    async get(key) {
      try { return await fs.readFile(file(key)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
  };
}
