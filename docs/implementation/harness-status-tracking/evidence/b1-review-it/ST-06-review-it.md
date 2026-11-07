# review-it verdict: ST-06 Render STATUS.md from status.json (B1-01 independent pass)

Mode: contract-qa, independent of REAL-VERIFY.
Reviewer session: 44a2d822-c92d-4e09-a9bf-e6ad258affa8. REAL-VERIFY's commits carry Claude-Session session_01JnLKUMkP2oR4fCs3AHABRv, so the sessions differ.
Scope: the REAL-VERIFY rows that cover ST-06, checked against the run output they cite. The REAL-VERIFY harness was not re-executed in this pass. The earlier ST-06 review (review-it/ST-06-review-it-report.md, REAL-VERIFY's session) was reverted by its owner on the grounds that it was not independent; this verdict does not rely on it.

task: ST-06
checkpoint: CP-B1-01-ST06
verdict: PASS

## Rows relied on
| Case | REAL-VERIFY row | Run output (under evidence/real-verify/run/) | Line checked |
| --- | --- | --- | --- |
| AT-02 | STATUS.md counts match the JSON counts, one row per task | G01-planit-real-epics.txt | `ok   STATUS.md counts equal the JSON counts`, `ok   STATUS.md has one task row per task (176)` |
| T-B-16 | STATUS.md rendered by the writer, marker on line 1 | G01-planit-real-epics.txt | `ok   STATUS.md rendered by the writer (marker on line 1)` |
| T-B-17 | done updates the STATUS.md row with no hand edit | G02-done-evidence-real-board.txt | `ok   STATUS.md row shows done, the evidence and the new updated_at, with no hand edit`, `ok   updated_at changed (2026-10-18T17:21:20Z -> 2026-10-18T17:21:21Z)` |

## Caveat carried forward
The AT-02 and T-B-16 rows use the 176-task plan-it board, which is all not-started, so only the total and not-started counts are non-zero there. The committed dogfood STATUS.md was rendered before D-28 (finding F-1 in the earlier report). It has no "(claims)" label, so the render compare in that earlier report needed the D-28 labels removed. That gap is open and is not a render fault in these rows.
