// Epic N1 test contract. Test names carry the case ID. [REAL] cases (16 to 18) run against a live Engine only
// when probeEngine finds one; otherwise they assert the probe record and report IMPLEMENTED-NOT-VERIFIED (G-3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../../../core/pipelines/yaml-lite.mjs';
import { compileSquad, loadSquad } from '../compile/squad-to-definition.mjs';
import { decompileDefinition, decompileToYaml } from '../compile/definition-to-squad.mjs';
import { canonicalHash, canonicalJson } from '../compile/canon.mjs';
import { deriveRoster } from '../compile/roster.mjs';
import { intakeCard } from '../compile/intake.mjs';
import { ask } from '../ask/channels.mjs';
import { createCollector } from '../ask/collect.mjs';
import { deliverPack } from '../ask/pack-fallback.mjs';
import { reviewLoop } from '../review/cap.mjs';
import { drain } from '../drain/drain.mjs';
import { probeEngine } from '../live/probe.mjs';
import { liveClient, liveCheckpointCard, liveAskReply, liveReadBack } from '../live/live-cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.resolve(HERE, '..');
const FIX = path.join(HOST, 'fixtures');
const S2D = path.join(HOST, 'compile/squad-to-definition.mjs');
const D2S = path.join(HOST, 'compile/definition-to-squad.mjs');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'n1-'));
const node = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
const pack3 = () => readJson(path.join(FIX, 'pack-3q.json'));
const sink = () => { const got = []; return { got, send: async (m) => { got.push(m); } }; };
const base = (steps, extra = {}) => ({ squad: 't', version: 1, conductor: 'manager', steps, ...extra });
const compileCode = (squad) => { try { compileSquad(squad); return null; } catch (e) { return e; } };
const live = await probeEngine();
const verdict = (id, v, detail) => console.log(`VERDICT ${id} ${v}${detail ? ' ' + detail : ''}`);

test('T-N1-01 round trip of the lifecycle squad is lossless', () => {
  const dir = tmp();
  const defFile = path.join(dir, 'def.json'), outFile = path.join(dir, 'back.yaml');
  const c = node([S2D, path.join(FIX, 'lifecycle-squad.yaml'), '--out', defFile]);
  assert.equal(c.status, 0, c.stderr);
  const d = node([D2S, defFile, '--out', outFile]);
  assert.equal(d.status, 0, d.stderr);
  const orig = parseYaml(fs.readFileSync(path.join(FIX, 'lifecycle-squad.yaml'), 'utf8'));
  const back = parseYaml(fs.readFileSync(outFile, 'utf8'));
  assert.equal(canonicalJson(back), canonicalJson(orig));
  assert.equal(canonicalHash(back), canonicalHash(orig));
  assert.equal(canonicalJson(readJson(defFile)), canonicalJson(readJson(path.join(FIX, 'lifecycle-definition.json'))), 'checked-in definition is current');
});

test('T-N1-02 roster is derived from steps', () => {
  const squad = base(['planner', 'builder', 'reviewer', 'builder'].map((p, i) => ({ id: `s${i}`, type: 'persona', persona: p })));
  assert.deepEqual(deriveRoster(squad), ['manager', 'planner', 'builder', 'reviewer']);
  const def = compileSquad(squad);
  assert.ok(!('roster' in def));
  assert.deepEqual(deriveRoster({ conductor: def.conductor, steps: def.steps }), ['manager', 'planner', 'builder', 'reviewer']);
});

test('T-N1-03 stored roster that drifts from steps is rejected', () => {
  const dir = tmp();
  const f = path.join(dir, 'drift.json'), out = path.join(dir, 'out.json');
  fs.writeFileSync(f, JSON.stringify(base([{ id: 'a', type: 'persona', persona: 'planner' }, { id: 'b', type: 'persona', persona: 'builder' }], { roster: ['manager', 'planner', 'ghost'] })));
  const r = node([S2D, f, '--out', out]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ROSTER_DRIFT/);
  assert.ok(!fs.existsSync(out));
});

