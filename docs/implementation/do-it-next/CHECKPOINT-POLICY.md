# Review checkpoint policy (v1)

Status: built on feature branches, not merged, 2026-10-18. Part of do-it 1.0.1 scope.

Binding decision (approved by Fernando): plan-it and do-it decide how many review-it checkpoints an implementation gets, from its size, complexity and importance. The count is not fixed per wave.

A checkpoint is one review-it run at a named boundary. It produces a verdict file. Work may not cross the boundary until that file says PASS.

## 1. Inputs

| Input | What it is | Where it comes from |
|---|---|---|
| `tasks` | Number of tasks (or the list of task ids) | Counted: `status.json` waves when present (`--status`), else the epic checklist items |
| `epics` | Number of epics | Counted from `epics/` |
| `waves` | Wave count or `[{id, tasks}]` | Counted: `status.json` or the program plan |
| `cross_cutting` | Complexity. A shared interface or writer that other plugins or lanes consume, or a change to a run loop | Planner, with a one-line reason |
| `owner_gated` | Complexity. At least one task or decision waits on the owner | Planner, with a reason |
| `new_surface` | Complexity. A new schema, CLI verb, API, plugin or file format | Planner, with a reason |
| `data` | Importance. Writes or migrates persisted state that people or tools read as truth | Planner, with a reason |
| `money` | Importance. Billing, payments, pricing, spend | Planner, with a reason |
| `security` | Importance. Auth, secrets, permissions, tenant isolation | Planner, with a reason |
| `prod_facing` | Importance. Ships to production, to users, or as a tagged release | Planner, with a reason |
| `adversarial_wave` | Optional. The wave that is already an adversarial review (the ST-08 convention) | Plan |
| `interface_lock_after` | Optional. In a single-wave plan, the task the rest builds on | Plan |

A flag is either a one-line reason or `null`. Setting a flag to `true` with no reason is refused (exit 1). The reasons show at the plan review gate (G4), where the owner can contradict them.

## 2. Score

- Size points: 1 to 3 tasks = 0, 4 to 10 = 1, 11 to 25 = 2, 26 or more = 3. Add 1 when there are 4 or more epics. The maximum is 3.
- Complexity points: 1 per complexity flag (0 to 3).
- Importance points: 1 per importance flag (0 to 4).
- Score = size + complexity + importance (0 to 10).

| Score | Level |
|---|---|
| no tasks | none |
| 0 to 1 | light |
| 2 to 3 | standard |
| 4 to 5 | heightened |
| 6 or more | full |

## 3. Mapping to checkpoints

Each rule adds checkpoints. The count is the number of checkpoints added.

| Rule | Adds | Sits at | review-it runs | Blocks |
|---|---|---|---|---|
| R0. Zero tasks | nothing (count 0, level `none`) | none | none | none |
| R1. At least one task | `pre-merge` (always) | before merge to main | the whole Test Contract on the integrated branch | merge |
| R2. Score 2 or more, or size 3 | `wave` after W1 only (2 or more waves), or one `phase` checkpoint (one wave and 4 or more tasks) | wave boundary, or after `interface_lock_after` (else the halfway task) | the contract cases of the finished waves, on the merged tree | the next wave |
| R3. Score 4 or more, or size 3 | `wave` at every wave boundary (waves minus 1) | each wave boundary | same as R2 | the next wave |
| R4. `security` or `money`, or `data` and `cross_cutting` together, or score 6 or more | `adversarial` | after the last wave, before pre-merge. If the plan has an `adversarial_wave`, that wave's boundary becomes this checkpoint (one review, not two) | try to get a false pass through every gate and writer | pre-merge (or the next wave) |
| R5. `prod_facing` | `pre-release` | after merge, before tag, publish or deploy | deploy-verify plus the `[REAL]` cases on the released artifact | tag, publish, deploy |

Checkpoints are numbered `CP-01`, `CP-02` and so on, in run order: wave and phase checkpoints by wave, then adversarial, pre-merge and pre-release.

## 4. What a checkpoint must produce

Each checkpoint names its verdict file: `<evidence-dir>/CP-NN-<kind>[-<wave>].md`. plan-it puts the evidence dir under the implementation folder (for example `docs/implementation/<name>/reviews/`). That way the same file is valid `verified` evidence for the status-write rules in CARD-B. The default is `plan/reviews/`.

The verdict file is review-it's report, plus two header lines the reader checks:

```
checkpoint: CP-02
verdict: PASS            (or FAIL)
```

It should also carry `cases: <passed>/<total>` and the `head_sha` that was reviewed.

