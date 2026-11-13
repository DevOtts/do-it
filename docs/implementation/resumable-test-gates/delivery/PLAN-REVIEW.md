# PLAN-REVIEW — resumable-test-gates (gate G4)

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

Reviewed-by: Fernando Ott 2026-11-06 (plan approved in full with A15; OQ-1 yes, OQ-2 jest → pytest → vitest, OQ-3 per machine, OQ-4 fresh leg in v1, A14 kept; recorded with `do-it answer` on run r-20261106-130657-7ff2)

Fernando, this is the one review round for the plan of `docs/implementation/resumable-test-gates/README.md`. It was
planned while you were away (autonomous-draft). Nothing was built and no test or gate was run. Answer the four numbered
questions; then read the defaults and contradict any you disagree with (cite its Rn). Silence on a default keeps it.

## What the plan is, in one screen

- A per-test-file **gate results store** in `{git-common-dir}/do-it/gate-results/`, written the moment each file
  finishes, so a killed or failed gate resumes and reuses every still-valid PASS (rulings D1, D2).
- A **key** per test file over everything that can change its outcome, hashed from the bytes on disk: closure, CORE set,
  the *installed* dependency tree, salted HMACs of declared env values, platform, plus the whole tracked tree for the
  208 specs in the pilot's largest suite that read files at runtime (WIDE class).
- A **composed verdict** that names its sources (`[COMPOSED push: … reused from 3 runs (oldest …) · 52 ran now]`), never
  a bare `[OK]`, plus a **clean nightly run** that can catch what reuse cannot and flags `UNSTABLE_UNDER_REUSE`.
- One **deterministic gate queue per machine** (`do-it gate queue`) with memory-budget admission, visible FIFO, live-owner
  lock and child cleanup, that never runs a gate without a slot (ruling D4).
- do-it owns *when* (push, train complete, nightly); the project owns *what* in an optional `gates` block (ruling D3).
- Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`).

Delivery (recounted 2026-11-06 after the adoption part moved out, A15): 5 PRDs, 11 epics, 81 tasks, 174 binding cases (36 [REAL]), 4 waves, 5 review checkpoints (CONTRACT v1.1, docs/06; tally in KICKOFF.md). Release do-it 1.2.0 on top of 1.1.0.

## Corrections to the proposal that you should know about

1. The pilot's largest suite has **1,624** spec files at origin/main, not ~1,340; the archive has **14** full runs (median **686 s**), not
   20 (median 630 s) (pilot measurement, research/02). The spread is mostly cold vs warm ts-jest cache.
2. A jest suite that **crashes reports zero failures**; treating "no failures" as PASS would reuse a crashed suite
   forever. The plan requires at least one passing case and no execution error.
3. The installed `node_modules` differs from `package-lock.json` in **198 of 860** entries in the pilot's largest repo main checkout, and
   `.env` values decide whether 190+ real-mongo specs run or skip — so the key hashes the installed tree and declared env
   values (salted, never stored), not just the lockfile and env names.
4. The pilot's slot script is in **3 of 12** repos, not every pre-push, and a pilot rule says a push must *proceed without a
   slot* after the timeout — the opposite of your ruling. The plan keeps your ruling (retryable
   `[WAIT-TIMEOUT]`, exit 3, not `[BLOCK]`); the pilot amends its rule in its own program (do-it 1.1 R3).
5. The pilot's **diff-coverage leg runs the whole suite with coverage** and cannot be composed — see OQ-4.
6. "ledger" and T1–T3 are already taken inside do-it, so the store is `gate-results` and the CLI says
   `edit | push | train | nightly` (R1, R2).

## Questions only you can answer (numbered; reply "1 yes, 2 yes, …" or say otherwise)

1. **OQ-1** Does a composed train-scope run (T2) count as the merge and deploy gate, with T3 clean every night as the
   safety net? Recommended: **yes**, written into the consumer's full-run rule with three conditions: tree-reading specs always run,
   real-mongo specs never reused, nightly clean T3. Default if unanswered: yes.
2. **OQ-2** v1 runner order? Recommended: **jest → pytest → vitest** (waves W2, W3, W4). Default: that order.
3. **OQ-3** Store scope? Recommended: **per machine** with a store interface that allows a remote store later.
   Default: per machine.
4. **OQ-4** The pilot's diff-coverage leg: keep it a **fresh** leg in v1 (pushes touching
   the four coverage-gated source directories still pay one full coverage run), or store per-file coverage so it can
   be composed too (bigger rows, more build)? Recommended: **fresh leg in v1**, measure in the pilot's adoption, revisit. Default: fresh.

## Defaults to contradict (all in DECISIONS.md with evidence)

R1 store name · R2 scope labels · R3 code placement · R4 hash and manifest · R5 PASS predicate · R6 NARROW/WIDE/NEVER
· R7 env HMAC · R8 installed state · R9 24 h reuse lifetime · R10 isolatedModules measured only · R11 dirty tree ·
R12 train complete by merged ancestry · R13 admission rule · R14 queue timeout 4 h and home · R15 nightly schedule
printed, you install it · R16 pilot never-reuse set · R17 cheap legs before admission · R18 flaky and unstable ·
R19 test seams · R20 `gates` block additions · R21 no new env var · R22 jest skip mechanism · R23 row size and
CRC · R24 the queue does not honour the old conductor HOLD file (an exclusive gate replaces it).

The ones most worth your eye: **R9** (a reused PASS older than 24 h re-runs), **R14** (a gate that waits 4 h fails
retryably instead of running on a loaded machine), **R16** (real-mongo specs, ~25–32% of the pilot's largest suite test time, are never
reused in v1), **R24** (HOLD file dropped).

## What I could not verify

- The reuse ratio after a typical edit for NestJS specs (closures are probably wide) — the pilot's adoption measures it with no test run
  before any saving is claimed.
- One pilot repo's runner (no `node_modules` installed in its checkout).
- The README's "20 runs / 260 s" source; and the live swap-out rate (single readings only).
- Linux admission signals (from kernel documentation; no Linux host here).

To approve: reply with your answers and any contradicted Rn. The plan-it run is parked at `planReview`.
