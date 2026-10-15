// Blob driver `rows`: blobs live in database rows next to the state, size-capped (D14 default).
import { StoreError, ERR } from '../interface.mjs';

export const ROWS_BLOB_CAP = 8 * 1024 * 1024;

export function createRowsDriver({ transport, cap = transport?.maxWriteBytes ?? ROWS_BLOB_CAP }) {
  return {
    id: 'rows',
    async put(key, bytes) {
      if (bytes.length > cap) throw new StoreError(ERR.BLOB_TOO_LARGE, `blob of ${bytes.length} bytes exceeds the rows cap of ${cap}; choose the r2 or fs-mirror driver`, { path: key });
      await transport.rowPut(key, bytes);
    },
    async get(key) { return transport.rowGet(key); },
  };
}
