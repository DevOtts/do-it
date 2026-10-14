# 08 - Engine dev squad: fit with the do-it design, and what to adjust now

Read: ES = /Users/macbook/Workspace/Engine/Engine-Core/docs/implementation/engine-dev-squad/ (SCOPE-BRIEF, SYNTHESIS, DECISIONS, STATUS, WAVES.html, delivery/STATUS.md, delivery/00-program-plan.md, docs/02 and 04, delivery/KICKOFF-W3.md, SQUAD-BRIEF, CONTRACT headings).
do-it = /Users/macbook/Workspace/Devotts/do-it/docs/implementation/do-it-v1/ (research/02-RESEARCH-AND-DESIGN.html, research/06-engine-squads.md).
Not read in depth: R1-R7 research bodies, CONTRACT.md body (146 KB), epics/PRDs, AMENDMENT-LOG. Claims about them are from STATUS/synthesis only.

## 1. What the dev squad is (<=15 lines)

- Program: Engine runs a full software-development squad per client org, on Control Tower (CT) cards and p2p personas. Founding case: Leo's LP card -> chief-of-staff (CoS) -> PM -> designer (only for new UI) -> approval -> dev (gVisor Job) -> reviewer -> QA on preview via roteiro-teste.html -> merge -> acceptance -> docs round. (DECISIONS.md, WAVES.html)
- Shape: "a squad pipeline that CT `delegate(squad)` hands a card to", not a new routing layer (SYNTHESIS.md section 1). Closed `work_type` routing table (lp_content, feature_fe, feature_fullstack, bugfix, backend, infra_config, docs_only, not_dev) with per-type roles, preview, roteiro, risk class, PM-merge eligibility and budget (docs/02 section 5.2). Nine typed handoff artifacts (WorkOrder, Brief, ChangeSpec, PRClaims, ReviewReport, roteiro, QAReport, DocsDelta, MergeCard) in `ds_artifacts` (docs/02 5.4).
- Control flow is code: statechart M-A with ~35 states, failure/escalation states (ESCALATED, STALE_HEAD, BUDGET_DENIED, KILLED...) in docs/04. Agents never close a card (G-12).
- Process: /plan-it autonomous-draft, topology orchestrator (Opus 5.5) + 6 Sonnet squads + Opus adversarial reviewer (SCOPE-BRIEF). Output: CONTRACT v1.3-draft, 26 epics (20 v1 + 6 v1.5), 549 cases, 95 [REAL]. Each epic ends in a binding Test Contract; DoD = 100%; four-term status NOT-STARTED / IN-PROGRESS / IMPLEMENTED-NOT-VERIFIED / VERIFIED (delivery/STATUS.md).
- Rulings: GitHub App (Q1), ClickUp as intake (Q2), repo is doc truth (Q3), Job+gVisor runner (Q-A1), credentials via the backbone with per-step preference + fallback (O-2), PM may merge only low-risk work (Q-A3), fast track for unconnected providers (Q-B2), pilot her0-landing-page (Q-B3.1), one repo per card (OR-9), prompt-injection boundary (OR-8), previews free, prod deploys are approved Plans (O-1).
- Waves (re-waved G4-W): W1 integrations (GitHub App, gateway, repos<->orgs, PR events, ClickUp fail-closed, Cloudflare read) ; W2 runtime foundations (gVisor probe, settings, PR on card) ; W3 squad pipeline DS8-DS13 ; W4 merge+deploy+docs round ; W5 repo docs -> bible ; W6 ClickUp mirror ; W7 pilot ; v1.5 outside-change rail etc.
- Status: delivery/STATUS.md says W2 CLOSED 2026-10-10 (49/56 VERIFIED, gVisor PASS), W3 next, 0 shipped to her0/praxya (HELD). KICKOFF-W3.md exists. Top-level ES/STATUS.md is STALE (still says W-B "TBD" and W-P at G4).
- Open: G4 owner questions O-3/4/5/11/12/13; cross-program asks A-10..A-15 to the CT/p2p orchestrator; KT24 delegation and CT dispatch are code-guarded off until brain-agent honours cancel (critical path).

## 2. Overlaps and conflicts with the do-it design

