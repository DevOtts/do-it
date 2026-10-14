# PRD 4: Engine host adapter, StateStore backends, Engine-layer hand-over (lane L4)

CONTRACT: delivery/CONTRACT.md v1.0-draft. Squad: engine. Epics: N1, N2, N3. Waves: N2 in W2, N1 and N3 in W3.

## 1. Summary
do-it is generic. Engine (the Engine-Core platform) enters do-it only as one of four host adapters (D6, D18). This PRD covers three things. N1 is the adapter under `hosts/engine/`: it compiles a do-it `squad.yaml` into an Engine `pipeline_definition` and back, delivers the numbered owner pack on every linked Engine channel, and keeps the squad flat. N2 is the `StateStore` interface with three backends (`local-fs`, `git-branch`, `engine`) and a cold-start resume rule, so a fresh sandbox with no disk can continue a run. N3 is the hand-over: the 15-point spec and 12 adjustments already saved in Engine-Core `docs/implementation/do-it-engine-layer/` are the deliverable of record; the epic proves them with a conformance replay and checks that this program touched nothing else in Engine-Core.

do-it ships no Engine runtime code (spec point 1, 02-ENGINE-LAYER-SPEC). Engine's Mongo, dispatcher, k8s Jobs and Mission Control stay Engine's job.

## 2. Problem and goals
Problem: Engine already runs a dev squad per client org, but its vocabulary (`pipeline_definition`, Mission Control cards, DB rows) differs from do-it's (`squad.yaml`, owner pack, `runs/{run_id}/` files). Without a lossless mapping, an Engine run and a Claude Code run of the same squad drift apart. Engine Jobs also start in a fresh box every time (research/08 and 02-ENGINE-LAYER-SPEC section A), so run state cannot live on local disk.

Goals:
- G1. One `squad.yaml` runs on Engine and on any other host with the same meaning (round-trip with no loss).
- G2. The owner answers an ask on whichever Engine channel he is on (Control Tower, chat/p2p, WhatsApp) with one terse reply (D19, G-16).
- G3. Untrusted card text can never choose tools, repos or hosts (G-17).
- G4. Any step starts cold from a git ref plus the previous result file (D15, spec point 6).
- G5. A tampered blob is rejected, never trusted.
- G6. Engine knowledge lives in Engine-Core `do-it-engine-layer/` and nowhere else in Engine-Core is edited (CONTRACT section 5).

Non-goals: Hermes and OpenClaw (G-14); a warm sandbox per card (D15); Langfuse or LangSmith export (D17, v2); applying the 12 adjustments to `engine-dev-squad/` (O2 open; they are saved, not applied).

## 3. Users and jobs
| User | Job |
|---|---|
| Fernando (owner) | Answer one numbered pack from whatever channel is at hand; trust that a reply on WhatsApp and a reply on Control Tower mean the same. |
| Engine operator | Install a do-it squad as a `pipeline_definition` and see checkpoints as Mission Control cards. |
| do-it spine (L1) | Call `ask`, `collect`, `spawn`, `stateStore` on `engine` exactly as on the other hosts. |
| Engine team (reader) | Read one folder to learn what to build; run a conformance replay to know if they got it right. |

