# real-verify summary (2026-10-18T17:21:46.406Z)
clone of do-it at 9a253febda6b202b3d1e522e401eff278254e192; committed board sha256 before de5f424be67f after de5f424be67f (untouched: true)

| Case | Result | Output | Real artifact |
| --- | --- | --- | --- |
| AT-01 | PASS | G01-planit-real-epics.txt | do-it delivery/epics/*.md (5 real epics) -> docs/implementation/do-it-v1/status.json via plan-it status-from-plan |
| T-B-16 | PASS | G01-planit-real-epics.txt | do-it delivery/epics/*.md (5 real epics) -> docs/implementation/do-it-v1/status.json via plan-it status-from-plan |
| AT-02 | PASS | G01-planit-real-epics.txt | do-it delivery/epics/*.md (5 real epics) -> docs/implementation/do-it-v1/status.json via plan-it status-from-plan |
| AT-03 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| T-B-04 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| AT-04 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| T-B-05 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| AT-05 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| T-B-06 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| AT-06 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| T-B-17 | PASS | G02-done-evidence-real-board.txt | docs/implementation/do-it-v1/status.json created by real plan-it from the real epics; evidence = a real tracked do-it run log |
| AT-07 | PASS | G03-roles-real-dogfood-board.txt | docs/implementation/harness-status-tracking/status.json as committed (8 tasks done by the real build-it run) |
| T-B-07 | PASS | G03-roles-real-dogfood-board.txt | docs/implementation/harness-status-tracking/status.json as committed (8 tasks done by the real build-it run) |
| AT-11 | PASS | G03-roles-real-dogfood-board.txt | docs/implementation/harness-status-tracking/status.json as committed (8 tasks done by the real build-it run) |
| AT-16 | PASS | G03-roles-real-dogfood-board.txt | docs/implementation/harness-status-tracking/status.json as committed (8 tasks done by the real build-it run) |
| AT-08 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| T-B-08 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| AT-09 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| T-B-09 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| AT-10 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| T-B-10 | PASS | G04-review-it-verdict-real.txt | docs/implementation/harness-status-tracking/status.json + the real review-it report for ST-06 (ST-06-review-it-report.md) |
| AT-13 | PASS | G05-concurrent-processes-real-board.txt | docs/implementation/harness-status-tracking/status.json, 8 writer processes started together, 10 rounds |
| T-B-14 | PASS | G05-concurrent-processes-real-board.txt | docs/implementation/harness-status-tracking/status.json, 8 writer processes started together, 10 rounds |
| AT-14 | PASS | G06-sigkill-mid-write-real-board.txt | docs/implementation/harness-status-tracking/status.json and docs/implementation/do-it-v1/status.json (plan-it, real epics); writer child SIGKILLed the moment status.json.tmp appears; no test hook |
| T-B-15 | PASS | G06-sigkill-mid-write-real-board.txt | docs/implementation/harness-status-tracking/status.json and docs/implementation/do-it-v1/status.json (plan-it, real epics); writer child SIGKILLed the moment status.json.tmp appears; no test hook |
| AT-15 | PASS | G07-unknown-key-real-producer.txt | docs/implementation/harness-status-tracking/status.json + review_checkpoints block computed by plan-it review-checkpoints.mjs from the real board |
| AT-12 | PASS | G08-validator-mod-real-board.txt | docs/implementation/harness-status-tracking/status.json hand-edited in the clone the way a model would; read by the installed doit-status mod (~/.claude/mods/doit-status/scripts/lib.mjs) |
| T-B-11 | PASS | G08-validator-mod-real-board.txt | docs/implementation/harness-status-tracking/status.json hand-edited in the clone the way a model would; read by the installed doit-status mod (~/.claude/mods/doit-status/scripts/lib.mjs) |
| T-B-12 | PASS | G08-validator-mod-real-board.txt | docs/implementation/harness-status-tracking/status.json hand-edited in the clone the way a model would; read by the installed doit-status mod (~/.claude/mods/doit-status/scripts/lib.mjs) |
| T-B-13 | PASS | G08-validator-mod-real-board.txt | docs/implementation/harness-status-tracking/status.json hand-edited in the clone the way a model would; read by the installed doit-status mod (~/.claude/mods/doit-status/scripts/lib.mjs) |
| AT-17 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| AT-18 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| T-B-02 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| AT-19 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| T-B-01 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| T-B-03 | PASS | G09-percent-real-boards.txt | committed dogfood board; real do-it delivery/STATUS.md migrated; real lens-data-honesty STATUS.md migrated; real plan-it board emptied by plan-it remove; real board in a 4-status mix via the writer + real review-it verdict |
| AT-20 | PASS | G10-migration-real-boards.txt | do-it delivery/STATUS.md (real, in the clone with its tracked .taskstate) and ANM lens-data-honesty delivery/STATUS.md (real, read only) |
| T-B-19 | PASS | G10-migration-real-boards.txt | do-it delivery/STATUS.md (real, in the clone with its tracked .taskstate) and ANM lens-data-honesty delivery/STATUS.md (real, read only) |
| AT-21 | PASS | G10-migration-real-boards.txt | do-it delivery/STATUS.md (real, in the clone with its tracked .taskstate) and ANM lens-data-honesty delivery/STATUS.md (real, read only) |
| T-B-18 | PASS | G11-conclude-guard-real-board.txt | docs/implementation/harness-status-tracking/status.json as committed (8 done, 0 verified) |
| T-B-20 | FAIL | G12-stale-real-git.txt | docs/implementation/harness-status-tracking in the real do-it history (git log -1 of the folder) vs the board's updated_at |
| AT-22 | PASS | G13-boundaries-real-run-history.txt | docs/implementation/harness-status-tracking/status.json history written by the real build-it run on 2026-10-18 |
