import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CACHE, REPO, cli, lib, tmp, writeJson } from './helpers.mjs';
import { canonical, canonicalHash, canonicalTools, sha256 } from '../canonical.mjs';
import { guard } from '../session-guard.mjs';
import { decideTtl, markerPolicy } from '../ttl-policy.mjs';
import { planFanout } from '../fanout.mjs';
import { cacheFields, detectRegression, hitRate } from '../telemetry.mjs';
import { buildBrief } from '../../routing/brief-builder.mjs';

const DIFF = lib('prefix-diff.mjs');
const LINT = lib('lint-drivers.mjs');
const tools = [{ name: 'bash', input_schema: { type: 'object', a: 1, b: 2 } }, { name: 'edit', input_schema: { z: 1, y: 2 } }, { name: 'read', input_schema: {} }];
const SYS = 'You are the do-it builder persona. Follow the brief exactly and report verdicts honestly.'; // > 57 bytes
const req = (over) => ({ model: 'm1', tools, system: SYS, messages: [{ role: 'user', content: 'hello' }], ...over });

test('T-P3-01 ten rules, each cited', () => {
  const { rules } = JSON.parse(fs.readFileSync(lib('rules.json'), 'utf8'));
  assert.equal(rules.length, 10);
  for (const r of rules) {
    assert.ok(r.id && r.statement && r.source);
    assert.match(r.source, /research\/09-cache-prior-art\.md/);
  }
  const ids = rules.map((r) => r.id);
  for (const id of ['stable-prefix', 'append-only', 'deterministic-serialization', 'no-tool-change', 'no-model-change', 'updates-in-messages', 'no-effort-change', 'warm-then-fan-out', 'ttl-by-gap', 'min-prefix']) assert.ok(ids.includes(id), id);
});

test('T-P3-02 deterministic serialization', () => {
  const a = { model: 'm', tools: [tools[0], tools[1], tools[2]], system: 's' };
  const b = { system: 's', tools: [{ input_schema: { b: 2, a: 1, type: 'object' }, name: 'bash' }, tools[2], { input_schema: { y: 2, z: 1 }, name: 'edit' }], model: 'm' };
  assert.equal(sha256(canonical(a)), sha256(canonical(b)));
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.deepEqual(canonicalTools(b.tools).map((t) => t.name), ['bash', 'edit', 'read']);
});

test('T-P3-03 identical prefixes', () => {
  const f1 = writeJson(req()); const f2 = writeJson(req());
  const r = cli(DIFF, [f1, f2]);
  assert.equal(r.code, 0);
  assert.equal(r.out.outcome, 'PREFIX_STABLE');
});

test('T-P3-04 volatile content in the system block at offset 57', () => {
  const stamp = '2026-10-14T10:00:00Z ';
  const sys2 = SYS.slice(0, 57) + stamp + SYS.slice(57);
  const r = cli(DIFF, [writeJson(req()), writeJson(req({ system: sys2 }))]);
  assert.equal(r.code, 1);
  assert.equal(r.out.block, 'system');
  assert.equal(r.out.offset, 57);
  assert.equal(r.out.class, 'volatile_content');
  assert.equal(r.out.rule, 'stable-prefix');
});

test('T-P3-05 tool order and tool set changes', () => {
  const reordered = req({ tools: [tools[2], tools[0], tools[1]] });
  const r1 = cli(DIFF, [writeJson(req()), writeJson(reordered)]);
  assert.equal(r1.code, 1);
  assert.equal(r1.out.class, 'tool_order');
  assert.equal(r1.out.block, 'tools');
  const added = req({ tools: [...tools, { name: 'grep', input_schema: {} }] });
  const r2 = cli(DIFF, [writeJson(req()), writeJson(added)]);
  assert.equal(r2.code, 1);
  assert.equal(r2.out.class, 'tool_set_changed');
  assert.equal(r2.out.rule, 'no-tool-change');
});

