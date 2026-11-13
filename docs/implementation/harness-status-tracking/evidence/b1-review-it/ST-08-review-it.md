# review-it verdict: ST-08 Adversarial review: try to get a fake 100% through every writer (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY rows that exercise the fake-100% and tamper paths, checked against the run output they cite. The REAL-VERIFY harness was not re-executed in this pass.

task: ST-08
checkpoint: CP-B1-01-ST08
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-12, T-B-11 | a typed "percent": 100 is rejected by the validator, the mod shows no percent | G08-validator-mod-real-board.txt | `ok   validator error naming the key "percent"`, `ok   mod does not show the typed 100 (percent null, invalid true)`, `ok   writer refuses a --percent flag` |
| AT-17 | percent formula, worked example = 62 | G09-percent-real-boards.txt | `ok   worked example is exactly 62`, `ok   and the same function gives the formula on the real boards`, `AT-17: PASS` |
| AT-18, T-B-02 | zero tasks: never 0, never 100 | G09-percent-real-boards.txt | `ok   zero tasks: lib "unknown", mod no number, writer view "unknown" (never 0, never 100)` |
| AT-19, T-B-01, T-B-03 | 8 done, 0 verified: 60, never 100; blocked rows weigh 0 | G09-percent-real-boards.txt | `ok   every task done, none verified: 60, never 100`, `ok   real owner-gated rows: 4 in the blocked list, contribute 0, shown separately` |
| AT-14, T-B-15 | SIGKILL mid-write leaves status.json intact | G06-sigkill-mid-write-real-board.txt | `summary: {"trials":300,"tmpLeft":300,"intactOld":300,"completedNew":0,"bad":0,...}`, `ok   every trial left status.json either byte-identical to before or fully renamed` |

## Caveat carried forward
The percent rows use a 4-status real mix and the committed board, which has no verified rows, so the verified weighting is shown only on the 4-status mix. The AT-19 spec example uses T=1, while the real board has T=8; the same rule applies. The adversarial review's own findings are in evidence/ST-08.md and are not re-judged here.
