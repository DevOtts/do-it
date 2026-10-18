# Review checkpoint policy (v1)

Status: built on feature branches, not merged, 2026-10-18. Part of do-it 1.0.1 scope.

Binding decision (approved by Fernando): plan-it and do-it decide how many review-it checkpoints an implementation gets, from its size, complexity and importance. The count is not fixed per wave.

A checkpoint is one review-it run at a named boundary. It produces a verdict file. Until that file says PASS, the checkpoint holds the work that depends on what it reviewed, and the promotion, merge or release of that work. It never holds independent work: a run must not idle because one wave waits for its review (section 3a).

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
| R1. At least one task | `pre-merge` (always) | before merge to main | the whole Test Contract on the integrated branch | merge to main (`merge`) |
| R2. Score 2 or more, or size 3 | `wave` after W1 only (2 or more waves), or one `phase` checkpoint (one wave and 4 or more tasks) | wave boundary, or after `interface_lock_after` (else the halfway task) | the contract cases of the finished waves, on the merged tree | the start of slices that depend on the covered wave (or tasks), and the promotion of that work (`dependents`, `promotion`) |
| R3. Score 4 or more, or size 3 | `wave` at every wave boundary (waves minus 1) | each wave boundary | same as R2 | same as R2, for the wave it sits after |
| R4. `security` or `money`, or `data` and `cross_cutting` together, or score 6 or more | `adversarial` | after the last wave, before pre-merge. If the plan has an `adversarial_wave`, that wave's boundary becomes this checkpoint (one review, not two) | try to get a false pass through every gate and writer | merge to main (`merge`); at a mid-plan `adversarial_wave` boundary, the slices that depend on that wave (`dependents`) |
| R5. `prod_facing` | `pre-release` | after merge, before tag, publish or deploy | deploy-verify plus the `[REAL]` cases on the released artifact | tag, publish, deploy (`release`) |

Checkpoints are numbered `CP-01`, `CP-02` and so on, in run order: wave and phase checkpoints by wave, then adversarial, pre-merge and pre-release.

## 3a. What a checkpoint holds

Finding H-10 (first real run, 23 epics, 5 waves): writing `blocks: start of W<n+1>` and reading it as "do not cross" stopped the whole next wave, including epics that depended on nothing in the finished wave. That is the wave lock again. The rule now: a checkpoint may hold the promotion of the work it reviewed and the work that depends on it, never independent work.

Finding H-21 (same run, on the real plan): with the whole of W0 covered, a W0 slice that needs another W0 slice waited on the W0 checkpoint, a review that only runs after W0 has ended, so W0 could never finish. A checkpoint reviews the work it covers, so it cannot hold the start of that same work: `dependents` holds the slices outside the covered work that depend on it.

Each checkpoint carries two optional fields (schema stays `review-checkpoints/1`; the fields are additive):

- `gates`: what it holds until its verdict is PASS, a subset of `dependents`, `promotion`, `merge`, `release`.
- `covers`: the ids it reviews, a wave id (`W1`) or slice/task ids.

| Gate | Holds until PASS | Never holds |
|---|---|---|
| `dependents` | The start of any slice outside the covered work that depends, directly or through other slices (`depends_on`), on covered work | A slice that depends on nothing covered, and a slice that is itself covered work (it waits on its own dependencies, not on a review that only runs after it) |
| `promotion` | Promoting covered work beyond the integration environment: deploy, cut over, publish | Work in the integration environment |
| `merge` | Merge to the main branch | Starting or building anything |
| `release` | Tag, publish or deploy of the release (a release also needs every `promotion` gate, since it publishes all the work) | Starting or building anything |

| Kind | `gates` | `covers` |
|---|---|---|
| `wave`, `phase` | `dependents`, `promotion` | the wave it sits after; for a phase, the tasks up to the lock (left out when only a task count is known) |
| `adversarial` | `merge`; `dependents` when it replaced a mid-plan wave boundary | every wave; or that wave |
| `pre-merge` | `merge` | every wave |
| `pre-release` | `release` | every wave |

`blocks` stays as text for people, and now says what is held, for example "slices that depend on W0 work, and promotion of W0 work".

To resolve a wave id in `covers`, a slice needs its wave. plan-it's `decide --write` tags each READINESS slice with `wave` from the wave task lists (`waves: [{id, tasks: [ids]}]`, or `--status`), and names any slice it cannot place.

build-it asks before it acts: `checkpoints.mjs gate --readiness <file> --action start|promote|merge|release [--slice <id>]`. Exit 0 allowed; exit 2 blocked, naming every unmet checkpoint, its verdict state and why; exit 1 cannot evaluate, saying exactly what is missing (for example a wave id in `covers` while the slices carry no `wave`). It never guesses: an unknown answer is exit 1, not 0 and not 2. A checkpoint with a PASS verdict holds nothing.

