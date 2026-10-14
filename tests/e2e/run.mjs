#!/usr/bin/env node
// e2e harness: run a fixture on a host and write tests/e2e/out/{fixture}/ (state, ledger, events, token meter).
// usage: node tests/e2e/run.mjs --fixture NAME [--host stub|claude-code|codex|opencode] [--variant V] [--out DIR]
// Exit: the conclude exit code of the run (0 = concluded), 4 = host or pipeline not available
// (IMPLEMENTED-NOT-VERIFIED: a real host is never replaced by the stub).
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materialize } from './lib/fixture.mjs';
import { ROTEIROS } from './lib/roteiros.mjs';
import { doItDir, readJson, runDirOf } from './lib/spine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXIT_NOT_AVAILABLE = 4;
const HOST_BINARY = { 'claude-code': 'claude', codex: 'codex', opencode: 'opencode' };

function onPath(bin) {
  return cp.spawnSync('sh', ['-c', 'command -v ' + bin], { encoding: 'utf8' }).status === 0;
}

export function exportOut(ctx, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const copy = (src, name) => { if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, name || path.basename(src))); };
  copy(path.join(runDirOf(ctx), 'state.json'));
  copy(path.join(runDirOf(ctx), 'ledger.json'));
  copy(path.join(runDirOf(ctx), 'events.jsonl'));
  copy(path.join(runDirOf(ctx), 'token-meter.jsonl'));
  copy(path.join(runDirOf(ctx), 'owner-pack.json'));
  copy(path.join(doItDir(ctx), 'finish-line.json'));
  copy(path.join(ctx.workdir, 'drain-table.json'));
  copy(path.join(ctx.workdir, '.deploy-it', 'events.jsonl'), 'deploy-events.jsonl');
  const ev = path.join(ctx.workdir, 'evidence');
  if (fs.existsSync(ev)) fs.cpSync(ev, path.join(outDir, 'evidence'), { recursive: true });
}

export function runFixture(opts) {
  const fixture = opts.fixture;
  const host = opts.host || 'stub';
  if (host !== 'stub') {
    const bin = HOST_BINARY[host];
    if (!bin) return { exit: 1, outcome: 'USAGE', reason: 'unknown host ' + host };
    return {
      exit: EXIT_NOT_AVAILABLE,
      outcome: 'IMPLEMENTED-NOT-VERIFIED',
      reason: (onPath(bin) ? '`' + bin + '` is installed but the host driver and the pipelines are not built yet (H1-H3, P1-P4, S2/S4/S5)' : '`' + bin + '` is not installed') + '; the stub is never substituted for a real host (G-3)',
    };
  }
  if (!ROTEIROS[fixture]) {
    return { exit: EXIT_NOT_AVAILABLE, outcome: 'IMPLEMENTED-NOT-VERIFIED', reason: 'no stub roteiro for ' + fixture + ': it needs a pipeline or engine that is not built yet' };
  }
  const ctx = materialize(fixture, { host });
  const c = ROTEIROS[fixture](ctx, opts.variant || '');
  const outDir = opts.outDir || path.join(HERE, 'out', fixture);
  exportOut(ctx, outDir);
  const state = fs.existsSync(path.join(runDirOf(ctx), 'state.json')) ? readJson(path.join(runDirOf(ctx), 'state.json')) : {};
  const summary = { fixture, host, variant: opts.variant || '', run_id: ctx.runId, status: state.status, run_verdict: state.run_verdict === undefined ? null : state.run_verdict, last: { code: c && c.code, outcome: c && c.out && c.out.outcome }, out_dir: outDir };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const code = c && typeof c.code === 'number' ? c.code : 1;
  return { exit: code, outcome: summary.last.outcome, summary, ctx, last: c };
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf('--' + k); return i === -1 ? null : argv[i + 1]; };
  const fixture = get('fixture');
  if (!fixture) { console.error('usage: run.mjs --fixture NAME [--host stub|claude-code|codex|opencode] [--variant V] [--out DIR]'); return 1; }
  const r = runFixture({ fixture, host: get('host') || 'stub', variant: get('variant') || '', outDir: get('out') || null });
  console.log(JSON.stringify(r.summary || { outcome: r.outcome, reason: r.reason }, null, 2));
  if (r.reason) console.error(r.reason);
  return r.exit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
