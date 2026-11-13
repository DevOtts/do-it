# DECISIONS — resumable-test-gates

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

Run `resumable-test-gates` (do-it run r-20261106-130657-7ff2), autonomous-draft, 2026-11-06. The owner was away:
rulings D1 to D5 come from the owner-approved README; every Rn below is a plan-it default marked
`[default — contradict if wrong]`; OQ-1 to OQ-4 are the only questions for the owner, each with a recommendation and
the default applied if unanswered. All are reviewed once at G4 (PLAN-REVIEW.md). **G4 (2026-11-06, Fernando Ott): plan approved in full with A15; OQ-1 to OQ-4 take their recommendations; A14 kept; every Rn stands.**

## Ruled (locked — owner, 2026-11-06, from README)

| Id | Ruling | Owner | Date |
|---|---|---|---|
| D1 | Gate tiers T0 (edit), T1 (push), T2 (train complete, fired by the do-it conductor from the plan's state), T3 (nightly/pre-release, scheduled) | Fernando Ott | 2026-11-06 |
| D2 | Resume after a partial pass is mandatory ("reiniciar os 500 é um absurdo") | Fernando Ott | 2026-11-06 |
| D3 | do-it owns the trigger, the project owns the command; optional `gates` settings block; missing or null = visible skip; key is `gates`, never `tiers` | Fernando Ott | 2026-11-06 |
| D4 | One deterministic gate queue per machine, not an LLM negotiation skill; a gate never runs without a slot | Fernando Ott | 2026-11-06 |
| D5 | Docker memory cap stays at 13 GB | Fernando Ott | 2026-11-06 |

## Defaults (plan-it recommendations applied; each `[default — contradict if wrong]`)

| Id | Decision | Default | Rationale (evidence) |
|---|---|---|---|
| R1 | Store name and place | "gate results store": `core/spine/src/gate-results.mjs`, schema `do-it-gate-result/1`, data at `{git-common-dir}/do-it/gate-results/` | "ledger" is taken three times and `readLedger` would break the bundle (docs/01 §4.3) `[default — contradict if wrong]` |
| R2 | Gate scope labels inside do-it | CLI and output use `edit, push, train, nightly` (= D1's T0, T1, T2, T3); do-it never prints T-labels for gates; a consumer's docs may keep T0–T3 as aliases | T1–T3 already mean model tiers with inverted cost (docs/01 §4.5) `[default — contradict if wrong]` |
| R3 | Code placement | CLI, store, fingerprint core, verdict, queue = bundled spine modules `core/spine/src/gate-*.mjs`; runner adapters = standalone files under `core/gates/adapters/` with a new mirror-manifest row | bundler rules (docs/01 §4.2) `[default — contradict if wrong]` |
| R4 | Hash and manifest | SHA-256 hex over raw on-disk bytes, repo-relative POSIX paths, `rtg-key/1` manifest sorted by UTF-8 byte order, every component digest stored per row | research/03 F26–F27 `[default — contradict if wrong]` |
| R5 | PASS predicate | no execution error, zero failures, no failure message, at least one passing case; else SKIPPED / DESELECTED / FAIL | crashed suites report 0 failures (docs/01 §5.2) `[default — contradict if wrong]` |
| R6 | Key classes | NARROW (closure) by default; WIDE (closure plus tracked-tree hash) for runtime-read patterns or unresolved repo-local imports; NEVER set (`always_run`, `never_reuse`) always fresh | 208 fs-reading specs vs 13 guards (docs/01 §6 H6) `[default — contradict if wrong]` |
| R7 | Env values | declared names plus `hmac-sha256(machine salt, value)`; declared env files hashed the same way; values never stored or printed | `.env` values decide real-mongo run-or-skip (docs/01 §6 H4) `[default — contradict if wrong]` |
| R8 | Dependency input | installed state (`node_modules/.package-lock.json`, workspace realpaths; python metadata and `.pth`) plus the lockfile | 198 of 860 entries differ (docs/01 §6 H2) `[default — contradict if wrong]` |
| R9 | Reuse lifetime | a reused PASS expires after 24 h or at the last T3 clean, whichever is sooner | 406 specs touch the clock (research/03 table #15) `[default — contradict if wrong]` |
| R10 | ts-jest `isolatedModules` | measure only (transform time with and without, both behind a T3 clean); no flip in this program | emit changes decorator metadata NestJS needs (docs/01 §5.8) `[default — contradict if wrong]` |
| R11 | Dirty tree | rows are written (content-keyed, sound); the verdict says `for WORKING TREE (dirty)` and no tree or commit stamp is written; the train gate runs in a scratch worktree at the target SHA | working tree vs commit hazard (docs/01 §6) `[default — contradict if wrong]` |
| R12 | Train complete | every planned slice's `head_sha` is an ancestor of the target branch tip (`git merge-base --is-ancestor`), or the owner answered `train-closed`; never slice `DONE` | the spine has no merged field (docs/01 §4.7) `[default — contradict if wrong]` |
| R13 | Queue admission | strict FIFO; admit the head when pressure is normal, swap-out rate is about zero over 5 s, `avail_est` covers the peak, and declared peaks of live holders plus this peak fit in 60% of RAM; unreadable signals mean budget-only with a printed warning | research/03 F28–F31 `[default — contradict if wrong]` |
| R14 | Queue timeout and home | 14400 s; then `[WAIT-TIMEOUT]`, exit 3, retryable, never started; queue files under `~/.do-it/queue/` (from HOME); `gates.queue` read from the global settings layer only | ruling D4; conflict with a pilot rule (docs/01 §3) `[default — contradict if wrong]` |
| R15 | Nightly schedule | `do-it gate nightly` runs the declared command; `do-it gate schedule --print` emits launchd and crontab text; installing it is an owner action | no scheduler exists in do-it (docs/01 §4.8) `[default — contradict if wrong]` |
| R16 | Pilot never-reuse set | `*.real-mongo.spec.ts` never reused in v1; `always_run` = the pilot's 13 ALWAYS_RUN_GUARDS plus its outbound grep-fence spec | DB state and tree readers (research/02 §4.2–§4.3) `[default — contradict if wrong]` |
| R17 | Consumer queue placement | cheap legs 0–2 run before admission; admission wraps the jest and build legs | lint failures waited hours behind a gate (research/02 §5.6) `[default — contradict if wrong]` |
| R18 | Flaky and unstable | retry-pass is FLAKY; FLAKY needs 2 consecutive passes on one key; UNSTABLE_UNDER_REUSE loses reuse for 7 days; `views/flaky.json` is the quarantine view | README §4; no pilot rule defines it (docs/01 §3) `[default — contradict if wrong]` |
| R19 | Test seams | do-it tests inject memory readings through `DO_IT_GATE_SIGNALS` (a fixture file) and kills through the existing `DO_IT_FAULT` pattern; both do-it-internal | spine fault-hook precedent (docs/01 §4.10) `[default — contradict if wrong]` |
| R20 | `gates` block additions | optional `peak_mb`, `reuse.{core,always_run,never_reuse,env,env_files}`, `queue.{budget_pct,timeout_s,swap_used_max_mb}`, all null or empty by default; the three ruled keys unchanged | `--set` needs default leaves (docs/01 §4.4) `[default — contradict if wrong]` |
| R21 | Consumer env vars | the queue adds no env var; a consumer's own slot env vars are its to clean up (Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`)) | catalog marks 3 of 4 for cleanup (docs/01 §2.8) `[default — contradict if wrong]` |
| R22 | jest skip mechanism | skip through `--filter`; explicit lists through `--runTestsByPath` with a sent-equals-received count check | research/03 F7 `[default — contradict if wrong]` |
| R23 | Row size and integrity | one write per row, at most 4096 bytes, full failure text in a side file, CRC per row | torn appends (research/03 §2.7) `[default — contradict if wrong]` |
| R24 | Conductor HOLD file | the queue does not honour a consumer's conductor `HOLD` file; a gate with no declared peak (or `--exclusive`) reserves the whole budget and runs alone instead | one admission mechanism, not two (CONTRACT §11 A8) `[default — contradict if wrong]` |

## Open (owner questions, numbered; default applied if unanswered)

| Id | Question | Recommendation | Default if unanswered | Blocks |
|---|---|---|---|---|
| OQ-1 | Does a composed train-scope (T2) run count as the merge/deploy gate, with T3 clean nightly as the safety net? | yes, with the consumer's full-run rule amended: tree readers `always_run`, real-mongo `never_reuse`, nightly T3 | yes | consumer docs text (pilot's own program, do-it 1.1 R3), S2 deploy rule |
| OQ-2 | v1 runner order | jest, then pytest, then vitest | that order (W2, W3, W4) | A2, A3 waves |
| OQ-3 | Store scope | per machine with a store interface for a later remote store | per machine | L1 interface only |
| OQ-4 | pilot diff-coverage leg under composition | fresh leg in v1; the pilot's adoption measures; revisit | fresh leg | pilot adoption scope (do-it 1.1 R3) |