test('T-N1-04 step mapping', () => {
  const def = compileSquad(base([
    { id: 'p', type: 'persona', persona: 'planner', tier: 'T1' },
    { id: 'c', type: 'checkpoint', label: 'gate' },
    { id: 'k', type: 'code', persona: 'deployer', capability: 'publish' },
    { id: 'd', type: 'decision' },
  ]));
  assert.deepEqual(def.steps.map((s) => s.type), ['persona', 'checkpoint', 'publish', 'decision']);
  assert.equal(def.steps[0].model_tier, 'powerful');
  assert.equal(def.steps[1].surface, 'mission_control_card');
  const t = compileSquad(base([{ id: 'a', type: 'persona', tier: 'T2' }, { id: 'b', type: 'persona', tier: 'T3' }, { id: 'r', type: 'code', capability: 'render' }]));
  assert.deepEqual(t.steps.map((s) => s.model_tier ?? s.type), ['balanced', 'cheap', 'render']);
});

test('T-N1-05 unknown step type fails the compile', () => {
  const dir = tmp();
  const f = path.join(dir, 'robot.json'), out = path.join(dir, 'o.json');
  fs.writeFileSync(f, JSON.stringify(base([{ id: 'r1', type: 'robot' }])));
  const r = node([S2D, f, '--out', out]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /UNKNOWN_STEP_TYPE/);
  assert.match(r.stderr, /r1/);
  assert.ok(!fs.existsSync(out));
});

test('T-N1-06 ask fans out to all three channels with one pack', async () => {
  const t = { controlTower: sink(), chatP2p: sink(), whatsapp: sink() };
  const pack = pack3();
  const r = await ask(pack, t);
  assert.deepEqual(r, { delivered: ['controlTower', 'chatP2p', 'whatsapp'], failed: [] });
  for (const s of Object.values(t)) {
    assert.equal(s.got.length, 1);
    assert.equal(s.got[0].pack_id, pack.pack_id);
    assert.deepEqual(s.got[0].questions.map((q) => q.n), [1, 2, 3]);
    assert.deepEqual(s.got[0].questions.map((q) => q.recommendation), ['yes', 'no', 'yes']);
  }
});

test('T-N1-07 reply parsing by ID, same result on every channel', () => {
  const results = ['controlTower', 'chatP2p', 'whatsapp'].map((channel) => {
    const c = createCollector(pack3());
    c.ingest({ channel, text: '1 yes 2 no 3: use B' });
    return c.snapshot().answers;
  });
  assert.deepEqual(results[0], { 1: 'yes', 2: 'no', 3: 'use B' });
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  const c = createCollector(pack3());
  const r = c.ingest({ channel: 'whatsapp', text: 'all except 2' });
  assert.deepEqual(r.errors, []);
  const snap = c.snapshot();
  assert.deepEqual(snap.answers, { 1: 'yes', 3: 'yes' });
  assert.equal(snap.state[2], 'pending');
});

test('T-N1-08 first valid reply per ID wins', () => {
  const c = createCollector(pack3());
  c.ingest({ channel: 'controlTower', text: '1 yes' });
  const r = c.ingest({ channel: 'whatsapp', text: '1 no 2 no' });
  assert.deepEqual(r.ignored, [1]);
  const c2 = createCollector(pack3());
  c2.ingest({ channel: 'controlTower', text: '1 yes' });
  c2.ingest({ channel: 'whatsapp', text: '1 no 2 B' });
  assert.deepEqual(c2.snapshot().answers, { 1: 'yes', 2: 'B' });
  assert.equal(c2.events.filter((e) => e.event === 'answer_applied' && e.n === 1).length, 1);
  assert.equal(c2.events.filter((e) => e.event === 'answer_ignored_answered' && e.n === 1).length, 1);
});

