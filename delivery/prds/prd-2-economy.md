# PRD 2: economy (lane L2)

CONTRACT: delivery/CONTRACT.md v1.0-draft. Squad: economy. Epics: P1, P2, P3, P4. Legend: G-n governance rule, T-EID-NN test case, Rn default, Dn ruling (GLOSSARY.md).

## 1. Summary
The economy lane is the part of do-it that decides what runs, on which tier, with how much context, and when a loop stops. It ships four things, all as data or small deterministic modules with no harness knowledge (G-12):
- P1: five preset pipelines (feature, investigate-fix, drain, review-loop, reconcile) as YAML in Engine's step vocabulary, ten persona markdown files, two lints, and a router.
- P2: the tier policy, escalation and downgrade, the decomposition rule, the brief builder (8000 tokens, every path and ID validated), the token meter with honest sources, and the KPI tokens per VERIFIED row.
- P3: cache rules, a per-provider `drivers.json`, cache telemetry, a prefix byte-diff detector, and a written list of what is NOT built because prior art covers it.
- P4: the review-loop convergence controller, with its frozen fingerprinted roteiro, severity classes, four exits, the ratchet and the ATTENDED-GATE.html format.

Code decides, models work (docs/02 principle P1). Every number a model could invent (usage, hit rate, cost) is computed by code from a provider field, an estimate flagged as such, or recorded as unknown (G-6).

## 2. Problem and goals
Problem (docs/implementation/do-it-v1/01-TOKEN-DISCIPLINE.md section 1): a coordinator that lives for hours, workers spawned on the top tier by inheritance, a finished session that kept polling, and a model switch mistaken for a fix burned a third of a weekly limit in about eight hours. Review loops add a second leak: without an exit rule they continue by taste (docs/02 principle P5). research/07-benchmarks.md lessons 1, 6, 7, 8, 9 say the same from outside: single writer, a verifier that did not write the code, effort scaled to task size, tier by stage, escalate on failure.

Goals, each tied to a test:
1. A message becomes a runnable pipeline without a human choosing the preset, and without a model call in the common case (P1).
2. No spawn runs untiered or on T1 without a written reason; escalation and downgrade are rules with counters, not feelings (P2, G-4).
3. A brief never exceeds 8000 tokens and never cites a path or ID that does not exist (P2, G-11).
4. The meter never contains a number a model typed (P2, G-6). The run reports tokens per VERIFIED row.
5. Cache hit rate is measured, and the obvious busting mistakes are detectable by a byte diff (P3).
6. A review loop ends through exactly one of four exits, and an attended failure cannot vanish without a regression test or a written reason (P4, G-10).

Non-goals: no model harness, no response cache, no prompt compression, no memory service, no gateway (all listed in P3 as NOT built); no edits to Engine-Core; nothing for Hermes or OpenClaw (G-14); no spine code (L1 owns the state writer, `next`, `record`, `meter` command wiring).

## 3. Users and jobs
| User | Job | What they must know to do it | Honest states the lane must show |
|---|---|---|---|
| Owner (Fernando) | Send one message and get the right pipeline without choosing | Which preset ran and why | router chose by rule; router asked one cheap call; router could not decide and asked me |
| Owner | Spend tokens like they are mine | Tokens per VERIFIED row, tier mix, what was estimated | provider, estimated, unknown are three different labels |
| Owner | Decide only what only I can decide | One batched pack: stalled loop, escalated slice, attended checks | STALLED then ESCALATED, OVER_BUDGET then PARKED |
| Conductor (T2 session) | Spawn the right worker cheaply | Tier for this task class, brief that validates | downgraded for missing reason; split or inline and why |
| Reviewer, runner, builder personas | Stay in lane and in tier | persona file contract | lint tells the truth about drift from RUN-POLICY |
| Human at the attended gate | Tick only what a machine cannot check | Which rows, from which round, origin | rows tagged plan, build or review; a FAIL becomes a test or a written reason |
| Host adapter authors (L3, L4) | Read `drivers.json` and `tiers`, feed the meter | Cache cells with an honest unknown | unknown is a value, never a guess |

## 4. Solution design (numbered decisions)
D1. Presets are YAML data, not code. Each file has `pipeline`, `version`, `steps`; each step uses only the contract fields (CONTRACT section 2 pipeline step; docs/03 section 9; docs/02 "Pipeline as data"). Unknown fields fail lint. Loops are `loop_to` plus `max_rounds`; the convergence controller (D18) owns the exit, the YAML only declares the loop.

