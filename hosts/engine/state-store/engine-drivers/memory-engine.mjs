// In-memory stand-in for the Engine services. Unit cases only: it is never counted as a [REAL] pass.
export class MemoryEngine {
  constructor() {
    this.id = 'memory-engine';
    this.real = false;
    this.rows = new Map();     // state rows and rows-driver blobs, keyed by store path
    this.objects = new Map();  // object-store stand-in, keyed by object key
  }
  async rowGet(key) { return this.rows.has(key) ? Buffer.from(this.rows.get(key)) : null; }
  async rowPut(key, bytes) { this.rows.set(key, Buffer.from(bytes)); }
  async rowAppend(key, bytes) { this.rows.set(key, Buffer.concat([this.rows.get(key) ?? Buffer.alloc(0), bytes])); }
  async rowKeys(prefix) { return [...this.rows.keys()].filter((k) => k.startsWith(prefix)); }
  async rowDelete(key) { this.rows.delete(key); }
  async objPut(key, bytes) { this.objects.set(key, Buffer.from(bytes)); }
  async objGet(key) { return this.objects.has(key) ? Buffer.from(this.objects.get(key)) : null; }
}
