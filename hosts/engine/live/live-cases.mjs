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

export async function liveCheckpointCard(client, squadPath) {
  const def = compileSquad(parseYaml(readFileSync(squadPath, 'utf8')));
  const { id } = await client.post('/api/pipeline-definitions', def);
  const run = await client.post(`/api/pipeline-definitions/${id}/runs`, { until: 'checkpoint' });
  const card = await client.get(`/api/mission-control/cards/${run.card_id}`);
  return { ok: card?.id === run.card_id && /checkpoint/i.test(JSON.stringify(card)), card_id: card?.id };
}

export async function liveAskReply(client, pack) {
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
  const out = {};
  for (const [name, fixture] of [['happy', 'lp_content-card'], ['stale-head', 'stale-head'], ['budget-denied', 'budget-denied'], ['loop-cap', 'loop-cap'], ['injection', 'injection']]) {
    const { card_id } = await client.post('/api/mission-control/cards', loadCard(fixture));
    const state = await client.get(`/api/mission-control/cards/${card_id}/state`);
    out[name] = { ok: state?.status === expected[name].status && state?.exit_code === expected[name].exit_code, state };
  }
  return out;
}
