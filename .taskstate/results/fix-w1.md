# fix-w1
Cause: harness bug, not spine. tests/e2e/lib/roteiros.mjs seeded weekly-drain finish-line rows with kind 'card'; the finish-line schema (CONTRACT s2) allows only wave|package|dod. S2's record now validates on write (FINISH_LINE_INVALID), so the record journal never applied, rows stayed OPEN (T-R4-04) and conclude behaved wrongly (T-R4-06).
Fix: seed kind 'dod' (one line). Spine untouched, no rebuild.
Results: r4.test.mjs 15 pass / 0 fail / 11 skip; spine glob 72 pass / 0 fail.
Note: harness ignores record exit codes (finishDrain); worth asserting later.
