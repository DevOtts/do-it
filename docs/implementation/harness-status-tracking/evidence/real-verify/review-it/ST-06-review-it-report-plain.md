# review-it report (plain, non-checkpoint run) — ST-06 Render STATUS.md from status.json (do-it harness-status-tracking)
Mode: contract-qa   ·   Run: 2026-10-18T17:16Z → 2026-10-18T17:19Z (evidence file times: R1 17:17:16Z, R2 17:17:47Z, R3 17:17:49Z; verifier pass after)
Preflight (R9): repo=/Users/macbook/Workspace/Devotts/build-it-wt/real-verify branch=feat/real-verify@5e8ad8c (= origin/main 5e8ad8c) app=none (CLI scripts, node v22.23.2) checkout=dirty (only the untracked tests/status/real/ harness; plugins/ unchanged)
Oracle: AUTHORED (PROMPT-plan-it-build-it-status-json.md AT-02; CARD-B-status-tracking.md T-B-16, T-B-17 and section 5 "render it from status.json, so the two cannot disagree"; ST-06 brief, 19 render cases)   ·   Contract: ST-06 scope (declared 5 rows / counted 5 rows; row 1 holds 19 cases)

## Verdict rows
| Case | Oracle | Status | Evidence (ledger ref) / Blocker |
|------|--------|--------|---------------------------------|
| ST-06 render suite (19 cases) | AUTHORED | PASS | `node --test tests/status/render.test.mjs` -> "# tests 19 / # pass 19 / # fail 0" (R1-render-tests.txt) |
| ST-06 real board agreement | AUTHORED | PASS | `status-write render --file <clone>/docs/implementation/harness-status-tracking/status.json --out R2-rendered-STATUS.md`; committed STATUS.md equals the fresh render once the two D-28 labels are removed: "identical after removing only the D-28 labels ...: true"; red check with one count mutated: "identical=false" (R2-render-compare.txt). Not byte-identical: see finding F-1 |
| AT-02 | AUTHORED | PASS | real plan-it on the 5 real do-it epics, 176 tasks: "ok   STATUS.md counts equal the JSON counts", "ok   STATUS.md has one task row per task (176)" (R3-real-verify/G01-planit-real-epics.txt) |
| T-B-16 (render half) | AUTHORED | PASS | "ok   STATUS.md rendered by the writer (marker on line 1)", 176 tasks not-started (R3-real-verify/G01-planit-real-epics.txt) |
| T-B-17 | AUTHORED | PASS | "ok   STATUS.md row shows done, the evidence and the new updated_at, with no hand edit", "ok   updated_at changed" (R3-real-verify/G02-done-evidence-real-board.txt) |

## Findings
- F-1 (minor): the committed `STATUS.md` of the dogfood board was rendered before D-28. The current renderer adds " (claims)" to the verified count and an empty "Verified claims" section. Every count, row, evidence path and history line matches. The next writer call re-renders it; nothing to fix in ST-06.

## Accepted-gaps register
- None in ST-06 scope. The board-level percent rows (AT-17..19, T-B-01..03) are not ST-06 cases and are not judged here.

## Challenges (fresh-context verifier)
- Fresh-context verifier (sonnet subagent, read only the contract, this draft and the evidence files): CONFIRM on all 5 rows; header verdict PASS justified.
- Notes it raised, kept as caveats (no row demoted): R1 output does not name the commit (the preflight line above does: 5e8ad8c); row 2 is a comparison after stripping the D-28 labels, disclosed as F-1, and the red check shows the compare can fail; AT-02's board is all not-started, so only total and not-started are non-zero; T-B-16 is the render half only (the 6-item fixture was not used, the real input has 176 items); T-B-17 calls status-write directly, not through a build-it run.

## Debrief (R10)
Did any row get a false VERIFIED this run, and which verification primitive would have caught it earlier?
No false VERIFIED in scope. The near miss is row 2: a byte compare would have failed on renderer drift (F-1) and a loose "counts match" would have hidden it. Comparing a fresh render against the committed file, with a red check, is the primitive that surfaced it.
