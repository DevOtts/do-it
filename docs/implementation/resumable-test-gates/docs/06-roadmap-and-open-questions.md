# 06 — Roadmap and open questions

## 1. Waves

| Wave | Epics | Why this order | Exit |
|---|---|---|---|
| W1 | L1 store, F1 fingerprint core, Q1 queue admission | no dependency on a runner; the queue is useful alone (the pilot's swap problem today) | contracts 100%, bundle builds, mirror in sync |
| W2 | A1 jest adapter, V1 gate run + composed verdict, V2 clean + flaky, Q2 child cleanup + entry point, S1 settings block | jest first (OQ-2); verdict needs rows; cleanup needs admission | jest fixture repo resumes a killed run (README T-01) |
| W3 | S2 train + nightly stages, A2 pytest plugin | the pilot consumer proves it on a real gate ([REAL]), in its own program (do-it 1.1 R3); stages need the verdict | README T-09 [REAL] on the pilot consumer repo (path in KICKOFF) |
| W4 | A3 vitest reporter | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3) | vitest reporter contract 100% |

First vertical slice: L1 + F1 (NARROW only) + A1 + V1 on a 30-file jest fixture repo — kill at file 20, resume runs
exactly 10 + NEVER set, verdict line names 20 reused from 1 run.

## 2. Risks

| Risk | Likelihood | Effect | Mitigation (case) |
|---|---|---|---|
| silent false PASS from an input outside the key | medium | a red merge ships green | WIDE class, CORE closure, installed state, env HMAC, T3 clean + UNSTABLE flag (T-F1-*, T-V2-*) |
| crashed suite recorded as PASS | high without the predicate | reused forever | PASS predicate + planted crashing suite (T-A1-*) |
| wide framework closures, little reuse after edits | medium | saving only on kill/resume | closure-size spike (in the pilot's adoption) before claims; honest verdict counts |
| queue blocks every gate (bad memory estimator) | medium | pushes stall | estimator from research/03 F30 + budget-only fallback + `--status` (T-Q1-*) |
| queue timeout turns slow push into failed push | certain (by ruling) | unattended runs see a non-code failure | `[WAIT-TIMEOUT]` exit 3 retryable; conductor parks and wakes (T-Q1-*, T-S2-*) |
| consumer rule conflicts | certain | a consumer's own standard may contradict the tool | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3) |
| name collisions (ledger, T-labels, gate verb) | certain | reviewer confusion, bundle failure | R1, R2, bundle smoke per module (T-L1-*) |

## 3. Questions only the owner can answer (also in DECISIONS.md and PLAN-REVIEW.md)

- **OQ-1** Does a composed train-scope run (T2) count as the merge/deploy gate, with T3 clean every night as the safety
  net? Recommended: **yes**, under three conditions written into the consumer's rule amendment: tree-reading specs are
  `always_run`, real-mongo files are `never_reuse`, nightly T3 clean runs. Default if unanswered: yes.
- **OQ-2** v1 runner order? Recommended: **jest → pytest → vitest** (jest = the largest suite ≈ the cost; a dense
  graph benefits less, decision D8; vitest's graph API is private). Default: that order (waves W2, W3, W4).
- **OQ-3** Store scope? Recommended: **per machine** (`git-common-dir`) with a store interface that allows a remote store
  later. Default: per machine.
- **OQ-4** (new) The pilot's diff-coverage leg runs the whole suite with coverage and cannot be composed (needs every
  file's lcov). Keep it a fresh leg in v1, or store per-file coverage in the store? Recommended: **fresh leg in v1**,
  measure in the pilot's adoption, revisit. Default: fresh leg. Cost of the default: pushes touching the four coverage-gated source directories keep paying one full coverage run.
