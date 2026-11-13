# do-it 1.1: program plan

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Dn ruling — see GLOSSARY.md

## Waves

| Wave | Epics | Why this order |
|---|---|---|
| W0 | K1, S1, B1, I1, E1, H1, then A1 | Fixes and hygiene. K1 ships doc-it 0.1.0 first because A1, L1 and V1 call it. S1 ends the stop-gate trap; A1 and B1 stop boards from lying; E1 moves the engine store out of core. |
| W1 | L1, V1 | The trust mechanisms that need no subagents |
| W2 | Q1, then K2 | Q1 needs L1's ledger format; K2 wires conclude-it, plan-it, review-it and do-it to doc-it after K1, V1 and Q1 land |
| W3 | Integration and release | Siblings tag first (doc-it 0.1.0, build-it, conclude-it, plan-it, review-it, init-it, prompt-it tag, reconcile-it 1.0.1), then do-it 1.1.0 pins them; RTG merges as 1.2.0 (D7) |

Test cases: 55 across 11 epics and 55 tasks (S1 11, A1 5, B1 2, I1 2, K1 8, K2 4, E1 5, H1 4, L1 5, V1 3, Q1 6). [REAL] cases: T-S1-06, T-S1-09, T-I1-01, T-K1-02, T-K1-08, T-Q1-01.

## Squads

Solo topology for planning. For the build, one worker per epic branch, tiered per CONTRACT RUN-POLICY, worktrees created from the main session.

## Runbook

`/build-it` on this package: Definition of Done = every Test Contract at 100% plus each review checkpoint's PASS verdict (READINESS.json). Start with the KICKOFF's step 1: re-derive the case tally from disk and stop on a mismatch.