test('T-P3-06 [REAL] detector on real files', () => {
  const d = tmp();
  const a = Buffer.alloc(4096, 0x61); const b = Buffer.from(a); b[2000] = 0x62;
  const fa = path.join(d, 'a.bin'); const fb = path.join(d, 'b.bin');
  fs.writeFileSync(fa, a); fs.writeFileSync(fb, b);
  assert.equal(fs.statSync(fa).size, 4096);
  const r = cli(DIFF, [fa, fb]);
  assert.equal(r.code, 1);
  assert.equal(r.out.offset, 2000);
  fs.writeFileSync(fb, a);
  const ok = cli(DIFF, [fa, fb]);
  assert.equal(ok.code, 0);
  assert.equal(ok.out.outcome, 'PREFIX_STABLE');
});

test('T-P3-07 model change is flagged', () => {
  const r = cli(DIFF, [writeJson(req()), writeJson(req({ model: 'm2' }))]);
  assert.equal(r.code, 1);
  assert.equal(r.out.class, 'model_changed');
  const g = guard(req(), req({ model: 'm2' }));
  assert.equal(g.outcome, 'MODEL_CHANGED');
  assert.match(g.advice.join(' '), /new session at a spawn boundary/);
  const c = cli(lib('session-guard.mjs'), [writeJson(req()), writeJson(req({ model: 'm2' }))]);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'MODEL_CHANGED');
});

test('T-P3-08 TTL by gap', () => {
  assert.deepEqual(decideTtl({ gap_s: 120, expected_calls: 2 }), { ttl: '5m', cold_expected: false });
  assert.deepEqual(decideTtl({ gap_s: 600, expected_calls: 3 }), { ttl: '1h', cold_expected: false });
  assert.deepEqual(decideTtl({ gap_s: 600, expected_calls: 1 }), { ttl: '5m', cold_expected: false });
  assert.deepEqual(decideTtl({ gap_s: 4000, expected_calls: 3 }), { ttl: '5m', cold_expected: true });
  assert.equal(decideTtl({ gap_s: 270, expected_calls: 9 }).ttl, '5m');
  assert.equal(decideTtl({ gap_s: 3570, expected_calls: 2 }).ttl, '1h');
});

test('T-P3-09 below the minimum prefix', () => {
  const table = { 'model-a': 1024 };
  const low = markerPolicy({ model: 'model-a', prefix_tokens: 400, table });
  assert.equal(low.marker, false);
  assert.equal(low.event, 'BELOW_MIN_PREFIX');
  const unk = markerPolicy({ model: 'not-in-table', prefix_tokens: 5000, table });
  assert.equal(unk.marker_policy, 'unknown');
  assert.equal(unk.cache_expected, 'unknown');
  assert.ok(!unk.ttl_allowed.includes('1h'));
  assert.equal(markerPolicy({ model: 'model-a', prefix_tokens: 2000, table }).marker, true);
});

const w = (id, kind, model, prefix) => ({ id, kind, model, prefix });
test('T-P3-10 warm then fan out', () => {
  const p1 = planFanout([1, 2, 3, 4].map((i) => w('w' + i, 'anthropic', 'm1', 'P')));
  assert.equal(p1.steps.length, 2);
  assert.equal(p1.steps[0].type, 'warm');
  assert.equal(p1.steps[1].type, 'parallel');
  assert.equal(p1.steps[1].workers.length, 4);
  assert.equal(p1.steps[1].waits_for, p1.steps[0].id);
  const p2 = planFanout([w('a1', 'anthropic', 'm1', 'P'), w('a2', 'anthropic', 'm1', 'P'), w('b1', 'anthropic', 'm2', 'P'), w('b2', 'anthropic', 'm2', 'P')]);
  assert.equal(p2.warm_steps, 2);
  assert.equal(p2.steps.filter((s) => s.type === 'parallel').length, 2);
  for (const g of p2.steps.filter((s) => s.type === 'parallel')) assert.ok(p2.steps.find((s) => s.id === g.waits_for && s.model === g.model));
});