Older plans (no `gates`/`covers`, for example plan-it 5.1.0 output) get the corrected meaning, not the old text: `wave`/`phase` hold `dependents` and `promotion` for the wave in `at`; `adversarial` holds `merge` (`dependents` if its old `blocks` began with "start of"); `pre-merge` holds `merge`; `pre-release` holds `release`. An old `phase` checkpoint names only its lock task, so a dependent start under it is exit 1 until plan-it is re-run.

Unchanged: the run closes only when every checkpoint is PASS (`checkpoints.mjs status` exit 0, and every `checkpoint:CP-NN` finish-line row closed). Only what is held, and when, changed.

## 4. What a checkpoint must produce

Each checkpoint names its verdict file: `<evidence-dir>/CP-NN-<kind>[-<wave>].md`. plan-it puts the evidence dir under the implementation folder (for example `docs/implementation/<name>/reviews/`). That way the same file is valid `verified` evidence for the status-write rules in CARD-B. The default is `plan/reviews/`.

The verdict file is review-it's report, plus two header lines the reader checks:

```
checkpoint: CP-02
verdict: PASS            (or FAIL)
```

It should also carry `cases: <passed>/<total>` and the `head_sha` that was reviewed.

Reading rule (the same in build-it's reader and the do-it spine, and as strict as review-it's status-sync): only report prose counts. Lines inside fenced code (``` and ~~~), indented code and HTML comments are ignored. There must be exactly one checkpoint id, and it must be this checkpoint. Every overall `verdict:` line (outside a `task:` block) must say the same value, exactly `PASS` or `FAIL`; a repeated identical line is fine. PASS and FAIL together, an overall PASS with a task block that is not PASS, no verdict line, or another value (`pass`, `GO`) is contradictory or invalid, and never a pass.

| Reader result | Meaning | build-it does |
|---|---|---|
| exit 0, PASS | Verdict file present, names this checkpoint, says PASS | Releases what the checkpoint held |
| exit 1, FAIL, contradictory or invalid | FAIL, empty or unreadable file, wrong or second checkpoint id, no verdict line, conflicting verdict lines, or a value other than PASS/FAIL | Sends the failing cases back to the fix cycle, then re-runs the same checkpoint. What it holds stays held; independent work goes on |
| exit 2, missing | No verdict file | Keeps holding its gates (section 3a); independent work goes on. `gate` answers per slice and action |

In a do-it run, `do-it gate build` turns each checkpoint into a finish-line row `checkpoint:CP-NN` and stores its `gates`, `covers` and `blocks` on the run (old blocks get the gates from section 3a; slices keep their `wave`). The row closes only when review-it records a VERIFIED verdict whose evidence is that checkpoint's own verdict file and the file passes the reading rule above; otherwise `record` keeps the row OPEN and answers `CHECKPOINT_NOT_PASS` (exit 1) with the reason. (Before this, the spine closed the row on any existing file named as evidence; it never read the verdict.) So a run cannot close with a checkpoint skipped or failed.

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
| Older plan with no `review_checkpoints` block | build-it exits 2 and names the fallback: one pre-merge checkpoint. do-it seeds no rows. `gate` exits 1 |
| Older block with no `gates`/`covers` (`blocks: start of W2`) | Read with the corrected meaning (section 3a): an independent next-wave slice is allowed |
| A wave id in `covers`, slices with no `wave` | `gate` exits 1 and says plan-it must tag slices; it does not guess |
| A slice that depends on a covered slice, directly or through others | `gate --action start` exits 2 naming the checkpoint |
| A slice inside the covered wave that depends on another slice of that wave (H-21) | Not held by that wave's checkpoint: it waits on its own dependencies. `gate --action start` exits 0 with no verdict |
| `due --at merge` and `due --at release` (H-22) | Aliases of the `pre-merge` and `pre-release` kinds. They used to match the `at` text by prefix, which returned the pre-release checkpoint for `merge` and nothing for `release` |
| `depends_on`, `covers` or `gates` that is not a list (of strings) | A plan error: `gate` exits 1 naming the slice or checkpoint; do-it says READINESS_INVALID |
| A cycle in `depends_on` | A plan error: `gate --action start` exits 1 and prints it (`A -> C -> A`); do-it says READINESS_INVALID with the cycle |
| A verdict file with PASS and FAIL lines, or PASS only inside code or a comment | Not a pass: `gate` exits 2, `check` exits 1, the do-it row stays OPEN |
| Tampered `count`, or ids out of sequence | plan-it `check`, build-it and do-it all refuse (READINESS_INVALID in do-it) |
| Flag `true` with no reason, or an unknown flag | Refused, exit 1 |

## 6. Where the code is

| Repo, branch | File | Role |
|---|---|---|
| plan-it `feat/review-checkpoints` | `plugins/plan-it/scripts/review-checkpoints.mjs` | `decide` (writes `review_checkpoints` into `plan/READINESS.json`), `check` |
| plan-it | `SKILL.md`, `plugins/plan-it/skills/plan-it/SKILL.md` | One Phase 10 bullet, kept identical in both copies |
| plan-it | `tests/review-checkpoints/decide.test.mjs` | 23 table-driven tests |
| build-it `feat/review-checkpoints` | `plugins/build-it/scripts/checkpoints/checkpoints.mjs` | `plan`, `due --at`, `check --id`, `status`, `gate --action` (branch `fix/checkpoint-gates`) |
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

| Id | Kind | Sits at | Holds (`gates`) |
|---|---|---|---|
| CP-01 | wave | after W1 (ST-01, ST-06, ST-07, ST-02) | W2 slices that depend on W1 work, and promotion of W1 work |
| CP-02 | wave | after W2 (ST-03, ST-04, ST-05) | W3 slices that depend on W2 work, and promotion of W2 work |
| CP-03 | adversarial | after W3 (ST-08), before pre-merge | merge |
| CP-04 | pre-merge | before plan-it and build-it merge to main | merge |
| CP-05 | pre-release | before the plugin versions are tagged | tag |

Finding: on today's board W1 is done and W2 is in progress, and no W1 review-it verdict exists. CP-01 is due now. It holds the W2 tasks that depend on W1 work from being started and W1 work from being promoted; a W2 task that depends on nothing in W1 goes on.

### do-it 1.0.1 package

Inputs (assumed package shape, change it if the scope differs): 16 tasks in 3 epics and 4 waves. W1: the HST writer, render, migration and plan-it creation, plus this policy and the plan-it emitter. W2: the HST lifecycle callers, the build-it reader and the do-it seeding. W3: the adversarial wave (ST-08 plus an adversarial pass on the checkpoint gate). W4: companion pins, changelog, tag. Flags: all three complexity flags (`owner_gated`: the version bump, tag and visibility need Fernando), plus `data` and `prod_facing`.

Score: size 2 + complexity 3 + importance 2 = 7, level full. Five checkpoints (six if W3 were not already the adversarial wave):

| Id | Kind | Sits at | Holds (`gates`) |
|---|---|---|---|
| CP-01 | wave | after W1 | slices that depend on W1 work, and promotion of W1 work |
| CP-02 | wave | after W2 | slices that depend on W2 work, and promotion of W2 work |
| CP-03 | adversarial | after W3 | slices that depend on W3 work |
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
| D13 | What a wave checkpoint covers (H-10) | (a) Only the wave it sits after. Recommended: a later wave checkpoint re-reviews earlier waves, but holding their dependents twice would rebuild the lock | (b) every finished wave | pre-approved |
| D14 | `covers` form | (a) The wave id, plus a `wave` tag on each READINESS slice written by `decide --write`. Recommended: wave task ids are not always slice ids, and the tag fails loud when missing | (b) list slice ids in `covers` directly | pre-approved |
| D15 | Release and promotion | (a) `gate --action release` also needs every `promotion` gate. Recommended: a release publishes all the work | (b) release checks only `release` gates | pre-approved |
| D16 | Merge and wave verdicts | (a) Wave checkpoints do not hold the merge; pre-merge does. Recommended: follows the contract; the run still closes only on all PASS | (b) merge needs every checkpoint | pre-approved |
| D17 | Blocked and unknown at once | (a) Exit 2, listing the unknowns too. Recommended: the block is certain either way | (b) exit 1 | pre-approved |
| D18 | Old `phase` checkpoint | (a) Coverage unknown, so a dependent start is exit 1 until plan-it is re-run. Recommended: its `at` names only the lock task, and guessing the rest is what fail-loud forbids | (b) treat the slices before the lock in list order as covered | pre-approved |
| D19 | A checkpoint and the work it covers (H-21) | (a) A checkpoint never holds the start of the work it covers; it holds slices outside it that depend on it, and the promotion of the covered work. Recommended: the review runs after the covered work ends, so holding that work's own slices is a deadlock | (b) hold covered slices that depend on other covered slices until a partial review; rejected, there is no partial review to wait for | pre-approved |

## 9. Not done here

- review-it is not changed (D8).
- No branch is pushed or merged, and no version is bumped.
- The do-it 1.0.1 package shape in section 7 is an assumption until the 1.0.1 scope is fixed.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
