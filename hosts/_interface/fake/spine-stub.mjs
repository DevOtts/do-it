// Stub spine: records every call to a JSONL file and answers from a fixture. Never touches run state.
import { appendFileSync, readFileSync } from 'node:fs';

export function createStubSpine({ logPath, fixture = {} }) {
  return {
    call(name, args = {}) {
      appendFileSync(logPath, JSON.stringify({ ts: Date.now(), name, args }) + '\n');
      return name in fixture ? fixture[name] : { ok: true };
    },
    calls() {
      try {
        return readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      } catch { return []; }
    },
  };
}
