// Slice-level driving of the real spine: READINESS.json, `gate build`, per-slice results. The stub plays the
// builder (it runs a real command and writes a real log); the scheduling decisions come from the spine's `next`.
import fs from 'node:fs';
import path from 'node:path';
import { startRun } from './fixture.mjs';
import { doItDir, record, sh, spine, stateOf, writeJson } from './spine.mjs';

export function startSliceRun(ctx, ids, o) {
  const opts = o || {};
  startRun(ctx, opts.preset || 'feature', opts.request || 'Build ' + ids.length + ' slices');
  writeJson(path.join(doItDir(ctx), 'plan', 'READINESS.json'), {
    schema: 'do-it-readiness/1',
    decisions: [{ id: 'D1', state: 'RESOLVED' }],
    preflight: { passed: true },
    credentials: [],
    owner_dependent_slices: 0,
    slices: ids.map((id) => ({ id, lane: 'L1', class: opts.class || 'implementation', depends_on: (opts.deps && opts.deps[id]) || [] })),
  });
  const b = spine(ctx, ['gate', 'build']);
  if (b.code !== 0) throw new Error('gate build failed: ' + b.stdout);
  return b;
}

// The stub builder: runs `command`, logs it, reports the slice. exit 0 = VERIFIED with the log as evidence.
export function buildSlice(ctx, sliceId, command, extra) {
  const r = sh(ctx, command);
  const rel = 'evidence/slice-' + sliceId + '-' + (fs.existsSync(path.join(ctx.workdir, 'evidence')) ? fs.readdirSync(path.join(ctx.workdir, 'evidence')).length : 0) + '.log';
  fs.mkdirSync(path.join(ctx.workdir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(ctx.workdir, rel), '$ ' + command + '\n' + r.stdout + r.stderr + 'exit: ' + r.code + '\n');
  const ok = r.code === 0;
  return record(ctx, {
    slice_id: sliceId,
    status: ok ? 'ok' : 'failed',
    verdicts: ok ? [{ row: sliceId, verdict: 'VERIFIED', evidence: rel, real: false }] : [],
    artifacts: [{ path: rel, kind: 'log' }],
    ...(extra || {}),
  });
}

export const nextOf = (ctx) => spine(ctx, ['next']);
export const sliceOf = (ctx, id) => stateOf(ctx).slices.find((s) => s.id === id);

// An executable hook script that logs its arguments and exits with `code` (optionally printing a line first).
export function hookScript(ctx, name, o) {
  const f = path.join(ctx.userHome, name);
  const log = path.join(ctx.userHome, name + '.log');
  fs.writeFileSync(f, '#!/bin/sh\necho "$@" >> "' + log + '"\n' + (o && o.print ? 'echo ' + o.print + '\n' : '') + 'exit ' + ((o && o.code) || 0) + '\n');
  fs.chmodSync(f, 0o755);
  return { file: f, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0) };
}
