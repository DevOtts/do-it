// Materialize a fixture into a scratch git repo and start a spine run on it.
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, git, newScratch, spine } from './spine.mjs';

const SKIP = new Set(['expected.json', 'stub-solution', 'node_modules', '.git']);

export function copyTree(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip && skip.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyTree(s, d, skip); else fs.copyFileSync(s, d);
  }
}

export function materialize(fixture, opts) {
  const userHome = newScratch('dit-e2e-home-');
  const workdir = newScratch('dit-e2e-' + fixture + '-');
  const ctx = { fixture, fixtureDir: path.join(FIXTURES, fixture), workdir, userHome, runId: null, host: (opts && opts.host) || 'stub' };
  copyTree(ctx.fixtureDir, workdir, SKIP);
  git(ctx, ['init', '-q', '-b', 'main']);
  git(ctx, ['config', 'user.email', 'e2e@example.com']);
  git(ctx, ['config', 'user.name', 'e2e']);
  fs.writeFileSync(path.join(workdir, '.gitignore'), '.do-it/\nresults/\nevidence/\n');
  git(ctx, ['add', '-A']);
  git(ctx, ['commit', '-q', '-m', 'fixture base']);
  git(ctx, ['tag', 'fixture-base']);
  return ctx;
}

export function startRun(ctx, preset, request) {
  const r = spine(ctx, ['start', '--preset', preset, '--request', request, '--host', 'stub']);
  if (r.code !== 0) throw new Error('start failed: ' + r.stdout + r.stderr);
  ctx.runId = r.out.run_id;
  return ctx.runId;
}

export function seedFinishLine(ctx, rows) {
  const full = rows.map((r) => ({ id: r.id, kind: r.kind || 'dod', state: 'OPEN', evidence: null, owner_question: null, reason: null, archived_to: null, text: r.text }));
  fs.mkdirSync(path.join(ctx.workdir, '.do-it'), { recursive: true });
  fs.writeFileSync(path.join(ctx.workdir, '.do-it', 'finish-line.json'), JSON.stringify({ rows: full }, null, 2) + '\n');
}

export function advance(ctx, ...steps) {
  for (const to of steps) {
    const r = spine(ctx, ['gate', 'advance', '--to', to]);
    if (r.code !== 0) throw new Error('advance to ' + to + ' failed: ' + r.stdout);
  }
}

// Stub meter rows are estimates, never labelled provider (G-6).
export function meterStub(ctx, stage, tokensIn, tokensOut) {
  return spine(ctx, ['meter', '--append', '--source', 'estimate', '--estimated', 'true', '--tokens-in', String(tokensIn), '--tokens-out', String(tokensOut), '--stage', stage, '--host', 'stub']);
}
