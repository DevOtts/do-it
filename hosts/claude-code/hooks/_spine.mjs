// Shared by the two hooks. This directory is mirrored on its own into the plugin, so it imports
// nothing outside itself. The spine is reached as a command: DO_IT_SPINE (a script run with node,
// used by tests), else the plugin copy, else the in-repo bundle.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function spineScript() {
  if (process.env.DO_IT_SPINE) return process.env.DO_IT_SPINE;
  const candidates = [join(HERE, '..', 'scripts', 'do-it.mjs'), join(HERE, '..', '..', '..', 'core', 'spine', 'do-it.mjs')];
  return candidates.find((p) => existsSync(p));
}

// Returns { exit, json } ; json is null when stdout is not JSON or the spine is unreachable.
export function callSpine(args, cwd) {
  const script = spineScript();
  if (!script) return { exit: null, json: null };
  const r = spawnSync(process.execPath, [script, ...args], { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 20000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { exit: r.status, json };
}

export function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