| Topic | Engine dev squad | do-it design | Verdict |
|---|---|---|---|
| Stages | Product pipeline (CoS..docs round). Build process is plan-it -> /build-it per epic -> adversarial verify -> deploy -> [REAL] (00-program-plan section 6, 9 steps) | intake, plan, ratify, build, verify, review, deploy, prove, conclude (+reconcile) | Same lifecycle for BUILDING the squad; the squad's own steps are a different (product) pipeline. Do not conflate. do-it's `verify` (non-author) and `prove` (live probe) are explicit; Engine folds them into step 5 and 8. |
| Pipeline-as-data | `pipeline_definition` is Engine's own vocabulary, but the dev squad's flow is mostly in M-A code (docs/04) plus `dev-squad v9` definition (DS8/DS9) | pipeline is data in Engine's step vocabulary (persona/checkpoint/decision/render/publish) | Overlap. Gap: Engine encodes loops and head-binding in the state machine, not in step `eval`/`loop_to`. Fine for runtime; but not expressible in a do-it squad.yaml today. |
| State files | `.taskstate/engine-dev-squad-w{1,2}/` (decisions.md D-nn, evidence.md, run-memory.md, CHECKPOINT.md, LANE-RULES.md, OWNER-ASKS.md, BOARD-REQUESTS.md), `.plan-it/*.state.json`, delivery/STATUS.md board, AMENDMENT-LOG.md | `.do-it/runs/<id>/` state.json, events.jsonl, ledger.json, token-meter.jsonl, briefs/, results/, owner-pack.md | Strong semantic overlap (decisions ~ events, evidence.md ~ ledger, OWNER-ASKS ~ owner pack, run-memory ~ resume note). Different names and no machine schema; no result.json. |
| Tiers | RUN-POLICY / 00-program-plan section 7: Opus orchestrator ("never Fable"), Sonnet 5.5 for epics, Opus for crown jewels DS9/DS14/DS17 and every adversarial verify, Haiku for mechanical; escalate after 2 failed contract runs. Runtime: per-step `model_tier` + backbone fallback (O-2) | T1/T2/T3 = powerful/balanced/cheap, conductor T2, T1 needs written reason, escalate one step up, cap, log | Near-identical rules. Differences: Engine conductor is Opus (T1) for the orchestrator; do-it says T2. Engine names models; do-it names tiers. Escalation trigger (2 failures) matches. RUN-POLICY tier provenance not even recorded in run state (STATUS residual). |
| Gates | CONTRACT section 9 DoD, wave entry gates, gate slot + deploy slot (ct-p2p board), pre-push.sh, gate-check.mjs exit codes (plan-it), per-wave exit row | gates = data records with exit codes (0/1/2/3), spine CLI | Compatible. Engine's gate slots/deploy slots = do-it router lock + deploy lock. Engine already has human-curated hot-spot collision board; do-it has none. |
| Review loop | Product: REVIEW_CHANGES/QA_FAILED loops, "loop budget" in M-A (no number visible in docs/04); build: adversarial verify (Opus, fresh context) once per epic; Engine runtime dev board caps at 2 rounds | review loop max 2 rounds then owner | Match on runtime (2). The squad's own loop budget is not stated in the docs read: pin to 2. |
| Owner pack | STATUS "Residuals": owner-gated rows O-3..O-13 + PLAN-REVIEW.html (11 questions + 60 PDs + 25 Ds); defaults "accepted unless contradicted by ID" | one numbered owner pack, terse reply parsed | Same idea; Engine's ID-based default-accept is good and do-it should copy it. Engine's pack is 100+ items across files; not "one pack". |
| Completion / 0-done | 4-term status, VERIFIED = a CONTRACT section 9 lookup, `[REAL]` unreachable = IMPLEMENTED-NOT-VERIFIED never green; disposition column | DoD row VERIFIED only with evidence ref; conclude blocks on unaccounted rows; "0-done" archive | Aligned vocabulary (do-it's IMPLEMENTED-NOT-VERIFIED is literally Engine's). Engine is ahead: per-case ids, `[REAL]` tags, evidence.md. Gap vs do-it: no archival of finished wave to 0-done; docs/implementation grows (this folder has dozens of reports). |
| Folder layout | ES/{docs 01-06, delivery/{CONTRACT, 00-program-plan, STATUS, KICKOFF-Wn, BUILD-REPORT-Wn, CONCLUDE_REPORT-Wn, prds/, epics/, evidence/}, research/} + .taskstate/ outside the folder | .do-it/ for run state; docs under project docs/implementation | Two homes: durable docs (ES) vs run state (.taskstate in repo root, shared with ~100 unrelated programs). Needs a mapping, not a move. |
| Parallelism | 6 parallel planning squads (docs-only), worktrees `epic/<EID>-<slug>`, collision board vs CT/p2p, single writer per epic | one writer, read-only subagents, worktrees via parallel-lifecycle | Compatible; Engine enforces single writer per epic and lane ownership. |
| Delegation depth | Orchestrator -> squads -> workers; reaped squads; runtime `spawn_agent` OFF, squads cannot start squads | conductor spawns stage personas, 8K briefs, one hop | Engine's planning phase used one extra level (orchestrator -> 6 squad leads -> subagents); do-it is conductor -> stage persona. See section 3. |
| Result envelope | Prose BUILD-REPORT / CONCLUDE_REPORT, STATUS table | `it-result/1` JSON | Missing in Engine. Cheapest high-value gap. |

