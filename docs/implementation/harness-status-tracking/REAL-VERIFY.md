# Real verification of the 42 binding cases (do-it 1.0.1)

Date: 2026-10-18. Scope: AT-01..AT-22 (PROMPT-plan-it-build-it-status-json.md) and T-B-01..T-B-20 (CARD-B-status-tracking.md, section 10).

## Why this exists

The first run marked all 42 cases VERIFIED. Most of them ran only against synthetic fixtures: temporary repos built by the test helpers, a test hook that exits instead of a real kill, and a verdict file written by hand for AT-08. This pass reruns every case against a real artifact, or says plainly why it cannot.

## Result

| Status | Count |
| --- | --- |
| VERIFIED (real artifact) | 41 |
| PARKED | 1 (T-B-20, stale half) |
| BLOCKED | 0 |

- 38 rows moved from fixture to real. AT-20, T-B-19 and AT-21 already ran on real files and were run again. T-B-20 is only half real.
- 11 of the 41 VERIFIED rows carry a caveat in the table: the real artifact needed a case input added to it (an empty file, a hand edit, a key from another tool), or the real shape differs from the spec's example. Each caveat says which.
- Before this pass, by input artifact: 3 rows ran on real files (AT-20, T-B-19, AT-21). 6 more ran real processes or the real mod, but on synthetic input (AT-13, T-B-14, AT-22, T-B-11, T-B-12, T-B-13). T-B-20 used a throwaway git repo with forced dates. The other 32 were fixtures only, and AT-08 used a hand-written verdict.

## How it was run

- Harness: `build-it/tests/status/real/real-verify.mjs` (build-it PR `feat/real-verify`). It clones this repo with `git clone --no-hardlinks` into a temp dir and runs every mutation in the clone. It records the sha256 of the committed board before and after the run. Run output: `"source_board_untouched": true` (evidence/real-verify/run/summary.json).
- Code under test: build-it origin/main 5e8ad8c (writer, lib, render, migrate), plan-it origin/main 2271099 (`status-from-plan.mjs`, `review-checkpoints.mjs`), and the installed mod `~/.claude/mods/doit-status` reading the build-it lib.
- Real inputs: this board as committed (`status.json`, 8 tasks done by the real build-it run); `delivery/epics/*.md` (5 real do-it v1 epics, 176 checklist items); `delivery/STATUS.md` (20 epics) together with its tracked `.taskstate` evidence; `ANM/docs/implementations/lens-data-honesty/delivery/STATUS.md` (read only, sha checked); the board folder's real git history.
- Command:
  `node tests/status/real/real-verify.mjs --doit <do-it> --planit <plan-it>/plugins/plan-it/scripts --lens <ANM lens STATUS.md> --verdict docs/implementation/harness-status-tracking/evidence/real-verify/review-it/ST-06-review-it-report.md --verdict-plain .../ST-06-review-it-report-plain.md --out docs/implementation/harness-status-tracking/evidence/real-verify/run`
- Exit 1, and the one FAIL is T-B-20 (parked below). Summary: `evidence/real-verify/run/summary.md`.
- The build-it unit suite still passes after the change: `node --test tests/status/` gives 135/135.

All output paths below are relative to `docs/implementation/harness-status-tracking/evidence/real-verify/`.

## The 42 cases

