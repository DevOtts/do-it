# review-it verdict: ST-07 Migration script, run on do-it and one ANM package (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY rows that cover ST-07, checked against the run output they cite. The REAL-VERIFY harness was not re-executed in this pass.

task: ST-07
checkpoint: CP-B1-01-ST07
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-20 | migrate do-it delivery/STATUS.md: 20 tasks, approximate, downgrade reported, second run refused | G10-migration-real-boards.txt | `tasks found: 20`, `downgrades: 1`, `ok   20 tasks`, `ok   approximate: true`, `ok   second run refuses, file byte-identical`, `AT-20: PASS` |
| AT-21 | migrate the ANM lens-data-honesty STATUS.md: 21 tasks, blocked rows kept | G10-migration-real-boards.txt | `AT-21: PASS` (the 21-task result is in the same file, section for the lens source) |
| T-B-19 | migration downgrades unevidenced VERIFIED rows | G10-migration-real-boards.txt | `pre-downgrade counts: verified=16 done=4`, `R1: done -> in-progress`, `T-B-19: PASS` |

## Caveat carried forward
Every real VERIFIED row has a real evidence file, so the verified-to-done downgrade path never fired on real data. The one real unevidenced row (R1) went done to in-progress. The source line for AT-21 was read in the run and is not quoted here.
