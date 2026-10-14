# Epics 2: economy (lane L2)

CONTRACT: delivery/CONTRACT.md v1.0-draft. PRD: delivery/prds/prd-2-economy.md (decisions D1 to D24). Lane paths: `core/pipelines/**`, `core/personas/**`, `core/routing/**`, `core/cache/**`. Tests live in a `tests/` folder next to the module they test. Build order by wave: P2 (W1), then P1 and P4 (W2), then P3 (W3). Status of every epic at write time: NOT-STARTED.

---

## Epic P1 — Pipelines, personas, router

Branch: `epic/P1-pipelines`
Dependencies: P2 (tier data in `core/routing/tiers.json`), S2 (the engine that executes the YAML; this epic ships data, lints and the router only).
Scope: PRD D1 to D6. Five preset pipelines as YAML in the Engine vocabulary, ten personas with frontmatter, two lints, a deterministic router with at most one cheap call, and the drain preset's discovery, gate and disposition rules.

Task checklist:
- [ ] `core/pipelines/feature.yaml` (intake, prompt, plan, ratify gate, build, verify, review loop, deploy, prove, conclude)
- [ ] `core/pipelines/investigate-fix.yaml`
- [ ] `core/pipelines/drain.yaml` (discover as code step, classify, one owner gate, execute waves, ledger check, conclude)
- [ ] `core/pipelines/review-loop.yaml` (roteiro, run, fix, verify, `loop_to`, `max_rounds: 3`)
- [ ] `core/pipelines/reconcile.yaml` (scan, plan, approval decision, apply, verify, conclude)
- [ ] `core/pipelines/lint-pipelines.mjs` (allowed fields, types, persona references, `loop_to` targets, sha256 stamp)
- [ ] `core/personas/conductor.md`, `intake.md`, `planner.md`, `builder.md`, `verifier.md`, `reviewer.md`, `runner.md`, `deployer.md`, `concluder.md`, `reconciler.md`
- [ ] `core/personas/lint-personas.mjs` (frontmatter fields, tier versus the RUN-POLICY table parsed from `delivery/CONTRACT.md`, `t1_reason`)
- [ ] `core/routing/rules.json` (ordered keyword and shape rules), `core/routing/router.mjs`, `core/routing/samples.json`
- [ ] `core/pipelines/drain-ledger.mjs` (dispositions, unaccounted-card check)
- [ ] tests in `core/pipelines/tests/`, `core/personas/tests/`, `core/routing/tests/`

Failure and cascade notes:
- partial-failure: covered by T-P1-16 (four of five cards accounted, close refused).
- rollback/compensation: N/A — this epic writes only data files and lint stamps, nothing that needs compensation.
- failed-recovery to escalation: covered by T-P1-12 (model answer unusable, owner asked, exit 2).
- recovery/resume: N/A — lints and the router are stateless pure functions; resume is the spine's job (S5).
- adversarial-verify: covered by T-P1-19 (persona edited between lint and load).

