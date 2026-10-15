#!/usr/bin/env node
// Usage: node core/state-stores/conformance/run.mjs --backend local-fs|git-branch|engine [--driver memory-engine|rows|fs-mirror|r2]
// Exit: 0 all pass, 1 a case failed, 3 target unreachable (IMPLEMENTED-NOT-VERIFIED).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cases } from './cases.mjs';
import { openStore } from '../index.mjs';
import { selectBlobDriver } from '../engine.mjs';
import { MemoryEngine } from '../engine-drivers/memory-engine.mjs';
import { createHttpRowsTransport } from '../engine-drivers/http-rows.mjs';

export async function runSuite(store, meta = {}) {
  const results = [];
  for (const [i, [name, fn]] of cases.entries()) {
    const run = `conf-${i + 1}-${Math.random().toString(36).slice(2, 8)}`;
    try { await fn(store, run); results.push({ n: i + 1, name, ok: true }); } catch (e) { results.push({ n: i + 1, name, ok: false, error: String(e.message).split('\n')[0] }); }
  }
  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length, results, ...meta };
}

export async function makeTarget({ backend, driver, tmp }) {
  if (backend === 'local-fs') return { store: openStore({ backend, root: path.join(tmp, 'fs') }), meta: { backend, driver: 'fs', real: true } };
  if (backend === 'git-branch') {
    const repo = path.join(tmp, 'repo');
    await fs.mkdir(repo, { recursive: true });
    execFileSync('git', ['init', '-q', repo]);
    return { store: openStore({ backend, repo }), meta: { backend, driver: 'git', real: true } };
  }
  if (backend === 'engine') {
    if (driver === 'memory-engine') {
      const transport = new MemoryEngine();
      return { store: openStore({ backend, transport, settings: {} }), meta: { backend, driver: 'memory-engine', real: false } };
    }
    const miss = probeEngine(driver);
    if (miss) return { unreachable: miss };
    const transport = createHttpRowsTransport({ baseUrl: process.env.DO_IT_ENGINE_URL, apiKey: process.env.DO_IT_ENGINE_TOKEN, spaceId: process.env.DO_IT_ENGINE_SPACE_ID });
    const reach = await transport.rowKeys('runs/conf-probe/').then(() => null, (e) => ({ driver, error: `${new URL(process.env.DO_IT_ENGINE_URL).host} not reachable or rows API off: ${e.message}` }));
    if (reach) return { unreachable: reach };
    const blobs = driver === 'rows' ? undefined : selectBlobDriver({ state: { engine: { blobs: driver } } }, { transport });
    return { store: openStore({ backend, transport, blobs, settings: {} }), meta: { backend, driver, real: true } };
  }
  throw new Error(`unknown backend ${backend}`);
}

// G-3: never pass on a mock. Returns a record naming what is missing, or null when URL and key are configured.
export function probeEngine(driver) {
  if (!process.env.DO_IT_ENGINE_URL) return { driver, error: 'DO_IT_ENGINE_URL is unset: no reachable Engine staging with a card' };
  if (!process.env.DO_IT_ENGINE_TOKEN) return { driver, error: 'DO_IT_ENGINE_TOKEN is unset: the Engine rows API needs a service key (x-service-api-key)' };
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const backend = arg('--backend'), driver = arg('--driver', 'rows');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'do-it-conf-'));
  try {
    const t = await makeTarget({ backend, driver, tmp });
    if (t.unreachable) {
      console.log(`IMPLEMENTED-NOT-VERIFIED backend: ${backend}, driver: ${t.unreachable.driver}, real: true, probe: ${t.unreachable.error}`);
      process.exitCode = 3; return;
    }
    const r = await runSuite(t.store, t.meta);
    for (const c of r.results) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${String(c.n).padStart(2)} ${c.name}${c.ok ? '' : ' -- ' + c.error}`);
    console.log(`${r.passed === r.total ? 'PASS' : 'FAIL'} ${r.passed}/${r.total}`);
    console.log(`backend: ${r.backend}, driver: ${r.driver}, real: ${r.real}, root: ${backend === 'engine' ? (r.real ? 'engine-run-rows' : 'memory') : tmp}`);
    process.exitCode = r.passed === r.total ? 0 : 1;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
    process.exitCode = 1;
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