D2. Five presets and their spines. feature: intake, prompt, plan, ratify gate, build, verify, review loop, deploy, prove, conclude. investigate-fix: intake, investigate (gather), root-cause decision, fix, verify, conclude. drain: discover, classify, one owner gate, execute waves, ledger check, conclude. review-loop: roteiro, run, fix, verify, with `loop_to`. reconcile: scan, plan, owner approval decision, apply, verify, conclude (docs/05 reconcile-it `scan` / `plan` / `apply --approved`).

D3. Ten personas, one markdown file each in `core/personas/`: conductor, intake, planner, builder, verifier, reviewer, runner, deployer, concluder, reconciler. Frontmatter: `name, description, tier, tools, deny` (docs/02 layer 3). `tools` and `deny` use neutral capability words (read, write, edit, search, shell, spawn, ask), never a harness tool name (G-12).

D4. The tier of every persona is checked against CONTRACT RUN-POLICY by a lint that parses the real table in `delivery/CONTRACT.md`. Planner is T1 and must carry `t1_reason` (G-4). Runner is T3 and may carry `visual_tier: T2` for visual walks, the only allowed deviation. Deployer is `code` (no model).

D5. The router is deterministic first: an ordered rule list in `core/routing/rules.json` (keyword and shape rules) maps a message to a preset. If no rule or more than one preset matches, it makes at most one T3 call whose answer must be one of the five preset names; every decision writes `route.json` with the rule id or `model`, the candidates and the reason. If the call is unavailable or its answer is not a preset name, it asks the owner and exits 2. The router only selects a preset: untrusted message text never selects tools, repos or hosts (G-17). Router source of truth is docs/02 "Pipeline as data".

D6. The drain preset implements the proven ritual of the backlog-drain-it skill as data: verify-before-build discovery logs `already-implemented: none|partial|full` with proof per card; every card gets exactly one disposition from drained, trimmed, promoted, attended, parked; ONE batched owner gate; conclude cannot close while any card is unaccounted (G-13, docs/02 behavior 2).

D7. Task classes and tiers: deterministic runs as code (zero tokens), gather is T3, implementation is T2, hard is T1 with a written reason else downgraded to T2 and logged (G-4; CONTRACT section 4; docs/02 token economy; 01-TOKEN-DISCIPLINE gates TR-1, TR-2). Every spawn names a tier or is rejected (TR-1). Conductor default is T2, never the top model (G-4; TR-4).

D8. Escalation and downgrade (CONTRACT RUN-POLICY; DECISIONS D8): a slice that fails its contract is retried one tier up, once, logged; the second failure is ESCALATED and goes to the owner pack. Three consecutive first-try passes of a class lower its tier by one (never below T3, never for deterministic). A pass that needed a retry resets the counter. Pure functions over events rows; the spine records the outcome (G-1).

D9. Tier changes only at a spawn or stage boundary, never inside a live session: a change request naming a live session id is refused (docs/02 token economy; TR-5; prior art rule on model switch, research/09 section 5).

D10. Decomposition rule (docs/02 token economy): do not split when the estimated saving is below the spawn cost; a one-file change runs inline; one writer per path lane, so two slices touching the same path merge (research/07 lesson 1). Spawn cost is an input constant (default recorded in `tiers.json`, calibrated by the R4 fixtures); the function and its inputs are the deliverable, not a claimed number.

D11. Brief builder (G-11; 01-TOKEN-DISCIPLINE DL-2, IH-4): input is a structured brief spec; output is a file under `runs/{run_id}/briefs/`. Token count is estimated at characters divided by 4 and flagged estimated. Over 8000 fails with `BRIEF_TOO_LARGE`. Every path pointer must exist inside the repo root (symlinks resolved; escape fails with `BRIEF_REF_OUTSIDE_ROOT`) and every ID (DoD row, slice id, test case id) must resolve in the ledger, finish line or a test contract file, else `BRIEF_REF_INVALID`. A failed build writes no file. Sections have a fixed order: stable preamble, run-constant section, slice-specific section (this ordering is what P3 relies on).