Real conflicts (not just naming): (1) conductor tier (Opus vs T2); (2) runtime control flow lives in a code statechart while do-it wants it in pipeline data; (3) top-level status/board are hand-edited markdown that already drifted (ES/STATUS.md vs delivery/STATUS.md); (4) state files outside the squad folder with ad-hoc names.

## 3. Flat squad vs hierarchy

Engine's hard constraints (research/06 section 2, ES docs/02-04):
- `spawn_agent` is OFF in prod; squad steps are fenced from `start_squad_run` (DENY_BY_CALLER). Nested agents are not available at runtime.
- The conductor persona only sets a default tier; the versioned pipeline_definition conducts. Roster drifted from steps in 8 of 10 squads.
- Next step sees nothing unless `consumes_previous` (one hop, refs only); the dev squad already works around it with typed artifacts via `dsa://` refs.
- Tool cap 128/turn (~122 used), so a manager persona with more tools is expensive.
- Cross-repo work is split by the PM into dependent cards (OR-9, PD-42), not delegated to sub-squads.
- Loops (reviewer -> dev, QA -> dev) and head-SHA binding are the hard parts, and they are already implemented as state machine M-A, with KT24 and CT dispatch gated.
- Parallel writers fail (Cognition); the runner is one Job per task, 2 concurrent per tenant.

Recommendation: a flat, data-defined pipeline per work type, with a ONE-level router, and no manager-agent hierarchy. Concretely:
1. CoS is a router (deterministic-first; one cheap LLM call), not a manager. It picks the work_type and therefore the step list. This is do-it's "factory router" (video) and already in Engine (routing table).
2. The pipeline is flat inside a card. Repetition and conditional steps (designer yes/no, preview yes/no, roteiro short/full) are expressed as per-work_type step lists, not as an LLM deciding at runtime.
3. "Hierarchy" exists only as card dependencies (dev_tasks `parents[]`) for multi-repo or oversized work; each child card runs the same flat pipeline. This gives hierarchy of work without hierarchy of agents.
4. Humans/checkpoints and the conductor-as-code (M-A, spine) own state, so no agent has to hold the whole run in context.
5. The one place a second level pays is the BUILD side of the squad (orchestrator + epic builders + adversarial verifier), which is exactly do-it's conductor -> stage persona model. Keep it one level deep and reap.

Experiments that would settle it (cheap, on the her0 pilot / fo tenant):
- E1, flat vs "manager reads artifacts and decides": replay the same 5 lp_content cards and 3 bugfix cards through (a) the work_type step list as data, (b) a single generic definition with a PM-persona deciding which roles to run next. Measure tokens per VERIFIED assertion (do-it KPI), loops per card, wrong-skip rate (designer/QA skipped when needed). Predicted: (a) wins on cost and wrong-skip; (b) only wins on unfamiliar work types. If (b) wins on work types outside the closed table, add a manager only for `unknown`, not globally.
- E2, split vs one card: take a feature_fullstack case (FE+API in one repo, ~400+ lines). Run (a) PM splits into 2 dependent cards, each flat; (b) one card with one dev Job. Measure review rounds, rework, STALE_HEAD, cost. If (a) is not worse by a margin, hierarchy-by-cards is the default and no nested agents are ever needed.
Neither requires spawn_agent.

## 4. Adjustments to make the dev squad do-it-ready (do these now; each is docs/decisions/waves only)

Ordered by value over cost.