test('T-P3-11 driver without explicit pre-warm', () => {
  const p = planFanout([1, 2, 3, 4].map((i) => w('w' + i, 'deepseek', 'ds', 'P')));
  assert.equal(p.steps[0].warm, 'first_worker');
  assert.equal(p.steps[0].worker, 'w1');
  assert.equal(p.steps[1].waits_for, p.steps[0].id);
  assert.equal(p.steps[1].waits_on, 'first_response');
  assert.deepEqual(p.steps[1].workers, ['w2', 'w3', 'w4']);
  assert.ok(!JSON.stringify(p).includes('max_tokens'));
  assert.ok(!p.steps.some((s) => s.warm === 'prewarm'));
});

test('T-P3-12 updates in messages, not the system prompt', () => {
  const g1 = guard(req(), req({ system: SYS + ' Now it is 10:00.' }));
  assert.equal(g1.outcome, 'SYSTEM_CHANGED');
  const c = cli(lib('session-guard.mjs'), [writeJson(req()), writeJson(req({ system: SYS + ' x' }))]);
  assert.equal(c.code, 1);
  assert.equal(c.out.outcome, 'SYSTEM_CHANGED');
  const ok = cli(lib('session-guard.mjs'), [writeJson(req()), writeJson(req({ messages: [{ role: 'user', content: 'changed' }] }))]);
  assert.equal(ok.code, 0);
  assert.equal(guard(req(), req({ tools: [tools[0]] })).outcome, 'TOOLS_CHANGED');
  assert.equal(guard(req(), req({ tools: [tools[2], tools[1], tools[0]] })).outcome, 'SESSION_OK');
});

test('T-P3-13 [REAL] real drivers.json lints and the module list is honest', () => {
  const drv = lib('drivers.json');
  const a = cli(LINT, [drv]);
  assert.equal(a.code, 0, a.stdout);
  const b = cli(LINT, ['--allowlist']);
  assert.equal(b.code, 0, b.stdout);
  const obj = JSON.parse(fs.readFileSync(drv, 'utf8'));
  assert.deepEqual(Object.keys(obj.kinds).sort(), ['anthropic', 'deepseek', 'host-owned', 'openai-compatible']);
  assert.deepEqual(Object.keys(a.out.unknown_cells).sort(), Object.keys(obj.kinds).sort());
  assert.deepEqual(fs.readdirSync(CACHE).sort(), JSON.parse(fs.readFileSync(lib('ALLOWLIST.json'), 'utf8')).files.slice().sort());
  const nb = fs.readFileSync(lib('NOT-BUILDING.md'), 'utf8').split('\n').filter((l) => /^\d+\.\s/.test(l));
  assert.ok(nb.length >= 7);
  for (const l of nb) assert.match(l, /research\/09/);
  for (const topic of [/response cache/i, /compression/i, /memory/i, /keep-alive/i, /gateway/i, /harness prefix/i, /self-hosted/i]) assert.ok(nb.some((l) => topic.test(l)), String(topic));
});

test('T-P3-14 unverified items are marked unknown', () => {
  const k = JSON.parse(fs.readFileSync(lib('drivers.json'), 'utf8')).kinds;
  for (const c of [k.deepseek.min_prefix_tokens, k['openai-compatible'].generic.caching, k['host-owned'].write_controls, k.deepseek.ttl_guarantee]) assert.equal(c.status, 'unknown');
  const bad = JSON.parse(fs.readFileSync(lib('drivers.json'), 'utf8'));
  bad.kinds.deepseek.min_prefix_tokens = { value: 1024, status: 'documented', source: 'research/09 section 1 note [S]' };
  const r = cli(LINT, [writeJson(bad, 'drivers.json')]);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'STATUS_OVERCLAIM');
  const d = tmp();
  for (const f of fs.readdirSync(CACHE)) if (f !== 'tests') fs.copyFileSync(path.join(CACHE, f), path.join(d, f));
  fs.mkdirSync(path.join(d, 'tests'));
  assert.equal(cli(LINT, ['--allowlist', d]).code, 0);
  fs.writeFileSync(path.join(d, 'response-cache.mjs'), '// no\n');
  const u = cli(LINT, ['--allowlist', d]);
  assert.equal(u.code, 1);
  assert.equal(u.out.outcome, 'UNLISTED_CACHE_MODULE');
});

