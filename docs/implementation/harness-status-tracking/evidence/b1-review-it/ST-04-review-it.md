# review-it verdict: ST-04 review-it path: set verified from the verdict (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY rows that cover ST-04, checked against the run output they cite. The REAL-VERIFY harness was not re-executed in this pass.

task: ST-04
checkpoint: CP-B1-01-ST04
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-08, T-B-08 | a review-it verdict is accepted and the view shows the claim and sha | G04-review-it-verdict-real.txt | `ok   review-it verified with the real verdict path: accepted`, `ok   view shows the claim with the verdict sha (D-28)`, `AT-08: PASS` |
| AT-09, T-B-09 | lowering verified without a note is refused | G04-review-it-verdict-real.txt | `ok   lowering verified without a note: refused`, `ok   byte-identical` |
| AT-10, T-B-10 | lowering verified with a note is accepted and the history carries it | G04-review-it-verdict-real.txt | `ok   lowering with a note: accepted`, `ok   history entry: {"at":"2026-10-18T17:21:22Z","task":"ST-06","from":"verified","to":"in-progress","by":"build-it","note":"real-verify: lowered to prove AT-10 on a clone"}` |

## Quoted output
- `compatibility probe: ... plain (non-checkpoint) review-it report ... no "verdict:" line`: a plain report is refused by the writer (finding, not a case). Only checkpoint reports with a verdict line pass D-06.

## Caveat carried forward
The verdict used is ST-06's report, so the path is exercised on one task only. The G04 run wrote to a clone, and the clone was lowered again on purpose to prove AT-10.