1. Add `it-result/1` JSON beside each BUILD-REPORT-Wn and CONCLUDE_REPORT-Wn. Where: delivery/ (one file per wave, e.g. RESULT-W3.json); schema per 02 memo "The contract that makes stages drivable" (status, exit_code, next, pending_human, artifacts with sha256, resume, tokens). Why: makes a finished wave machine-readable; lets do-it replay W3 as test of the spine. Size S per wave; W3 onward only.
2. Reconcile status homes. Delete or auto-generate ES/STATUS.md and WAVES.html "state" from delivery/STATUS.md (today ES/STATUS.md says W-B TBD, W-P at G4, while delivery/STATUS.md says W2 closed). Where: ES/STATUS.md header "source of truth: delivery/STATUS.md". Why: do-it needs one board. Size S.
3. Name the state-file schema. Write a one-page `delivery/RUN-STATE-MAP.md` mapping `.taskstate/engine-dev-squad-wN/{decisions, evidence, run-memory, CHECKPOINT, OWNER-ASKS, LANE-RULES}` to `.do-it/runs/<id>/{events.jsonl, ledger.json, resume note, owner-pack.md}`. Do not move files. Why: do-it's adapter can then read Engine state. Size S.
4. Record tiering per run in run state (the open RUN-POLICY provenance residual) in do-it vocabulary: add a `tier` column (T1/T2/T3 with powerful/balanced/cheap aliases) to 00-program-plan section 7 and CONTRACT RUN-POLICY table, keep model names as the mapping. Where: 00-program-plan section 7, CONTRACT lines ~1474-1484. Why: Engine's tiers become a driver config; also closes an existing residual. Size S.
5. Decide the orchestrator tier: the program plan says Opus orchestrator for the whole squad; do-it says conductor T2 + restart at context ceiling. Add to DECISIONS.md: "Orchestrator = T1 only for plan/ratify; build waves are conducted by a fresh T2 conductor that restarts from `.taskstate/<wave>/` (KICKOFF-Wn is already the resume prompt)." KICKOFF-Wn files already work as resume prompts, so this is mostly a policy line. Size S.
6. State the loop cap in M-A and CONTRACT: reviewer/QA loops cap at 2 rounds then ESCALATED (matches Engine dev-board and do-it). The docs only say "loop budget exhausted". Where: docs/04 section A.2 (REVIEW_CHANGES, QA_FAILED), CONTRACT test-contract negatives. Size S, plus one test case each (cascade coverage already exists to host it).
7. Single owner pack per wave: add `delivery/OWNER-PACK-Wn.md` (numbered, default-accept-by-ID) generated from OWNER-ASKS.md + PLAN-REVIEW open items; Fernando replies "1 yes 2 no". Why: PLAN-REVIEW.html carried 11 questions + 60 PDs + 25 Ds. Size M (template once, then free).
8. Write a deterministic classifier/brief spec for `lp_content` etc. as the "router: deterministic-first" example (the routing table data in docs/02 5.2 is already close). Add a note that routing is table-driven with confidence < 0.7 -> Ask (already M-A ROUTE_AMBIGUOUS). Where: docs/02 5.2. Size S.
9. Give each artifact (WorkOrder, Brief, ...) a one-hop rule statement + max size, matching do-it "briefs 8K or less, pointers only, paths validated to exist". Where: docs/02 5.4 and CONTRACT 2.9. Why: Engine's `dsa://` resolution already provides one-hop; stating it makes the squad portable. Size S.
10. Archive finished waves: after W2 VERIFIED, move BUILD-REPORT-W1*, W1-FIXROUND-*, G4-DNS-WRITE-MEMO, roteiro-teste-W1.html to delivery/archive-W1/ with a manifest. Why: do-it "0-done" / conclude archive; the folder has ~60 files at top level. Size S, no content change.
11. Mark which steps are code vs persona vs checkpoint in docs/04 M-A (each transition tagged `code | persona | checkpoint | decision`). This is what lets a do-it squad.yaml compile to Engine's pipeline_definition and back. Size M, docs only.
12. Cross-program asks A-10..A-15 and KT24: add them to the owner pack with owner and due; they are the true critical path for W4 PM-merge. Size S.

Do NOT change now: CONTRACT schemas, wave order, epic scope, or Test Contracts. They are working and being built.