| Reader result | Meaning | build-it does |
|---|---|---|
| exit 0, PASS | Verdict file present, names this checkpoint, says PASS | Crosses the boundary |
| exit 1, FAIL or invalid | FAIL, empty file, wrong checkpoint id, or no verdict line | Sends the failing cases back to the fix cycle, then re-runs the same checkpoint |
| exit 2, missing | No verdict file | May not cross |

In a do-it run, `do-it gate build` turns each checkpoint into a finish-line row `checkpoint:CP-NN`. The row closes only when review-it records a VERIFIED verdict whose evidence is that file. So a run cannot close with a checkpoint skipped.

## 5. Edge cases (all have tests)

| Case | Result |
|---|---|
| Zero tasks | 0 checkpoints, level `none`. build-it prints "nothing to build or review". do-it accepts count 0 and seeds no rows |
| One trivial task, no flags | 1: pre-merge |
| One task, `security` and `prod_facing` | 3: adversarial, pre-merge, pre-release (score 2) |
| Two tasks, `money` | 2: adversarial, pre-merge |
| 6 tasks, 2 waves, no flags | 1: pre-merge (score 1) |
| 30 tasks, 5 waves, no flags | 5: four wave checkpoints, pre-merge (size 3) |
| Single wave, 6 tasks, one flag | 2: phase checkpoint after task 3 (or after `interface_lock_after`), pre-merge |
| Older plan with no `review_checkpoints` block | build-it exits 2 and names the fallback: one pre-merge checkpoint. do-it seeds no rows |
| Tampered `count`, or ids out of sequence | plan-it `check`, build-it and do-it all refuse (READINESS_INVALID in do-it) |
| Flag `true` with no reason, or an unknown flag | Refused, exit 1 |

## 6. Where the code is

| Repo, branch | File | Role |
|---|---|---|
| plan-it `feat/review-checkpoints` | `plugins/plan-it/scripts/review-checkpoints.mjs` | `decide` (writes `review_checkpoints` into `plan/READINESS.json`), `check` |
| plan-it | `SKILL.md`, `plugins/plan-it/skills/plan-it/SKILL.md` | One Phase 10 bullet, kept identical in both copies |
| plan-it | `tests/review-checkpoints/decide.test.mjs` | 23 table-driven tests |
| build-it `feat/review-checkpoints` | `plugins/build-it/scripts/checkpoints/checkpoints.mjs` | `plan`, `due --at`, `check --id`, `status` |
| build-it | `plugins/build-it/skills/build-it/SKILL.md` | One Step 5 paragraph |
| build-it | `tests/checkpoints/checkpoints.test.mjs`, `tests/checkpoints/fixtures/READINESS.json` | 10 tests |
| do-it `feat/review-checkpoints` | `core/schemas/readiness.schema.json`, `core/spine/src/readiness.mjs` (rebuilt into `do-it.mjs` and mirrored) | Validate the block, store it on the run, seed `checkpoint:CP-NN` rows |
| do-it | `core/spine/test/s2/checkpoints.test.mjs` | 4 tests (T-CP-01 to T-CP-04) |

None of these files is a status-write or harness-status-tracking file. A trial merge (`git merge-tree`) of each feature branch against the current `harness-status-tracking` branch in plan-it and build-it is clean.

## 7. Worked examples

Inputs and the exact script output are in `checkpoint-examples/`. They were produced by `review-checkpoints.mjs decide`, not typed by hand.

### harness-status-tracking

Inputs: 9 tasks (the task as given; `status.json` lists 8, ST-01 to ST-08, which is the same size band), 1 epic, 3 waves, adversarial wave W3. Flags: `cross_cutting` (one shared writer for four plugins, ST-03 touches the build-it run loop), `new_surface` (status.json schema, status-write CLI, /doit-status mod), `data` (status.json is the progress truth), `prod_facing` (ships in the plugins every session loads). Not set: `owner_gated`, `money`, `security`.

Score: size 1 + complexity 2 + importance 2 = 5, level heightened. Five checkpoints:

| Id | Kind | Sits at | Blocks |
|---|---|---|---|
| CP-01 | wave | after W1 (ST-01, ST-06, ST-07, ST-02) | start of W2 |
| CP-02 | wave | after W2 (ST-03, ST-04, ST-05) | start of W3 |
| CP-03 | adversarial | after W3 (ST-08), before pre-merge | pre-merge |
| CP-04 | pre-merge | before plan-it and build-it merge to main | merge |
| CP-05 | pre-release | before the plugin versions are tagged | tag |

Finding: on today's board W1 is done and W2 is in progress, and no W1 review-it verdict exists. Under this policy, CP-01 is due now, before any W2 task is marked done.

### do-it 1.0.1 package

