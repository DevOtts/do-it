# live-w4: live local Engine attempt (2026-10-14)

Target: Engine-Core `brain-api-core` run locally (`ts-node src/main.ts`, port 3001) on the local dev infra
(`brain-scripts/dev-setup/docker-compose.dev.yml`: redis, rabbitmq, mongo). Local only; auth via the local
service key (value never printed or copied). Stack stopped afterwards (api killed, 3 engine-* containers stopped).

| Case | Verdict | Evidence |
|---|---|---|
| T-N1-16 | VERIFIED | squad created, checkpoint-only definition posted, run reached `awaiting_checkpoint`, Mission Control returned a pending `change_proposal` card with an approve action whose ref_id equals the run's checkpoint proposal_id. `node --test hosts/engine/tests/*.test.mjs` 32/32. |
| T-N1-17 | IMPLEMENTED-NOT-VERIFIED | GET /api/ask-cards -> 404. No ask-pack route or test-reply hook exists on Engine. |
| T-N1-18 | IMPLEMENTED-NOT-VERIFIED | POST /api/squads/:id/definitions -> 400 "property x_do_it should not exist" (whitelist DTO). |
| T-N3-14 | IMPLEMENTED-NOT-VERIFIED | Engine has only GET /api/mission-control/cards; no card injection or /cards/:id/state. |
| T-N2-04 | IMPLEMENTED-NOT-VERIFIED | Engine has no generic row/blob store route (rowGet/rowPut/rowAppend/rowKeys). The do-it conformance runner also has no Engine rows client yet (it prints "not exercised"). |

## Divergences (adapter assumed vs real Engine)
- Auth header is `x-service-api-key` (DualAuthGuard), not only `Authorization: Bearer`. FIXED in hosts/engine/ask/channels.mjs (sends both).
- Definitions live under a squad: `POST /api/squads` then `POST /api/squads/:id/definitions`; run is `POST /api/squads/:id/run` with `{org_slug, started_by:{kind,user}}`; status at `GET /api/pipeline-runs/:run_id`. Assumed `/api/pipeline-definitions` does not exist. FIXED for the checkpoint case.
- Step shape: `n` (int >=1), `type`, `persona`, `task`, `question`, `label`, `model_tier`, ... ; `id`, `needs`, `deny`, `router`, `schema`, `x_do_it` all rejected. Persona steps need an existing persona_agents row.
- Checkpoint -> card: `change_proposal` card in `GET /api/mission-control/cards?org_slug=` (not `/cards/:id`).

## Needs Engine-side work (not done; recorded in spec terms)
1. Metadata carrier on definition steps (or a `meta` field) so `x_do_it` round-trips (T-N1-18).
2. Ask-pack route plus a reply path on CT/chat/WhatsApp (T-N1-17).
3. Card injection plus card state read for replay (T-N3-14).
4. A generic keyed row store for the `engine` StateStore (T-N2-04), then an Engine rows client in do-it L2.

## Side effects
- Local dev Mongo (`brain` db) now holds squads `do-it-live-*` and their runs/proposals (test data, local only).
- Docker Desktop was started and left running; `analysis-v2-dashboard-*` containers auto-restarted with it (not mine).
- Engine-Core untouched (no files edited).