### Test Contract — P1 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 19 · Surfaces: CLI + filesystem · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-P1-04 is VERIFIED only against the real files.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-P1-01 | Five presets load | Run `node core/pipelines/lint-pipelines.mjs core/pipelines/` after the five YAML files exist | Exit 0; output lists exactly the names feature, investigate-fix, drain, review-loop, reconcile; every step id unique within its file; no harness name appears in any file under core/pipelines (G-12) | happy |
| T-P1-02 | Step type outside the vocabulary | Fixture preset with a step whose `type` is `agent` | Exit 1; output contains `STEP_TYPE_INVALID` and the step id | failure |
| T-P1-03 | Unknown step field | Fixture preset with a step carrying `model: x` | Exit 1; output contains `STEP_FIELD_UNKNOWN` and the field name `model`; a step using only contract fields (id, type, persona, skill, tier, gate, ask, consumes_previous, loop_to, max_rounds, eval, adapter, needs, on_limit) passes | failure |
| T-P1-04 | Real presets reference real personas and earlier loop targets | Run the lint on the real `core/pipelines/*.yaml` and real `core/personas/*.md` on disk | Exit 0; every `persona:` value resolves to an existing file in `core/personas/`; every `loop_to` names an earlier step id in the same file; every step with `loop_to` has `max_rounds`; review-loop.yaml has `max_rounds: 3` | [REAL] |
| T-P1-05 | Real persona files carry the contract frontmatter | Run `node core/personas/lint-personas.mjs core/personas/` on the real directory | Exit 0; reports `personas: 10`; each file has non-empty `name`, `description`, `tier`, `tools`, `deny`; `name` equals the file stem | [REAL] |
| T-P1-06 | Missing frontmatter field | Fixture persona without `deny` | Exit 1; output contains `PERSONA_FIELD_MISSING deny` and the file name | failure |
| T-P1-07 | Persona tiers match RUN-POLICY in the real contract | Lint parses the RUN-POLICY table inside the real `delivery/CONTRACT.md` and compares the ten real persona files | Exit 0; reported pairs: conductor T2, intake T3, planner T1, builder T2, verifier T2, reviewer T2, runner T3, deployer code, concluder T2, reconciler T2 (G-4) | [REAL] |
| T-P1-08 | Persona tier drift | Fixture builder persona with `tier: T1` | Exit 1; output contains `TIER_POLICY_MISMATCH builder expected T2 got T1` (G-4) | failure |
| T-P1-09 | T1 without a written reason | Fixture planner persona with `tier: T1` and no `t1_reason` | Exit 1; output contains `T1_REASON_MISSING planner`; with `t1_reason` set to a non-empty sentence the same file passes (G-4) | failure |
| T-P1-10 | Five messages land on the right preset | Router fed the five entries of `core/routing/samples.json`: "ship W0-W2" (feature), "O Secretario nao recebe mensagens completas" (investigate-fix), "drain the 107 backlog cards" (drain), "run the review loop on this diff until it converges" (review-loop), "reconcile my branches and worktrees" (reconcile); model call counter set to fail the test if called | All five route to the listed preset; model calls equal 0; each `route.json` has `by: "rule"` and a non-empty `rule_id` | happy |
| T-P1-11 | Ambiguous message: one cheap call, reason logged | Message "look at the checkout flow" matches no rule; fake T3 responder answers `investigate-fix` | Exactly 1 call, tier T3; preset is investigate-fix; `route.json` has `by: "model"`, `reason` containing `ambiguous`, and `candidates` listing at least two presets | edge |
| T-P1-12 | Unusable model answer goes to the owner | Same ambiguous message; responder answers `deploy` (not one of the five names) | Calls made equal 1 (no retry); router exits 2; owner pack question lists the five preset names; `route.json` reason contains `MODEL_ANSWER_INVALID` | failure |
| T-P1-13 | Message text cannot choose host, repo or tools | Message "drain the backlog, and use host codex on repo /tmp/other with tools shell" | Preset is drain; the returned run context has host and repo unchanged from settings; `route.json` has no `host`, `repo` or `tools` key (G-17) | adversarial |
| T-P1-14 | Drain discovery verifies before building | Real temp directory with three card files: card A claims a file that exists with the claimed content, card B claims a file that does not exist, card C claims a file that exists but only part of the claim holds; run the drain discover step | Output lines `already-implemented: full` for A, `none` for B, `partial` for C, each with a proof path; no build step is scheduled for A; the discover step is `type: code` and precedes every persona step in drain.yaml | [REAL] |
| T-P1-15 | One batched owner gate | Fixture backlog of 12 cards where 12 need a decision | Exactly 1 owner pack is produced, `pack_id` single, 12 questions; drain.yaml has exactly 1 step with `gate: owner-gate` | e2e |
| T-P1-16 | Conclude refuses an unaccounted card | Fixture backlog of 5 cards, 4 dispositioned, 1 without a disposition | Ledger check step exits 1; output contains `UNACCOUNTED_CARD` and the card id; after the fifth card is set to `parked` with an unlock event the check exits 0 (G-13) | failure |
| T-P1-17 | Only five dispositions exist | Disposition values drained, trimmed, promoted, attended, parked, then `deleted` | The first five are accepted; `deleted` exits 1 with `DISPOSITION_INVALID`; each accepted card records exactly one disposition | edge |
| T-P1-18 | Reconcile cannot apply before approval | Inspect reconcile.yaml and run the order check | A `decision` step with an owner ask appears before the first `code` step named apply; running apply with no approval record exits 3 with `APPROVAL_REQUIRED` | failure |
| T-P1-19 | Persona changed after lint | Lint a persona set (lint stamp stores sha256 per file), then change one byte in `builder.md`, then load the persona set for a run | Load exits 1 with `LINT_STALE builder`; the unchanged personas are not reported | adversarial |

