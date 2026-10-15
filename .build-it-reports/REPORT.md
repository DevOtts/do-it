# do-it v1 — build-it run report

Run date 2026-10-14. Base commit `9576d151` (planning package, CONTRACT sha256 `e9a485e2…8e5d` re-derived and matched, `gate-check handoff` 352 distinct IDs). Law: `delivery/CONTRACT.md` v1.1. Orchestrator: Sonnet 5.5 (T2).

## 1. Outcome
All 20 epics (S1–S5, P1–P4, H0–H3, N1–N3, R1–R4) are built and merged to `main`. Of 352 contract cases, **347 are VERIFIED** (of which **340 were reproduced by the coordinator and the independent verifier in this session**, **3 (T-N1-17, T-N1-18, T-N2-04) were run live by the engine-adapter lane against a local, unmerged Engine PR #727 branch**, and **5 rest on a worker's recorded live run that the coordinator did not repeat**: T-H2-13, T-H2-14, T-H3-15, T-R4-02 and T-N1-16; they pass on a plain run only as `IMPLEMENTED-NOT-VERIFIED` without the paid/live prerequisites) with run output in `.taskstate/evidence.md` / `.taskstate/results/*`, **5 are IMPLEMENTED-NOT-VERIFIED** with a stated reason, **0 BLOCKED**. Every suite on `main` ends with 0 failures (`.taskstate/final-suites.txt`; H0, plugin and readme re-run green after the last fix). `gate-check handoff` and `gate-check adversary` both PASS on the final tree. The README (R1) follows README-SPEC and its only token figure comes from `tests/claims.json` (one real `claude-code` fixture run).

## 2. Per-epic verdicts
| Epic | Cases | VERIFIED | Not verified — exact reason | Command (all exit 0) |
|---|---|---|---|---|
| S1 | 15 | 15 | — | `node --test "core/spine/test/**/*.test.mjs"` (89/89 on main) |
| S2 | 18 | 18 | — | same |
| S3 | 19 | 19 | — | same |
| S4 | 16 | 16 | — | same |
| S5 | 18 | 16 | T-S5-16, T-S5-17: live `aws` / `op` never run (no access); stub-CLI invocation contract only | same |
| P1 | 19 | 19 | — | `core/pipelines/tests/*.test.mjs` (router model call is an injected fake by contract) |
| P2 | 18 | 18 | — | `core/routing/tests/*.test.mjs` |
| P3 | 18 | 18 | — | `core/cache/tests/**/*.test.mjs` |
| P4 | 20 | 20 | — | `core/pipelines/review-loop/tests/*.test.mjs` (T-P4-17 asserts on real generated HTML, export script on a DOM stub) |
| H0 | 18 | 18 | — | `hosts/_interface/tests/*.test.mjs` |
| H1 | 20 | 20 | — | `hosts/claude-code/tests/*.test.mjs`; real `claude plugin validate`, real install of `do-it@devotts` pulling 5 companions |
| H2 | 17 | 17 | — (paid calls T-H2-13/14 gated `DOIT_REAL_CALLS=1`, run once by the worker, VERIFIED lines in `H2.log`) | `hosts/codex/tests/*.test.mjs` |
| H3 | 18 | 18 | — (T-H3-15 gated, one free-model call, run once by the worker) | `hosts/opencode/tests/*.test.mjs` |
| N1 | 18 | 18 | — (T-N1-16/17/18 live on a local brain-api-core running unmerged PR #727; after the adapter was wired to its ask-cards and `x_do_it` routes) | `hosts/engine/tests/*.test.mjs` |
| N2 | 18 | 18 | — (T-N2-04: shared conformance 12/12 on `/api/run-rows` of the local PR #727 Engine) | `core/state-stores/tests/*.test.mjs` |
| N3 | 14 | 13 | T-N3-14: inject and state read-back verified live (5 cards, idempotent replay), but no do-it W3 pipeline is installed so the cards never run and the expected run_status/exit_code cannot be compared | `hosts/engine/tests/*.test.mjs` |
| R1 | 16 | 15 | T-R1-15: morning-report block matched against a stub-host run only (spec needs a real-host run with a non-clean state) | `DO_IT_SIBLINGS=… node --test tests/readme/r1.test.mjs` (17 tests incl. scratch-copy check) |
| R2 | 16 | 16 | — (needs `DO_IT_SIBLINGS=/Users/macbook/Workspace/Devotts` outside the usual path, else T-R2-06 skips) | `node --test "tests/plugin/*.test.mjs"` |
| R3 | 16 | 16 | — | `DO_IT_SIBLINGS=… node --test "tests/catalog/*.test.mjs"` |
| R4 | 20 | 19 | T-R4-05: Engine reachable, but PR #727 only injects cards; no W3 pipeline/drain, so no card runs and no sandbox is created to sample | `node --test tests/e2e/r4.test.mjs` (25 pass / 2 skip: T-R4-02 gated paid, T-R4-05) |

Total VERIFIED 347 + NOT-VERIFIED 5 = 352. (The suites run slightly more tests than contract cases: build-determinism checks, extra scratch-copy checks.)

## 3. No silent caps
- **Verifier audit (fresh-eyes) resolved:** counts per lane re-derived (86/75/73/50/68 = 352) and every suite re-run green; challenges accepted: the 5 worker-log-only VERIFIED cases are disclosed above rather than demoted, because the worker logs quote the live output (`H2.log`, `H3.log`, `R4.md`, `live-w4.log`); T-N1-16 conflicts between `N1.md` (written before the live Engine existed, says not-verified) and `live-w4.md` (VERIFIED on a local `brain-api-core`, card created) — `live-w4` is later and wins; `final-suites.txt` was regenerated; STATUS header/residuals corrected.
- **Ungated real call:** T-H1-11 is not behind `DOIT_REAL_CALLS`: every plain run of `hosts/claude-code` makes real `claude -p` calls on subscription aliases (up to four; two expired). The coordinator and the verifier each ran it at least once; spend not measured. Treat "paid calls are gated" as true for H2/H3/R4 only.
- **Env-dependent REAL cases:** without `DO_IT_SIBLINGS=/Users/macbook/Workspace/Devotts`, T-R2-06 and (in worktrees) T-R2-12..14 skip as IMPLEMENTED-NOT-VERIFIED; they are VERIFIED only with it set. Same for `tests/catalog`.
- Paid-call cases (T-H2-13/14, T-H3-15, T-R4-02) are gated by `DOIT_REAL_CALLS=1`; a plain run reports them IMPLEMENTED-NOT-VERIFIED. The coordinator did not re-run them (cost); their VERIFIED status rests on the worker's logs. T-R4-02 ran 3 times (~0.011 USD each, haiku tier, alias `anm`).
- Live Engine: Docker Desktop was started and Engine-Core `brain-api-core` run locally (port 3001, dev containers); 1 of 5 live cases VERIFIED. Stack stopped; Docker Desktop left running; test squads `do-it-live-*` remain in the local dev Mongo. Second live pass (engine-adapter lane): PR #727 head b901a9bd in a throwaway worktree (removed), API on :3001 with `HOST_ADAPTER_API_ENABLED`, `CT_TASKS_ENABLED`, `SQUADS_ENABLED`, scratch Mongo DB `doit_scratch_*` (left in the stopped dev Mongo volume), a random throwaway service key; engine dev containers stopped again. Verdicts hold for the PR branch only: PR not merged, not deployed.
- Token usage shapes for codex/opencode are documented shapes, not captured streams except where noted in the H2/H3 logs.
- Mirror `plugins/do-it/` currently also copies `tests` directories from `core/` (cosmetic; not excluded).
- Engine-Core: only `docs/implementation/do-it-engine-layer/` edited (uncommitted, in the Engine-Core repo). Sibling plugin repos untouched (verified by T-R3-16; one pre-existing deletion in `prompt-it` predates the run).

## 4. Delegation and cost
Orchestrator was Sonnet 5.5 (the session model could not be switched; KICKOFF asks for T2). 19 build/fix workers plus 1 report drafter, all Sonnet (T2); 1 Haiku doc worker; the drafter was blocked from writing files, so the coordinator wrote this report. **Zero escalations to T1/Opus** (no slice failed its contract after a corrected dispatch). Integration fixers: `fix-w0` (G-14 scan + `doctor --install` companion fallback), `fix-w1` (R4 harness seeded an invalid finish-line kind), `live-w4`. Coordinator fixed in place: S2 merge conflict, G-12 scan test dirs, G-12 wording in `NOT-BUILDING.md`, G-14 literals in README checkers, `SKILL.md` regeneration, mirror sync.

## 5. Decisions and amendments worth reading
Full list in `.taskstate/decisions.md` (B1–B17). Cross-lane edits: spine `record.mjs` (blocked results also route `pending_human` to the owner pack) and `state.mjs` (`NEEDS_HUMAN → ESCALATED`) by ship-w4 for T-R4-19/T-R4-08; `doctor --install` companion fallback by fix-w0. Proposed contract amendments to file with the orchestrator: M1 add `NEEDS_HUMAN → ESCALATED`; outcome enum `ESCALATED`/`TIER_UNROUTED` (applied to the H0 schema); `state.handoff_state`/`ceiling` shapes; `readiness`/`finish-line` schemas; P2 meter null tokens (applied); A6 vs T-P2-15 codex `cache_write`; `hosts/engine/live/**` as L4; G-14 scope = code directories.

## 6. For Fernando
1. Re-login claude aliases **8fai** and **8ftools** (expired OAuth). Any handoff to them ends HANDOFF_FAILED.
2. Confirm the codex tier mapping (T1–T3 in `hosts/codex/tiers.json` is a guess; default R8).
3. Engine PR #727 (ask-cards, `x_do_it`, card inject/state, run-rows) is wired and verified locally; merge and deploy it, then re-run the live cases against a real tenant. T-N3-14 and T-R4-05 additionally need the do-it W3 pipeline installed and an Engine drain.
4. Engine-Core docs edits under `docs/implementation/do-it-engine-layer/` are uncommitted in that repo.
5. Provide `aws`/`op` access to verify T-S5-16/17 live.
6. No git release tag exists, so the README has no version badge.

## 7. Next actions
Run one real-host overnight feature run with a non-clean state to close T-R1-15; after PR #727 is deployed re-run `hosts/engine/live/live-cases.mjs` on it, and install the W3 pipeline to close T-N3-14 and T-R4-05; apply the R3 catalog diffs to the sibling plugins (pin bump 0.2.1→0.3.0 in build-it, plan-it, review-it).