## 4. Solution design (decisions)
- D1. The Engine adapter lives only in `hosts/engine/`; `core/` never names a harness (CONTRACT section 5, G-12). The `engine` StateStore backend is a driver-selected module in `core/state-stores/`; the name is a backend id from CONTRACT section 3, not a harness call.
- D2. Compile table (spec point 2; research/06 section 7; research/08 section 5.2). `persona` stays `persona`. `checkpoint` becomes a checkpoint step that Engine surfaces as a Mission Control card (Rail A in research/06 section 3). `code` becomes a `render` or `publish` step calling an installed capability. `decision` stays `decision`. `tier` T1/T2/T3 passes through as `model_tier` powerful/balanced/cheap (spec point 4; DECISIONS R8). `eval{veto,max_retries}`, `consumes_previous` and `needs` pass through. Source: research/06 section 1 (step types `checkpoint | persona | render | publish | decision`).
- D3. Round trip is lossless (spec point 2). Fields Engine has no slot for (`ask`, `on_limit`, `loop_to`, `max_rounds`, `adapter`) travel in a reserved `x_do_it` block of the step, so decompile restores them byte for byte after canonical key ordering. Whether Engine tolerates an extra block is UNVERIFIED (research/08 section 5 caveat); N1 has a [REAL] case for it and degrades to storing the block in the definition metadata if Engine rejects it.
- D4. The roster is derived, never stored: roster = conductor persona union distinct step personas (research/06 section 6, lesson 1; spec point 2). A `squad.yaml` that carries its own roster is accepted only if it equals the derived one; otherwise compile fails with exit 1.
- D5. Owner pack delivery. `ask(pack)` posts the same numbered pack (same `pack_id`, same question numbers, recommendation per question) to every channel linked to the org: Control Tower ask card, chat/p2p, WhatsApp (D19; spec section F). `collect()` returns answers parsed by question ID using the CONTRACT grammar (`N answer`, `all except N N`, `N: free text`), the same parser every host uses (G-16).
- D6. First valid reply per ID wins; later replies for that ID, on any channel, are marked `answered` and not applied. Replies for other IDs from other channels are still accepted. This resolves the open item in 03-OPEN-QUESTIONS and spec section F; Engine ratifies it (N3 records it as an owner-visible assumption, not an Engine decision).
- D7. Default-accept-by-ID: a question with `reversible: true` and a `default` that is still unanswered when the pack closes is recorded `accepted-by-default` with its ID. A question with `reversible: false` is never default-accepted; the run ends BLOCKED (research/08 section 2, owner pack row; G-8).
- D8. The squad is flat. One router level picks the work type and therefore the step list (spec point 11, closed table, confidence below 0.7 asks). Hierarchy exists only as dependent child cards from a PM split. A step that spawns a squad, or a router inside a router, is rejected at compile (spec point 13; research/08 section 3; `DENY_BY_CALLER[SQUAD_STEP]`).
- D9. Safety (G-17; spec point 10; research/08 section 4 "OR-8"). Card, ticket, web and reply text is data. Tools, repo and host come from the compiled definition and settings only. No persona step may hold a publish capability: only a `code` step publishes. Persona deny list always contains `spawn_squad` and `deploy`.
- D10. Review cap is 3 rounds per PD-06 and DECISIONS D9, then ESCALATED (STALLED first when findings do not shrink). Source: 01-ADJUSTMENTS item 6 and its CORRECTION.
- D11. Drain: one parent card. Discovery is read-only and batches many cards per Job; only cards that need a build become dependent child cards; cards closed by verification get a disposition row on the parent and no child (spec section B, questions 2 and 3).
- D12. Failure semantics for asks: delivery to at least one channel is success with a recorded warning per failed channel; delivery to zero channels leaves the run BLOCKED with the owner pack written to disk (CONTRACT section 6 fallback chain: html then markdown).
- D13. StateStore interface is exactly `get(path)`, `put(path, bytes)`, `append(path, line)`, `list(prefix)` over `runs/{run_id}/...` (CONTRACT section 3; docs/03 section 10). Paths outside `runs/{run_id}/` or containing `..` are rejected. Only the spine calls `put`/`append` on state (G-1).
- D14. Backends. `local-fs`: atomic write via temp file plus rename. `git-branch`: one branch per run, one commit per write batch. `engine`: small state (state.json, ledger.json, events lines, owner pack, finish-line) in database rows tied to the card or in interaction records; blobs (evidence, roteiro HTML, large results) in an object store addressed by sha256 (spec section F; D19). The blob driver is a setting: `rows`, `r2`, or `fs-mirror`. Cloudflare R2 is UNVERIFIED in Engine (03-OPEN-QUESTIONS), so no default is `r2`; the default is `rows` (blobs in rows, size-capped) until the Engine team confirms. Note: spec point 6 in 02-ENGINE-LAYER-SPEC says backend `card`; CONTRACT says `engine`. N3 corrects the spec text to `engine` (card rows are one implementation of it).
- D15. Integrity. Every blob key is its sha256. `get` of a blob recomputes the hash and rejects a mismatch with `HASH_MISMATCH` (G-2 requires evidence to resolve to something checkable). `it-result/1` artifacts already carry sha256 (CONTRACT section 2).
- D16. Partial write safety. A `put` is two-phase: write blob, then publish the reference by atomic rename (or single commit, or single row upsert). A crash between phases leaves the old state readable and an orphan blob that recovery sweeps. `append` writes whole lines; recovery quarantines a torn last line and reports it (never silently drops).
- D17. Cold-start resume (D15 in DECISIONS: no warm box in v1). Given only a git ref and the previous `it-result/1` file, the spine rebuilds state through the store and continues at `resume.next_action`. If the result file is missing the run is BLOCKED with a named reason, never guessed.
- D18. Secrets in store config are references only (G-7, D16 in DECISIONS). A literal credential in backend config is rejected at load.
- D19. Hand-over of record (N3). The 15-point spec, 12 adjustments, open questions and README in Engine-Core `docs/implementation/do-it-engine-layer/` are the deliverable. This program may edit only that folder (docs only). The epic fixes two stale lines found while reading: spec section D says "loop cap 2 in statechart" (should be 3 per PD-06) and spec point 6 names backend `card` (should be `engine`). Adjustments are saved, not applied in place (O2 stays an owner decision).
- D20. Conformance replay (spec point 14). The W3 `lp_content` landing-page card is replayed against the compiled definition, with exact gates and exit codes, plus four negatives: stale head, budget denied, loop cap, injection. A replay that runs on a fixture is VERIFIED only for fixture behavior; a replay that needs a live Engine environment is [REAL] and ends IMPLEMENTED-NOT-VERIFIED when none is reachable (G-3). Engine dev-squad W3 is not yet closed (research/08 section 1), so the live replay is expected to be unreachable at first.
- D21. Scope check. A scripted check proves no file outside `do-it-engine-layer/` in Engine-Core was modified by this program (CONTRACT section 5). Engine-Core is a git repo and other sessions work in it, so the check is path-scoped and attribution-aware (see N3 cases).