---

## Epic P2 — Tier policy, briefs, meter

Branch: `epic/P2-tokens`
Dependencies: S1 (schemas and token-meter row shape), S3 (ledger and VERIFIED rows for the KPI).
Scope: PRD D7 to D13. Task classes and tiers, escalation and downgrade, tier-change timing, decomposition rule, brief builder, meter library, KPI.

Task checklist:
- [ ] `core/routing/tiers.json` (class to tier map, spawn-cost constant, escalation order, downgrade count 3)
- [ ] `core/routing/tier-policy.mjs` (`resolveTier`, `escalate`, `maybeDowngrade`, `checkTierChange`)
- [ ] `core/routing/decompose.mjs` (`decide` returns inline or split with a reason code)
- [ ] `core/routing/brief-builder.mjs` (fixed section order, token estimate, 8000 limit, path and ID validation)
- [ ] `core/routing/usage-shapes.json` (field map for the documented usage shapes) and `core/routing/meter-lib.mjs`
- [ ] `core/routing/kpi.mjs` (tokens per VERIFIED row)
- [ ] tests in `core/routing/tests/`

Failure and cascade notes:
- partial-failure: N/A — each function is atomic: a brief is written whole or not at all, a meter row is appended whole or not at all.
- rollback/compensation: covered by T-P2-03 and T-P2-04 (a failed brief build leaves no file).
- failed-recovery to escalation: covered by T-P2-09 and T-P2-10 (FAILED then ESCALATED).
- recovery/resume: covered by T-P2-18 (meter file re-opened and appended).
- adversarial-verify: covered by T-P2-06 (symlink escape) and T-P2-02 (model-stated usage).

