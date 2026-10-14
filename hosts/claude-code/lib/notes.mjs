// PROBE-NOTES.json: observations from real-binary cases, merged key by key.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'PROBE-NOTES.json');

export function mergeNotes(patch, path = NOTES_PATH) {
  const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const next = { ...cur, ...patch };
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
  return next;
}
