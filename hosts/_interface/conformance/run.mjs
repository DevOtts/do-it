#!/usr/bin/env node
// Shared conformance suite. Usage: run.mjs --adapter PATH --json [--off LIST] [--case ID] [--skip ID=REASON]... [--workdir DIR]
// An adapter passes when no case FAILs and every SKIP has a reason matching a false capability (docs/03 s8).
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { validateFile } from '../validate.mjs';
import * as fb from '../lib/fallbacks.mjs';
import { meterRow } from '../lib/estimate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { skip: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--adapter') o.adapter = argv[++i];
    else if (a === '--off') o.off = argv[++i].split(',').filter(Boolean);
    else if (a === '--case') o.case = argv[++i];
    else if (a === '--workdir') o.workdir = argv[++i];
    else if (a === '--skip') { const s = argv[++i]; const k = s.indexOf('='); o.skip.push({ case: k < 0 ? s : s.slice(0, k), reason: k < 0 ? '' : s.slice(k + 1) }); }
  }
  return o;
}

function capValue(caps, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), caps);
}

const scratch = (ctx, name) => { const d = join(ctx.adapter.workdir, 'case-' + name); mkdirSync(d, { recursive: true }); return d; };

const handlers = {
  'schema-adapter-valid': (ctx) => {
    const errs = validateFile('adapter', ctx.adapter.manifestPath);
    assert.deepEqual(errs, [], JSON.stringify(errs));
    return {};
  },
  'schema-caps-valid': (ctx) => {
    const errs = validateFile('capabilities', ctx.adapter.capabilitiesPath);
    assert.deepEqual(errs, [], JSON.stringify(errs));
    return {};
  },
  'spawn-native': (ctx) => {
    const r = ctx.adapter.spawn({ role: 'builder', tier: 'T2', brief: 'x' });
    assert.equal(r.outcome, 'ok');
    assert.ok(existsSync(r.result_path));
    return { outcome: r.outcome };
  },
  'spawn-untiered': (ctx) => {
    const before = ctx.adapter.stats.spawns;
    const r = ctx.adapter.spawn({ role: 'builder', brief: 'x' });
    assert.equal(r.outcome, 'UNTIERED_SPAWN');
    assert.equal(ctx.adapter.stats.spawns, before);
    return { outcome: r.outcome };
  },
  'fallback-spawn': (ctx) => {
    const r = fb.spawnRoles(ctx.adapter, [{ role: 'builder', tier: 'T2', brief: 'b' }, { role: 'verifier', tier: 'T2', brief: 'v' }]);
    assert.equal(r.mode, ctx.caps.spawn.native ? 'native' : 'sequential');
    assert.deepEqual(r.spans.map((s) => s.role), ['builder', 'verifier']);
    assert.ok(r.spans[0].end <= r.spans[1].start, 'builder must end before verifier starts');
    assert.ok(r.results.every((x) => x.outcome === 'ok'));
    return { outcome: { mode: r.mode }, spans: r.spans };
  },
  'ask-native': (ctx) => {
    const pack = { questions: [{ n: 1, text: 'a' }, { n: 2, text: 'b' }] };
    const r = ctx.adapter.ask(pack);
    assert.equal(r.outcome, 'ok');
    assert.equal(r.channel, 'native');
    assert.equal(ctx.adapter.stats.nativeAsk, 1);
    return { outcome: 'native' };
  },
  'fallback-ask': (ctx) => {
    const n = ctx.caps.ask.native ? ctx.caps.ask.max_questions + 1 : 3;
    const pack = { questions: Array.from({ length: n }, (_, i) => ({ n: i + 1, text: `q${i + 1}` })) };
    const dir = scratch(ctx, 'ask');
    const before = ctx.adapter.stats.nativeAsk;
    const r = fb.askChain(ctx.adapter, pack, dir);
    const htmlOff = ctx.off.includes('renderer.html');
    assert.equal(r.channel, htmlOff ? 'markdown' : 'html');
    assert.deepEqual(r.attempted, htmlOff ? ['html', 'markdown'] : ['html']);
    assert.ok(existsSync(r.path));
    assert.ok(r.path.endsWith(htmlOff ? 'owner-pack.md' : 'owner-pack.html'));
    assert.equal(ctx.adapter.stats.nativeAsk - before, 0);
    return { outcome: { channel: r.channel, path: r.path, attempted: r.attempted, questions: n, native_calls: 0 } };
  },
  'continue-headless': (ctx) => {
    const r = ctx.adapter.continue({ run_id: 'r1', path: 'h.md' });
    assert.equal(r.outcome, 'ok');
    assert.equal(ctx.adapter.stats.children, 1);
    return { outcome: 'ok' };
  },
  'fallback-continue': (ctx) => {
    const before = ctx.adapter.stats.children;
    const r = fb.continueOrAsk(ctx.adapter, { run_id: 'r1', path: 'runs/r1/handoff.md' });
    if (ctx.caps.continue.headless) { assert.equal(r.outcome, 'ok'); return { outcome: 'ok' }; }
    assert.equal(r.outcome, 'handoff.mode:ask');
    assert.equal(r.mode, 'ask');
    assert.ok(typeof r.command === 'string' && r.command.length > 0 && !/[\r\n]/.test(r.command));
    assert.equal(ctx.adapter.stats.children, before, 'no child process may be spawned');
    return { outcome: r.outcome, command: r.command, children_spawned: 0 };
  },
  'fallback-handoff-cap': () => {
    const c = fb.createAttemptCounter(5);
    let spawned = 0;
    const run = () => { spawned++; return fb.failingStart(); };
    const out = [];
    for (let i = 0; i < 6; i++) out.push(fb.handoffAttempt(c, run));
    assert.deepEqual(out.slice(0, 4).map((x) => x.outcome), Array(4).fill('HANDOFF_FAILED'));
    assert.deepEqual(out[4], { outcome: 'ESCALATED', attempts: 5 });
    assert.equal(out[5].outcome, 'ESCALATED');
    assert.equal(spawned, 5, 'sixth call spawns nothing');
    return { outcome: out.map((x) => `${x.outcome}:${x.attempts}`) };
  },
  'wake-native': (ctx) => {
    const r = ctx.adapter.wake('2026-10-15T00:00:00Z', 'resume');
    assert.equal(r.outcome, 'ok');
    return { outcome: 'ok' };
  },
  'fallback-wake': (ctx) => {
    const r = fb.wakeOrPark(ctx.adapter, '2026-10-15T00:00:00Z', 'resume');
    if (ctx.caps.wake.native) { assert.equal(r.outcome, 'ok'); return { outcome: 'ok' }; }
    assert.equal(r.outcome, 'PARKED');
    assert.equal(r.reason, 'wake.native=false');
    assert.match(r.message, /parked/);
    assert.ok(!existsSync(join(ctx.adapter.workdir, 'timers')), 'no timer artifact may be written');
    return { outcome: 'PARKED', reason: r.reason, message: r.message };
  },
  'meter-provider': (ctx) => {
    const u = ctx.adapter.meter();
    assert.ok(u && u.tokens_in >= 0);
    const row = meterRow(u, 'ignored');
    assert.equal(row.source, 'provider');
    assert.equal(row.estimated, false);
    return {};
  },
  'fallback-meter': () => {
    const row = meterRow(null, 'x'.repeat(400));
    assert.equal(row.tokens_in, 100);
    assert.equal(row.estimated, true);
    assert.equal(row.source, 'estimate');
    const none = meterRow(null, '');
    assert.equal(none.tokens_in, null);
    assert.equal(none.source, 'unknown');
    return { rows: [row, none] };
  },
  'stop-gate-hook': (ctx) => {
    assert.deepEqual(fb.stopGate(ctx.adapter), { mode: 'hook' });
    return {};
  },
  'fallback-stopgate': (ctx) => {
    const r = fb.stopGate(ctx.adapter);
    if (ctx.caps.hooks.stop_gate) { assert.equal(r.mode, 'hook'); return { mode: 'hook' }; }
    assert.equal(r.mode, 'checklist');
    assert.ok(r.items.length >= 3 && r.items.every((s) => typeof s === 'string' && s.length > 0));
    return { mode: 'checklist', items: r.items };
  },
  'recovery-partial': async (ctx) => {
    const a = await ctx.create({ workdir: join(ctx.adapter.workdir, 'recovery') });
    const k = a.spawnCrashing({ role: 'builder', tier: 'T2', brief: 'x' });
    assert.equal(k.killed, true, 'child must die by SIGKILL');
    const col = a.collect();
    assert.equal(col.results.length, 0, 'no result for the killed spawn');
    assert.equal(col.partial.length, 1, 'tmp listed as partial');
    const spawnsBefore = a.stats.spawns;
    const res = fb.resumePartials(a);
    assert.equal(res.rerun.length, 1);
    assert.equal(a.stats.spawns - spawnsBefore, 1, 'resume re-runs spawn exactly once');
    const dir = join(a.workdir, 'spawns', k.id);
    const files = readdirSync(dir);
    assert.equal(files.filter((f) => f === 'result.json').length, 1);
    assert.equal(files.filter((f) => f.endsWith('.tmp')).length, 0);
    assert.deepEqual(a.collect().partial, []);
    return { partial_listed: col.partial.length, files };
  },
  'secrets-no-leak': (ctx) => {
    const name = 'DOIT_CANARY';
    let created = false;
    if (process.env[name] === undefined) { process.env[name] = `probe-${process.pid}-${Date.now()}`; created = true; }
    try {
      const sec = ctx.adapter.drivers.secrets;
      let line = '';
      const r = sec.use(`env:${name}`, (v) => { line = `Authorization: Bearer ${v}`; });
      assert.equal(r.present, true);
      const red = sec.redact(line);
      assert.ok(!red.includes(process.env[name]), 'redacted line still carries the value');
      assert.ok(!JSON.stringify(sec.describe(`env:${name}`)).includes(process.env[name]));
      return { present: true, redacted: red.replace(process.env[name], '') };
    } finally { if (created) delete process.env[name]; }
  },
  'skip-needs-reason': (ctx) => {
    const bad = [];
    for (const s of ctx.declaredSkips) {
      const c = ctx.cases.find((x) => x.id === s.case);
      if (!s.reason || !s.reason.trim()) { bad.push(`${s.case}: empty reason`); continue; }
      if (!c) { bad.push(`${s.case}: no such case`); continue; }
      if (!c.needs || capValue(ctx.caps, c.needs) !== false) { bad.push(`${s.case}: no matching false capability`); continue; }
    }
    assert.deepEqual(bad, [], bad.join('; '));
    return { declared: ctx.declaredSkips.length };
  },
};

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.adapter) { console.error('usage: run.mjs --adapter PATH --json [--off LIST] [--case ID]'); process.exit(2); }
  const adapterPath = resolve(o.adapter);
  const mod = await import(pathToFileURL(adapterPath).href);
  const create = async (extra = {}) => mod.default({ off: o.off || [], ...extra });
  const workdir = o.workdir || mkdtempSync(join(tmpdir(), 'doit-conf-'));
  const adapter = await create({ workdir, off: o.off || [] });
  const caps = adapter.capabilities;
  const cases = readdirSync(join(HERE, 'cases')).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(HERE, 'cases', f), 'utf8')));
  const declaredSkips = [...(adapter.skips || []), ...o.skip];
  const ctx = { adapter, caps, off: o.off || [], create, cases, declaredSkips };

  const results = [];
  for (const c of cases) {
    if (o.case && o.case !== c.id) continue;
    const declared = declaredSkips.find((s) => s.case === c.id);
    const capOff = c.needs && capValue(caps, c.needs) === false;
    if (declared || capOff) {
      const reason = declared ? declared.reason : `${c.needs}=false`;
      results.push({ id: c.id, status: 'SKIP', reason });
      continue;
    }
    try {
      const evidence = await handlers[c.handler](ctx);
      results.push({ id: c.id, status: 'PASS', evidence });
    } catch (e) {
      results.push({ id: c.id, status: 'FAIL', reason: e.message.split('\n')[0] });
    }
  }
  const report = {
    adapter: adapterPath,
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    skipped: results.filter((r) => r.status === 'SKIP').map((r) => ({ case: r.id, reason: r.reason })),
    cases: results,
  };
  if (o.json) console.log(JSON.stringify(report, null, 2));
  else for (const r of results) console.log(`${r.status} ${r.id}${r.reason ? ' - ' + r.reason : ''}`);
  process.exit(report.failed ? 1 : 0);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(2); });
