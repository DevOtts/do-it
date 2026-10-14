import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from '../routing/errors.mjs';
import { sha256 } from './canonical.mjs';

export const stampPath = (file) => file + '.sha256';
export const DEFAULT_FILE = fileURLToPath(new URL('./drivers.json', import.meta.url));

// Refuses a drivers.json whose bytes differ from the sha256 written by the last lint (adversarial verify).
export function loadDrivers(file = DEFAULT_FILE) {
  const bytes = fs.readFileSync(file);
  let stamp;
  try { stamp = fs.readFileSync(stampPath(file), 'utf8').trim(); } catch { throw fail('DRIVERS_UNSTAMPED', 1, { file }); }
  if (sha256(bytes) !== stamp) throw fail('DRIVERS_STALE', 1, { file, message: 'drivers.json changed since lint; rerun lint-drivers --stamp' });
  return JSON.parse(bytes.toString('utf8'));
}

// A cell is only trusted when documented; unknown cells never drive behaviour.
export function documented(drivers, kind, name) {
  const cell = name.split('.').reduce((o, k) => (o ? o[k] : undefined), drivers.kinds[kind]);
  return cell && cell.status === 'documented' ? cell.value : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => { loadDrivers(process.argv[2] || DEFAULT_FILE); return { outcome: 'DRIVERS_OK' }; });
}
