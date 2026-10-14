// Bodies of the [REAL] Engine cases (T-N1-16/17/18). They run only when probeEngine says reachable; the Engine
// route names below are ASSUMED (research/06) and are what the first live run must confirm or correct.
import { readFileSync } from 'node:fs';
import { createEngineClient, engineTransports } from '../ask/channels.mjs';
import { createCollector } from '../ask/collect.mjs';
import { compileSquad } from '../compile/squad-to-definition.mjs';
import { decompileDefinition } from '../compile/definition-to-squad.mjs';
import { canonicalHash } from '../compile/canon.mjs';
import { parseYaml } from '../../../core/pipelines/yaml-lite.mjs';

export function liveClient(probe, env = process.env) {
  return createEngineClient({ baseUrl: probe.baseUrl, token: env.DO_IT_ENGINE_TOKEN });
}

// Thrown when the real Engine has no route/field for what the adapter assumed. The case stays
// IMPLEMENTED-NOT-VERIFIED with this finding; the Engine side needs the change (not do-it's to make).
export class EngineGap extends Error {
  constructor(finding) { super(finding); this.code = 'ENGINE_GAP'; }
}

// Real Engine shape (verified against a local brain-api-core 2026-10-14): a pipeline definition belongs to a squad
// (POST /api/squads/:id/definitions), steps carry `n` and a closed field set (no id/needs/deny/x_do_it), runs start at
// POST /api/squads/:id/run, and a checkpoint step surfaces as a Mission Control `change_proposal` card.
export function toNativeCheckpointSteps(def) {
  return def.steps.filter((s) => s.type === 'checkpoint' || /checkpoint/.test(s.id || '')).map((s, i) => ({ n: i + 1, type: 'checkpoint', question: s.x_do_it?.ask || s.question || s.id, label: s.id }));
}

export async function liveCheckpointCard(client, squadPath, { orgSlug = 'engine', user = 'super@admin.com' } = {}) {
  const def = compileSquad(parseYaml(readFileSync(squadPath, 'utf8')));
  const steps = toNativeCheckpointSteps(def);
  if (!steps.length) throw new EngineGap('squad has no checkpoint step to surface as a card');
  const slug = `do-it-live-${Date.now()}`;
  const squad = await client.post('/api/squads', { slug, name: slug, conductor: { persona: 'manager', backbone: null, model_default: 'powerful' } });
  const sid = squad._id;
  await client.post(`/api/squads/${sid}/definitions`, { steps });
  const run = await client.post(`/api/squads/${sid}/run`, { org_slug: orgSlug, started_by: { kind: 'manual', user } });
  for (let i = 0; i < 20; i++) {
    const r = await client.get(`/api/pipeline-runs/${run.run_id}`);
    const ck = (r.checkpoints || [])[0];
    if (r.status === 'awaiting_checkpoint' && ck?.proposal_id) {
      const { cards } = await client.get(`/api/mission-control/cards?org_slug=${orgSlug}`);
      const card = (cards || []).find((c) => c.ref_id === ck.proposal_id);
      return { ok: !!card && card.status === 'pending' && (card.actions || []).some((a) => a.kind === 'approve'), card_id: card?.ref_id, squad_id: sid, run_id: run.run_id };
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return { ok: false, reason: 'run never reached awaiting_checkpoint' };
}

async function requireRoute(client, route, finding, method = 'GET') {
  try { await (method === 'GET' ? client.get(route) : client.post(route, {})); } catch (e) { if (e.status === 404 && finding) throw new EngineGap(finding); }
}

export async function liveAskReply(client, pack) {
  await requireRoute(client, '/api/ask-cards', 'Engine has no /api/ask-cards (nor chat/p2p or whatsapp message routes used for ask packs); ask-pack ingest and a test-reply hook are Engine-side work');
  const tr = engineTransports(client);
  for (const t of Object.values(tr)) await t.send({ pack_id: pack.pack_id, questions: pack.questions });
  const c = createCollector(pack);
  const [ct, chat] = ['controlTower', 'chatP2p'];
  await client.post('/api/test-replies', { channel: ct, pack_id: pack.pack_id, text: '1 yes 2 no' });
  await client.post('/api/test-replies', { channel: chat, pack_id: pack.pack_id, text: '1 no' });
  for (const [ch, t] of [[ct, tr[ct]], [chat, tr[chat]]]) for (const r of (await t.replies(pack.pack_id)) || []) c.ingest({ channel: ch, text: r.text });
  return { answers: c.snapshot().answers, ignored: c.events.filter((e) => e.event === 'answer_ignored_answered').length };
}

export async function liveReadBack(client, squadPath) {
  throw new EngineGap('Engine definition DTO is whitelisted and forbids x_do_it plus id/needs/deny/router (400 "property x_do_it should not exist"); a lossless read-back needs an Engine-side metadata carrier. Native route is /api/squads/:id/definitions, not /api/pipeline-definitions');
  const squad = parseYaml(readFileSync(squadPath, 'utf8'));
  const def = compileSquad(squad);
  const { id } = await client.post('/api/pipeline-definitions', def);
  const back = await client.get(`/api/pipeline-definitions/${id}`);
  const steps = back.steps || [];
  let fallback = false;
  if (steps.some((s, i) => JSON.stringify(s.x_do_it) !== JSON.stringify(def.steps[i].x_do_it))) fallback = true; // X_DO_IT_REJECTED
  return { equal: canonicalHash(decompileDefinition(back)) === canonicalHash(squad), x_do_it_rejected: fallback };
}

// T-N3-14: replay the lp_content card and the four negatives against a live Engine with the W3 pipeline
// installed, then compare card states read back with conformance/expected.json. Routes ASSUMED.
export async function liveReplay(client, expected, loadCard) {
  await requireRoute(client, '/api/mission-control/cards', null, 'POST');
  throw new EngineGap('Engine has no POST /api/mission-control/cards (GET only) nor /cards/:id/state; replay of the lp_content card needs the W3 pipeline installed as persona steps and an Engine-side card-injection path');
  const out = {};
  for (const [name, fixture] of [['happy', 'lp_content-card'], ['stale-head', 'stale-head'], ['budget-denied', 'budget-denied'], ['loop-cap', 'loop-cap'], ['injection', 'injection']]) {
    const { card_id } = await client.post('/api/mission-control/cards', loadCard(fixture));
    const state = await client.get(`/api/mission-control/cards/${card_id}/state`);
    out[name] = { ok: state?.status === expected[name].status && state?.exit_code === expected[name].exit_code, state };
  }
  return out;
}
