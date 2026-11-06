# CARD B: mechanical status tracking

Status: study plus decision, 2026-10-15. Nothing here is built. Companion: `CARD-A-init-it.md`, `PROMPT-plan-it-build-it-status-json.md`.

## 1. Problem

`/doit-status` must show a percent to 0-done, a table of pieces, and tokens and cost. Today any percent a session reports is an LLM's judgment. That is not acceptable: a model can write "100%" with nothing behind it. The harness (the plugins and the mod) must own the numbers, and a model may only supply facts plus evidence.

## 2. What exists today (read from real packages)

- plan-it ends every epic with a binding Test Contract: up to about 20 cases, DoD is 100% of the contract passing (plan-it SKILL.md, section "The Test Contract"). Case ids look like `T-P1-12`, `T-E1-07`.
- Status vocabulary in the wild: `NOT-STARTED, IN-PROGRESS, IMPLEMENTED-NOT-VERIFIED, VERIFIED`.
- `do-it/delivery/STATUS.md`: a markdown table with columns EID, Epic, Squad, Wave, Status, Tests (green/total), Branch, Disposition, plus a Residuals table and a dated Log. It has a header line "Program totals: 20 epics, 16 VERIFIED..." typed by hand.
- `ANM/docs/implementations/lens-data-honesty/delivery/STATUS.md`: same vocabulary, one row per task (LDH-01..21), columns EID, Task, Squad, Wave, Cases, Status, Disposition; header "21 tasks, 24 test cases, 0 passing". Disposition carries owner-gates ("owner-gated: Fernando").
- `ANM/docs/implementations/hackathon-plan`: no STATUS.md in the package root (the folder holds `PROMPTS.md`, `RULES.md`, `index.html`, `_build.py`); run state lived in `.taskstate/hackathon-plan/BOARD.md`. So status is spread over at least two conventions already.
- Session ledger: cards exist only for ended sessions and carry no implementation field (Card A).

Finding: the information exists, but as free-form markdown typed by a model, in different places per package, with hand-typed totals.

## 3. Options

| Option | How it works | Pros | Cons |
|---|---|---|---|
| 1. `status.json` written by plugins | One versioned JSON per implementation, tasks with a status enum and an evidence path, written by the stage that owns the fact | Machine readable, one place, schema-checkable, computed fields can be derived, atomic writes | Needs plan-it and build-it changes; old packages have none; can go stale if a plugin forgets to write |
| 2. Parse `STATUS.md` tables | Mod reads the existing markdown | Zero plugin change; works on all existing packages today | Fragile (columns differ per package), hand-typed totals, no evidence field, parser breaks on any table edit |
| 3. Test-contract pass counts | Count passing cases from the test runner output or `evidence/` | The strongest truth: the tests ran | Only exists for tasks that have cases; owner-gated and non-code tasks have none; needs a runner convention |
| 4. Git and PR state | Branch exists, PR merged, tag present | Hard to fake, external to the model | Says "merged", not "verified"; many tasks have no branch; wrong in squash or rebase flows |

## 4. Failure modes

1. Stale file. A plugin finishes work and does not write. Mitigation: every status row carries `updated_at`; the mod shows "last change N days ago" and flags a stale implementation whose newest commit or session is newer than `updated_at`.
2. Model writes 100% (or `done`) without evidence. Mitigation: the rule in section 6. A writer script refuses `done` and `verified` without a resolvable evidence path.
3. Hand-typed percent drifts from the counts. Mitigation: percent is never stored by a model. The mod computes it (formula in the prompt file).
4. Lowering a verified item silently (regression hidden). Mitigation: moving down from `verified` requires a `note`, and the change is appended to a history list.
5. Evidence path exists but is empty or points to a different run. Mitigation: evidence must be a path under the implementation folder or `.taskstate/`, must exist, must be non-empty; the review-it verdict file is preferred over free text.
6. Two sessions write at once. Mitigation: atomic temp-and-rename plus a retry on a changed `updated_at`.
7. Package with no tasks. Mitigation: the mod shows "unknown", never 0% and never 100%.
8. Old packages with only `STATUS.md`. Mitigation: one-time migration, marked approximate (section 7).

## 5. Recommendation

Use option 1 as the source of truth, backed by option 3 as the evidence, with options 2 and 4 only as a one-time migration and a cross-check.

- `status.json` is the file the mod reads.
- A task reaches `done` only with an evidence path. A task reaches `verified` only through review-it, whose verdict file is the evidence. Test-contract pass counts live in that verdict file, so option 3 is how `verified` is earned, not a parallel system.
- Git and PR state is a cross-check the mod may show as a hint ("PR merged: yes"), never an input to the percent.
- `STATUS.md` stays as the human-readable board. After this change plan-it and build-it render it from `status.json`, so the two cannot disagree (one source, one render).

## 6. Rules (binding)

1. Done requires an evidence field. No evidence path, no `done`. The writer script rejects it; a model cannot bypass it by editing prose.
2. Percent is computed by the mod from task counts. It is never typed or stored by a model. A `computed` block in the file, if present, is ignored by the mod and flagged as an error when a model wrote it.
3. `verified` is set only by review-it (or by conclude-it carrying a review-it verdict forward). build-it may set up to `done`.
4. Lowering a `verified` task requires a `note`.
5. Unknown beats guessed: no tasks gives "unknown", a migrated file is shown "approximate".

## 7. Who owns what

