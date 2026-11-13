# 00 — Program plan

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

| Squad | Tier | PRD | Epics | Wave |
|---|---|---|---|---|
| SQ-A1 store | T1 | prd-1-store-fingerprint | L1 store, F1 fingerprint | W1 |
| SQ-A2 verdict | T1 | prd-2-gate-run-verdict | V1 gate run, V2 clean and flaky | W2 |
| SQ-B adapters | T2 | prd-3-runner-adapters | A1 jest (W2), A2 pytest (W3), A3 vitest (W4) | W2–W4 |
| SQ-C queue | T1 | prd-4-gate-queue | Q1 admission (W1), Q2 cleanup and entry point (W2) | W1–W2 |
| SQ-D stages | T2 | prd-5-settings-stages | S1 settings block (W2), S2 train and nightly (W3) | W2–W3 |

Test standard: every epic ends in a binding Test Contract (≥10 cases, ≤20), DoD = 100% pass; `[REAL]` cases need a live
target (installed runner, real repository, real machine signals) and are never VERIFIED on a mock.
Branching and lanes: CONTRACT §5. Build runbook: `/build-it` per wave in a fresh session (KICKOFF.md); after each
`core/spine/src` change rebuild the bundle and sync the mirror. Board: `STATUS.md` generated from `status.json`.
Dependency graph: L1 then F1; L1 and F1 then V1, A1; V1 then V2; Q1 then Q2; S1 then S2; A1 then A2 then A3. Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`).
