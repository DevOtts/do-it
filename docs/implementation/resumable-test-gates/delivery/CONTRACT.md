# CONTRACT: resumable-test-gates

**Version:** v1.1 · 2026-11-06 · run `resumable-test-gates` (do-it run r-20261106-130657-7ff2) · final, ratified by Fernando Ott at G4 on 2026-11-06
Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

**Pinning:** grounded on DevOtts/do-it `origin/main` d38cedbee0e3e63e8c03b1e51f7ac2bbec4bfb71 (do-it 1.0.5). The pilot
consumer's shas are in `research/` (evidence only). Release: **do-it 1.2.0**, built on top of 1.1.0 (the peer plan
`docs/implementation/do-it-1.1/`, TRUST + harness-status-tracking); the build branches from `main` after 1.1.0 merges.

This is the law for every squad and for the build. Explanation lives in `docs/02` and `docs/03`. Rulings D1 to D5 and
defaults R1 to R24 are in `DECISIONS.md`. Cross-cutting findings fold back as dated amendments (v1.0 to v1.1).

## 1. Vocabulary

- **Gate results store** (the README's "ledger"; R1): the append-only per-repository file set under
  `{git-common-dir}/do-it/gate-results/`. Never called "ledger" in code, schema or CLI.
- **Row**: one JSON line of `results.jsonl`. **Fold**: the per-file state computed from rows (model M1).
- **Key**: `sha256` of the `rtg-key/1` manifest of one test file. **Component**: one manifest line group (gate, runner,
  core, installed, env, platform, class, tree, dep).
- **Scope** (R2): `edit` (D1 T0), `push` (T1), `train` (T2), `nightly` (T3). Inside do-it, T1/T2/T3 mean model tiers only.
- **Composed verdict**: a verdict where at least one file's PASS was reused from an earlier run. **Fresh verdict**: none
  reused. **Clean run**: a run that reads no rows (`--clean`, always for `nightly`).
- **NEVER set**: files matching `gates.reuse.always_run` or `gates.reuse.never_reuse`; always run fresh.
- **Queue**: the per-machine admission primitive `do-it gate queue`. **Holder**: an admitted gate. **Ticket**: a waiter.
- **Train**: the set of planned slices of one do-it run. **Train complete**: R12.

## 2. Schemas

**2.1 Row** `do-it-gate-result/1` (`core/schemas/gate-result.1.schema.json`, embedded by `build.mjs`). Fields:
`schema` (const), `type` (enum `start|finish|run_start|run_end|clean`), `run_id` (pattern `^g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}$`),
`at` (ISO UTC), `file` (repo-relative POSIX, absent on run rows), `leg` (string, default `unit`), `scope` (enum §4),
`key` (64 hex, finish/start), `components` (object: gate, runner, core, installed, env, platform, deps as 64 hex;
`class` enum `NARROW|WIDE`; `tree` 64 hex when WIDE), `result` (enum `PASS|FAIL|SKIPPED|DESELECTED`, finish only),
`retried` (bool), `counts` {passed, failed, skipped, pending} (pending = jest `todo` or pytest xfail) (integers), `exec_error` (bool), `duration_ms` (integer),
`failure_ref` (string or null, `failures/{sha256}.txt`), `clean` (bool), `tree_dirty` (bool), `tainted` and `reason`
and `verdict` (run_end only), `crc` (16 hex). `additionalProperties: false`. Serialized size ≤ 4096 bytes.
`crc` = first 16 hex of sha256 over the spine `canonicalJson` of the row without `crc`; the Python plugin reproduces it
with `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.

**2.2 Key manifest** `rtg-key/1`: UTF-8, LF, tab-separated, header line `rtg-key/1` then lines sorted by UTF-8 byte
order: `gate`, `runner {name}@{version} {argv-sha}`, `core`, `installed`, `env {NAME} {hmac|-|*}` per declared name and
env file, `platform`, `class`, `tree` (WIDE only), `dep {path} {sha256|-}` per closure member. File hash = sha256 of raw
bytes; symlinks hashed through the target with the repo-relative realpath recorded; missing = `-`. HMAC key = 32 bytes in
`gate-results/.salt`, mode 0600. The `gate` component = sha256 of the adapter, fingerprint and store source files, never
a hand-bumped integer.

**2.3 CORE set**: runner config files; every module the config references (setupFiles, setupFilesAfterEnv, globalSetup,
globalTeardown, reporters, transformer, testEnvironment) with its closure; `tsconfig*.json`; every `conftest.py`;
`**/__mocks__/**`; vitest `forceRerunTriggers`; `gates.reuse.core` globs; the gate code. Any CORE change changes every key.

**2.4 Settings** `gates` block (in `settings.schema.json` and `SETTINGS_DEFAULTS`, every leaf null or empty):
`on_push`, `on_train_complete`, `nightly` (string or null); `peak_mb` (integer ≥ 1 or null); `reuse.core`,
`reuse.always_run`, `reuse.never_reuse`, `reuse.env`, `reuse.env_files` (arrays of strings); `queue.budget_pct`
(1–90, default 60), `queue.timeout_s` (≥ 1, default 14400), `queue.swap_used_max_mb` (integer or null). `queue.*` is read
from the global layer only.

**2.5 Queue files** under `{HOME}/.do-it/queue/`: `.lock/` (mkdir lock, `owner.json`), `seq` (monotonic counter),
`tickets/{seq}-{pid}.json` and `holders/{seq}-{pid}.json` with `{seq, pid, pid_start, pgid, cwd, repo, label, peak_mb,
enqueued_at, admitted_at}`. Liveness = `process.kill(pid, 0)` succeeds AND the process start time equals `pid_start`.

**2.6 Train verdict** `runs/{run_id}/gate-train.json`: `{tree_sha, branch, verdict_line, source_runs[], at}`; finish-line
row id `gate-train:{run_id}`.

## 3. Interface contract

| Command | Run-bound | Does | Exit |
|---|---|---|---|
| `do-it gate run --scope S --runner R [--resume] [--clean] [--leg L] [--json] -- argv` | no | select, skip reusable files, run, write rows, print one verdict line (§4.3) | 0 pass, 1 fail, 3 blocked |
| `do-it gate results [--why FILE] [--json]` | no | print folds; `--why` names the changed component | 0 |
| `do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command` | no | admit (R13), run the command in its own process group, clean up, release | command's exit, or 3 on WAIT_TIMEOUT |
| `do-it gate queue --status` | no | print holders and FIFO with reasons | 0 |
| `do-it gate train [--run ID]` | yes | R12 detection; run `gates.on_train_complete` under the queue in a scratch worktree at the target SHA; write §2.6 | 0, 1, 3 (TRAIN_INCOMPLETE) |
| `do-it gate nightly` | no | run `gates.nightly` under the queue (implies clean) | 0, 1, 3 |
| `do-it gate schedule --print` | no | print launchd plist and crontab text for `nightly`; never installs | 0 |

`--resume` and `--clean` are added to `BOOL_FLAGS` (`cli.mjs:29`). `--resume` with `--clean` is a usage error. Existing
`gate verify|conclude|advance|build|stop|route|ceiling` are unchanged. Adapter files: `core/gates/adapters/jest/`
(`reporter.cjs`, `filter.cjs`, `closure.cjs`), `core/gates/adapters/pytest/do_it_gate.py`,
`core/gates/adapters/vitest/reporter.mjs`. Adapters write rows only through the documented row format and read the
store only to decide skips; the spine computes core, installed, env and platform components and passes them to the
adapter in a manifest file named by `--manifest` (jest/vitest) or `--do-it-manifest` (pytest).

## 4. Enums and constants

- 4.1 Scopes: `edit, push, train, nightly`. Row types and results: §2.1.
- 4.2 Fold states: NEVER_RUN, RUNNING, PASS, FAIL, SKIPPED, FLAKY, KILLED, SUSPECT_KILLER, UNSTABLE_UNDER_REUSE,
  EXPIRED, CORRUPT.
- 4.3 Verdict tokens: `[COMPOSED {scope}: …]`, `[FRESH {scope}: …]`, `[FAIL {scope}: …]`, `[skip] {stage}: no gate
  declared`, `[WAIT-TIMEOUT] gate-queue: …`. Composed and fresh lines carry: files passed/total, reused count, number of
  source runs, oldest reused timestamp, ran-now count, skipped count, flaky-excluded count, `run=` id, and the dirty
  suffix ` · for WORKING TREE (dirty), not {sha}` when R11 applies. A bare `[OK]` is never printed by `gate run`.
- 4.4 Outcomes (`--json`): GATE_PASS_COMPOSED, GATE_PASS_FRESH, GATE_FAIL, GATE_SKIP_NO_GATE, GATE_WAIT_TIMEOUT,
  GATE_INTERRUPTED, TRAIN_INCOMPLETE.
- 4.5 Constants: reuse TTL 24 h or since the last clean run, whichever is shorter (R9); FLAKY clears after 2 consecutive
  passes (R18); UNSTABLE lasts 7 days (R18); SUSPECT_KILLER after 2 kills on one key; queue poll 2 s; swap-out window
  5 s; default budget 60% of RAM; default queue timeout 14400 s; row ≤ 4096 bytes.
- 4.6 WIDE patterns (Node): `readFileSync|readdirSync|glob|execSync|spawnSync|execFileSync|child_process|git `;
  (Python): `open(|subprocess|Path(|glob|os.listdir`.

## 5. Repo ownership and branch conventions

| Lane | Squad | Owns (only these paths) | Branch |
|---|---|---|---|
| store | SQ-A1 | `core/spine/src/gate-results.mjs`, `gate-fingerprint.mjs`, `core/schemas/gate-result.1.schema.json`, `core/spine/test/g1/**` | `epic/L1-store`, `epic/F1-fingerprint` |
| verdict | SQ-A2 | `core/spine/src/gate-run.mjs`, `gate-verdict.mjs`, `core/spine/src/cli.mjs` (gate subcommand table), `core/spine/test/g2/**` | `epic/V1-gate-run`, `epic/V2-clean-flaky` |
| adapters | SQ-B | `core/gates/adapters/**`, `core/gates/tests/**`, the mirror-manifest row for `core/gates` | `epic/A1-jest`, `epic/A2-pytest`, `epic/A3-vitest` |
| queue | SQ-C | `core/spine/src/gate-queue.mjs`, `gate-signals.mjs`, `core/spine/test/g3/**` | `epic/Q1-admission`, `epic/Q2-cleanup` |
| stages | SQ-D | `core/spine/src/settings.mjs`, `init.mjs`, `core/schemas/settings.schema.json`, `core/spine/src/gate-train.mjs`, `gate-schedule.mjs`, `core/pipelines/{feature,drain}.yaml` and their tests, `core/spine/test/g4/**`, do-it `docs/03-data-model-and-contract.md` | `epic/S1-settings`, `epic/S2-stages` |

`cli.mjs` is edited only in the verdict lane: V1 adds the subcommand table with all six entries dispatching to
`gateRunCmd`, `gateResultsCmd` (verdict lane), `gateQueueCmd` (queue lane), `gateTrainCmd`, `gateNightlyCmd`,
`gateScheduleCmd` (stages lane). After any `core/spine/src` change: `node core/spine/build.mjs` then
`node scripts/sync-mirror.mjs --write`. do-it work branches from `main` of DevOtts/do-it. Adoption by a consumer repo is
that repo's own program, built against the frozen 1.2.0 CONTRACT (R3).

## 6. Fallbacks (capability missing)

- No store, unreadable store, CRC failure, resolver crash, unresolved repo-local import, unknown component: the file
  runs (G-1).
- Adapter missing for the runner: `gate run` runs the runner unchanged, writes no rows and prints a `[FRESH …]` line
  with `reuse unavailable: no adapter`.
- Memory signals unreadable (unknown OS, sysctl error): budget-only admission with
  `[gate-queue] memory signals unavailable: budget-only admission`.
- vitest module-graph walk throws: that file is never reusable in this run.
- Python missing for the pytest plugin, or plugin import error: pytest runs unchanged; no rows.

## 7. Definition of shipped

An epic ships when 100% of its Test Contract passes with evidence, `gate-check handoff` and `adversary` are clean, the
bundle builds (`node core/spine/build.mjs`) and the mirror is in sync (`node scripts/sync-mirror.mjs --check` exit 0),
and no case tagged `[REAL]` passed on a mock. A `[REAL]` case whose target is unreachable is IMPLEMENTED-NOT-VERIFIED.

## 8. Core-logic models

Full tables in `docs/03` §6; frozen here.

**M1 result-row fold.**
NEVER_RUN --> RUNNING --> PASS
RUNNING --> FAIL ; RUNNING --> SKIPPED ; RUNNING --> FLAKY (retried pass) ; RUNNING --> KILLED (owner dead, no finish)
KILLED --> NEVER_RUN (resume) ; KILLED --> SUSPECT_KILLER (second kill on one key)
PASS --> NEVER_RUN (key changed) ; PASS --> EXPIRED (TTL) ; EXPIRED --> NEVER_RUN
PASS --> FLAKY (fail on same key) ; FAIL --> FLAKY (pass on same key) ; FAIL --> NEVER_RUN (fix changes key)
FLAKY --> PASS (two consecutive passes) ; PASS --> UNSTABLE_UNDER_REUSE (clean run disagrees) ; UNSTABLE_UNDER_REUSE --> PASS (7 days and two clean passes)
CORRUPT --> NEVER_RUN (row ignored)

**M2 gate run.**
QUEUED --> ADMITTED --> SELECTING --> RUNNING --> COMPOSING --> PASSED
COMPOSING --> FAILED ; SELECTING --> FAILED (fallback cannot start)
RUNNING --> INTERRUPTED (signal, kill, OOM, tool timeout) ; INTERRUPTED --> RESUMED (next resume) ; RESUMED --> RUNNING

**M3 queue ticket.**
WAITING --> ADMITTED --> RELEASED
WAITING --> WAIT_TIMEOUT (never started, exit 3, retryable) ; WAIT_TIMEOUT --> WAITING (caller retries)
WAITING --> REJECTED (peak above budget)
ADMITTED --> RECLAIMED (holder dead or start time differs) ; RECLAIMED --> RELEASED

**M4 train gate.**
TRAIN_OPEN --> TRAIN_INCOMPLETE ; TRAIN_INCOMPLETE --> TRAIN_OPEN (after merges)
TRAIN_OPEN --> TRAIN_GATING --> TRAIN_PASSED
TRAIN_OPEN --> TRAIN_SKIPPED (no gate declared)
TRAIN_GATING --> TRAIN_FAILED ; TRAIN_FAILED --> TRAIN_GATING (retry after fix, resume) ; TRAIN_FAILED --> ESCALATED (review cap reached)

**M5 store compaction.**
COMPACTING --> COMPACTED
COMPACTING --> COMPACTION_ABORTED (crash or lock lost) ; COMPACTION_ABORTED --> ROLLED_BACK (old file kept, temp removed) ; ROLLED_BACK --> COMPACTING (retry)

Required failure coverage: FAIL, FAILED, WAIT_TIMEOUT, REJECTED, TRAIN_FAILED, ESCALATED, COMPACTION_ABORTED and
ROLLED_BACK each asserted as an outcome, and the five cascade classes covered.

## 9. Governance rules

- G-1 Every error path fails toward running more: no row, corrupt row, resolver crash or unknown component means the file runs (test: T-L1-04).
- G-2 A finish row is PASS only under the PASS predicate (no exec error, zero failures, no failure message, at least one passed case) (test: T-A1-02).
- G-3 A FAIL on a key blocks reuse until two consecutive passes on that key; latest-wins is forbidden (test: T-V2-02).
- G-4 `gate run` never prints a bare `[OK]`; every verdict names reused and fresh counts, source runs and the oldest reused timestamp (test: T-V1-04).
- G-5 A clean run reads no rows, rewrites the folds and flags UNSTABLE_UNDER_REUSE on disagreement (test: T-V2-01).
- G-6 Env values never appear in rows, logs, verdicts or failure side files; only salted HMACs (test: T-F1-08).
- G-7 A CORE change changes every key (test: T-F1-03).
- G-8 Keys use repo-relative paths; identical bytes and installed state in two worktrees give identical keys (test: T-F1-05).
- G-9 A run on a dirty tree never writes a tree or commit stamp and says so in its verdict (test: T-V1-08).
- G-10 A gate never runs without admission; a wait past the timeout ends in WAIT_TIMEOUT with exit 3 (test: T-Q1-03).
- G-11 The queue ends its gate's process group and descendants by PID on pass, fail or signal, never by name pattern (test: T-Q2-01).
- G-12 A holder whose PID is dead or whose start time differs is reclaimed at the next admission check (test: T-Q1-04).
- G-13 A project with no `gates` block runs every stage with a visible `[skip]` and exit 0 (test: T-S1-01).
- G-14 Train completeness keys on merged ancestry or an owner `train-closed` answer, never on slice DONE (test: T-S2-02).
- G-15 Gate modules keep the spine zero-dependency: `node:` and relative imports, unique top-level names, bundle builds (test: T-L1-10).
- G-16 NEVER-set files run fresh in every gated run (test: T-F1-06).

## RUN-POLICY
| Role | Tier | Reason |
|---|---|---|
| planner | T1 | crown jewels: fingerprint and invalidation, composed-verdict honesty, queue admission |
| squads-drafting | T2 | spec'd PRD and epic drafting: adapters, stages |
| mechanical | T3 | lint, render and count passes |
| builder | T2 | implementation against the Test Contract; escalate to T1 on struggle |
| verifier | T2 | never the builder |
| conductor | T2 | thin dispatcher; never the top model |
Escalation: one tier up per slice, once, logged; L1, F1, V1, V2, Q1 and Q2 builders start at T1 (crown jewels). Tier changes only at a spawn or stage boundary.
Worktrees: reap-on-merge, a squad's worktree and branch are removed once its work is merged and captured on disk. Delivery: every worker writes results to disk and ends with a content-bearing final message; a worker that goes idle without files is re-dispatched (idle is not delivered). Heavy gates: never run a test suite or gate outside `do-it gate queue` once Q1 ships; before that, one heavy gate per machine.

## 11. Amendments folded from squads (v1.1)

Each amendment overrides the section it names; where §1–§9 and this section disagree, this section wins.

- **A1 selection protocol (§3; SQ-A2 AM-1, SQ-B AM-1, adjudicated).** The spine alone folds and decides reuse; adapters
  never read the store to decide skips. One runner invocation: (1) `gate run` writes the run directory
  `{os.tmpdir()}/do-it-gate-{run_id}/` with `manifest.json` (`rtg-manifest/1`, schema
  `core/schemas/gate-manifest.1.schema.json`, store lane); jest and vitest find it through the do-it-internal env var
  `DO_IT_GATE_MANIFEST` (jest rejects unknown argv), pytest through `--do-it-manifest`; (2) inside the runner's own
  selection hook (jest `--filter`, pytest `pytest_collection_modifyitems`, vitest `select.mjs` pre-run helper) the
  adapter computes the per-file `class` and `dep` lines and writes `keys.json`; (3) the adapter calls the internal
  subcommand `do-it gate decide --run-dir D` synchronously; it writes `run-list.json`; any decide error, timeout or
  missing file means the adapter runs every file (G-1); (4) the adapter runs only `run-list.json` files, writes rows and,
  at exit, `runner-report.json`; (5) the spine composes. The spine independently recomputes the gate, core, installed,
  env and platform components (and the tree for WIDE) before any reuse. For Python, `installed` and `platform` are
  computed by the spine by spawning the project's interpreter with `-I` (SQ-B AM-5 rejected).
- **A2 descriptors and mirror (§3, §5).** Each adapter ships `core/gates/adapters/{runner}/adapter.json` (adapters lane),
  read by `gate run`. The mirror row's source is `core/gates/adapters` (fixtures under `core/gates/tests` are not shipped).
- **A3 fold placement (§5).** `gateFold(rows, keyNow, now, opts)` lives in `gate-results.mjs` (store lane, L1) as a pure
  function over every M1 transition; `gate-verdict.mjs` (V1, V2) imports it. V1/V2 cases exercise it through `gate run`.
- **A4 rows (§2.1).** `run_start` carries `pid` and `pid_start`; at most one `start` and one `finish` per
  (file, leg, run), and the fold de-duplicates on (type, run_id, file, leg); an interrupted run is not tainted —
  `tainted:true` only for unhandled errors, force-exited workers or open-handle kills; rows of an interrupted run
  (`run_end` verdict GATE_INTERRUPTED, or no `run_end` and a dead owner) are reusable only under `--resume`, never from a
  run whose owner is alive; a `clean` row marks a completed clean run and its start is the TTL horizon.
- **A5 fold rules (§8 M1).** A clean PASS counts as one pass toward the two-consecutive rule (it does not jump FLAKY or
  FAIL straight to PASS); FLAKY is file-sticky for 7 days across a key change; a CORRUPT row voids every earlier PASS of
  the file it can be attributed to, or of every file when it cannot be attributed, and compaction keeps corrupt lines; the
  env token `*` (present but unhashable) makes the file not reusable.
- **A6 store layout (§2).** Adds compaction `base`/segment files, `closures/{sha256}.json` closure sidecars (for `--why`
  and vitest pre-run decisions), `components/` digests and `tmp/`; the blob memo is bypassed for assume-unchanged and
  skip-worktree files and disabled when `.gitattributes`, `core.autocrlf` or any `filter.*` config exists.
- **A7 CLI (§3; SQ-C A5, SQ-D A-2/A-4).** `cli.mjs` gains a `--` separator (everything after it is passed through
  verbatim) and `status` joins `BOOL_FLAGS`. The verdict-lane subcommand table has eight run-free or run-bound entries:
  `run`, `results`, `decide` (internal), `queue`, `push`, `train`, `nightly`, `schedule`. `do-it gate push` runs
  `gates.on_push` under the queue or prints `[skip] on_push: no gate declared` (stages lane). `do-it gate train
  --check-tree SHA` exits 0 only when the recorded TRAIN_PASSED tree equals SHA. Train outcomes add TRAIN_PASSED,
  TRAIN_FAILED, TRAIN_SKIPPED, TRAIN_BLOCKED, TRAIN_TREE_MISMATCH; queue outcomes add GATE_QUEUE_REJECTED (exit 1,
  `[REJECTED]` line) and QUEUE_SETTINGS_INVALID (exit 1); a command that cannot start exits 127 from `gate queue` only (see A14).
- **A8 queue (§2.5, §4.5; SQ-C A1–A4, A6, A7).** A gate with no declared peak is exclusive (reserves the whole budget,
  runs alone; this replaces heavy-gate's conductor HOLD file, which the queue does not honour — default R24). Swap-out
  "about zero" = at most 1 MB/s over the 5 s window; SIGTERM-to-SIGKILL grace 10 s; an unchanged status line is reprinted
  at most once a minute. Tickets add `reason` and `checked_at`; seq is zero-padded to 10 digits; damaged entries move to
  `corrupt/`. The queue sets the do-it-internal env var `DO_IT_GATE_HOLDER` on its child; `gate run` and a nested
  `gate queue` that see a live holder above them run as `admission: inherited`; otherwise `gate run` admits itself
  in-process through the queue lane's exports `gateQueueAdmit` and `gateQueueHeldBySelf`. The process start-time helper
  `gateProcStart(pid)` lives in `gate-signals.mjs` (queue lane) and the store lane imports it. Until S1 merges, Q1 reads
  `gates.queue` from the global settings file directly; S1 keeps that behaviour (stored defaults null; effective values
  60 and 14400 come from one helper).
- **A9 nightly is enforced clean (§3; SQ-D A-5, adjudicated).** `gate nightly` sets `DO_IT_GATE_SCOPE=nightly` on its
  child; a `gate run` that inherits it runs clean whatever its flags (G-5) and warns when the project command lacks
  `--clean`.
- **A10 (moved out, 2026-11-06, R3).** The consumer-adoption amendment moved with PRD-6 and its epics to the pilot
  consumer's own program; do-it names no consumer. The rules it set for hooks (fail closed when do-it is absent, re-enter
  under `do-it gate queue`, no new env var) are the consumer's to keep.
- **A11 do-it test switches (R19).** do-it-internal test-only env names: `DO_IT_GATE_SIGNALS`, `DO_IT_GATE_ADAPTERS`,
  `DO_IT_REAL_JEST`, `DO_IT_REAL_PYTHON`, `DO_IT_REAL_VITEST`; a `[REAL]` case whose runner is absent reports
  IMPLEMENTED-NOT-VERIFIED.

- **A12 coordination with do-it 1.1 (conductor, 2026-11-06).** 1.1 edits `core/spine/src/stopgate.mjs`, `state.mjs`,
  `cli.mjs` and `finish-line.mjs` (finish-line rows gain `run_id`) and adds no settings key; `gates` is this package's.
  1.1 epic E1 also edits `core/schemas/settings.schema.json` and `core/spine/src/settings.mjs`: `state` keeps `backend` plus
  one options object keyed by the backend name, validated by the host, and the `engine` default leaves the core. This
  package adds only the root key `gates` (with `gates.queue.*`, global layer only) and nothing under `state`, so the two
  fit; S1 rebases those two files on 1.1 (checked 2026-11-06).
  The built bundle `core/spine/do-it.mjs` and its plugin mirror are never merged by hand: after every merge, rebuild with
  `node core/spine/build.mjs` and `node scripts/sync-mirror.mjs --write`, and commit the regenerated files. S2 uses 1.1's
  finish-line `run_id` when present instead of encoding the run in the row id. Readiness checkpoint `gates` and run-state
  `state.gates.build` (existing, `readiness.mjs:89,119,197`) are lifecycle gates, unrelated to the settings `gates` block.
- **A13 train outcomes (SQ-D).** `gate train --check-tree` refusals are TRAIN_NOT_PASSED (no TRAIN_PASSED record) and
  TRAIN_RECORD_MISMATCH (record tree differs from the deploying tree), both exit 3; with TRAIN_TREE_MISMATCH reserved for
  a scratch-worktree tree that does not equal the target SHA.

- **A15 host-agnostic core (owner ruling, do-it 1.1 DECISIONS R3, 2026-11-06).** do-it names no consumer project. PRD-6, its epics E1/E2,
  squad SQ-E, A10's content and governance rules 17 and 18 left this package for the pilot consumer's program. The gate mechanism stays
  generic: `gate run`, `gate queue`, the `gates` block, the T2 stage and the T3 nightly. Anything that must know a specific
  harness at runtime lives under `hosts/<name>/` (do-it 1.1 G-9). Rules 17 and 18 are retired, not renumbered (WAIVED: moved to the pilot program).

- **A14 runner start failure (conductor ruling, 2026-11-06).** §3 wins over A7 for `gate run`: when the runner cannot
  start, `gate run` exits 1 with GATE_FAIL and the verdict line names the reason, for example `runner did not start:
  exit 127`. Exit 127 stays the child's code, reported inside the verdict and never passed through by `gate run`.

## 12. Changelog
- v1.1 2026-11-06 (owner G4): plan approved in full with A15; OQ-1 to OQ-4 take their recommendations; A14 kept; contract final.
- v1.1-draft 2026-11-06 (owner ruling, do-it 1.1 R3): A15 host-agnostic core; PRD-6, E1/E2, SQ-E, A10 content, rules 17 and 18 moved to the pilot consumer's program.
- v1.1-draft 2026-11-06 (final draft): A14 runner start failure (conductor ruling).
- v1.1-draft 2026-11-06 (later): A12 coordination with do-it 1.1, A13 train outcomes; pinned to origin/main d38cedb; release 1.2.0.
- v1.1-draft 2026-11-06: squad amendments A1 to A11 folded; default R24 added (Fernando Ott ratifies at G4).
- v1.0-draft 2026-11-06: frozen from docs/01 to docs/06 for squads; rulings D1 to D5 applied; defaults R1 to R23 recorded for G4 (Fernando Ott ratifies).