D12. Meter (G-6; CONTRACT section 2 token-meter row; DECISIONS D5): a library that turns an adapter `meter()` return into a token-meter row with `source` provider, estimate or unknown. Provider usage gives `estimated:false`; no usage but a payload gives characters divided by 4 and `estimated:true`; nothing measurable gives `tokens_in`, `tokens_out` as null and `source:"unknown"`. Usage shapes are normalised by a table (the field map idea copied from LiteLLM, research/09 section 3), not by per-provider code. A `tokens` claim found in a model-written result body is ignored and logged `MODEL_STATED_USAGE_IGNORED`. The file is append-only.

D13. KPI (docs/02 token economy): tokens per VERIFIED row = sum of tokens_in, tokens_out, cache_read, cache_write over the run's meter rows, divided by the count of VERIFIED rows in `ledger.json`. The KPI carries `estimated:true` if any contributing row is estimated and reports `unknown_rows`; zero VERIFIED rows gives null with `NO_VERIFIED_ROWS`. Whether subscription meters weight cached reads differently is unknown (01-TOKEN-DISCIPLINE section 10 question 4), so the breakdown is always reported next to the total.

D14. Cache rules are ten machine-readable rules in `core/cache/rules.json`, each citing research/09 section 5: stable prefix, append-only history, deterministic serialization, no tool change mid-session, no model change mid-session, updates in messages not the system prompt, no thinking or effort or tool_choice change mid-thread, warm-then-fan-out, TTL by gap, no cache markers below the minimum prefix. Plus measurement always. Honest scope: when the host owns the cache (a harness), do-it cannot touch the prefix (research/09 section 7 item 1); the rules then govern only what do-it controls: brief layout, spawn grouping, tier and model change timing, and telemetry.

D15. `core/cache/drivers.json` is a per-provider matrix with kinds anthropic, openai-compatible, deepseek, and host-owned. Each cell is `{value, status, source}` with status `documented` or `unknown`. A cell that research/09 tagged secondary or unverified is `unknown`. DeepSeek is reached through a host's provider routing (research/07, research/11); the host route lives in the host adapter, and the driver is keyed by provider so core stays harness-free (G-12). Unknown cells include: DeepSeek minimum prefix, generic openai-compatible endpoint caching behavior, Gemini items (not a v1 kind), and exact usage shapes from host JSON output (docs/research/11 unknown 1).

D16. TTL and fan-out policy: gap up to 270 seconds uses the 5 minute TTL; gap above that and up to 3570 seconds uses 1 hour only when at least two reuses are expected (the write premium 2x versus 1.25x pays back at the second read, arithmetic in research/09 rule on TTL); a gap beyond one hour is recorded `cold_expected`. Fan-out is one warm request per (provider, model, prefix hash), wait for the first response to begin, then parallel workers; where a driver has no explicit pre-warm the first worker is the warm request (research/09 Anthropic concurrency note).

D17. Telemetry: every call records cache_read and cache_write from the provider field when present, null when the shape lacks it. Hit rate is cache_read divided by cache_read plus cache_write plus uncached input; sessions under 20 requests report null with `TOO_FEW_REQUESTS` (research/09 measure-always rule). A relative drop against the run's own baseline emits `CACHE_REGRESSION`; thresholds are defaults to calibrate with measured fixtures, and no public hit-rate claim is made until a fixture measures it (G-15, DECISIONS R7).

D18. Prefix byte-diff detector: compares two consecutive request prefixes (tools, system, messages up to the last breakpoint), reports the first differing byte offset, the block, and a class: volatile_content, tool_order, tool_set_changed, model_changed, key_order, unknown. Exit 0 identical, 1 different. Anthropic's own cache diagnostics feature was not read in detail (research/09 section 7 item 6), so it is marked unknown and the detector is the provider-independent fallback.

D19. NOT built (research/09 section 4 and section 7): a local or response cache (GPTCache is a different problem), prompt compression (rewrites the prefix), memory services (inject at the tail), keep-alive pings (use 1 hour TTL or pre-warm), a gateway or normaliser of our own (copy the field map; LiteLLM and OpenRouter are adopt-optional), harness prefix manipulation, self-hosted inference caching. Built: only the genuinely unsolved items 1 to 4 and 6 of research/09 section 7, scoped to v1. An allowlist test keeps this honest.

