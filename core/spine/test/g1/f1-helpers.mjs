// Store-lane F1 test helpers: fixture repositories and spine construction (no bundle build side effect).
import fs from 'node:fs';
import path from 'node:path';
import { gateFpSpine, gateKeyFor } from '../../src/gate-fingerprint.mjs';
import { FIX, mkGitRepo, tmpStore } from './g1-helpers.mjs';

export const FIX_ADAPTERS = path.join(FIX, 'f1', 'adapters');

export function fpRepo(files) {
  return mkGitRepo(files);
}

export function write(repo, rel, content) {
  const f = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

export function spineOf(repo, extra) {
  const logs = [];
  const store = extra && 'store' in extra ? extra.store : tmpStore();
  const s = gateFpSpine({ repo: repo.dir, runner: 'jest', env: repo.env, store, adaptersDir: FIX_ADAPTERS, log: (m) => logs.push(m), ...(extra || {}) });
  s.logs = logs;
  s.storeHandle = store;
  return s;
}

export function keysOf(spine, files, depsOf) {
  const out = {};
  for (const f of files) out[f] = gateKeyFor(spine, { file: f, runner: { name: 'jest', version: '29.7.0', argv: ['--ci'] }, deps: depsOf ? depsOf(f) : [] });
  return out;
}

export function changed(a, b) {
  return Object.keys(a).filter((k) => a[k].key !== b[k].key).length;
}