| Plugin | Owns | Writes |
|---|---|---|
| plan-it | Creating the file | From the epics and Test Contract: waves, tasks (all `not-started`), pieces. One task per checklist item or per test-contract group. Never writes `done` or `verified`. |
| build-it | Progress and evidence | Task status `in-progress`, `blocked` (with `blocked_on`), `done` (with evidence path to its `.taskstate` log or test output). Updates `owner` and `updated_at`. Never writes `verified`. |
| review-it | Verification | Sets `verified` after running the Test Contract; evidence is the review-it verdict path. Sets a task back to `in-progress` with a note when a case fails. |
| conclude-it | Closing | Sets the final state, records `ended_at` on sessions, moves the folder to `0-done`, freezes the file (`closed: true`). Refuses to move if any task is not `verified` unless the owner overrides with a note. |
| init-it | Sessions | Adds and updates `sessions[]` only (Card A). |
| `/doit-status` mod | Reading | Reads, validates, computes percent, shows. Never writes task status. |

Migration for existing implementations: a one-time script reads `STATUS.md`, maps `VERIFIED` to `verified`, `IMPLEMENTED-NOT-VERIFIED` to `done`, `IN-PROGRESS` to `in-progress`, `NOT-STARTED` to `not-started`, takes the Disposition and Residuals text as `blocked_on` for owner-gated rows, writes `evidence` from the "log" or "run:" path when one is quoted, and sets `"approximate": true`. Rows with no usable evidence are downgraded one step (`VERIFIED` without a path becomes `done`) so the mod never shows more than the evidence supports.

## 8. Acceptance criteria

1. A writer helper (one script, shared) is the only code path that edits task status. Direct edits are caught by a validator the mod runs.
2. Writing `done` or `verified` without an existing, non-empty evidence path exits non-zero and leaves the file unchanged.
3. Writing `verified` from a role other than review-it or conclude-it is refused.
4. Lowering `verified` without `note` is refused.
5. The mod's percent equals the formula applied to the counts, for every fixture, to the digit.
6. A `status.json` containing a typed `percent` or a `computed` block from a model makes the validator report an error and the mod ignore it.
7. A package with no tasks shows "unknown".
8. The migration of `do-it/delivery/STATUS.md` yields 20 tasks, 16 `verified` before the evidence downgrade, and flags `approximate`.
9. After plan-it creates the file and build-it marks one task `done` with evidence, the rendered `STATUS.md` shows it with no hand edit.
10. A stale file (newest commit newer than `updated_at` by more than the threshold) is flagged.

## 9. Tasks and tiers

| ID | Task | Tier |
|---|---|---|
| ST-01 | Schema v1 as JSON Schema, plus the shared writer and validator script | sonnet |
| ST-02 | plan-it: create `status.json` from epics and Test Contract | sonnet |
| ST-03 | build-it: update status and evidence at task boundaries | opus (cross-cutting, touches the run loop) |
| ST-04 | review-it: set `verified` from the verdict | sonnet |
| ST-05 | conclude-it: final state, freeze, move to `0-done` with the guard | sonnet |
| ST-06 | Render `STATUS.md` from `status.json` | haiku |
| ST-07 | Migration script, run on do-it and one ANM package | sonnet |
| ST-08 | Adversarial review: try to get a fake 100% through every writer | opus |

## 10. Test contract (binding)

Type: file-state logic with an adversarial surface, so enumerated cases plus invariants.

| Case | Setup | Expected |
|---|---|---|
| T-B-01 | 4 tasks: 1 verified, 1 done, 1 in-progress, 1 not-started | Percent equals the formula result exactly |
| T-B-02 | Zero tasks | Percent shown as unknown |
| T-B-03 | Blocked task present | Counted in the blocked list, contributes 0, not hidden |
| T-B-04 | Write `done` with no evidence | Rejected, file unchanged |
| T-B-05 | Write `done` with evidence path that does not exist | Rejected |
| T-B-06 | Write `done` with an empty evidence file | Rejected |
| T-B-07 | build-it writes `verified` | Rejected |
| T-B-08 | review-it writes `verified` with its verdict path | Accepted |
| T-B-09 | Lower verified to in-progress with no note | Rejected |
| T-B-10 | Same with a note | Accepted, history entry appended |
| T-B-11 | File contains `"percent": 100` typed by a model | Validator error; mod ignores it |
| T-B-12 | Unknown schema number | Mod shows "unsupported schema", no crash |
| T-B-13 | Invalid JSON | Mod shows a clear error for that implementation, others still list |
| T-B-14 | Two writers at once | Final file valid, both updates present |
| T-B-15 | Kill during write | Previous file intact |
| T-B-16 | plan-it on a fixture epic with 6 checklist items | `status.json` with 6 `not-started` tasks, `STATUS.md` rendered |
| T-B-17 | build-it marks T done with evidence | `STATUS.md` row updated, `updated_at` changed |
| T-B-18 | conclude-it with an unverified task | Move to `0-done` refused without owner note |
| T-B-19 | Migration of `do-it/delivery/STATUS.md` | 20 tasks, `approximate: true`, unevidenced VERIFIED downgraded |
| T-B-20 | Newest commit older than `updated_at` vs newer than threshold | Fresh vs stale flag |

Failure and cascade notes: partial write is covered by T-B-14 and T-B-15; rollback is the previous file (whole-file atomic replace); recovery is re-running the stage, which rewrites the same task row idempotently.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