D20. Convergence controller (CONTRACT section 8 M2; DECISIONS D9; docs/02 behavior 3): a pure `decide(history)` function plus a thin runner under `core/pipelines/review-loop/`. Inputs per round: counts by severity, finding fingerprints, cost, context ids. Precedence per round: (1) zero blockers and majors ends CONVERGED, or CONVERGED_WITH_MINORS if minors or nits exist; (2) cost over the cap ends OVER_BUDGET; (3) a blocker or major fingerprint present in two consecutive rounds raises the builder tier once (T2 to T1, with a written reason), and a second recurrence ends STALLED; (4) from round 2, blocker plus major count not strictly below the previous round ends STALLED; (5) round number at the budget (default 3) with blockers or majors left ends OVER_BUDGET; (6) otherwise FIXING and the next round. Only the four exit tokens exist; anything else is refused (G-10). STALLED moves the run to ESCALATED with an owner pack question of kind review-cap; OVER_BUDGET moves it to PARKED with a resume note. Minors and nits never loop: each becomes a backlog card.

D21. Frozen, fingerprinted roteiro (docs/implementation research 05 section 2): at round 1 start the roteiro is hashed (sha256 over canonical rows) and then frozen; edits are refused with `ROTEIRO_FROZEN`. Each check also has its own fingerprint (check text plus digests of the files it references); a mark is inherited across rounds only if that fingerprint is unchanged, else the row shows "re-run - changed since round N". Amendments are appended rows tagged with an origin (plan, build, review) and tracked under a separate amendments fingerprint; original rows are immutable.

D22. Separate contexts: the author (reviewer), runner and builder must have three distinct context ids per round, else the round refuses to start with `CONTEXT_NOT_SEPARATE` (research/07 lesson 6; docs/02 behavior 3).

D23. The ratchet (DECISIONS D2, research 05 section 2): every attended FAIL must become either a regression test (a path that exists) or a written reason it cannot be automated. Otherwise the ratchet is open (`RATCHET_OPEN`) and the result file tells conclude to refuse (G-13). ATTENDED-GATE.html is a self-contained file (no external URLs): one tickable row per attended check with id, origin tag, round and fingerprint, PASS and FAIL controls and a note box, and an export button that produces a JSON result the controller ingests. The row format is the one the review-it companion adopts (R3 catalog); this lane owns the reference generator in `core/pipelines/review-loop/`.

D24. Integrity (adversarial verify): any file a decision depends on (lint result, drivers.json, round result) is re-read and checked against the sha256 recorded when it was produced; mismatch refuses with a named token and never silently proceeds (G-2 spirit; CONTRACT section 8 cascade class).

## 5. Epics table
| EID | Epic | Wave | Branch | Depends on | Cases | REAL |
|---|---|---|---|---|---|---|
| P2 | tier policy, briefs, meter | W1 | epic/P2-tokens | S1 (schemas), S3 (ledger) | 18 | 4 |
| P1 | pipelines and personas | W2 | epic/P1-pipelines | P2 (tier lint data), S2 (engine that runs the YAML) | 19 | 4 |
| P4 | review-loop convergence | W2 | epic/P4-review | P2 (meter, tiers), S3, S4 | 20 | 4 |
| P3 | cache | W3 | epic/P3-cache | P2 (meter, brief layout) | 18 | 3 |
Total 75 cases, 15 REAL.

## 6. Acceptance criteria
- AC1 Five preset YAML files lint clean and each step uses only contract fields (T-P1-01 to T-P1-04).
- AC2 Ten persona files lint clean; each tier equals the CONTRACT RUN-POLICY row (T-P1-05 to T-P1-09).
- AC3 Five sample messages route to the right preset with zero model calls; an ambiguous one makes at most one T3 call and logs why (T-P1-10 to T-P1-13).
- AC4 Drain preset: verify-before-build, one owner gate, five dispositions, no close with an unaccounted card (T-P1-14 to T-P1-17).
- AC5 Untiered spawn rejected; T1 without reason downgraded; conductor T2 (T-P2-01, T-P2-07, T-P2-08).
- AC6 Escalate once then owner; downgrade after three first-try passes; no mid-session tier change (T-P2-09 to T-P2-12).
- AC7 Briefs are at most 8000 tokens with every reference validated; failed build writes nothing (T-P2-03 to T-P2-06).
- AC8 Meter sources and the estimated flag are honest; model-stated usage is ignored; KPI computed from ledger plus meter (T-P2-02, T-P2-14 to T-P2-16).
- AC9 Cache rules machine-readable; drivers.json lints with unknown cells marked; prefix detector names the busting block; telemetry records read and write (T-P3 cases).
- AC10 Controller reaches exactly the four exits with the stated escalation mapping; same-fingerprint, counts, rounds and cost rules each have a case (T-P4 cases).
- AC11 An attended FAIL without a test or a reason keeps the ratchet open; ATTENDED-GATE.html rows are tickable and origin-tagged.
- AC12 Nothing in core/ names a harness (G-12), nothing for Hermes or OpenClaw (G-14), every file lives in lane L2 (CONTRACT section 7).

