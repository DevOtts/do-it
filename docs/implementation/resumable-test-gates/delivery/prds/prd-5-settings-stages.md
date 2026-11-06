# PRD-5 — Settings block and pipeline stages (lane: stages, squad SQ-D)

**Version:** v1.0-draft · 2026-11-06 · run `resumable-test-gates` · epics S1 (W2) and S2 (W3)
Where this PRD and CONTRACT.md disagree, CONTRACT.md wins. Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn ruling (owner rulings D1 to D5 are in `DECISIONS.md`; the PRD-local decisions below are written PD1..PD16 so they never collide with them).

## 1. Summary

do-it learns WHEN a project's tests must run (on push, when a train of slices is complete, nightly) and records the verdict. The
project keeps WHAT runs: an optional `gates` block in `.do-it/settings.json`. This PRD covers the two pieces that make that
real: S1, the `gates` settings block with visible skips; and S2, the train stage (`do-it gate train`), the push and nightly stages
(`do-it gate push`, `do-it gate nightly`), the schedule printer (`do-it gate schedule --print`) and the two pipeline edits (`feature.yaml`,
`drain.yaml`). Rulings behind it: D1 (four scopes), D3 (do-it owns the trigger, the project owns the command, key is `gates`),
D4 (a gate never runs without a slot), R11 (dirty tree and scratch worktree), R12 (train complete = merged ancestry or an owner
answer, never slice DONE), R14 (queue timeout and global-only `queue.*`), R15 (print, never install), R20 (block additions).

## 2. Problem and goals