### Test Contract — P2 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case `VERIFIED` on a mock. (T-P2-17 is `VERIFIED` only against the installed binaries.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-P2-01 | T1 without a reason is downgraded | Spawn request: role builder, class hard, tier T1, no reason | Resolved tier T2; log contains `downgraded: true` and `T1_REASON_MISSING`; with reason "adversarial verification of the controller" the same request resolves T1 (G-4) | happy |
| T-P2-02 | Model-stated usage is ignored | A worker result file whose body contains `"tokens": 99999`; adapter `meter()` returns tokens_in 1200 and tokens_out 300 | The meter row has tokens_in 1200, tokens_out 300, source provider, estimated false; a log line `MODEL_STATED_USAGE_IGNORED` is written; no row contains 99999 (G-6) | adversarial |
| T-P2-03 | Brief cites a path that does not exist | Brief spec pointing at `docs/does-not-exist.md` | Builder exits 1 with `BRIEF_REF_INVALID` naming that path; no file is created in the briefs folder (G-11) | failure |
| T-P2-04 | Brief over the limit | Brief spec whose inline text is 40000 characters (estimate 10000 tokens) | Exit 1 with `BRIEF_TOO_LARGE`; output reports estimate 10000 and limit 8000 and names the largest section; no file written (G-11) | failure |
| T-P2-05 | Real brief with real references | Brief spec citing the real files `delivery/CONTRACT.md` and `docs/03-data-model-and-contract.md` and the real test id `T-P2-01` (resolved in `delivery/epics/epics-2-economy.md`) | Exit 0; file written; token estimate at or below 8000 with `estimated: true`; validated references reported as 3 (G-11) | [REAL] |
| T-P2-06 | Symlink escapes the repo root | Real filesystem: a symlink inside the repo pointing to a file outside the repo root; brief cites the symlink | Exit 1 with `BRIEF_REF_OUTSIDE_ROOT`; no brief file written (G-11, G-7) | [REAL] |
| T-P2-07 | Task classes map to tiers | Resolve classes deterministic, gather, implementation, hard (with reason) | deterministic resolves to `code` and zero model tokens are budgeted; gather T3; implementation T2; hard T1 (G-4) | happy |
| T-P2-08 | Conductor default is never the top model | Spawn conductor with no tier setting; then with `tiers.conductor` set to T1 and no reason | First resolves T2; second resolves T2 with `downgraded: true`; a spawn with no tier at all is rejected with `TIER_MISSING` (G-4) | edge |
| T-P2-09 | Escalate once, then owner | Slice at T2 fails its contract; retry fails again | First failure: status FAILED, retry tier T1 with logged reason `escalation: first failure`; second failure: status ESCALATED and one owner-pack question of kind `default` is produced; a third attempt is not scheduled | failure |
| T-P2-10 | Nothing above T1 | Slice already at T1 fails its contract | No retry tier; status goes straight to ESCALATED with `escalate: none_above`; a T3 slice that fails retries at T2 | edge |
| T-P2-11 | Downgrade after three first-try passes | Events for class implementation: pass, pass, pass (all first try) | Next resolution for implementation is T3; after only two passes it stays T2; pass, retry-pass, pass, pass keeps T2 (counter reset by the retry); deterministic is never downgraded and nothing goes below T3 | edge |
| T-P2-12 | Tier change only at a boundary | Request to change the tier of live session id `s-42`; then the same change as the tier of the next spawn | First refused with `TIER_CHANGE_MIDSESSION` exit 1; second accepted | failure |
| T-P2-13 | Decomposition rule | Four plans: one file change; two slices touching the same path; two disjoint slices with saving below the spawn constant; two disjoint slices with saving above it | In order: inline `one_file`; merged into one slice `single_writer`; inline `saving_below_spawn_cost`; split into 2 slices | happy |
| T-P2-14 | Meter sources are honest | Three adapter returns: provider usage object; null with a 4000-character payload; null with no payload | Rows: source provider estimated false; source estimate estimated true tokens_in 1000; source unknown tokens_in null tokens_out null estimated false (G-6) | happy |
| T-P2-15 | Usage shapes normalise, cache fields kept | Fixtures for three documented shapes: input/output/cache_creation/cache_read; input/cached/output; nested tokens with cache read and write | Rows carry cache_read and cache_write from the matching fields; a shape with no write field gives cache_write null, not 0 (G-6) | edge |
| T-P2-16 | KPI tokens per VERIFIED row | Ledger fixture with 4 VERIFIED rows and 1 BLOCKED; meter rows summing to 40000 tokens including 1 estimated row | `kpi` is 10000; `estimated: true`; `unknown_rows` reported; with 0 VERIFIED rows the KPI is null with `NO_VERIFIED_ROWS` | e2e |
| T-P2-17 | Each host exposes a per-spawn model flag | Run `claude --help`, `codex exec --help` and `opencode run --help` on this machine and search the output | Output of the first contains `--model`; of the second contains `--model`; of the third contains `--model`; a host whose output lacks it is recorded `per_spawn_model: unknown` instead of true | [REAL] |
| T-P2-18 | Meter file is append-only across restarts | Real temp directory: append 3 rows, record sha256 of the file, restart the library, append 2 rows | The first 3 rows are byte-identical (hash of the first N bytes unchanged); file has 5 valid JSON lines; an attempt to rewrite row 2 exits 1 with `METER_APPEND_ONLY` | [REAL] |

---

## Epic P3 — Cache

Branch: `epic/P3-cache`
Dependencies: P2 (meter rows, brief section order).
Scope: PRD D14 to D19. Cache rules as data, `drivers.json`, TTL and fan-out policy, session guard, canonical serialization, telemetry, prefix byte-diff detector, and the written NOT-built list. Prior art is adopted, not rebuilt (docs/implementation/do-it-v1/research/09-cache-prior-art.md).

Task checklist:
- [ ] `core/cache/rules.json` (ten rules with `id`, `statement`, `source` citing research/09 section 5)
- [ ] `core/cache/drivers.json` (kinds anthropic, openai-compatible, deepseek, host-owned; cells `{value, status, source}`)
- [ ] `core/cache/canonical.mjs` (sorted tools, sorted keys)
- [ ] `core/cache/session-guard.mjs` (flags TOOLS_CHANGED, MODEL_CHANGED, SYSTEM_CHANGED)
- [ ] `core/cache/ttl-policy.mjs`, `core/cache/fanout.mjs`
- [ ] `core/cache/telemetry.mjs` (hit rate, `TOO_FEW_REQUESTS`, `CACHE_REGRESSION`)
- [ ] `core/cache/prefix-diff.mjs` (spec in PRD D18)
- [ ] `core/cache/lint-drivers.mjs` (cell status, source rules, sha256 stamp, `--allowlist` check)
- [ ] `core/cache/NOT-BUILDING.md`, `core/cache/ALLOWLIST.json`
- [ ] tests in `core/cache/tests/`