## 7. Risks
| Risk | Effect | Mitigation |
|---|---|---|
| Router keyword rules overfit five samples | wrong preset on real traffic | rules are ordered data with a sample file; ambiguity falls to one cheap call, then the owner; R4 fixtures extend the sample set |
| Host JSON usage shapes are unverified (docs/research/11 unknown 1) | meter fields wrong or missing | normaliser is a data table; missing field is null, never zero; REAL cases only assert the help flags exist; one paid run is needed to verify output shapes and is listed as a residual |
| Cache cells go stale (models and prices change often) | wrong TTL or premium assumptions | every cell has status and source; unknown is allowed; a cell older than the research date is not claimed |
| Cost cap default is arbitrary | premature OVER_BUDGET or runaway loop | proposed setting `review.cost_cap_tokens` with default flagged as a default to calibrate; estimate-based breaches still trigger |
| Convergence rules too strict for first real loops | spurious STALLED | rule order is pinned by tests; owner pack decides STALLED, so the cost of a false stall is one question |
| G-12 scan would flag test files that probe real CLIs | false failure | proposed amendment A1; until ratified the scan excludes tests directories by lane convention |
| Spawn-cost constant is unmeasured | decomposition thresholds wrong | constant lives in config, function tested at both sides of the threshold; calibrated by R4 fixtures; no claim of savings in README (G-15) |
| P4 depends on S3 and S4 for ledger and owner pack | order of delivery | P4 consumes interfaces only (ledger.json rows, owner-pack questions); mocked cases are never marked REAL |

## 8. Repo and branch plan
Lane L2 paths (CONTRACT section 5): `core/pipelines/**`, `core/personas/**`, `core/routing/**`, `core/cache/**`. One worktree per squad; branches `epic/{EID}-{slug}` as in STATUS.md.
| Epic | Branch | Files |
|---|---|---|
| P1 | epic/P1-pipelines | core/pipelines/feature.yaml, investigate-fix.yaml, drain.yaml, review-loop.yaml, reconcile.yaml, lint-pipelines.mjs; core/personas/*.md (ten), lint-personas.mjs; core/routing/rules.json, router.mjs, samples.json; tests under each dir's tests/ |
| P2 | epic/P2-tokens | core/routing/tiers.json, tier-policy.mjs, decompose.mjs, brief-builder.mjs, meter-lib.mjs, usage-shapes.json, kpi.mjs; tests |
| P3 | epic/P3-cache | core/cache/rules.json, drivers.json, ttl-policy.mjs, fanout.mjs, session-guard.mjs, canonical.mjs, prefix-diff.mjs, telemetry.mjs, NOT-BUILDING.md, ALLOWLIST.json; tests |
| P4 | epic/P4-review | core/pipelines/review-loop/controller.mjs, fingerprint.mjs, severity.mjs, ratchet.mjs, attended-gate.mjs; tests |
Spine wiring (`do-it meter`, `next`, `record`) is L1; this lane exports libraries the spine calls and never writes `state.json` (G-1).

## 9. Proposed CONTRACT amendments
- A1 (G-12): clarify that provider names (anthropic, openai, deepseek) are allowed in core/ and that `**/tests/**` is excluded from the harness-name scan, because REAL cases must run `claude --help`, `codex exec --help` and `opencode run --help`. Also the brief wording "deepseek via opencode" is honored by keying the driver by provider and keeping the route in hosts/opencode.
- A2 (settings): add `review.cost_cap_tokens` (default 600000, to calibrate) beside `review.max_rounds`; the brief requires a cost cap but CONTRACT section 2 has no setting for it.
- A3 (events row): add an optional `detail` string so the router and the meter can log why without a side file; until ratified this lane writes `route.json` and meter notes as separate files.

## 10. Residuals and unknowns
- Exact JSON output shape of host CLIs for usage is unverified without a paid run (docs/research/11 unknown 1); P2 and P3 cases use documented shapes and mark that.
- Anthropic cache diagnostics and opencode cache logic (research/09 conflicts) are unknown; cells say so.
- Whether subscription limits weight cached reads like API prices is unknown; KPI reports the breakdown.