Today a settings file containing `gates` fails validation (`SETTINGS_INVALID ... /gates is not an allowed property`) because
the schema root has `additionalProperties: false` (`core/schemas/settings.schema.json:5`, research/01 §2.2 #14), and
`--set gates.x=y` fails with `SETTINGS_UNKNOWN_KEY` because `--set` accepts only default leaves (`core/spine/src/settings.mjs:160-162`).
There is no train stage: the `feature` pipeline goes `review` straight to `deploy` (`core/pipelines/feature.yaml:33-44`), the
spine has no "merged" notion (`record.mjs:341-365` sets slice `DONE` on a recorded result, not on a landed PR; research/01 §2.3 #23),
and no recurring scheduler exists (research/01 §2.7 #34).

Goals:
1. A project with no `gates` block behaves exactly as today and every gate stage prints a visible `[skip] {stage}: no gate declared` (G-13, README T-11).
2. `gates` is a real, validated, `--set`-able, `doctor`-visible block whose leaves default to null or empty (R20).
3. The train gate fires from the plan's own state, gates the integrated tree in a scratch worktree, and deploy proceeds only for that gated tree (R11, R12).
4. A failing train is recoverable (retry after a fix resumes), bounded (review cap escalates into the owner pack) and honest (a queue wait timeout is a park-and-wake, never a red test).
5. The nightly clean run and its schedule exist as printed text; installing the schedule stays an owner action (R15).

Non-goals: the queue, the store, the verdict printer and the runner adapters (other lanes); any consumer repository change; installing launchd or crontab entries; a recurring scheduler inside do-it.

## 3. Users and jobs

| User | Job | What they must see |
|---|---|---|
| Project owner (Fernando) | declare once what "the tests" are for this repo, without do-it assuming any | `doctor` lists `gates.*` leaves as null and says which stages will skip |
| do-it conductor (an agent) | know when the last slice has landed and run the heavy gate once | `TRAIN_INCOMPLETE` naming the slices not merged, or `TRAIN_PASSED` with a tree SHA |
| Deploy step | ship only what was gated | a refusal when the tree differs from the gated tree |
| Owner at the pack | decide when a train keeps failing | an `ESCALATED` question naming the run, the rounds and the last verdict line |
| Unattended run | survive a long queue wait | `[WAIT-TIMEOUT]` turned into a parked run with a wake, not a failure |
| Owner scheduling nightly | get a clean full run every night | `gate schedule --print` output to paste, never an installed job |

## 4. Solution design

### PD1. The `gates` block shape (S1)
`gates` is a new root property of `settings.schema.json` with `additionalProperties: false` and exactly the leaves of
CONTRACT §2.4: `on_push`, `on_train_complete`, `nightly` (`["string","null"]`, minLength 1 when a string); `peak_mb`
(`["integer","null"]`, minimum 1); `reuse.{core,always_run,never_reuse,env,env_files}` (arrays of strings); `queue.budget_pct`
(`["integer","null"]`, 1 to 90), `queue.timeout_s` (`["integer","null"]`, minimum 1), `queue.swap_used_max_mb`
(`["integer","null"]`, minimum 0). Everything stays inside the validator subset: type (arrays allowed, as `host.alias` already
does at `settings.schema.json:21`), minimum, maximum, minLength, items (`core/spine/src/schema.mjs:6-7`; research/01 §2.2 #14).
Cites: CONTRACT §2.4; docs/03 §5; DECISIONS R20.

### PD2. Defaults are null or empty; effective defaults live in a helper (S1)
`SETTINGS_DEFAULTS` (`settings.mjs:6-19`) gains `gates` with all three stage leaves and `peak_mb` null, the five `reuse` arrays
`[]`, and the three `queue` leaves null. That is what makes `--set gates.on_push=...` legal (`settings.mjs:160-162`;
research/01 §2.2 #13) and makes `doctor` show `gates.on_push = null (default)`. CONTRACT §2.4 says "every leaf null or empty" and
also "default 60 / 14400" for two queue leaves; PD2 reconciles them: the stored default is null, and the exported helper
`gatesQueueSettings` returns the effective 60 and 14400 when a leaf is null (so the owner-visible `doctor` row still says
"null (default)", and the queue never sees null). Adopted as CONTRACT v1.1 A8 (stored defaults null; effective 60 and 14400 from one helper).

### PD3. One stage resolver, one visible skip line (S1)
`gatesStage(values, stage)` (new export in `settings.mjs`, unique name for the bundler, `core/spine/build.mjs:44-47`) returns
`{stage, declared, command, line}` where `line` is exactly `[skip] on_push: no gate declared` (token from CONTRACT §4.3) when the
leaf is null (an empty string never reaches the resolver: the schema minLength 1 rejects it). Consumers: `do-it doctor` (new `gate_stages` array), `do-it gate train`, `do-it gate nightly`,
and, by CONTRACT v1.1 A7, the new `do-it gate push` (PD17). G-13 and README T-11 are tested against the resolver and its four consumers.

### PD4. `queue.*` is honoured from the global layer only (S1)
`gatesQueueSettings(ctx, loaded)` reads the global settings file itself (`settingsPaths`, `settings.mjs:90-95`), because the merged
value loses the global one once a workspace overrides it. Only the global file and the defaults are honoured. A leaf
whose merged source in `loaded.entries` is `workspace` or `run-flag` (`settings.mjs:149-171`) is ignored and returned in `ignored[]` with its source so the queue prints
`[gate-queue] ignored gates.queue.{key} from {source} settings: machine queue settings are global-only`. A repository
therefore cannot loosen the machine queue (DECISIONS R14; docs/03 §5). Settings validation still accepts the key in a
workspace file (it is schema-valid); only the value is not honoured.

### PD5. Secret scan interplay (S1)
`settingsScanSecrets` (`settings.mjs:36-58`, run at `:134-142`) flags a string under a key named
`value|token|password|secret|api_key|...`, a known token shape, or an unbroken 32-plus character alphanumeric string containing a
digit and a letter. Consequences, all tested: (a) no `gates` leaf may be named like a secret key (the leaf names are fixed by
PD1; a guard test pins it); (b) a normal command with spaces passes; (c) a spaceless 32-plus alphanumeric `gates.*` command is
rejected with `SETTINGS_SECRET_VALUE` and only the key path is printed (research/01 §2.2 #12, §4 risk 9), documented in
docs/03 §6 as "write the command with a path or a space, or call a script; secrets go through the secrets driver"; (d) env
names under `reuse.env` pass (names, never values; G-6).

### PD6. `init` and `doctor` (S1)
`init` writes a clone of `SETTINGS_DEFAULTS` into a new `.do-it/settings.json` (`core/spine/src/init.mjs:39`), so the new file
carries the null `gates` block and validates at `init.mjs:48`; an existing settings file is not modified (the existing
`secrets` repair path at `init.mjs:40-41` is the only mutation) so `init` stays idempotent. `doctor` already prints every
default leaf through `entries` (`core/spine/src/doctor.mjs:13`), so the twelve `gates.*` leaves appear with source `default`;
S1 adds one field, `gate_stages`, to the doctor result (one-line edit in `doctor.mjs`, outside the CONTRACT §5 stages lane;
CONTRACT v1.1 A7/ruling: `doctor.mjs` joins the stages lane).

### PD7. Train detection keys on merged ancestry (S2; R12, G-14)
Planned slices are `state.json` `slices[]` (seeded from READINESS, `readiness.mjs:149-160`). For each slice: take the newest
recorded result for that `slice_id` under `runs/{run_id}/results/` that carries a non-null `head_sha`
(`core/schemas/it-result.1.schema.json:12`), then run `git merge-base --is-ancestor {head_sha} {branch_ref}`: exit 0 is
merged; exit 1 or any other outcome is not merged (git unreachable counts as not merged, never as merged: G-1 spirit). A
slice with status `DONE` but no `head_sha`, or whose `head_sha` is not an ancestor, is NOT merged. Slice `DONE` is never read
as merged (research/01 §2.3 #23, §4 risk 10). The train is complete when every planned slice is merged, or when the owner pack
holds a `train-closed` question answered by a reply (`answers.json` row with `source: reply`; a default or recommendation
applied by the pack does not close a train). Incomplete ⇒ outcome `TRAIN_INCOMPLETE`, exit 3, the unmerged slice ids and
reasons listed, the gate command never started (M4).

### PD8. Gate the integrated tree in a scratch worktree (S2; R11)
The target is `refs/remotes/origin/{branch}` when it exists, else the local branch; `branch` is `--branch`, else the remote
default (`origin/HEAD`), else `main`. The gate runs in a detached scratch worktree at `{git-common-dir}/do-it/gate-wt/{short}-{pid}`,
the pattern of a pilot repo's gate runner `:86-103` (`git worktree add --detach`, cleanup on every exit). Files named in
`gates.reuse.env_files` are copied in when they exist (run.sh copies `.env` at `:101`; here only declared names). The checkout's
top-level `node_modules` is linked in when present, and the run is refused with outcome `TRAIN_BLOCKED` (exit 1, no state
change) when the lockfile (`package-lock.json` or `poetry.lock`) differs between the target and the checkout, the same
defect run.sh refuses at `:93-96`. The working tree being dirty is irrelevant: the verdict is for a commit tree, so it never
carries the WORKING TREE suffix (G-9). The worktree is removed on pass, fail and signal.

### PD9. One queue entry; verdict capture (S2)
`gate-train` runs `gates.on_train_complete` by re-invoking its own entry as
`do-it gate queue --peak-mb {gates.peak_mb} --label train:{run_id} -- sh -c "{command}"` with `cwd` = the scratch worktree (CONTRACT §3
and the Q2 single-entry rule: pre-push, train and manual all go through `gate queue`). It never starts the command itself.
Verdict capture: the last output line starting `[COMPOSED train:`, `[FRESH train:` or `[FAIL train:` is the `verdict_line`;
`source_runs[]` are the `run=` ids on that line (CONTRACT §4.3). If the project command prints none (it is not a do-it gate
run), a line is synthesized that is never a bare OK: `[FRESH train: command exit 0 · reuse unavailable: no adapter]` or
`[FAIL train: command exit N]` (CONTRACT §6 wording; G-4).

### PD10. What is written (S2)
`runs/{run_id}/gate-train.json` = `{tree_sha, branch, verdict_line, source_runs[], at}` exactly (CONTRACT §2.6), written with
`atomicWriteJson` (`fs-atomic.mjs`). Two finish-line rows are upserted with `finishLineUpsert` (`finish-line.mjs:27-35`)
and written with `writeFinishLine`: the run-scoped `gate-train:{run_id}` (kind `package`) and the pipeline step row `gate-train`
that `next.mjs:49-59` seeds (kind `wave`). `gate-train:{run_id}` ends `DONE` with evidence `runs/{run_id}/gate-train.json` on
TRAIN_PASSED and TRAIN_SKIPPED, `BLOCKED` with the verdict line as reason on TRAIN_FAILED, and `PARKED` with an owner question
on ESCALATED. The step row `gate-train` is closed (DONE plus the same evidence) only on TRAIN_PASSED or TRAIN_SKIPPED, so
`deploy.needs: [gate-train]` (`next.mjs:59`) holds; on TRAIN_FAILED it stays OPEN so `next` offers the step again after the fix.
`do-it record` is not used: `it-result.1.schema.json:5` lists a closed `stage` enum without a gate stage (research/01 §2.3 #20).
Finish-line is one board per home, not per run (`finish-line.mjs:11-13`; research/01 §4 risk 11), hence the run-scoped id.

### PD11. TRAIN_FAILED, retry, and the review cap (S2; M4)
A non-zero project command is `TRAIN_FAILED` (exit 1). Retry is the same command `do-it gate train`; the project's own gate
(`do-it gate run --scope train --resume`) reuses every file whose key still matches, so only the fix and what it touches
re-run (README T-09 intent). Failed rounds are counted from `gate_train_failed` events in `events.jsonl`
(`appendEvent`, `events.mjs`). The cap is the existing `review.max_rounds` setting (default 3, `settings.mjs:14`): when the
failed-round count reaches it, outcome `ESCALATED` (exit 2), the run status becomes `ESCALATED`, an owner-pack question of
kind `review-cap` is appended with `packAppend` (`pack.mjs:12-36`), and `gate-train:{run_id}` becomes PARKED with that
question. Precedent: `escalateHandoffCap` (`handoff.mjs:79-95`) and the review-loop cap question
(`core/pipelines/review-loop/controller.mjs:25`). No new setting.

### PD12. WAIT_TIMEOUT is park-and-wake, not a red test (S2; G-10, R14)
When the queue returns exit 3 (`[WAIT-TIMEOUT] gate-queue: ...`, the command never started), `gate-train` does not mark the
train failed and does not count a round. It calls the existing park path (`cmdPark`, `park.mjs:19-48`) with
`reason: gate_queue_wait_timeout` and a reset time 1800 seconds ahead, which writes `park.json`, sets the run `PARKED`, and calls
`scheduleWake` (`wake.mjs:16-36`, hook `DO_IT_HOST_WAKE`). Outcome `GATE_WAIT_TIMEOUT`, exit 3, M4 state stays
`TRAIN_OPEN`. Without a wake hook the park prints the existing no-wake text (`wake.mjs:7`). After resume, `do-it gate train`
runs the same detection again and proceeds. The timeout seconds come from `gatesQueueSettings` (global layer only).

### PD13. Deploy proceeds only for the gated tree (S2; M4 rule, OQ-1)
`do-it gate train --check-tree SHA` (CONTRACT v1.1 A7) re-reads `gate-train.json` and the finish-line row,
re-derives the tree of the branch tip with `git rev-parse {ref}^{tree}`, and exits 0 only when the recorded verdict is a
pass or skip, the row agrees, and the three trees match; otherwise exit 1 with outcome `TRAIN_TREE_MISMATCH` (different tree),
`TRAIN_NOT_PASSED` (failed or missing) or `TRAIN_RECORD_MISMATCH` (file and board disagree: tamper). The deploy adapter
(`deploy-it`, a conductor label, `feature.yaml:42`) calls it before shipping.

### PD14. Pipeline edits (S2; research/01 §2.3 #21)
`core/pipelines/feature.yaml`: new step after `review` and before `deploy`: `id: gate-train`, `type: code`,
`adapter: gate-train`, `needs: [review]`; `deploy.needs` changes from `[review]` to `[gate-train]`. `core/pipelines/drain.yaml`:
new step `gate-train` (`type: code`, `adapter: gate-train`, `needs: [execute-waves]`) and `ledger-check.needs` changes from
`[execute-waves]` to `[gate-train]`. `type: code` plus a free-string `adapter` needs no step-type change in the four places that
close the vocabulary (`lint-pipelines.mjs:9`, the host compile guards, `next.mjs:12-13`; research/01 §2.3 #19). No `tier:` field is
added to the step (label collision, research/01 §2.2 #17). Tests: `core/pipelines/tests/pipelines.test.mjs` and `drain.test.mjs`
gain step-order assertions; the plugin mirror `plugins/do-it/pipelines/` is refreshed with `node scripts/sync-mirror.mjs --write`
(`scripts/mirror-manifest.json:8`).

### PD15. Nightly and the schedule printer (S2; R15, D1)
`do-it gate nightly` resolves `gates.nightly` with `gatesStage`; null prints `[skip] nightly: no gate declared` and exits 0;
otherwise it runs the command through `do-it gate queue` in the checkout (no scratch worktree: a nightly runs the repo as it
is), with label `nightly:{repo}`, and exits with the command's exit (0, 1) or 3 on WAIT_TIMEOUT. CONTRACT v1.1 A9: `gate nightly` sets `DO_IT_GATE_SCOPE=nightly` on its child (a do-it-internal marker, not a consumer env var), so any `gate run` inside it runs clean whatever its flags (G-5; enforced in the verdict lane, V2). The stages lane also prints `[warn] nightly: gate command has no --clean; a nightly is meant to run clean` when the declared command lacks the token `--clean`. `do-it gate
schedule --print` writes to stdout a launchd plist (Label `com.devotts.do-it.nightly`, `ProgramArguments` = node, the bundle,
`gate nightly`, `WorkingDirectory` = the repository, `StartCalendarInterval` at 03:00) and a crontab line
(`0 3 * * * cd {repo} && node {bundle} gate nightly`), plus the manual install commands as comments. It spawns no process, writes
no file, touches no `LaunchAgents` directory and never runs `launchctl` or `crontab`.

### PD16. Test seams (S2)
Tests build throwaway git repositories under a sandboxed HOME (`core/spine/test/helpers.mjs:20-32`), stub the queue with a
fixture executable named by the existing `DO_IT_GATE_SIGNALS` seam (R19) only for memory readings, and inject a crash with the
`DO_IT_FAULT` pattern (`fs-atomic.mjs:10-19`). The wake hook is a recording fixture script in `DO_IT_HOST_WAKE`. No new env
var is introduced in product code.

### PD17. `do-it gate push` (S2; D1, A7)
`gatePushCmd` (exported from `gate-schedule.mjs`, run-free like nightly) resolves `gates.on_push` with `gatesStage`. Null prints
`[skip] on_push: no gate declared` and exits 0 (outcome `GATE_SKIP_NO_GATE`, CONTRACT §4.4). Otherwise it runs the command through
`do-it gate queue` in the current checkout with label `push:{repo}` and `--peak-mb {gates.peak_mb}`, and returns the command's exit
(0, 1) or 3 on WAIT_TIMEOUT. It sets no scope marker: the project command carries its own `gate run --scope push`.

## 5. Epics

| Epic | Title | Wave | Depends on | Branch | Cases |
|---|---|---|---|---|---|
| S1 | The gates settings block | W2 | none (reads no other lane; Q1 consumes its helper) | `epic/S1-settings` | 16 |
| S2 | Train and nightly stages | W3 | S1, V1 (dispatch table), Q2 (single queue entry) | `epic/S2-stages` | 18 |

## 6. Acceptance criteria

1. `.do-it/settings.json` with the example block of docs/03 §5 validates; `gates.tiers` and any unknown key fail with `SETTINGS_INVALID`; `--set gates.on_push="..."` works.
2. A project with no `gates` block: `doctor`, `gate train` and `gate nightly` each print their `[skip] {stage}: no gate declared` and exit 0 (G-13).
3. `queue.*` set in a workspace file or by `--set` is ignored and reported; set in the global file it is honoured.
4. A train with one planned slice DONE but not merged prints `TRAIN_INCOMPLETE`, exits 3, and never starts the command (G-14).
5. A complete train runs the declared command through the queue in a scratch worktree at the target SHA and writes `gate-train.json` and the row `gate-train:{run_id}`.
6. A failing train exits 1 as `TRAIN_FAILED`; a fix then a retry reaches `TRAIN_PASSED`; the round that reaches `review.max_rounds` ends `ESCALATED` with a `review-cap` owner question.
7. A queue `[WAIT-TIMEOUT]` parks the run with a wake and counts no failed round.
8. `gate train --check-tree` exits 1 for any tree other than the gated one and for a tampered record.
9. `feature` and `drain` carry the `gate-train` step in the order of PD14; pipeline lint passes; the five presets still load.
10. `gate push` prints `[skip] on_push: no gate declared` when null; `gate nightly` sets `DO_IT_GATE_SCOPE=nightly` on its child; `gate schedule --print` prints a plist and a crontab line and installs nothing.
11. After the epics: `node core/spine/build.mjs` succeeds, `node scripts/sync-mirror.mjs --check` exits 0, docs/03 §5 and §6 describe the block and the stage.

## 7. Risks

- Train detection keyed on slice DONE instead of merged ancestry fires the gate before the PRs land and gates the wrong tree (research/01 §4 risk 10): mitigated by PD7, G-14 and the mutation case T-S2-16.
- Step finish-line rows are not run-scoped (`next.mjs:49-52` seeds `st.id`): two concurrent runs share the `gate-train` step row (research/01 §4 risk 11); the run-scoped row `gate-train:{run_id}` carries the truth and the check-tree command re-reads both. UNKNOWN whether concurrent runs on one home are supported at all.
- `head_sha` is optional in `it-result/1` (`it-result.1.schema.json:12`, type string or null): a builder that never records it makes every train TRAIN_INCOMPLETE until the owner answers `train-closed`. This is the safe direction; the closeout of the plan stage should require `head_sha`. UNKNOWN how often current builders record it.
- The scratch worktree has no installed dependencies: the node_modules link plus the lockfile refusal (PD8) is a design choice, UNKNOWN for monorepos with nested workspaces; the case is `[REAL]` on a real repository only.
- Exit 3 means two things (TRAIN_INCOMPLETE and WAIT-TIMEOUT); callers must read the outcome token, not the exit code alone. Asserted in T-S2-02 and T-S2-09.
- A settings typo in the global file fails every command closed (`loadSettings` throws, research/01 §4 risk 4); correct behaviour (loud), but a pre-push hook shows it as a push failure. T-S1-15 pins the loud behaviour.
- "Nightly implies clean" cannot be enforced from outside the project command (PD15); a nightly without `--clean` would reuse rows. Mitigation: warning plus the clean-run rule in the consumer's own adoption. Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`).
- Queue settings consumed before S1 exists: Q1 is W1 and S1 is W2, so Q1 uses the CONTRACT constants (60, 14400) and S1 provides `gatesQueueSettings`; per CONTRACT v1.1 A8 Q1 reads `gates.queue` from the global settings file directly until S1 merges, and S1 keeps that behaviour.

## 8. Repo and branch plan

Repository: `/Users/macbook/Workspace/Devotts/do-it` (DevOtts/do-it), branches from `main`.

| Lane path (CONTRACT §5) | S1 | S2 |
|---|---|---|
| `core/spine/src/settings.mjs`, `init.mjs` | edit | read only |
| `core/schemas/settings.schema.json` | edit | none |
| `core/spine/src/gate-train.mjs`, `gate-schedule.mjs` | none | new |
| `core/pipelines/feature.yaml`, `drain.yaml`, `core/pipelines/tests/*.test.mjs` | none | edit |
| `core/spine/test/g4/**` | new (`s1-*.test.mjs`) | new (`s2-*.test.mjs`) |
| `docs/03-data-model-and-contract.md` | §6 | §5 and §7 |
| in lane by v1.1 | `core/spine/src/doctor.mjs` (`gate_stages`) | none |
| outside the lane, by ruling | `core/spine/test/s1/s1.test.mjs` only if a snapshot assertion fails | none |

After any `core/spine/src` change: `node core/spine/build.mjs`, then `node scripts/sync-mirror.mjs --write`, then `--check`.
Names added to the bundle are unique by prefix: `gates*`, `gateTrain*`, `gateNightly*`, `gateSchedule*` (`build.mjs:44-47`).
`cli.mjs` dispatch of `gate train|nightly|schedule` is added by V1 (CONTRACT §5); S2 exports `gateTrainCmd`, `gateNightlyCmd`
(from `gate-schedule.mjs`) and `gateScheduleCmd`.

## 9. Amendments adopted (CONTRACT v1.1-draft section 11)

- A8: stored defaults for `queue.budget_pct` and `queue.timeout_s` are null; effective 60 and 14400 come from one helper (`gatesQueueSettings`); Q1 reads the global file directly until S1 merges.
- A7: `do-it gate push` (this lane, `gatePushCmd`), `do-it gate train --check-tree SHA`, train outcomes TRAIN_PASSED, TRAIN_FAILED, TRAIN_SKIPPED, TRAIN_BLOCKED, TRAIN_TREE_MISMATCH; the cli table entry is the verdict lane's. This PRD also uses TRAIN_NOT_PASSED, TRAIN_RECORD_MISMATCH, GATE_WAIT_TIMEOUT and ESCALATED as train outcomes (the last two are named in section 8 and the ruling).
- A9: `gate nightly` sets `DO_IT_GATE_SCOPE=nightly` on its child; `gate run` inside runs clean.
- Ruling: `core/spine/src/doctor.mjs` joins the stages lane; `core/spine/test/s1/s1.test.mjs` may be edited when a settings snapshot fails.
- Still to confirm with the conductor: TRAIN_NOT_PASSED and TRAIN_RECORD_MISMATCH are not in A7's outcome list; they are used here for `--check-tree` refusals.
