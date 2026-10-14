// Stub-host roteiros. The stub plays the part of a pipeline: it runs the fixture's real commands
// (node, git, sh), writes real evidence files and talks to the real spine. It makes no model call,
// so results are labelled stub and are never VERIFIED evidence for a [REAL] case (G-3).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { advance, copyTree, materialize, meterStub, seedFinishLine, startRun } from './fixture.mjs';
import { escalateStalled, parkOverBudget, runReview } from './reviewloop.mjs';
import { git, ledgerOf, readJson, record, sh, spine, stateOf, writeJson } from './spine.mjs';

function evidenceLog(ctx, rel, command, r) {
  const f = path.join(ctx.workdir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '$ ' + command + '\n' + r.stdout + r.stderr + 'exit: ' + r.code + '\n');
  return rel;
}

// A record call the roteiro depends on must succeed: an unnoticed failed record would leave the ledger short.
function recordOk(ctx, o) {
  const rec = record(ctx, o);
  assert.equal(rec.code, 0, 'record failed: ' + rec.stdout + rec.stderr);
  return rec;
}

// The stub's own intake pass. It reads card frontmatter with its own parser and classifies with its own code,
// not scripts/measure-fixture.mjs or the fixture's rules.json, so agreement with expected.json is evidence (finding 6).
function readCard(file, text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const c = { file };
  for (const line of (m ? m[1] : '').split('\n')) {
    const [k, ...rest] = line.split(':');
    if (!k.trim()) continue;
    const v = rest.join(':').trim();
    c[k.trim()] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return c;
}

export function classifyCard(c) {
  if (c.needs_decision === true) return 'PARKED';
  if (c.needs_build === true) return 'BUILT';
  return c.kind === 'idea' ? 'DEFERRED' : 'CLOSED';
}

function conclude(ctx) {
  const c = spine(ctx, ['gate', 'conclude']);
  ctx.conclude = c;
  return c;
}

export const ROTEIROS = {
  'feature-overnight'(ctx) {
    startRun(ctx, 'feature', fs.readFileSync(path.join(ctx.workdir, 'request.md'), 'utf8').trim());
    const dod = readJson(path.join(ctx.workdir, 'dod.json'));
    seedFinishLine(ctx, dod.rows);
    advance(ctx, 'BUILDING');
    copyTree(path.join(ctx.fixtureDir, 'stub-solution'), ctx.workdir);
    git(ctx, ['add', '-A']);
    git(ctx, ['commit', '-q', '-m', 'feat: slugify']);
    meterStub(ctx, 'build-it', 2400, 900);
    advance(ctx, 'VERIFYING');
    const verdicts = [];
    const artifacts = [];
    for (const row of dod.rows) {
      const r = sh(ctx, row.check);
      const rel = evidenceLog(ctx, 'evidence/' + row.id + '.log', row.check, r);
      meterStub(ctx, 'build-it', 300, 80);
      verdicts.push({ row: row.id, verdict: r.code === 0 ? 'VERIFIED' : 'IMPLEMENTED-NOT-VERIFIED', evidence: r.code === 0 ? rel : null, real: false });
      artifacts.push({ path: rel, kind: 'log' });
    }
    const rec = recordOk(ctx, { verdicts, artifacts });
    ctx.recorded = rec;
    advance(ctx, 'CONCLUDING');
    return conclude(ctx);
  },

  'investigate-fix'(ctx) {
    const meta = readJson(path.join(ctx.workdir, 'fixture.json'));
    startRun(ctx, 'investigate-fix', fs.readFileSync(path.join(ctx.workdir, 'bug-report.md'), 'utf8').trim());
    seedFinishLine(ctx, [{ id: meta.regression_row, kind: 'dod', text: 'regression check is green' }]);
    advance(ctx, 'BUILDING');
    const cmd = 'node ' + meta.failing_check;
    const red = sh(ctx, cmd);
    const redRel = evidenceLog(ctx, 'evidence/red.log', cmd, red);
    meterStub(ctx, 'build-it', 1800, 600);
    ctx.red = red.code;
    copyTree(path.join(ctx.fixtureDir, 'stub-solution'), ctx.workdir);
    git(ctx, ['add', '-A']);
    git(ctx, ['commit', '-q', '-m', 'fix: clamp upper bound is inclusive']);
    advance(ctx, 'VERIFYING');
    const green = sh(ctx, cmd);
    const greenRel = evidenceLog(ctx, 'evidence/green.log', cmd, green);
    meterStub(ctx, 'build-it', 500, 120);
    ctx.green = green.code;
    const ok = red.code !== 0 && green.code === 0;
    const rec = recordOk(ctx, {
      verdicts: [{ row: meta.regression_row, verdict: ok ? 'VERIFIED' : 'IMPLEMENTED-NOT-VERIFIED', evidence: ok ? greenRel : null, real: false }],
      artifacts: [{ path: redRel, kind: 'log' }, { path: greenRel, kind: 'log' }],
    });
    ctx.recorded = rec;
    advance(ctx, 'CONCLUDING');
    return conclude(ctx);
  },

  'weekly-drain'(ctx, variant) {
    const cards = fs.readdirSync(path.join(ctx.workdir, 'backlog')).filter((f) => f.endsWith('.md')).sort()
      .map((f) => readCard(f, fs.readFileSync(path.join(ctx.workdir, 'backlog', f), 'utf8')));
    startRun(ctx, 'drain', 'Drain the weekly backlog');
    seedFinishLine(ctx, cards.map((c) => ({ id: c.id, kind: 'dod', text: c.file })));
    advance(ctx, 'BUILDING');
    const leaveOpen = variant && variant.startsWith('leave-open:') ? variant.slice('leave-open:'.length) : null;
    ctx.cards = cards;
    ctx.pending = [];
    const table = [];
    fs.mkdirSync(path.join(ctx.workdir, 'archive'), { recursive: true });
    for (const c of cards) {
      const disposition = classifyCard(c);
      table.push({ id: c.id, disposition });
      if (c.id === leaveOpen) { ctx.pending.push({ id: c.id, disposition }); continue; }
      drainRow(ctx, c, disposition);
    }
    meterStub(ctx, 'build-it', 3000, 900);
    advance(ctx, 'VERIFYING');
    writeJson(path.join(ctx.workdir, 'drain-table.json'), { rows: table });
    ctx.table = table;
    finishDrain(ctx);
    advance(ctx, 'CONCLUDING');
    return conclude(ctx);
  },

  deploy(ctx, variant) {
    return runDeployVariant(ctx, variant);
  },

  // Variants are the fixture files: converge, converge-clean, stall, over-budget.
  'review-loop'(ctx, variant) {
    const d = runReview(ctx, variant || 'converge');
    if (d.exit === 'STALLED') return escalateStalled(ctx, d).esc;
    if (d.exit === 'OVER_BUDGET') return parkOverBudget(ctx, d).park;
    advance(ctx, 'CONCLUDING');
    return conclude(ctx);
  },
};

// One card: write evidence, archive unless parked, and record the row.
export function drainRow(ctx, card, disposition) {
  const rel = 'evidence/' + card.id + '.txt';
  fs.mkdirSync(path.join(ctx.workdir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(ctx.workdir, rel), 'card ' + card.id + ' disposition ' + disposition + '\nneeds_build=' + card.needs_build + ' needs_decision=' + card.needs_decision + '\n');
  if (disposition !== 'PARKED') {
    const dst = path.join(ctx.workdir, 'archive', card.file);
    fs.writeFileSync(dst, fs.readFileSync(path.join(ctx.workdir, 'backlog', card.file), 'utf8') + '\n---\nDisposition: ' + disposition + '\n');
    fs.rmSync(path.join(ctx.workdir, 'backlog', card.file));
  }
  ctx.drained = ctx.drained || [];
  const v = disposition === 'PARKED'
    ? { row: card.id, verdict: 'BLOCKED', evidence: 'parked: needs an owner decision (' + card.id + ')', real: false }
    : { row: card.id, verdict: 'VERIFIED', evidence: rel, real: false };
  ctx.drained.push({ v, art: { path: rel, kind: 'log' } });
}

export function finishDrain(ctx) {
  if (!ctx.drained || !ctx.drained.length) return null;
  const rec = recordOk(ctx, { verdicts: ctx.drained.map((d) => d.v), artifacts: ctx.drained.map((d) => d.art) });
  ctx.drained = [];
  git(ctx, ['add', '-A']);
  git(ctx, ['commit', '-q', '-m', 'drain: archive accounted cards']);
  return rec;
}

// Give a left-open card its disposition after the first conclude was refused (T-R4-06).
export function accountForPending(ctx) {
  for (const p of ctx.pending) {
    const card = ctx.cards.find((c) => c.id === p.id);
    drainRow(ctx, card, p.disposition);
  }
  ctx.pending = [];
  return finishDrain(ctx);
}

// ---------------------------------------------------------------- deploy (scripted adapter)

export function deployEvent(ctx, ev) {
  const f = path.join(ctx.workdir, '.deploy-it', 'events.jsonl');
  const n = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0;
  fs.appendFileSync(f, JSON.stringify({ seq: n + 1, ...ev }) + '\n');
}

export function deployEvents(ctx) {
  const f = path.join(ctx.workdir, '.deploy-it', 'events.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

export function fileSha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function adapter(ctx) { return readJson(path.join(ctx.workdir, '.deploy-it', 'adapter.json')); }

function deployEvidence(ctx, rel, parts) {
  const f = path.join(ctx.workdir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, parts.join('\n') + '\n');
  return rel;
}

// Run every leg: command, optional tamper, then an independent re-read via the leg's verify command.
export function deployLegs(ctx, o) {
  const ad = adapter(ctx);
  const env = {};
  if (o.failCommand) env.DEPLOY_FAIL = o.failCommand;
  const legs = [];
  const artifacts = [];
  const prefix = o.prefix || '';
  for (const leg of ad.legs) {
    const run = sh(ctx, leg.run, env);
    deployEvent(ctx, { kind: 'run', leg: leg.leg, exit: run.code, phase: o.phase || 'deploy' });
    let verify = { code: null, stdout: '', stderr: '' };
    if (run.code === 0) {
      if (o.tamperAfter === leg.leg) {
        fs.writeFileSync(path.join(ctx.workdir, ad.target), 'tampered after the leg claimed success\n');
        deployEvent(ctx, { kind: 'tamper', leg: leg.leg, phase: o.phase || 'deploy' });
      }
      verify = sh(ctx, leg.verify, env);
      deployEvent(ctx, { kind: 'verify', leg: leg.leg, exit: verify.code, phase: o.phase || 'deploy' });
    }
    const ok = run.code === 0 && verify.code === 0;
    const rel = deployEvidence(ctx, 'evidence/deploy/' + prefix + leg.leg + '.txt', [
      '$ ' + leg.run, run.stdout + run.stderr + 'exit: ' + run.code,
      '$ ' + leg.verify + ' (independent re-read)', run.code === 0 ? verify.stdout + verify.stderr + 'exit: ' + verify.code : 'not run',
    ]);
    artifacts.push({ path: rel, kind: 'log' });
    legs.push({ leg: leg.leg, state: ok ? 'DEPLOYED_VERIFIED' : 'FAILED', evidence: rel, compensate: ok ? leg.rollback : undefined });
    if (!ok) break;
  }
  const failed = legs.some((l) => l.state === 'FAILED');
  return record(ctx, { stage: 'deploy-it', status: failed ? 'failed' : 'ok', legs, artifacts });
}

// Follow `next`: run each rollback command in the order the spine names, verify, record one leg at a time.
export function rollbackAll(ctx, o) {
  const ad = adapter(ctx);
  const n = spine(ctx, ['next']);
  const order = (n.out && n.out.legs) || [];
  const env = o && o.rollbackFail ? { ROLLBACK_FAIL: o.rollbackFail } : {};
  const pre = fs.readFileSync(path.join(ctx.workdir, '.deploy-it', 'pre.sha256'), 'utf8').trim();
  let last = null;
  for (const name of order) {
    const leg = ad.legs.find((l) => l.leg === name);
    const r = sh(ctx, leg.rollback, env);
    deployEvent(ctx, { kind: 'rollback', leg: name, exit: r.code });
    let ok = r.code === 0;
    const extra = [];
    if (ok && name === 'write') {
      const now = fileSha(path.join(ctx.workdir, ad.target));
      extra.push('target sha256 ' + now + ' pre-deploy sha256 ' + pre);
      ok = now === pre;
    }
    const mismatch = /digest mismatch/.test(r.stderr + r.stdout);
    const rel = deployEvidence(ctx, 'evidence/deploy/rollback-' + name + (ok ? '' : mismatch ? '-digest-mismatch' : '-failed') + '.txt', ['$ ' + leg.rollback, r.stdout + r.stderr + 'exit: ' + r.code, ...extra]);
    last = record(ctx, { stage: 'deploy-it', status: ok ? 'ok' : 'failed', legs: [{ leg: name, state: ok ? 'ROLLED_BACK' : 'FAILED', evidence: rel }], artifacts: [{ path: rel, kind: 'log' }] });
    if (!ok) { deployEvent(ctx, { kind: 'stop', reason: 'rollback failed', leg: name }); break; }
  }
  return last;
}

export function redeploy(ctx) {
  advance(ctx, 'DEPLOYING');
  return deployLegs(ctx, { phase: 'recovery', prefix: 'redeploy-' });
}

// Variants: happy | fail-publish | fail-publish,rollback-fail:write | tamper:verify-digest | recover (fail-publish, rollback, redeploy).
export function runDeployVariant(ctx, variant) {
  const parts = String(variant || 'happy').split(',');
  const has = (p) => parts.some((x) => x === p || x.startsWith(p + ':'));
  const arg = (p) => (parts.find((x) => x.startsWith(p + ':')) || '').slice(p.length + 1);
  const ad = adapter(ctx);
  startRun(ctx, 'deploy', 'Deploy the release through the scripted adapter');
  fs.writeFileSync(path.join(ctx.workdir, '.deploy-it', 'pre.sha256'), fileSha(path.join(ctx.workdir, ad.target)) + '\n');
  advance(ctx, 'BUILDING', 'VERIFYING', 'DEPLOYING');
  meterStub(ctx, 'deploy-it', 800, 200);
  ctx.first = deployLegs(ctx, { failCommand: has('fail-publish') || has('recover') ? 'publish' : null, tamperAfter: has('tamper') ? arg('tamper') : null });
  if (ctx.first.out && ctx.first.out.outcome === 'PARTIAL_FAILURE' && !has('tamper') && !has('stop-at-partial')) {
    ctx.rollback = rollbackAll(ctx, { rollbackFail: has('rollback-fail') ? arg('rollback-fail') : null });
    if (has('recover') && stateOf(ctx).status === 'ROLLED_BACK') {
      ctx.recovery = redeploy(ctx);
      advance(ctx, 'CONCLUDING');
      return spine(ctx, ['gate', 'conclude']);
    }
    return { code: ctx.rollback && ctx.rollback.code, out: ctx.rollback && ctx.rollback.out };
  }
  if (ctx.first.out && ctx.first.out.outcome === 'RECORDED' && stateOf(ctx).status === 'PROVING') {
    advance(ctx, 'CONCLUDING');
    return conclude(ctx);
  }
  return { code: ctx.first.code, out: ctx.first.out };
}

export { ledgerOf, materialize };