test('T-N1-09 default-accept-by-ID and irreversible questions', () => {
  const pack = { ...pack3(), questions: [
    { n: 1, kind: 'default', text: 'q1', options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: true },
    { n: 2, kind: 'default', text: 'q2', options: ['yes', 'no'], recommendation: 'no', default: 'no', reversible: true },
    { n: 3, kind: 'default', text: 'q3', options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: false },
  ] };
  const c = createCollector(pack);
  c.ingest({ channel: 'controlTower', text: '1 yes' });
  const s = c.close();
  assert.equal(s.state[1], 'answered');
  assert.equal(s.state[2], 'accepted-by-default');
  assert.equal(s.answers[2], 'no');
  assert.equal(s.state[3], 'pending');
  assert.equal(s.status, 'blocked');
  assert.equal(s.reason, 'IRREVERSIBLE_UNANSWERED: 3');
  assert.equal(s.exit, 3);
});

test('T-N1-10 one channel down is a warning, zero channels is BLOCKED', async () => {
  const boom = { send: async () => { throw new Error('whatsapp down'); } };
  const events = [];
  const a = await deliverPack(pack3(), { controlTower: sink(), chatP2p: sink(), whatsapp: boom }, { runDir: path.join(tmp(), 'runs/r1'), emit: (e) => events.push(e) });
  assert.deepEqual(a.delivered, ['controlTower', 'chatP2p']);
  assert.equal(a.failed.length, 1);
  assert.equal(a.failed[0].channel, 'whatsapp');
  assert.equal(a.blocked, false);
  assert.ok(events.some((e) => e.event === 'channel_failed' && e.channel === 'whatsapp'));
  const dir = path.join(tmp(), 'runs/r1');
  const b = await deliverPack(pack3(), { controlTower: boom, chatP2p: boom, whatsapp: boom }, { runDir: dir });
  assert.equal(b.blocked, true);
  assert.equal(b.status, 'blocked');
  assert.equal(b.exit, 3);
  assert.deepEqual(b.files.map((f) => path.basename(f)), ['owner-pack.html', 'owner-pack.md']);
  assert.ok(b.files.every((f) => fs.existsSync(f)));
  assert.ok(fs.statSync(b.files[0]).mtimeMs <= fs.statSync(b.files[1]).mtimeMs + 5);
});

test('T-N1-11 untrusted card text never selects tools, repos or hosts', () => {
  const squad = loadSquad(path.join(FIX, 'lifecycle-squad.yaml'));
  const settings = { repo: 'acme/site', host: 'engine' };
  const card = readJson(path.join(FIX, 'inject-card.json'));
  const withCard = intakeCard(card, { squad, settings });
  const without = intakeCard({ id: 'x', title: 'Update the pricing page', body: '' }, { squad, settings });
  assert.equal(withCard.definition_json, without.definition_json);
  assert.equal(withCard.definition_json, canonicalJson(compileSquad(squad)));
  assert.equal(withCard.repo, 'acme/site');
  assert.equal(withCard.host, 'engine');
  assert.deepEqual(withCard.tools, without.tools);
  assert.ok(withCard.events.some((e) => e.event === 'untrusted_instruction_ignored'));
  assert.equal(without.events.length, 0);
});

test('T-N1-12 only code publishes', () => {
  const e = compileCode(base([{ id: 'p', type: 'persona', persona: 'builder', capability: 'publish' }]));
  assert.equal(e?.code, 'PERSONA_CANNOT_PUBLISH');
  const e2 = compileCode(base([{ id: 'p', type: 'persona', persona: 'builder', capabilities: ['read', 'publish'] }]));
  assert.equal(e2?.code, 'PERSONA_CANNOT_PUBLISH');
  const def = compileSquad(base([{ id: 'q', type: 'persona', persona: 'builder' }]));
  assert.deepEqual(def.steps[0].deny, ['deploy', 'spawn_squad']);
  const f = path.join(tmp(), 's.json');
  fs.writeFileSync(f, JSON.stringify(base([{ id: 'p', type: 'persona', capability: 'publish' }])));
  assert.equal(node([S2D, f]).status, 1);
});

