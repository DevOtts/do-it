# review-it verdict: ST-03 build-it updates status and evidence at task boundaries (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY row that covers ST-03, checked against the run output it cites. The REAL-VERIFY harness was not re-executed in this pass.

task: ST-03
checkpoint: CP-B1-01-ST03
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-22 | history of the real build-it run has separate start and finish writes per task | G13-boundaries-real-run-history.txt | `ok   history has 3 distinct write times, not one write at the end`, `ok   every task started after the board existed has its start and finish at separate times`, `ok   history chain validates` |

## Caveat carried forward
The W1 tasks (ST-01, ST-02, ST-06, ST-07) were recorded in one batch at board creation (D-16). The per-task boundary check holds for W2 and W3 only (ST-03, ST-04, ST-05, ST-08), and W2's three parallel tasks share wave-level timestamps.