## 5. Epics
| EID | Epic | Wave | Branch | Cases | [REAL] |
|---|---|---|---|---|---|
| N1 | Engine host adapter | W3 | epic/N1-engine | 18 | 3 |
| N2 | StateStore and backends | W2 | epic/N2-statestore | 18 | 7 |
| N3 | Engine-layer hand-over and replay | W3 | epic/N3-handoff | 14 | 4 |

Dependencies: N1 needs S4 (owner pack grammar), P1 (pipeline step schema) and H0 (host interface); N2 needs S1 (state layout and schemas); N3 needs N1 and N2.

## 6. Acceptance criteria
- A1. The lifecycle `squad.yaml` compiles, decompiles and compares equal (N1).
- A2. A pack sent once is answerable on three channels; one ID is never applied twice (N1).
- A3. Injection, nested-squad and publish-from-persona fixtures all fail closed (N1, N3).
- A4. The shared StateStore test passes for `local-fs`, `git-branch` and `engine`; the Engine backend's real-service case is VERIFIED or IMPLEMENTED-NOT-VERIFIED, never green on a mock (N2).
- A5. A tampered blob is rejected on every backend (N2).
- A6. A killed write leaves a readable prior state; a run resumes from git ref plus result file with an empty working directory (N2).
- A7. 15 spec points and 12 adjustments are present in Engine-Core; replay result is recorded; scope check shows zero stray edits (N3).
- A8. Every case in the three Test Contracts is PASS (CONTRACT section 7).

## 7. Risks
| Risk | Effect | Handling |
|---|---|---|
| No reachable Engine environment | [REAL] Engine cases cannot be VERIFIED | Ends IMPLEMENTED-NOT-VERIFIED, stated in the report; fixture cases still bind. |
| Engine rejects the `x_do_it` block (D3) | Lossless round trip breaks | Fallback to definition metadata; N1 case T-N1-18 decides. |
| R2 not used by Engine (D14) | Blob driver unavailable | Driver setting; default `rows`; `r2` only after Engine confirms. |
| Two channels answer at once (D6) | Double apply | First-valid-wins plus `answered` marker; tested. |
| Other sessions edit Engine-Core during the program | False positive on scope check | Attribution manifest and exit 2 instead of a guess (N3). |
| Spec text drifts from CONTRACT (card vs engine, cap 2 vs 3) | Engine builds the wrong thing | N3 task list fixes both and a case reads the saved file. |
| Dev-squad W3 unfinished | Live replay unavailable | Fixture replay now, live replay later, labeled. |

## 8. Repo and branch plan
Lane L4 owns `hosts/engine/**`, `core/state-stores/**`, and Engine-Core `docs/implementation/do-it-engine-layer/**` (docs only). Tests and fixtures stay inside the lane: `hosts/engine/tests/**`, `hosts/engine/fixtures/**`, `core/state-stores/tests/**`, `core/state-stores/conformance/**`. Proposed amendment A1 (CONTRACT section 5): state this explicitly, because `tests/**` belongs to L5.

Branches: `epic/N1-engine`, `epic/N2-statestore`, `epic/N3-handoff`, one worktree per squad (G-10 of plan-it). N3 edits Engine-Core files directly on that repo's own working branch, only under `do-it-engine-layer/`; no other Engine-Core path is staged.

## 9. Proposed CONTRACT amendments
- A1. Lane L4 may hold tests and fixtures in `hosts/engine/tests|fixtures` and `core/state-stores/tests|conformance`.
- A2. Add `STALE_HEAD` and `BUDGET_DENIED` as named reasons (not new run statuses) mapped to it-result status `blocked` and to OVER_BUDGET then PARKED, since Engine's statechart uses them (research/08 section 1).
- A3. Add `answered` and `accepted-by-default` as owner-pack answer states (D6, D7).
- A4. Name the Engine blob driver setting `state.engine.blobs` in settings.json with values rows, r2, fs-mirror.

## 10. Unknowns stated
Job start and clone latency, gVisor probe result, whether R2 is used in Engine, which channel wins when several answer in real Engine (03-OPEN-QUESTIONS); whether Engine accepts extra step fields. Host Engine is not in docs/research/11-host-cli-probe.md; every Engine fact here is from research/06, research/08 and the Engine-Core do-it-engine-layer docs, read as docs and not as runtime code.