What do-it should learn from the dev squad:
- Per-case Test Contract with ids (T-DSn-NN), [REAL] tag, and "unreachable [REAL] = IMPLEMENTED-NOT-VERIFIED, never green" is the best completion mechanism seen; do-it's DoD rows should carry the same tag and rule.
- Default-accept-by-ID owner questions (PLAN-REVIEW) reduce the owner burden.
- Amendment log + CONTRACT freeze: squads never edit the contract, they file ARs and the orchestrator folds them. Good cure for parallel-writer conflict; do-it should have it for multi-lane builds.
- Collision board / hot-spot ownership with gate and deploy slots (ct-p2p BOARD).
- Cascade-case requirement for machines (partial-failure, rollback, failed-recovery -> escalation, resume, adversarial-verify), and negative tests per governance rule.
- Head-SHA binding on verdicts (review/QA bound to the commit they saw; STALE_HEAD) - a pattern do-it's verifier should adopt.
- Prompt-injection boundary OR-8: untrusted text never picks tools/repos; persona holds no write token; only a code step publishes.
- KICKOFF-Wn as resume prompt that pins origin/main SHAs ("re-derive; stop on mismatch") and lists locked decisions.
- Honest stale markers (strikethrough on superseded rulings, e.g. the her0 seat note).
Where Engine should learn from do-it: tokens-per-VERIFIED-row meter, context ceilings, spine CLI as single writer, result envelope, one numbered owner pack.

## 5. What the do-it "Engine layer spec" handed to Engine should contain

Principle: do-it does NOT build Engine's layer. It hands over a spec so Engine can run a do-it lifecycle squad natively. Contents:

1. Scope and non-goals: file contract only; no Engine runtime code; Engine's Mongo/dispatcher/k8s/UI are Engine's job.
2. Squad definition format: `.do-it/squad.yaml` -> `pipeline_definition` compile table (persona stay; checkpoint -> Mission Control card; code steps -> render/publish capability; decision; tiers pass through; `eval{veto,max_retries,post}`; `consumes_previous`; `execution{kind, role, repo, timeout, allowed_tools}`; `backbone{requires,fallback}`). Include a round-trip rule and the roster-derived-from-steps rule (no separate roster).
3. Persona file format: frontmatter name/tier/tools/deny + prompt skeleton with the mandatory hard limits; mapping to `persona_agents` documents; deny table (no spawn_squad, no deploy) -> DENY_BY_CALLER[SQUAD_STEP].
4. Tier map: T1/T2/T3 <-> powerful/balanced/cheap; resolution order; escalation (one step, logged, cap); conductor T2; mapping config asked once.
5. Result envelope `it-result/1` and run states (INTAKE ... DONE, NEEDS_HUMAN, PARKED, BLOCKED) with mapping to CT card states (docs/04 A.1 as a worked example) and exit codes 0/1/2/3.
6. State files: .do-it/runs/<id> layout and how Engine persists them (artifact store / dsa:// refs / ds_artifacts) vs files; resume-from-state rules; how a "limit/park" maps to Engine's seat health and cooling window.
7. Gate and evidence contract: VERIFIED needs an evidence ref; IMPLEMENTED-NOT-VERIFIED; [REAL] probes; verifier is never author; head-SHA binding; "done" as ledger lookup; close blocked on unaccounted rows.
8. Handoff rules: one hop, refs only, brief <=8K, pointers validated, typed artifact schemas (reuse WorkOrder/Brief/PRClaims/ReviewReport/QAReport/DocsDelta names as the reference set).
9. Human-in-the-loop: four gate kinds, owner pack format, terse reply parse, default-accept-by-ID; review cap 2.
10. Safety: untrusted-input rule (OR-8), no write token in personas, deploy lock first, secret handling, spend caps/kill switch hooks.
11. Router: work_type table format (data, closed list, confidence -> Ask), and the rule that work-type chooses the step list.
12. Token economy hooks: meter format (token-meter.jsonl), what Engine must report (provider usage, cache hit, tier mix), stable-prefix brief ordering.
13. Delegation policy: flat by default; hierarchy by card dependency only; nested agents forbidden unless a host declares support; squads cannot start squads.
14. Conformance suite: a replay of W3's lp_content card (flat pipeline) as the acceptance test, with exact expected gates/exits, plus negative cases (stale head, budget denied, loop cap, injection).
15. Open items for Engine: which features it must provide natively (checkpoint cards, artifact refs, tier mapping), which are "do-it spine optional", and version/compat rules.

Unverified / caveats: loop budget number in M-A not located; whether Engine plans to express loops in `eval` vs state machine is not decided in the docs read; CONTRACT body not read.
