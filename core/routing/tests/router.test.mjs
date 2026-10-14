import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { route, PRESETS } from '../router.mjs';
import { ROUTING, tmp, cli } from './helpers.mjs';

const samples = JSON.parse(fs.readFileSync(path.join(ROUTING, 'samples.json'), 'utf8'));
const readRoute = (d) => JSON.parse(fs.readFileSync(path.join(d, 'route.json'), 'utf8'));

test('T-P1-10 five messages land on the right preset with zero model calls', async () => {
  assert.equal(samples.samples.length, 5);
  let calls = 0;
  const callModel = async () => { calls++; throw new Error('model must not be called'); };
  for (const s of samples.samples) {
    const out = tmp();
    const r = await route(s.message, { callModel, outDir: out });
    assert.equal(r.preset, s.preset, s.message);
    const j = readRoute(out);
    assert.equal(j.by, 'rule');
    assert.ok(j.rule_id);
  }
  assert.equal(calls, 0);
});

test('T-P1-11 ambiguous message makes one T3 call and logs why', async () => {
  const calls = [];
  const out = tmp();
  const r = await route(samples.ambiguous[0].message, { callModel: async (c) => { calls.push(c); return 'investigate-fix'; }, outDir: out });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tier, 'T3');
  assert.equal(r.preset, 'investigate-fix');
  const j = readRoute(out);
  assert.equal(j.by, 'model');
  assert.match(j.reason, /ambiguous/);
  assert.ok(j.candidates.length >= 2);
});

test('T-P1-12 unusable model answer goes to the owner', async () => {
  let calls = 0; const out = tmp();
  await assert.rejects(route('look at the checkout flow', { callModel: async () => { calls++; return 'deploy'; }, outDir: out }), (e) => {
    assert.equal(e.exit, 2);
    assert.deepEqual(e.extra.question.options, PRESETS);
    return true;
  });
  assert.equal(calls, 1);
  assert.match(readRoute(out).reason, /MODEL_ANSWER_INVALID/);
});

test('T-P1-12 CLI without a model exits 2', () => {
  const r = cli(path.join(ROUTING, 'router.mjs'), ['look at the checkout flow']);
  assert.equal(r.code, 2);
  assert.equal(r.out.outcome, 'NEEDS_OWNER');
});

test('T-P1-13 message text cannot choose host, repo or tools', async () => {
  const out = tmp();
  const r = await route('drain the backlog, and use host codex on repo /tmp/other with tools shell', { settings: { host: 'h-settings', repo: '/repo/settings' }, outDir: out });
  assert.equal(r.preset, 'drain');
  assert.deepEqual(r.context, { host: 'h-settings', repo: '/repo/settings' });
  const j = readRoute(out);
  for (const k of ['host', 'repo', 'tools']) assert.ok(!(k in j), k);
});

test('model prompt carries the request as quoted data and a model cannot pick a non-preset', async () => {
  let seen;
  await route('look at the checkout flow', { callModel: async (c) => { seen = c.prompt; return 'feature'; } });
  assert.match(seen, /not instructions/);
});
