// Shared helpers for the Q2 cases: the process-tree fixture, a liveness detector by pid, and survivor cleanup.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { G3, alive, waitFor } from './q1-helpers.mjs';

export const TREE = path.join(G3, 'fixtures', 'tree.mjs');
export const NEST = path.join(G3, 'fixtures', 'nest.mjs');

// A tree gate: `node tree.mjs {dir}` under the queue, TREE_MODE in the env.
export function treeGate(sb, flags, mode, dir, extraEnv) {
  fs.mkdirSync(dir, { recursive: true });
  return sb.gate(flags, null, { argv: [process.execPath, TREE, dir], env: sb.env({ TREE_MODE: mode, ...(extraEnv || {}) }) });
}

export async function treePids(dir, ms) {
  const f = path.join(dir, 'pids.json');
  await waitFor(() => fs.existsSync(f), ms || 15000, 'pids.json in ' + dir);
  return JSON.parse(fs.readFileSync(f, 'utf8')).pids;
}

// The liveness detector: how many of these pids still answer kill 0.
export function aliveCount(pids) {
  return Object.values(pids).filter((p) => alive(p)).length;
}

// A process started by the test (not a descendant of any gate), with the same argv as a tree gate.
export function decoy(dir, opts) {
  const c = cp.spawn(process.execPath, [TREE, dir], { detached: !!(opts && opts.detached), stdio: 'ignore', env: { ...process.env, TREE_MODE: 'decoy' } });
  return c;
}

export function killAll(pids) {
  for (const p of Object.values(pids || {})) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

// Registers a t.after that SIGKILLs every pid named in pids.json under dir (a failing case must not leak).
export function reapAfter(t, dirs, extra) {
  t.after(() => {
    for (const d of dirs) {
      try { killAll(JSON.parse(fs.readFileSync(path.join(d, 'pids.json'), 'utf8')).pids); } catch { /* none */ }
    }
    for (const p of extra || []) { try { process.kill(p.pid || p, 'SIGKILL'); } catch { /* gone */ } }
  });
}

// Waits until a pid answers ESRCH (a pid that is not our child cannot be waited on otherwise).
export async function gone(pid, ms) {
  await waitFor(() => !alive(pid), ms || 15000, 'pid ' + pid + ' to exit');
}