| Case | Spec setup | Before (test, input) | Now | Real artifact and what was seen | Output |
| --- | --- | --- | --- | --- | --- |
| AT-01 | plan-it on 6 items / 3 groups | plan-it fixture `tests/fixtures/status-json` | VERIFIED | Real plan-it on the 5 real do-it epics: 176 tasks. That equals the dry-run plan and an independent count of checklist lines. Schema 1, all not-started, sessions and history empty, validate 0 | run/G01-planit-real-epics.txt |
| AT-02 | STATUS.md after plan-it, counts match | plan-it fixture | VERIFIED | The same real board: the "Tasks:" line equals the JSON counts, with one row per task (176) | run/G01-planit-real-epics.txt |
| AT-03 | done, no evidence | writer fixture (mkImpl) | VERIFIED | First task of the real plan-it board: exit 1, status.json and STATUS.md byte-identical | run/G02-done-evidence-real-board.txt |
| AT-04 | done, missing path | fixture | VERIFIED | Same board: "does not exist", byte-identical | run/G02-done-evidence-real-board.txt |
| AT-05 | done, empty file | fixture | VERIFIED (caveat: do-it has no real empty evidence file, so the run creates one) | Same board: "empty", byte-identical | run/G02-done-evidence-real-board.txt |
| AT-06 | done, valid file | fixture | VERIFIED | Real evidence `.taskstate/results/S1.log` (tracked, 2.9K): accepted, updated_at falls inside the call window, history entry added by build-it | run/G02-done-evidence-real-board.txt |
| AT-07 | build-it asks verified | fixture | VERIFIED | Committed board, ST-01: "role build-it may not set status verified", byte-identical | run/G03-roles-real-dogfood-board.txt |
| AT-08 | review-it verdict accepted | hand-written verdict (`verdictText`) | VERIFIED | Real review-it contract-qa run on ST-06, report `review-it/ST-06-review-it-report.md` (sha cdfd9761edc3), with a fresh-context verifier: CONFIRM on all 5 rows. The writer accepts it and the view shows the claim and the sha | run/G04-review-it-verdict-real.txt |
| AT-09 | lower verified, no note | fixture | VERIFIED | ST-06 after the real verdict: refused, byte-identical | run/G04-review-it-verdict-real.txt |
| AT-10 | lower verified, note | fixture | VERIFIED | Accepted, history `verified -> in-progress` with the note, validates | run/G04-review-it-verdict-real.txt |
| AT-11 | blocked, no blocked_on | fixture | VERIFIED | Committed board, ST-05: refused, byte-identical; accepted with `--blocked-on` | run/G03-roles-real-dogfood-board.txt |
| AT-12 | `"percent": 100` | lib fixture | VERIFIED (caveat: the hand edit is the case input) | Real board plus the edit: the validator error names "percent" | run/G08-validator-mod-real-board.txt |
| AT-13 | two writers at once | real processes, fixture board | VERIFIED | Committed board, 8 writer processes at once, 10 rounds: all 8 changes present, history +4, valid, no residue | run/G05-concurrent-processes-real-board.txt |
| AT-14 | kill between tmp and rename | test hook `STATUS_WRITE_TEST_CRASH` (exit 137) | VERIFIED | No hook. The writer child gets SIGKILL the moment the tmp file exists, or once it reaches full size. 300 kills on two real boards: 150 left a complete tmp that was never renamed, 150 were mid-write. status.json was byte-identical in all 300 | run/G06-sigkill-mid-write-real-board.txt |
| AT-15 | unknown key preserved | fixture | VERIFIED (caveat: the key comes from a real tool, `review-checkpoints.mjs decide --write`, pointed at status.json; its documented target is READINESS.json) | The real `review_checkpoints` block is identical after a writer rewrite | run/G07-unknown-key-real-producer.txt |
| AT-16 | rename a done task | fixture | VERIFIED | Committed board, ST-01: rename and remove both refused, byte-identical | run/G03-roles-real-dogfood-board.txt |
| AT-17 | worked example = 62 | lib fixture | VERIFIED (caveat: no real board has the 10-task mix, so the spec's example goes through the real lib as given) | 62. The same function equals the formula on 4 real boards: committed 60, do-it delivery 89, lens 0, 4-status mix 50 | run/G09-percent-real-boards.txt |
| AT-18 | zero tasks | lib fixture | VERIFIED | Real plan-it board with all 176 tasks removed by `remove --by plan-it`: lib "unknown", mod shows no number, view "unknown" | run/G09-percent-real-boards.txt |
| AT-19 | 1 done of 1 = 60 | lib fixture | VERIFIED (caveat: the real board has T=8, the spec says T=1; same rule) | Committed board, 8 done, 0 verified: lib 60, mod 60, never 100 | run/G09-percent-real-boards.txt |
| AT-20 | migrate do-it STATUS.md | real copy (verify.mjs) | VERIFIED | Real `delivery/STATUS.md` in the clone: 20 tasks, approximate, "downgrades: 1"; the second run exits 2 and the file is byte-identical | run/G10-migration-real-boards.txt |
| AT-21 | migrate lens | real copy | VERIFIED | 21 tasks; LDH-01/02/03/21 blocked, matching the source's owner-gated rows; source sha unchanged | run/G10-migration-real-boards.txt |
| AT-22 | build-it on a 3-task fixture | live agent on a fixture | VERIFIED (caveat: W1's 4 tasks were bootstrapped in one batch, D-16) | This board's own history from the real run: writes at 3 times (14:24:33, 14:30:38, 14:47:48), and ST-03/04/05/08 have separate start and finish entries | run/G13-boundaries-real-run-history.txt |
| T-B-01 | 1 V, 1 D, 1 IP, 1 NS | lib fixture | VERIFIED | Committed board driven by the writer and the real verdict: V1 D5 IP1 NS1. Lib, mod and view all show 50, the formula's value | run/G09-percent-real-boards.txt |
| T-B-02 | zero tasks | lib fixture | VERIFIED | As AT-18 | run/G09-percent-real-boards.txt |
| T-B-03 | blocked listed, 0 weight | lib fixture | VERIFIED | Real lens board: 4 in blocked_list, percent 0 | run/G09-percent-real-boards.txt |
| T-B-04 | done, no evidence | fixture | VERIFIED | As AT-03 | run/G02-done-evidence-real-board.txt |
| T-B-05 | missing path | fixture | VERIFIED | As AT-04 | run/G02-done-evidence-real-board.txt |
| T-B-06 | empty file | fixture | VERIFIED (caveat as AT-05) | As AT-05 | run/G02-done-evidence-real-board.txt |
| T-B-07 | build-it writes verified | fixture | VERIFIED | As AT-07 | run/G03-roles-real-dogfood-board.txt |
| T-B-08 | review-it verdict | hand-written verdict | VERIFIED | As AT-08 | run/G04-review-it-verdict-real.txt |
| T-B-09 | lower, no note | fixture | VERIFIED | As AT-09 | run/G04-review-it-verdict-real.txt |
| T-B-10 | lower, note | fixture | VERIFIED | As AT-10 | run/G04-review-it-verdict-real.txt |
| T-B-11 | typed percent, mod ignores | mod on a synthetic doc | VERIFIED (caveat as AT-12) | The installed mod on the edited real board: no percent, `invalid: true`; the writer refuses both to write and `--percent` | run/G08-validator-mod-real-board.txt |
| T-B-12 | unknown schema | synthetic doc | VERIFIED (caveat: schema edited to 2) | Mod: `unsupported schema 2: this view reads schema 1 only`, no crash | run/G08-validator-mod-real-board.txt |
| T-B-13 | invalid JSON, others list | synthetic doc | VERIFIED (caveat: the real board is cut in half) | Mod lists all 4 real folders; the broken one says "status.json is not valid JSON"; do-it-v1 still lists 176 tasks | run/G08-validator-mod-real-board.txt |
| T-B-14 | two writers | real processes, fixture board | VERIFIED | As AT-13 | run/G05-concurrent-processes-real-board.txt |
| T-B-15 | kill during write | test hook | VERIFIED | As AT-14 | run/G06-sigkill-mid-write-real-board.txt |
| T-B-16 | plan-it 6 items, STATUS.md rendered | plan-it fixture | VERIFIED | As AT-01, with the writer marker on line 1 of STATUS.md | run/G01-planit-real-epics.txt |
| T-B-17 | done updates the STATUS.md row | fixture | VERIFIED | The real plan-it board's row shows done, the evidence and the new updated_at, with no hand edit | run/G02-done-evidence-real-board.txt |
| T-B-18 | conclude-it with an unverified task | fixture | VERIFIED | Committed board: `close --move` refused ("8 task(s) not verified"), byte-identical, not moved; with `--owner-note`, closed, moved, and still valid | run/G11-conclude-guard-real-board.txt |
| T-B-19 | migration downgrades unevidenced VERIFIED | real copy | VERIFIED (caveat: every real VERIFIED row has a real evidence file, so the verified-to-done path does not occur in real data; the real unevidenced row R1 went done to in-progress) | 20 tasks, 16 verified before the downgrade, every remaining verified row resolves to a tracked file | run/G10-migration-real-boards.txt |
| T-B-20 | fresh vs stale | lib fixture plus a throwaway git repo with forced dates | PARKED | Fresh half verified: newest real commit to the board folder f66d806, gap 0.14 h, not stale. The stale half cannot be seen on real data until a real commit lands more than 24 h after updated_at | run/G12-stale-real-git.txt |

## PARKED

| Case | Why | Human action that unparks it |
| --- | --- | --- |
| T-B-20 (stale half) | No real commit to the board folder lands more than 24 h after the board's `updated_at`. Faking the commit date would be a fixture again. | After 2026-10-20T17:23Z (updated_at is now 2026-10-18T17:22:44Z, after ST-06), merge this do-it PR or make any commit to the board folder without a writer call. Then run `node tests/status/real/real-verify.mjs ... --only T-B-20`. It should show stale=true. |

## Board change made with the writer

- ST-06 is now `verified` on this board. It was set with `status-write set ST-06 --status verified --by review-it` using the real report as evidence (sha cdfd9761edc3). View: 65%, verified 1 (claims). Output: `board-view-after-ST-06.txt`. The change is a separate commit, so it can be dropped if Fernando does not accept this run as review-it.
- STATUS.md was re-rendered by that same write, which also clears finding F-1 below.

## Findings

1. A plain review-it report cannot verify a task. The writer's D-06 check needs a `verdict: PASS` line, and review-it writes that line only in checkpoint reports (report-format section 2b). The same ST-06 review saved without the checkpoint lines is refused: "verdict file lacks a "verdict: PASS" line" (run/G04-review-it-verdict-real.txt). This is open item O-3, now with the real format in hand. Choice for Fernando: (a) review-it writes `task:` and `verdict:` lines in every contract-qa report, or (b) D-06 also reads the verdict-rows table.
2. The committed STATUS.md came from the renderer before D-28 (F-1 in the review-it report). It had no " (claims)" label and no "Verified claims" section. All data matched. The ST-06 write re-rendered it.
3. On the real board, `set X --status done` with no `--evidence` reuses the evidence already on the task. AT-03 holds for tasks that have none, which is how it was tested (on a real not-started task). A task sent back to in-progress keeps its old evidence, and a later done can reuse it. Seen on a clone: `set ST-01 --status in-progress`, then `set ST-01 --status done` with no `--evidence`, exits 0 with the old evidence (evidence/real-verify/finding-3-evidence-reuse.txt). That may be intended; no case covers it.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