const rows = (n, read, write, unc) => Array.from({ length: n }, () => ({ cache_read: read, cache_write: write, uncached: unc }));
test('T-P3-15 hit rate and cache fields recorded', () => {
  const a = hitRate(rows(25, 900, 100, 0));
  assert.equal(a.hit_rate, 0.9);
  assert.equal(a.rows[0].cache_read, 900);
  const b = hitRate(rows(12, 900, 100, 0));
  assert.equal(b.hit_rate, null);
  assert.equal(b.event, 'TOO_FEW_REQUESTS');
  const c = hitRate(rows(25, 900, null, 100));
  assert.equal(c.write_unknown, true);
  assert.equal(c.hit_rate, 0.9);
  assert.equal(c.rows[0].cache_write, null);
  assert.deepEqual(cacheFields({ input_tokens: 5, output_tokens: 2, cached_input_tokens: 40 }), { cache_read: 40, cache_write: null, uncached: 5 });
});

test('T-P3-16 regression alert', () => {
  const base = rows(25, 900, 0, 100);
  const bad = detectRegression(base, rows(10, 400, 0, 600));
  assert.equal(bad.event, 'CACHE_REGRESSION');
  assert.equal(bad.baseline_rate, 0.9);
  assert.equal(bad.window_rate, 0.4);
  assert.equal(detectRegression(base, rows(10, 850, 0, 150)).event, null);
});

test('T-P3-17 briefs share a byte-identical prefix', () => {
  const root = tmp(); const home = tmp();
  const pre = 'STABLE PREAMBLE: persona rules, gates, output format.';
  const mk = (slice_id, over) => buildBrief({ run_id: 'r1', slice_id, root, home, preamble: pre, run_constant: 'run constant', slice: 'slice ' + slice_id, refs: {}, ...over });
  const b1 = fs.readFileSync(mk('s1').file, 'utf8'); const b2 = fs.readFileSync(mk('s2').file, 'utf8');
  return import('../brief-prefix.mjs').then((m) => {
    assert.ok(m.sharedPrefixBytes(b1, b2) >= Buffer.byteLength('## preamble\n' + pre));
    assert.equal(cli(lib('brief-prefix.mjs'), [mk('s1').file]).code, 0);
    const vol = mk('s3', { preamble: pre + ' generated 2026-10-14T10:00:00Z' });
    const r = cli(lib('brief-prefix.mjs'), [vol.file]);
    assert.equal(r.code, 1);
    assert.equal(r.out.outcome, 'VOLATILE_IN_PREFIX');
  });
});

test('T-P3-18 [REAL] drivers.json tampered after lint', () => {
  const d = tmp();
  const f = path.join(d, 'drivers.json');
  fs.copyFileSync(lib('drivers.json'), f);
  const lint = cli(LINT, [f, '--stamp']);
  assert.equal(lint.code, 0);
  assert.ok(fs.existsSync(f + '.sha256'));
  const LOAD = lib('drivers-load.mjs');
  assert.equal(cli(LOAD, [f]).code, 0);
  const orig = fs.readFileSync(f);
  const i = orig.indexOf('"5m"') + 1;
  const mutated = Buffer.from(orig); mutated[i] = 0x36; // 5m -> 6m
  fs.writeFileSync(f, mutated);
  const r = cli(LOAD, [f]);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'DRIVERS_STALE');
  fs.writeFileSync(f, orig);
  assert.equal(cli(LOAD, [f]).code, 0);
});
