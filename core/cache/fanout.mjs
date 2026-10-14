import { DEFAULT_FILE } from './drivers-load.mjs';
import fs from 'node:fs';
import { sha256 } from './canonical.mjs';

const defaultDrivers = () => JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));

// workers: [{id, kind, model, prefix}] (prefix_hash may replace prefix). One warm request per
// (kind, model, prefix hash); siblings wait for its first response. Only a documented explicit
// pre-warm gets a separate step; otherwise the first worker is the warm request.
export function planFanout(workers, drivers = defaultDrivers()) {
  const groups = new Map();
  for (const w of workers) {
    const hash = w.prefix_hash || sha256(String(w.prefix || ''));
    const key = [w.kind, w.model, hash].join('|');
    if (!groups.has(key)) groups.set(key, { kind: w.kind, model: w.model, prefix_hash: hash, workers: [] });
    groups.get(key).workers.push(w);
  }
  const steps = []; let n = 0;
  for (const g of groups.values()) {
    n++;
    const cell = drivers.kinds[g.kind] && drivers.kinds[g.kind].explicit_prewarm;
    const explicit = !!(cell && cell.status === 'documented' && cell.value === true);
    const warmId = 'warm-' + n;
    const base = { kind: g.kind, model: g.model, prefix_hash: g.prefix_hash };
    if (explicit) {
      steps.push({ id: warmId, type: 'warm', warm: 'prewarm', ...base });
      steps.push({ id: 'group-' + n, type: 'parallel', workers: g.workers.map((w) => w.id), waits_for: warmId, ...base });
    } else {
      const [first, ...rest] = g.workers;
      steps.push({ id: warmId, type: 'warm', warm: 'first_worker', kind_of_warm: 'first_worker', worker: first.id, ...base });
      if (rest.length) steps.push({ id: 'group-' + n, type: 'parallel', workers: rest.map((w) => w.id), waits_for: warmId, waits_on: 'first_response', ...base });
    }
  }
  return { steps, warm_steps: steps.filter((s) => s.type === 'warm').length };
}
