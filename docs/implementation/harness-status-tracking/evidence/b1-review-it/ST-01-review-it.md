# review-it verdict: ST-01 Schema v1, shared writer and validator (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY rows that cover ST-01, each checked against the run output file that row cites. The REAL-VERIFY harness was not re-executed in this pass.

task: ST-01
checkpoint: CP-B1-01-ST01
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-03, T-B-04 | done with no evidence refused, board byte-identical | G02-done-evidence-real-board.txt | `ok   done with no evidence: exit non-zero`, `ok   status.json and STATUS.md byte-identical` |
| AT-04, T-B-05 | done with missing path refused | G02-done-evidence-real-board.txt | `ok   done with a path that does not exist: refused` |
| AT-05, T-B-06 | done with empty file refused | G02-done-evidence-real-board.txt | `ok   done with an empty evidence file: refused` |
| AT-06 | done with a valid file accepted | G02-done-evidence-real-board.txt | `ok   done with a valid file: accepted` |
| AT-07, T-B-07 | build-it cannot set verified | G03-roles-real-dogfood-board.txt | `ok   build-it asking for verified: refused by the role check` |
| AT-11 | blocked needs blocked_on | G03-roles-real-dogfood-board.txt | `ok   blocked with no blocked_on: refused` |
| AT-13, T-B-14 | concurrent writers keep every change | G05-concurrent-processes-real-board.txt | `round 9: exits 0,0,0,0,0,0,0,0 ... all 8 changes present=true ... validate=0 residue=[] -> ok`, `AT-13: PASS` |
| AT-15 | unknown key preserved | G07-unknown-key-real-producer.txt | `ok   review_checkpoints identical after the rewrite (849 chars)` |
| AT-16 | rename and remove of a done task refused | G03-roles-real-dogfood-board.txt | `ok   rename of a done task: refused`, `ok   remove of a done task: refused` |

## Caveat carried forward
AT-05 and T-B-06 use an empty file the run created, because do-it has no real empty evidence file. The concurrency rows are a real-process test, not a review of the writer's lock code.
