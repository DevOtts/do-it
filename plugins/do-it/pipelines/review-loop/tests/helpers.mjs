import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const tmp = (p = 'dit-p4-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
export const lib = (f) => path.join(RL, f);
export function run(file, args) {
  const r = cp.spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// findings: severity letter counts -> list. fp(prefix) gives distinct fingerprints per round unless given.
export function round(n, { b = 0, m = 0, mi = 0, ni = 0, fps = null, cost = 0, estimated = false } = {}) {
  const f = [];
  const mk = (sev, count, tag) => { for (let i = 0; i < count; i++) f.push({ id: `${tag}${n}-${i}`, fingerprint: `${tag}-r${n}-${i}`, severity: sev }); };
  mk('blocker', b, 'b'); mk('major', m, 'm'); mk('minor', mi, 'mi'); mk('nit', ni, 'ni');
  if (fps) fps.forEach((fp, i) => { f[i].fingerprint = fp; });
  return { round: n, findings: f, cost_tokens: cost, estimated };
}
export const files = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
