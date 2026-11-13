// Where the pilot consumer repo lives on this machine. Never hardcoded (R3, X3): the path comes from the
// environment: DO_IT_PILOT_REPO names the checkout. DO_IT_PILOT_DOIT is deliberately NOT used to find it: these
// cases pin the repo as it stood on 2026-10-14 and fail against a later state, so they run only when asked for.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function pilotRepo(env = process.env) {
  if (env.DO_IT_PILOT_REPO) return env.DO_IT_PILOT_REPO;
  return null;
}

export const LAYER_DOCS = 'docs/implementation/do-it-engine-layer';
// The consumer archives finished packages under 0-done/, so both homes are tried.
const LAYER_HOMES = [LAYER_DOCS, 'docs/implementation/0-done/do-it-engine-layer'];

export function pilotLayerDir(env = process.env) {
  const repo = pilotRepo(env);
  if (!repo) return null;
  return LAYER_HOMES.map((h) => join(repo, h)).find((d) => existsSync(d)) ?? null;
}

export const PILOT_UNSET = 'IMPLEMENTED-NOT-VERIFIED: DO_IT_PILOT_REPO is not set, so the pilot consumer repo is not reachable';
