// Bodies of the [REAL] Engine cases (T-N1-16/17/18, T-N3-14). They run only when probeEngine says reachable and use the
// routes Engine PR #727 added (/api/ask-cards, x_do_it on definitions, /api/internal/tasks, /api/run-rows). Needs
// HOST_ADAPTER_API_ENABLED=true and CT_TASKS_ENABLED=true on the Engine; the service key comes from DO_IT_ENGINE_TOKEN.
import { readFileSync } from 'node:fs';
import { createEngineClient, engineTransports, postReply, readPack, closePack } from '../ask/channels.mjs';
import { toNativeDefinition, fromNativeDefinition } from '../compile/native.mjs';
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
  for (let i = 0; i < 90; i++) {
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

const stamp = () => Date.now().toString(36);

// T-N1-17: open one pack (idempotent per channel send), answer it on two channels, read the arbiter's view back.
// Channel 1 (control_tower) says "1 yes 2 no"; channel 2 (chat_p2p) says "1 no" and must lose question 1.
export async function liveAskReply(client, pack) {
  const id = `${pack.pack_id}-${stamp()}`;
  const live = { ...pack, pack_id: id };
  const tr = engineTransports(client);
  for (const t of Object.values(tr)) await t.send({ pack_id: id, run_id: live.run_id, questions: live.questions.map((q) => ({ kind: 'default', options: [], recommendation: null, default: null, reversible: true, ...q })) });
  const first = await postReply(client, id, 'controlTower', '1 yes 2 no', `ct-${id}`);
  const second = await postReply(client, id, 'chatP2p', '1 no', `chat-${id}`);
  const replay = await postReply(client, id, 'chatP2p', '1 no', `chat-${id}`);
  const view = await readPack(client, id);
  const chatReplies = await tr.chatP2p.replies(id);
  return { pack_id: id, answers: Object.fromEntries(Object.entries(view.answers).map(([n, a]) => [Number(n), a])), ignored: second.ignored.length, applied_first: first.applied, idempotent_replay: replay.replay === true, pending: view.pending, chat_replies: chatReplies.length };
}

// T-N1-18: compile the lifecycle squad, store it on a real Engine squad with x_do_it carrying everything Engine has no
// slot for, read it back and compare the decompiled squad with the source by canonical hash.
export async function liveReadBack(client, squadPath) {
  const squad = parseYaml(readFileSync(squadPath, 'utf8'));
  const def = compileSquad(squad);
  const slug = `do-it-readback-${stamp()}`;
  const made = await client.post('/api/squads', { slug, name: slug, conductor: { persona: 'manager', backbone: null, model_default: 'powerful' } });
  const sid = made._id;
  const sent = toNativeDefinition(def);
  const stored = await client.post(`/api/squads/${sid}/definitions`, sent);
  const list = await client.get(`/api/squads/${sid}/definitions`);
  const back = (Array.isArray(list) ? list : list.definitions || [list]).find((d) => d.version === stored.version) || stored;
  const restored = fromNativeDefinition(back);
  const equal = canonicalHash(decompileDefinition(restored)) === canonicalHash(squad);
  return { equal, squad_id: sid, steps: back.steps?.length, x_do_it_rejected: false, definition_equal: canonicalHash(restored) === canonicalHash(def) };
}

// T-N3-14: inject the lp_content card and the four negatives as real Control Tower cards and read their state back.
// Compare with conformance/expected.json needs a RUN of the W3 pipeline; without that pipeline (and the Engine drain)
// installed the card state can only prove inject + state, so the case ends with an EngineGap naming exactly that.
export async function liveReplay(client, expected, loadCard, { orgSlug = process.env.DO_IT_ENGINE_ORG_SLUG } = {}) {
  if (!orgSlug) throw new EngineGap('DO_IT_ENGINE_ORG_SLUG is unset: card injection needs an organization on the target Engine');
  const run = stamp();
  const injected = {};
  for (const [name, fixture] of [['happy', 'lp_content-card'], ['stale-head', 'stale-head'], ['budget-denied', 'budget-denied'], ['loop-cap', 'loop-cap'], ['injection', 'injection']]) {
    const card = loadCard(fixture);
    const key = `do-it:replay:${name}:${run}`;
    const body = { org_slug: orgSlug, title: card.title || card.id, content: JSON.stringify({ body: card.body, comments: card.comments ?? [], work_type_scores: card.work_type_scores, head_sha: card.head_sha, settings: card.settings }), status: 'todo', actor: { type: 'squad', id: 'do-it-lifecycle' }, idempotency_key: key, external_ref: { system: 'do-it', id: card.id } };
    const made = await client.post('/api/internal/tasks', body);
    const again = await client.post('/api/internal/tasks', body);
    const state = await client.get(`/api/internal/tasks/${made.task.id}/state`);
    injected[name] = { task_id: made.task.id, created: made.created, replay_same_id: again.task.id === made.task.id && again.idempotent_replay === true, status: state.status, external_ref: state.external_ref };
  }
  const roundTrip = Object.values(injected).every((c) => c.created && c.replay_same_id && c.status === 'todo' && c.external_ref?.system === 'do-it');
  throw new EngineGap(`inject and state verified for ${Object.keys(injected).length} cards (round trip ${roundTrip ? 'ok' : 'FAILED'}); no do-it W3 pipeline is installed on this Engine, so the cards are never run and ${Object.keys(injected).length} expected outcomes (run_status/exit_code) cannot be compared. injected=${JSON.stringify(injected)}`);
}