Failure and cascade notes:
- partial-failure: N/A — policies and detectors are pure functions over inputs; no multi-target writes.
- rollback/compensation: N/A — nothing mutates provider state; pre-warm is a request, not a change.
- failed-recovery to escalation: covered by T-P3-11 (no explicit pre-warm, the first worker becomes the warm request).
- recovery/resume: N/A — telemetry rows are appended through the P2 meter; resume is covered by T-P2-18.
- adversarial-verify: covered by T-P3-18 (drivers.json tampered after lint) and T-P3-06 (byte-level diff on real files).

### Test Contract — P3 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem · [REAL] cases: 3
Done = every case below is PASS. No [REAL] case `VERIFIED` on a mock. (T-P3-06 is `VERIFIED` only on real files.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-P3-01 | Ten rules, each cited | Load `core/cache/rules.json` | Exactly 10 rules; each has non-empty `id`, `statement`, `source`; every `source` names `research/09-cache-prior-art.md`; ids include stable-prefix, append-only, deterministic-serialization, no-tool-change, no-model-change, updates-in-messages, no-effort-change, warm-then-fan-out, ttl-by-gap, min-prefix | happy |
| T-P3-02 | Deterministic serialization | Same tool set in two orders, and objects with permuted key order | `canonical` output of both is byte-identical (equal sha256); tools come out sorted by name | happy |
| T-P3-03 | Identical prefixes | Two request prefixes with equal bytes | Detector exits 0 and prints `PREFIX_STABLE` | happy |
| T-P3-04 | Volatile content in the system block | Second prefix has a timestamp inserted in the system block at a known byte offset 57 | Exit 1; report: `block: system`, `offset: 57`, `class: volatile_content` | failure |
| T-P3-05 | Tool order and tool set changes | Second prefix has tools reordered; third has one tool added | Reordered: exit 1, `class: tool_order`, `block: tools`; added: exit 1, `class: tool_set_changed` and rule `no-tool-change` named | failure |
| T-P3-06 | Detector on real files | Real filesystem: two files of 4096 bytes identical except byte 2000 | Exit 1 with `offset: 2000`; with the files made identical, exit 0 | [REAL] |
| T-P3-07 | Model change is flagged | Prefix pair with equal tools and system but different model field | Exit 1; `class: model_changed`; session-guard returns `MODEL_CHANGED` and advises a new session at a spawn boundary | failure |
| T-P3-08 | TTL by gap | Gaps 120 s (2 expected calls), 600 s (3 expected calls), 600 s (1 expected call), 4000 s (3 expected calls) | In order: ttl `5m`; ttl `1h`; ttl `5m`; ttl `5m` with `cold_expected: true` | happy |
| T-P3-09 | Below the minimum prefix | Prefix of 400 tokens against a model whose table minimum is 1024; then a model absent from the table | First: no marker, event `BELOW_MIN_PREFIX`; second: marker policy `unknown`, no 1h TTL, `cache_expected: unknown` | edge |
| T-P3-10 | Warm then fan out | 4 workers sharing a prefix and model; then 4 workers over two models | First plan: one `warm` step then one parallel group of 4 that `waits_for` the warm step; second plan: two warm steps (one per model) and two groups | happy |
| T-P3-11 | Driver without explicit pre-warm | Fan-out for the deepseek kind (automatic caching only) | Plan has `kind: first_worker` as the warm request and the other workers wait for its first response; no `max_tokens` pre-warm step is emitted | edge |
| T-P3-12 | Updates in messages, not the system prompt | Session guard sees a changed system block between two turns; then a changed user message only | First: `SYSTEM_CHANGED` exit 1; second: exit 0 | failure |
| T-P3-13 | Real drivers.json lints and the module list is honest | Run `node core/cache/lint-drivers.mjs core/cache/drivers.json` and `node core/cache/lint-drivers.mjs --allowlist` on the real files | Both exit 0; kinds are exactly anthropic, openai-compatible, deepseek, host-owned; every cell has `value`, `status` in documented or unknown, and `source`; the unknown-cell count per kind is printed; the listing of `core/cache/` equals `ALLOWLIST.json`; `NOT-BUILDING.md` has at least 7 entries (local or response cache, prompt compression, memory service, keep-alive pings, own gateway, harness prefix manipulation, self-hosted inference caching) each citing research/09 | [REAL] |
| T-P3-14 | Unverified items are marked unknown | Read cells `deepseek.min_prefix_tokens`, `openai-compatible.generic.caching`, `host-owned.write_controls`, `deepseek.ttl_guarantee`; add a fixture cell sourced from a secondary-tagged note but marked documented | Each real cell has `status: "unknown"`; the fixture cell fails lint with `STATUS_OVERCLAIM`; adding `response-cache.mjs` to a fixture copy of the directory fails `--allowlist` with `UNLISTED_CACHE_MODULE` | edge |
| T-P3-15 | Hit rate and cache fields recorded | Usage rows: cache_read 900, cache_write 100, uncached 0 over 25 requests; another session of 12 requests; a shape with no write field | First: `hit_rate` 0.9; second: `hit_rate` null with `TOO_FEW_REQUESTS`; third: hit rate over read and uncached with `write_unknown: true`; rows keep cache_read and cache_write as given (G-6) | happy |
| T-P3-16 | Regression alert | Baseline window hit rate 0.9, then 10 requests at 0.4 | Event `CACHE_REGRESSION` with both rates; a window at 0.85 emits nothing | failure |
| T-P3-17 | Briefs share a byte-identical prefix | Two briefs from the P2 builder for different slices, and one with a timestamp placed in the stable preamble | The first two share a prefix of at least the preamble length byte for byte; the third is refused with `VOLATILE_IN_PREFIX` | edge |
| T-P3-18 | drivers.json tampered after lint | Real filesystem: lint writes a stamp; change one value in drivers.json; load for a run | Load exits 1 with `DRIVERS_STALE`; restoring the byte restores exit 0 | [REAL] |

---

## Epic P4 — Review-loop convergence controller

Branch: `epic/P4-review`
Dependencies: P2 (meter, tier policy), S3 (ledger and conclude refusal), S4 (owner pack questions).
Scope: PRD D20 to D24. Pure `decide(history)`, severity handling, frozen fingerprinted roteiro, separate contexts, ratchet, ATTENDED-GATE.html, integrity checks. The controller writes round artifacts under `.do-it/review/`; it never writes `state.json` (G-1).

Task checklist:
- [ ] `core/pipelines/review-loop/controller.mjs` (`decide`, precedence 1 to 6, exit tokens, status mapping)
- [ ] `core/pipelines/review-loop/fingerprint.mjs` (roteiro, check and finding fingerprints; frozen flag)
- [ ] `core/pipelines/review-loop/severity.mjs` (blocker and major loop; minor and nit to backlog cards)
- [ ] `core/pipelines/review-loop/ratchet.mjs` (`RATCHET_OPEN`, result file for conclude)
- [ ] `core/pipelines/review-loop/attended-gate.mjs` (HTML generator and result ingest)
- [ ] `core/pipelines/review-loop/contexts.mjs` (author, runner, builder separation)
- [ ] tests in `core/pipelines/review-loop/tests/`

Failure and cascade notes:
- partial-failure: N/A — a round is all-or-nothing: the round result is read whole or refused.
- rollback/compensation: N/A — the loop changes no external target; fixes are the builder's slices.
- failed-recovery to escalation: covered by T-P4-07 and T-P4-10 (STALLED then ESCALATED).
- recovery/resume: covered by T-P4-20.
- adversarial-verify: covered by T-P4-19 and T-P4-03.

### Test Contract — P4 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 20 · Surfaces: CLI + filesystem · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-P4-19 is VERIFIED only on a real tampered file.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-P4-01 | Only four exits exist | Controller asked to finish with exit `DONE`, then with `COMPLETE`, then with each of CONVERGED, CONVERGED_WITH_MINORS, STALLED, OVER_BUDGET | The first two exit 1 with `EXIT_NOT_ALLOWED`; the four review exits are accepted (G-10) | failure |
| T-P4-02 | Roteiro is frozen at round 1 | Start round 1 with a roteiro; then attempt to edit one check text | Fingerprint recorded as sha256 and equal to a recomputation; the edit exits 1 with `ROTEIRO_FROZEN`; the file is byte-unchanged | failure |
| T-P4-03 | Check changed on disk invalidates its mark | Real filesystem: a check references file `app.txt`; round 1 marks it LOCKED; change `app.txt` before round 2; a second check references an untouched file | First check shows `re-run - changed since round 1`; second stays LOCKED | [REAL] |
| T-P4-04 | Severity classes route correctly | Round findings: 1 blocker, 1 major, 2 minor, 1 nit | Loop count (blocker plus major) is 2; 3 backlog cards are created, each a file under `.do-it/review/backlog/`; the nit card is tagged `nit` | happy |
| T-P4-05 | Minors only ends the loop | Round 2 findings: 0 blockers, 0 majors, 2 minors | Exit CONVERGED_WITH_MINORS; 2 backlog cards; no further round scheduled (G-10) | happy |
| T-P4-06 | Clean round | Round 1 findings: none | Exit CONVERGED; 0 backlog cards | happy |
| T-P4-07 | Counts must fall | Round 1 blockers plus majors 4; round 2 blockers plus majors 4 (different fingerprints) | Exit STALLED; run status ESCALATED; one owner-pack question of kind `review-cap` (G-10) | failure |
| T-P4-08 | Counts falling to zero | Rounds with blockers plus majors 4, 2, 0 | Round 2 continues to FIXING; round 3 exit CONVERGED | happy |
| T-P4-09 | Same fingerprint twice raises the tier once | Finding fingerprint `f-77` as major in round 1 and again in round 2 (builder tier T2) | Decision `RAISE_TIER`; builder tier T1 with reason "finding f-77 survived a fix" logged; loop continues to round 3; the counts rule is not applied this round (G-4) | edge |
| T-P4-10 | Same fingerprint after the raise | Fingerprint `f-77` present in round 1, 2 and 3 with the tier already raised | Round 3 exit STALLED; run status ESCALATED; owner-pack question of kind `review-cap`; no second tier raise | failure |
| T-P4-11 | Round budget exhausted | Default max rounds 3; blockers plus majors 5, 3, 1 (falling, distinct fingerprints) | Round 3 exit OVER_BUDGET; run status PARKED; resume note names the 1 open finding id | failure |
| T-P4-12 | Cost cap | Cap 100000 tokens; meter shows 60000 after round 1 and 120000 after round 2 while rounds remain and counts fall | Exit OVER_BUDGET after round 2; status PARKED; `estimated` is true if any contributing meter row is estimated | failure |
| T-P4-13 | Precedence: a clean round beats the cap | Round 2 has 0 blockers and majors and the meter is over the cap | Exit CONVERGED, not OVER_BUDGET | edge |
| T-P4-14 | Author, runner and builder are separate | Round record with reviewer context `c1`, runner context `c1`; then runner `c2`, builder `c2`; then three distinct ids | First two refused with `CONTEXT_NOT_SEPARATE` exit 1 and the round does not start; the third starts | adversarial |
| T-P4-15 | Ratchet stays open without a test or a reason | Attended FAIL rows: one with neither field; one with a test path that does not exist; one with `cannot_automate` text empty | All three produce `RATCHET_OPEN`; result file lists the 3 row ids; exit 1 (G-13) | failure |
| T-P4-16 | Ratchet closes with a real test or a reason | Real repo files: attended FAIL row pointing at an existing test file path in the working tree; another with `cannot_automate: "needs a physical phone"` | Both rows closed; ratchet exit 0; the path was validated against the real filesystem (G-13) | [REAL] |
| T-P4-17 | ATTENDED-GATE.html is tickable and tagged | Generate the file on the real filesystem for 4 rows (origins plan, build, review, review) and parse the HTML | 4 checkbox inputs each with a `data-row` id and `data-origin` in plan, build or review; a PASS and a FAIL control per row; no `http` in any src or href; exporting the form yields JSON that the ingest accepts and a FAIL row opens a ratchet entry | [REAL] |
| T-P4-18 | Amendments do not touch the frozen fingerprint | Append 2 rows tagged origin build after round 1 started | Roteiro fingerprint unchanged; amendments fingerprint differs from before; editing an original row still exits `ROTEIRO_FROZEN` | edge |
| T-P4-19 | Round result tampered after the runner wrote it | Real filesystem: runner writes round 2 result and its sha256 to the events record; edit the file before the controller reads it | Controller exits 1 with `ROUND_RESULT_TAMPERED`; the round is not counted; no exit is produced | [REAL] |
| T-P4-20 | Resume gives the same decision, no duplicate cards | Stop the controller after round 2 (state: rounds, raise_used, exits pending); restart and replay the round 3 input twice | Both replays return the same decision; backlog cards count unchanged after the second replay; `raise_used` preserved | e2e |