Inputs (assumed package shape, change it if the scope differs): 16 tasks in 3 epics and 4 waves. W1: the HST writer, render, migration and plan-it creation, plus this policy and the plan-it emitter. W2: the HST lifecycle callers, the build-it reader and the do-it seeding. W3: the adversarial wave (ST-08 plus an adversarial pass on the checkpoint gate). W4: companion pins, changelog, tag. Flags: all three complexity flags (`owner_gated`: the version bump, tag and visibility need Fernando), plus `data` and `prod_facing`.

Score: size 2 + complexity 3 + importance 2 = 7, level full. Five checkpoints (six if W3 were not already the adversarial wave):

| Id | Kind | Sits at | Blocks |
|---|---|---|---|
| CP-01 | wave | after W1 | start of W2 |
| CP-02 | wave | after W2 | start of W3 |
| CP-03 | adversarial | after W3 | start of W4 |
| CP-04 | pre-merge | before the do-it, plan-it and build-it branches merge | merge |
| CP-05 | pre-release | before the 1.0.1 tag and the companion releases | tag |

When a parent package and a nested implementation (here, HST inside 1.0.1) share a boundary, one verdict file can serve both. Point both checkpoints at the same path.

## 8. Decisions

Format: the default that is applied, the alternatives, and the recommendation. "Pre-approved" means it follows directly from the approved decision or is a reversible default. "Needs-override" means it touches something Fernando owns. Override only where you disagree.

| # | Decision | Default applied (recommended) | Alternatives | State |
|---|---|---|---|---|
| D1 | Floor | (a) Every plan with 1 or more tasks gets a pre-merge checkpoint. Recommended because it is the one review that sees the integrated tree | (b) allow 0 for a trivial single task; (c) floor only at score 1 or more | pre-approved |
| D2 | Thresholds | (a) Size bands 3/10/25, score cuts 2/4/6. Recommended: recalibrate after three real runs, using the review-it FAIL rate per checkpoint | (b) more checkpoints sooner (cuts 1/3/5); (c) fewer (cuts 3/5/7) | pre-approved |
| D3 | Adversarial trigger | (a) `security` or `money`, or `data` with `cross_cutting`, or score 6 or more. Recommended because these are the classes where a fake green costs the most | (b) only `security` and `money`; (c) every heightened or full plan | pre-approved |
| D4 | Adversarial wave already planned | (a) Its boundary becomes the adversarial checkpoint (one review). Recommended because it avoids two review-it runs on the same tree | (b) keep both | pre-approved |
| D5 | Who computes | (a) plan-it computes it once at G4, build-it reads it, the do-it spine checks it and enforces it through finish-line rows. Recommended: one implementation, no drift | (b) copy the algorithm into the do-it spine with a parity test; (c) do-it computes and plan-it only supplies inputs | pre-approved |
| D6 | Who sets the flags | (a) The planner sets them, each with a one-line reason. Counts come from files. The owner sees the flags at G4. Recommended because flags are judgment and counts are not | (b) detect flags from keywords (rejected: correlation, not definition); (c) the owner sets every flag | pre-approved |
| D7 | Verdict file location | (a) `<implementation>/reviews/CP-NN-<kind>.md`, so the same file is `verified` evidence for status-write. Recommended | (b) review-it's default `.review-it/`; (c) `.taskstate/` | pre-approved |
| D8 | Verdict header lines | (a) build-it tells review-it to add `checkpoint:` and `verdict:` lines. This works today because review-it is prompt-driven. Recommended: also add the two lines to review-it's `references/report-format.md` in a small review-it PR | (b) the reader parses review-it's current report body; (c) a separate JSON verdict | **needs-override** (review-it's report format is a companion contract) |
| D9 | Older plans with no block | (a) build-it runs one pre-merge checkpoint and says so in the report; do-it seeds no rows. Recommended: keeps old packages working | (b) refuse to build until the plan is re-run | pre-approved |
| D10 | Cap on wave checkpoints | (a) No cap beyond waves minus 1. Recommended: cost tracks the work | (b) at most 4 | pre-approved |
| D11 | gate-check | (a) `gate-check readiness` is not changed; `review-checkpoints.mjs check` validates the block. Recommended: it avoids editing the 133 KB mirrored gate-check | (b) add the block check to `gate-check readiness` now | pre-approved |
| D12 | Versions | (a) No version bump on any repo in this change. Recommended: plan-it 5.1.0, build-it 4.1.0 and do-it 1.0.1 are bumped together at release | (b) bump each repo now | **needs-override** (release is owner-gated) |

## 9. Not done here

- review-it is not changed (D8).
- No branch is pushed or merged, and no version is bumped.
- The do-it 1.0.1 package shape in section 7 is an assumption until the 1.0.1 scope is fixed.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