test('T-N1-13 review cap is 3', async () => {
  const rounds = [];
  const r = await reviewLoop(async (n) => { rounds.push(n); return { findings: [`major-${n}`] }; });
  assert.deepEqual(rounds, [1, 2, 3]);
  assert.equal(r.outcome, 'ESCALATED');
  assert.equal(r.rounds, 3);
  assert.equal(r.exit_code, 2);
  const r2 = await reviewLoop(async () => ({ findings: ['same'] }));
  assert.equal(r2.outcome, 'STALLED');
  assert.equal(r2.rounds, 2);
});

test('T-N1-14 flat pipeline, one router level', () => {
  const steps = [{ id: 'a', type: 'persona', persona: 'p' }, { id: 'b', type: 'persona', persona: 'q' }];
  assert.equal(compileCode(base([...steps, { id: 'd', type: 'delegate_squad' }]))?.code, 'NESTED_SQUAD_FORBIDDEN');
  assert.equal(compileCode(base(steps, { routes: [{ work_type: 'x', steps: ['a'], router: { routes: [] } }] }))?.code, 'ROUTER_DEPTH_EXCEEDED');
  const def = compileSquad(base(steps, { routes: [{ work_type: 'lp', steps: ['a'] }, { work_type: 'feat', steps: ['a', 'b'] }] }));
  assert.deepEqual(def.router.work_types.map((w) => w.steps), [['a'], ['a', 'b']]);
  const f = path.join(tmp(), 'n.json');
  fs.writeFileSync(f, JSON.stringify(base([...steps, { id: 'd', type: 'delegate_squad' }])));
  const r = node([S2D, f]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /NESTED_SQUAD_FORBIDDEN/);
});

test('T-N1-15 drain shape', () => {
  const { cards } = readJson(path.join(FIX, 'drain-107.json'));
  const frozen = JSON.stringify(cards);
  const out = drain(cards, { parentId: 'P' });
  assert.equal(cards.length, 107);
  assert.equal(out.children.length, 12);
  assert.ok(out.children.every((c) => c.parents.length === 1 && c.parents[0] === 'P'));
  assert.equal(out.parent.dispositions.length, 95);
  const built = new Set(cards.filter((c) => c.needs_build).map((c) => c.id));
  assert.ok(out.parent.dispositions.every((d) => !built.has(d.card)));
  assert.equal(out.writes_to_card_bodies, 0);
  assert.equal(JSON.stringify(cards), frozen);
});

const notVerified = (id, probe) => verdict(id, 'IMPLEMENTED-NOT-VERIFIED', `probe: ${probe.error}`);

test('T-N1-16 [REAL] live Control Tower checkpoint card', async () => {
  if (!live.reachable) { notVerified('T-N1-16', live); assert.ok(live.error); return; }
  const r = await liveCheckpointCard(liveClient(live), path.join(FIX, 'lifecycle-squad.yaml'));
  assert.ok(r.ok, JSON.stringify(r));
  verdict('T-N1-16', 'VERIFIED', `card ${r.card_id}`);
});

test('T-N1-17 [REAL] live ask on real channels and reply by ID', async () => {
  if (!live.reachable) { notVerified('T-N1-17', live); assert.ok(live.error); return; }
  const r = await liveAskReply(liveClient(live), pack3());
  assert.deepEqual(r.answers, { 1: 'yes', 2: 'no' });
  assert.equal(r.ignored, 1);
  verdict('T-N1-17', 'VERIFIED');
});

test('T-N1-18 [REAL] definition read-back is lossless on Engine', async () => {
  if (!live.reachable) { notVerified('T-N1-18', live); assert.ok(live.error); return; }
  const r = await liveReadBack(liveClient(live), path.join(FIX, 'lifecycle-squad.yaml'));
  assert.ok(r.equal, JSON.stringify(r));
  verdict('T-N1-18', 'VERIFIED', r.x_do_it_rejected ? 'X_DO_IT_REJECTED, metadata fallback used' : '');
});
