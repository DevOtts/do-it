# PRD 2 — Gate run, resume and composed verdict (lane: verdict, squad SQ-A2)

Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn decision (here D1 to D22 are PRD-local design
decisions; owner rulings are cited as "DECISIONS D1" to "DECISIONS D5") — see GLOSSARY.md

Where this PRD and CONTRACT.md disagree, CONTRACT.md wins. do-it code citations are pinned to origin/main `d38cedb`.

Run `resumable-test-gates` (do-it run r-20261106-130657-7ff2), autonomous-draft, 2026-11-06. Tier T1 (crown jewel:
composed-verdict honesty, CONTRACT RUN-POLICY). Lane paths (CONTRACT §5): `core/spine/src/gate-run.mjs`,
`core/spine/src/gate-verdict.mjs`, `core/spine/src/cli.mjs` (gate subcommand table only), `core/spine/test/g2/**`.

## 1. Summary

`do-it gate run` is the command every trigger ends in (pre-push, train, nightly, a manual run). It asks the queue for
admission, lists the files of one leg, computes which files already hold a reusable PASS, runs only the rest through
the runner's adapter, and prints exactly one verdict line that says how the verdict was built: how many files were
reused, from how many earlier runs, how old the oldest reused PASS is, how many ran now, and whether the tree was
dirty. `do-it gate results` prints the per-file folds and, with `--why`, which key component changed. Epic V1 builds
the run, resume and composition; epic V2 adds the safety net that can catch what reuse cannot see: clean runs, FLAKY,
UNSTABLE_UNDER_REUSE, TTL expiry, tainted runs and the quarantine view.

The owner's demand (README header): *"Se o teste tem 700 testes, já rodamos 500 com sucesso e deu um erro, reiniciar
os 500 é um absurdo."* The owner's honesty rule (README §4): a composed verdict says it is composed, never a bare
`[OK]`.

## 2. Problem and goals

Problem (docs/01 §1, §2): a gate is all or nothing. A killed run or a run that fails on one file starts again from zero,
and the pilot's largest gate prints `[OK]`, `[OK-PARTIAL]`, `[OK-RETRIED]` with no record of what was actually observed
(pilot measurement, research/02 §2.1; pre-push hook `:142-164,849-872`).

The danger this PRD exists to prevent: a composed verdict that is green while some file's real state is red. Every
way that can happen is enumerated in §5 (laundering map) and each has a test.

Goals:
1. A run killed after N of M files resumes and runs exactly the M−N files plus the NEVER set (README T-01, DECISIONS D2).
2. A verdict line that cannot hide its sources (G-4, README T-07) and cannot launder a failure (G-3, research/03
   `research/03-runners-and-fingerprint.md:411-423`).
3. Every error path runs more, never less (G-1): resolver crash, adapter missing, unreadable store, unknown runner.
4. A clean run that reads no rows and can fail (G-5, README T-05, the pilot's prove-the-gate-can-fail rule).
5. Run-free: works from a pre-push hook with no do-it run (research/01 §2.1 #2, `research/01-do-it-repo.md:20`).

Non-goals: the store format and compaction (L1), the key and closure (F1, A1), the queue internals (Q1, Q2), the train
and nightly stages and scheduling (S2), consumer adoption (moved to the pilot consumer's own program, do-it 1.1 R3), per-file coverage (OQ-4).

## 3. Users and jobs

| User | Job in this moment | What they must know from the gate |
|---|---|---|
| A consumer's pre-push hook (unattended) | decide push or block | pass or fail, by exit code; one greppable verdict line |
| Worker agent after a killed gate | finish the gate without paying for 500 files again | that `--resume` reused exactly the finished files, and from which run |
| Worker agent after a red gate | judge whether its branch added the failure (the pilot's red-baseline rule) | which files failed, whether each already failed on the same key before |
| do-it conductor at train complete (S2) | decide deploy | a verdict for a clean tree SHA only (G-9), its outcome token in `--json` |
| Owner reading a STATUS board | trust the green | that the green is composed, from which runs, how old; nightly clean says whether reuse lied |

## 4. Solution design (numbered decisions)

**D1 Run-free subcommand table with all eight entries, and the CLI parser fixes** (CONTRACT §11 A7). `cmdGate`
(`core/spine/src/cli.mjs:180-193`) gains `run`, `results`, `decide` (internal), `queue`, `push`, `train`, `nightly`,
`schedule`; the seven lifecycle subcommands stay unchanged and keep calling `selectRunId` (`cli.mjs:195-202`). `run`,
`results` and `decide` dispatch to `gateRunCmd`, `gateResultsCmd` and `gateDecideCmd` (verdict lane); `queue` to
`gateQueueCmd` (queue lane); `push`, `train`, `nightly`, `schedule` to `gateOnPushCmd`, `gateTrainCmd`,
`gateNightlyCmd`, `gateScheduleCmd` (stages lane) — CONTRACT §5. Until a lane ships, its entry returns
`notImplemented(epic, what)` (`cli.mjs:57-59`), outcome `NOT_IMPLEMENTED`, exit 1, so a dispatch never reaches a missing
bundled name and the bundle builds (`core/spine/build.mjs:44-47`). `gateRunCmd`, `gateResultsCmd` and `gateDecideCmd`
never call `selectRunId` and need no `.do-it/` directory (research/01 §2.1 #2). V1 owns every `cli.mjs` change (A7):
- `parseArgs` (`cli.mjs:32-55`) learns the `--` separator: every token after the first bare `--` goes verbatim into
  `args.passthrough` (today a bare `--` becomes a flag with an empty name and swallows the next word);
- `resume`, `clean` and `status` join `BOOL_FLAGS` (`cli.mjs:29`; CONTRACT §3, A7), so `--resume push` can never parse
  as `resume=push` (research/01 §2.1 #3) and `gate queue --status --json` keeps `json`.
`--resume` with `--clean` is `USAGE`, exit 1. `--scope` must be one of CONTRACT §4.1; `--runner` is required; the runner
argv is `args.passthrough`.

**D2 One gate run follows M2 exactly** (CONTRACT §8 M2). States and where each is observable:

| M2 state | Entered when | Observable as |
|---|---|---|
| QUEUED | `gate run` starts and is not already an admitted holder | queue ticket file (CONTRACT §2.5) |
| ADMITTED | the queue admits, or the process is already inside an admitted holder | `--json` `admission: "self"` or `"inherited"` |
| SELECTING | after admission: manifest written, runner spawned, adapter's hook calls `gate decide` | `run_start` row written at entry; `decision.json` |
| RUNNING | runner runs the `run-list.json` files | adapter `start`/`finish` rows |
| COMPOSING | runner exited | none (in memory) |
| PASSED / FAILED | verdict computed | `run_end` row with `verdict` = §4.4 outcome; exit 0 / 1 |
| INTERRUPTED | runner died by a signal, or (detected later) a `run_start` with no `run_end` whose owner is dead | `run_end` `verdict: GATE_INTERRUPTED`, exit 3; or no `run_end` |
| RESUMED | a later `--resume` run reuses rows of an INTERRUPTED run | `--json` `resumed_from[]` |

`SELECTING → FAILED` happens only when the fallback (run the whole selection) also cannot start: runner binary missing
(spawn `ENOENT`) ⇒ `GATE_FAIL`, exit 1, reason `runner could not start`.

**D3 Heavy scopes call the queue; `gate run` never admits itself twice** (CONTRACT §11 A8). G-10 has no scope
exception, so every scope (`edit`, `push`, `train`, `nightly`) passes admission. When `DO_IT_GATE_HOLDER` (set by the
queue on its child, A8) names a live holder, `gate run` proceeds as `admission: "inherited"` and writes no ticket
(confirmed through the queue lane's `gateQueueHeldBySelf`); otherwise it admits itself in-process through
`gateQueueAdmit(ctx, {peakMb, label, timeoutS})` with `peakMb` = `gates.peak_mb` (CONTRACT §2.4; null means exclusive,
A8), label `{repo basename}:{scope}:{leg}`, timeout from `gates.queue.timeout_s`. V1 only calls the queue; Q1/Q2 own
admission, FIFO, reclaim and process-group cleanup. Outcomes it surfaces unchanged: WAIT_TIMEOUT ⇒ the queue's
`[WAIT-TIMEOUT] gate-queue: …` line, outcome `GATE_WAIT_TIMEOUT`, exit 3; REJECTED (peak above the whole budget) ⇒ the
queue's `[REJECTED]` line, outcome `GATE_QUEUE_REJECTED`, exit 1 (A7). In both cases no `run_start` row is written and
the runner never spawns (CONTRACT §8 M3, G-10).

**D4 The spine decides selection inside one runner invocation** (CONTRACT §11 A1, A2). There is one fold (L1's
`gateFold`, A3) and one decision (`gateSelect` in `gate-verdict.mjs`), never copies in CommonJS, Python and ESM. Per run:
1. `gate run` creates the run directory `{os.tmpdir()}/do-it-gate-{run_id}/` and writes `manifest.json`
   (`rtg-manifest/1`; schema `core/schemas/gate-manifest.1.schema.json` and its builder are store lane, F1): `run_id`,
   `scope`, `leg`, `clean`, store directory, the spine-computed components (`gate`, `core`, `installed`, `env`,
   `platform`, and `tree` for WIDE), and the paths of `keys.json`, `run-list.json`, `decision.json`,
   `runner-report.json`. jest and vitest find it through `DO_IT_GATE_MANIFEST` set on the runner's env, pytest through
   `--do-it-manifest` (A1).
2. `gate run` spawns the runner once with the injection from the runner's descriptor
   `core/gates/adapters/{runner}/adapter.json` (adapters lane, A2), so the runner registry is data, not a `switch`.
3. Inside the runner's own selection hook (jest `--filter`, R22) the adapter lists the leg's files, writes `keys.json`
   `{files:[{file, class, deps}], errors:[{file, error}]}` and calls `do-it gate decide --run-dir D` synchronously.
4. `gateDecideCmd` (verdict lane, run-free, internal) reads the manifest and `keys.json`, builds each `key_now` from the
   spine components plus the adapter's `class` and `dep` lines (F1's `rtg-key/1` builder), runs D5, writes
   `run-list.json` and `decision.json` (every file with `key_now`, `decision: reuse|run`, `why`, and for reuse the
   source `run_id` and `at`) with `atomicWrite` (`core/spine/src/fs-atomic.mjs:11`), and exits 0. It refuses (exit 1,
   nothing written) a run directory whose `run_id` has no `run_start` row in the store. Any decide error, timeout or
   missing `run-list.json` makes the adapter run every file (A1, G-1).
5. The adapter runs only `run-list.json` files, writes at most one `start` and one `finish` row per file (A4) and at
   exit writes `runner-report.json` `{files_received, unhandled_errors, force_exited_workers, open_handles}`.
6. The spine composes (D7). The run directory is removed after the verdict (stale ones are swept by `cleanStaleTmp`,
   `fs-atomic.mjs:52`).

**D5 Selection = all files of the leg, minus reusable PASS folds, plus the NEVER set** (run inside `gate decide`).
For each file f in `keys.json` (the composed-verdict merge rule, `research/03-runners-and-fingerprint.md:411-423`,
items 1–4):
- f matches `gates.reuse.always_run` or `gates.reuse.never_reuse` (CONTRACT §1 NEVER set) ⇒ run (G-16);
- f has a `keys.json` error ⇒ run (G-1; CONTRACT §6 "resolver crash");
- otherwise gather f's rows from the store scan (L1 `gateStoreScan`, CRC-failed rows reported as CORRUPT, G-1) where
  `file == f` and `leg == --leg` (item 6), and fold them with L1's `gateFold(rows, keyNow, now, opts)` (A3, A5);
- **independent re-check (defence in depth):** a candidate PASS row is reusable only if its stored `components.gate`,
  `core`, `installed`, `env` and `platform` equal the digests the spine computed for this run, and, when its `class`
  is `WIDE`, its `components.tree` equals the current tree digest (item 4, A1). The adapter supplies only `class` and
  `dep` lines, so a stale adapter cannot launder the other five;
- source-run eligibility (A4): the row's run has a `run_end` with `tainted:false` and verdict `GATE_PASS_COMPOSED`,
  `GATE_PASS_FRESH` or `GATE_FAIL`; rows from a run whose `run_end` says `GATE_INTERRUPTED`, or with no `run_end`
  and a dead owner (`pid`/`pid_start` of its `run_start`), are eligible **only under `--resume`** (D6); rows from a run
  whose owner is alive are never eligible (a concurrent run may still be tainted);
- folded state PASS (not FLAKY, not UNSTABLE_UNDER_REUSE, not EXPIRED, not from a tainted run, no env token `*`, A5)
  ⇒ reuse; anything else ⇒ run. SKIPPED and DESELECTED are never reused: those files always run again (they are cheap,
  and a self-skip must be re-observed: research/03 §4 #2).

**D6 `--resume` widens eligibility to interrupted runs, nothing else.** Without a flag a run reuses PASS rows of
completed, untainted runs (the fix-and-retry case: 500 pass, 1 fail, fix, rerun). `--resume` additionally reuses the
finished rows of INTERRUPTED runs (the kill-and-resume case, DECISIONS D2), because an interrupted run never reached the point
where unhandled errors and force-exited workers are reported (research/03 §4 #7), so trusting its rows is a choice the
caller makes by name. The resuming run's `--json` carries `resumed_from[]` (the interrupted run ids it drew from).
Interruption itself does **not** taint a run (CONTRACT §11 A4): taint is evidence that PASS rows may be wrong
(unhandled errors, force exit, open-handle kill, non-zero runner exit with no failing file); interruption is only
evidence that the run did not finish.

**D7 Composition and the verdict predicate** (merge rule items 3 and 5). After the runner exits, the spine reads
`decision.json` for the file list and the decisions, re-reads the store (it never trusts the pre-run decision as the
record) and, per listed file f:
- satisfied-fresh: a `finish` row with this `run_id`, `file == f`, `leg`, `result PASS` (the PASS predicate is the
  adapter's, G-2);
- satisfied-reused: a `reuse` decision whose source row is still reusable at compose time (re-folded: a FAIL appended for
  that key by a concurrent run in between makes it unsatisfied);
- skipped: a fresh `finish` with `SKIPPED` or `DESELECTED`;
- failed: a fresh `finish` with `FAIL`;
- **unsatisfied (no result)**: none of the above — the runner dropped it, the run list was tampered, the reporter died.
  Unsatisfied counts as a failure (CONTRACT §8 M2, COMPOSING to FAILED); it never counts as reused or skipped.
If `decision.json` is missing (decide failed and the adapter ran every file), the file list is the union of `keys.json`
and this run's `start` rows, no file counts as reused, and `warnings` holds `reuse unavailable: decide failed`.
The verdict is PASS iff the runner exited 0, `runner-report.json` shows no taint (V2), `failed + unsatisfied = 0`,
`passed + skipped = total`, `passed ≥ 1`, and `total ≥ 1`. A leg whose files all skipped is a FAIL (research/03 §4 #2:
an unset `SEC_TEST_MONGO_URI` must not make the real-mongo leg green). A runner exit ≠ 0 with no failing file is a
FAIL with reason `runner exited {n} with no failing file` (coverage threshold, teardown throw). Precedence of the
verdict head: interrupted, then failed or unsatisfied files, then runner exit, then zero-pass.

**D8 One verdict line, one grammar** (CONTRACT §4.3). Exactly one stdout line starts with `[COMPOSED`, `[FRESH`,
`[FAIL` or `[WAIT-TIMEOUT]`; the human form is the existing `OUTCOME:` render (`cli.mjs:61-71`) with that line as the
first `say` line, so no renderer change is needed and consumer scripts grep `^\[(COMPOSED|FRESH|FAIL|WAIT-TIMEOUT)`.

```
[COMPOSED {scope}: {passed}/{total} files PASS · {reused} reused from {n} run(s) (oldest {YYYY-MM-DDTHH:MMZ}) · {ran} ran now · {skipped} skipped · {flaky} flaky-excluded] run={run_id}{dirty}
[FRESH {scope}: {passed}/{total} files PASS · 0 reused from 0 runs (oldest none) · {ran} ran now · {skipped} skipped · {flaky} flaky-excluded] run={run_id}{dirty}
[FAIL {scope}: {head} · {reused} reused from {n} run(s) (oldest {ts|none}) · {ran} ran now · {skipped} skipped · {flaky} flaky-excluded] run={run_id}{dirty}
```

- `{head}` is one of: `{k} of {total} files FAIL ({list})` where list holds up to five repo-relative paths, each
  suffixed ` no result` or ` suspect-killer` when that applies, then `, +{m} more`; `runner exited {n} with no failing
  file`; `0 files PASS (all {total} skipped)`; `0 test files listed`; `interrupted after {f} of {total} files`;
  `runner could not start`. (A queue rejection prints the queue's `[REJECTED]` line instead, D3.)
- `{dirty}` = ` · for WORKING TREE (dirty), not {12 hex of HEAD}` when D11 applies, else empty.
- COMPOSED iff `reused ≥ 1`; FRESH iff `reused = 0`. `run` is singular when n = 1 (`from 1 run`).
- `total` counts every listed file of the leg, skipped files included, so `27/30 files PASS · … · 3 skipped` is a pass
  (accepted AM-6: the `docs/03` §4 example becomes `1598/1607 … · 9 skipped`).
- `flaky-excluded` = selected files whose fold after this run is FLAKY or UNSTABLE_UNDER_REUSE (V2). Such a file is
  never reused; it is satisfied only by a fresh PASS in this run, and the count makes that visible.
- A bare `[OK]` is never printed (G-4); the test asserts `[OK` appears nowhere in stdout for every outcome.
- `oldest` is the minimum `at` over the reused rows, rendered to the minute in UTC.

**D9 `--json` outcomes and exit codes** (CONTRACT §4.4; `core/spine/src/record.mjs:19` `EXIT_FOR_STATUS`, research/01
§2.1 #4): `GATE_PASS_COMPOSED` and `GATE_PASS_FRESH` exit 0; `GATE_FAIL` exit 1; `GATE_INTERRUPTED` exit 3 (retryable
with `--resume`); `GATE_WAIT_TIMEOUT` exit 3; `GATE_QUEUE_REJECTED` exit 1 (A7); `USAGE` and `SETTINGS_INVALID` exit 1 (existing precedent
`cli.mjs:191`). The JSON object carries `outcome, exit, state` (M2), `scope, leg, run_id, line` (the exact verdict
line), `passed, total, reused, ran_now, skipped, flaky_excluded`, `source_runs[]` `{run_id, rows, oldest_at,
newest_at, ended}`, `oldest_reused_at`, `resumed_from[]`, `failed_files[]` `{file, reason: FAIL|no_result|
suspect_killer, failure_ref, prior_fail_on_same_key}` (V2), `unstable[]` (V2), `tree {dirty, commit}` (`commit` null
when dirty), `admission`, `warnings[]`. `GATE_SKIP_NO_GATE` and `TRAIN_INCOMPLETE` belong to the stages lane.

**D10 The M1 fold is L1's; the reuse decision and the verdict are V1's** (CONTRACT §11 A3, A5). `gateFold(rows,
keyNow, now, opts)` lives in `gate-results.mjs` (store lane) as a pure function over every M1 transition;
`gate-verdict.mjs` imports it and owns only what the fold does not decide: NEVER set, keys errors, the five-component
re-check, source-run eligibility (`--resume`, live owner, taint), the TTL inputs passed in `opts` (`now`, the clean
horizon per leg), the post-clean `unstable[]` list, the `flaky-excluded` count, composition and the line. Every fold
transition V1 and V2 rely on is still asserted, but as an integration case through `gate run` and `gate decide`, never
by unit-testing L1's function from the verdict lane. Fold rules relied on (A5): a clean PASS counts as one pass toward
two consecutive passes (it never jumps FLAKY or FAIL straight to PASS); FLAKY is file-sticky for 7 days across a key
change; a CORRUPT row voids every earlier PASS of the file it can be attributed to, or of every file when it cannot be
attributed.

**D11 Dirty tree** (R11, G-9). Before SELECTING and again at COMPOSING the spine runs `git status --porcelain=v1
--untracked-files=normal -z` and intersects the paths with the selected files, their closure members (`dep` lines of `keys.json`) and the CORE set; if `keys.json` is missing, any listed path counts. Non-empty at either moment,
or a fresh `finish` row whose `key` differs from the `key_now` in `decision.json` (the file changed during the run), ⇒ dirty. Dirty rows are
still written (content-keyed, sound); `run_start` and `run_end` carry `tree_dirty:true`; the verdict line carries the
suffix; `--json` `tree.commit` is null; `gate run` writes no tree or commit stamp anywhere (the only commit-bound record
is S2's `gate-train.json`, which S2 refuses to write from a dirty run).

**D12 Adapter missing** (CONTRACT §6). Runner with no descriptor, or a descriptor whose files are absent ⇒ spawn the
runner argv unchanged, write no rows at all (no `run_start` or `run_end` either), print
`[FRESH {scope}: runner exit 0 · 0 reused from 0 runs (oldest none) · files not counted · reuse unavailable: no
adapter] run=…` or `[FAIL {scope}: runner exited {n} · 0 reused from 0 runs (oldest none) · files not counted · reuse
unavailable: no adapter] run=…`; exit 0 or 1 from the runner's exit. Admission still applies (G-10).

**D13 Run ids and run rows.** `run_id` = `g-{UTC YYYYMMDDTHHMMSS}Z-{4 random hex}` (CONTRACT §2.1 pattern); if a
`run_start` with that id already exists in the store, a new suffix is drawn (at most 16 draws, then `INTERNAL_ERROR`).
`run_start` is appended at SELECTING entry with `scope, leg, clean, tree_dirty` and the owner fields `pid` and `pid_start` (CONTRACT §11 A4), which are needed to tell an INTERRUPTED run (owner dead) from a live one.
`run_end` is appended at the end with `tainted, reason, verdict`. If the `run_end` append fails, the verdict is still
printed and the exit code still follows it, plus warning `run_end not recorded`; the run then counts as having no
`run_end`, so its rows are reused only under `--resume` (compensation by eligibility, never by rewriting rows).

**D14 Suspect killer.** A file whose fold is SUSPECT_KILLER (two KILLED on one key, CONTRACT §4.5) is excluded from
the main run list and run after it in a solo runner invocation (adapter descriptor `solo` argv, for jest `--runInBand`; the manifest
names the solo file and `gate decide` returns only it). If the solo run is killed too, the file is unsatisfied with qualifier ` suspect-killer` and the verdict
is `GATE_FAIL`, exit 1: a run that keeps dying on one file escalates to a named red, never to an endless resume loop.

**D15 `do-it gate results`.** Read-only; exit 0 (CONTRACT §3). Prints one line per file and leg with fold state,
key prefix, last result, age and source run; a header with corrupt-row count and the last clean run per leg. `--why
FILE` compares the components of FILE's newest row with those of its newest PASS row on another key and prints the
component names that differ (`invalidated: installed, dep src/a.ts`), or the non-key reason (`FLAKY 1 of 2`, `EXPIRED
25 h`, `tainted run g-…`, `UNSTABLE until …`). `--json` emits folds plus V2's `fail_set` (D21). `--why` also reads closure sidecars `closures/{sha256}.json` when
present (A6). It never prints an
env value (G-6): components are digests only.

**D16 Clean runs (V2)** (G-5, CONTRACT §11 A9). `--clean`, `--scope nightly` with or without `--clean`, and any
`gate run` that inherits `DO_IT_GATE_SCOPE=nightly` from `gate nightly` (whatever its flags) read no rows for selection
or verdict: every listed file runs, the manifest carries `clean:true` so every `finish` row has `clean:true`, the
verdict uses only this run's rows (so it is always FRESH) and the line never says reused. The only store read a clean
run makes is after COMPOSING, to compare its results with earlier rows on the same keys for D17. On completion with
no taint, a `clean` row (`type: clean`, `run_id`, `at`, `leg`, `scope`) marks the boundary used by the TTL (D19); an
interrupted or tainted clean run writes no `clean` row. `--scope nightly --resume` typed on the command line is `USAGE`.
Under an inherited `DO_IT_GATE_SCOPE=nightly` the run uses scope `nightly` in its rows and line, ignores `--resume` and
the flag scope, and warns `DO_IT_GATE_SCOPE=nightly: running clean; add --clean to the gates.nightly command` when the
command lacks `--clean` (A9). In clean mode `gate decide` writes every file to `run-list.json` without opening the store.

**D17 UNSTABLE_UNDER_REUSE (V2)** (CONTRACT §8 M1, R18). A clean `FAIL` on key k for a file whose fold on k was PASS
before the clean run ⇒ UNSTABLE_UNDER_REUSE for 7 days; it clears only when 7 days have passed **and** the file's two
most recent clean finishes on its current key are PASS. A non-clean PASS never counts toward clearing. A clean FAIL on a
key different from the stored PASS key is a plain FAIL (different code, research/03 `:402-408`). A clean PASS after a
composed FAIL on the same key is FLAKY, not UNSTABLE. The clean verdict lists unstable files in `--json` `unstable[]`.

**D18 FLAKY (V2)** (G-3, R18). FAIL then PASS, or PASS then FAIL, on one key ⇒ FLAKY with a pass streak; a retried
PASS (`retried:true`) ⇒ FLAKY with streak 0; FLAKY clears after two consecutive PASS finishes on one key (row order =
store order, ties by `at`). Latest-wins is forbidden: FAIL, PASS, FAIL, PASS stays FLAKY. FLAKY is file-sticky across a
key change for 7 days (research/03 `:402`; CONTRACT §11 A5): the new key starts at
streak 0.

**D19 TTL (V2)** (R9, CONTRACT §4.5). A PASS row is EXPIRED when it is older than 24 h or `at` is earlier than the start (`run_start` `at`) of the
newest completed clean run of the same leg, the run named by its `clean` row (A4). EXPIRED files run; nothing is deleted.

**D20 Tainted runs (V2)** (docs/03 §3, research/03 `:409`). `run_end.tainted:true` with a `reason` when
`runner-report.json` shows unhandled errors, force-exited workers or open-handle kills, or when the runner exited ≠ 0
with no failing file, or when `runner-report.json` is missing after a run that the adapter was injected into. Every PASS
row of a tainted run folds to NEVER_RUN for reuse; the tainted run's own verdict is `GATE_FAIL` with head `runner
exited …` or `tainted: {reason}`. Interruption is not taint (A4).

**D21 Failure-set baseline for the pilot's red-baseline rule (V2)** (docs/01 §3, `docs/01-current-state-and-findings.md:71`).
Stored FAIL rows become a baseline, never a discount: `gate results --json` emits `fail_set[]` `{file, leg, key,
run_id, at, failure_ref}` for files whose newest finish on their newest key is FAIL; a `gate run` FAIL annotates each
failed file with `prior_fail_on_same_key` (true when a FAIL row on the same file, leg and key predates this run). The
annotation never changes the verdict, the exit code or the line.

**D22 Quarantine view (V2)** (R18, docs/03 §1). `views/flaky.json` = `{schema:"do-it-gate-flaky-view/1",
built_at, files:[{file, leg, state: FLAKY|UNSTABLE_UNDER_REUSE, key, since, until, streak, run_ids}]}`, rebuilt with
`atomicWrite` at the end of every `gate run` from the folds, sorted by file then leg. It is derived and never read for a
decision; a missing or corrupt view changes nothing. L1's compaction may call the same builder.

## 5. Laundering map (every way a composed verdict could hide a failure, and its guard)

| # | Way to launder | Guard | Case |
|---|---|---|---|
| 1 | latest-wins: FAIL then a lucky PASS on the same key | FLAKY, two consecutive passes (G-3) | T-V2-02 |
| 2 | reuse a PASS whose key no longer matches | key filter plus spine re-check of five components | T-V1-12 |
| 3 | adapter reports a stale key (bug) | spine-computed `gate/core/installed/env/platform/tree` re-check | T-V1-12 |
| 4 | runner silently drops a file (`--runTestsByPath`, F7) | unsatisfied ⇒ FAILED | T-V1-05 |
| 5 | runner exits non-zero but every file row is PASS | verdict FAIL, run tainted | T-V1-07, T-V2-07 |
| 6 | every file self-skipped (env unset) | zero-pass leg is FAIL | T-V1-05 |
| 7 | argv narrowed with a name filter, rows reused for the full run | `runner` component includes argv digest | T-V1-11 |
| 8 | a PASS from another leg | leg filter (merge rule 6) | T-V1-11 |
| 9 | rows of a run that later reported unhandled errors | taint voids PASS rows | T-V2-07 |
| 10 | rows of an interrupted run that never reached taint detection | only with `--resume`, named in `resumed_from[]` | T-V1-02 |
| 11 | rows of a concurrent live run | not eligible until it ends | T-V1-02 |
| 12 | tampered row or run list between write and verify | CRC ⇒ CORRUPT ⇒ run; compose re-reads the store | T-V1-12 |
| 13 | order-dependent pass hidden by reuse | clean run, UNSTABLE_UNDER_REUSE | T-V2-01, T-V2-16 |
| 14 | time-bomb PASS reused past midnight | TTL 24 h and last clean | T-V2-05, T-V2-06 |
| 15 | dirty working tree stamped as the commit | dirty suffix, no stamp, `commit` null | T-V1-08 |
| 16 | a retried pass shown as plain green | FLAKY, counted in `flaky-excluded` | T-V2-09 |
| 17 | a killer file looping resume forever | SUSPECT_KILLER solo, then named FAIL | T-V1-15 |
| 18 | red-baseline used to discount a red | annotation only, verdict unchanged | T-V2-13 |
| 19 | "no adapter" read as a composed green | FRESH with `reuse unavailable`, no rows | T-V1-09 |
| 20 | clean run quietly reading rows | write-only store file still yields a clean FRESH line | T-V2-03 |
| 21 | nightly command that forgot `--clean` reuses rows | inherited `DO_IT_GATE_SCOPE=nightly` forces clean and warns | T-V2-17 |
| 22 | `gate decide` writing a run list for a run that does not exist | decide refuses without a `run_start` row; compose re-checks | T-V1-12 |

## 6. Epics

| Epic | Title | Wave | Branch | Depends on | Cases | Real |
|---|---|---|---|---|---|---|
| V1 | Gate run, resume and composed verdict | W2 | `epic/V1-gate-run` | L1, F1 (Q1 admission interface; A1 for the `[REAL]` jest cases) | 18 | 3 |
| V2 | Clean runs, flaky and unstable | W2 | `epic/V2-clean-flaky` | V1 | 17 | 1 |

V1's own tests drive a stub adapter fixture (`core/spine/test/g2/fixtures/stub-runner/`): a fake runner and descriptor
that read per-file behaviour from fixture spec files (pass, fail, skip, drop, self-kill, unhandled error, retried
pass, order-dependent) and write rows in the CONTRACT §2.1 format, so V1 does not wait for A1.

## 7. Acceptance criteria

1. Both Test Contracts (`delivery/epics/epics-2-gate-run-verdict.md`) pass 100%; no `[REAL]` case passed on the stub.
2. README T-01, T-05, T-06, T-07 and G-3, G-4, G-5, G-9, G-16 (composition side) each have a passing case.
3. `node core/spine/build.mjs` builds with the two new modules (unique top-level names, `node:` imports only, G-15);
   `node scripts/sync-mirror.mjs --check` exits 0 (CONTRACT §7).
4. The seven existing lifecycle `gate` subcommands keep their outcomes; existing `core/spine/test/s1..s5` pass.
5. No stdout of `gate run` contains `[OK`.
6. The epics conform to CONTRACT v1.1-draft §11 (A1 to A11); any later amendment is folded back before the build.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| `gate decide` fails or is slow inside the runner's hook | adapter runs every file (A1); no saving that run | decide is file IO plus one store scan; `warnings` names it; the pilot's adoption measures decide time on 1,607 files |
| `cliMain` is synchronous (`cli.mjs:93-128`), so a SIGTERM to `gate run` during `spawnSync` kills it before `run_end` | interrupted runs often have no `run_end` | D2 detects INTERRUPTED from a dead owner (AM-4); rows already on disk carry the work |
| a fresh PASS on a FLAKY file satisfies the verdict | a flaky file can be green today | counted in `flaky-excluded`, named in `views/flaky.json`; owner may rule it blocks instead |
| closure cost on 1,607 files of the pilot's largest suite | selection overhead eats the saving | the pilot's adoption measures (closure-size spike); a failed closure falls back to run-all, never to skip |
| `--resume` widened by habit in consumer hooks | interrupted rows reused without taint detection | the verdict JSON names `resumed_from[]`; nightly clean is the net (G-5) |
| a stub runner that is kinder than jest | V1 cases pass but real jest drops files differently | T-V1-17, T-V1-18 and T-V2-16 run on installed jest 29.7 (the pilot's installed `jest/package.json` reads 29.7.0, MEASURED 2026-11-06) |
| verdict grammar change after a consumer greps it | broken pre-push parsing | grammar frozen here and in CONTRACT §4.3; any change is an amendment, with the consumer's own program informed in the same change (do-it 1.1 R3) |

## 8. Repo and branch plan

- Repo DevOtts/do-it, branched from `main`. `epic/V1-gate-run` then `epic/V2-clean-flaky` (V2 branches from V1's merge).
- Files: `core/spine/src/gate-run.mjs` (run, selection, protocol, run rows), `core/spine/src/gate-verdict.mjs` (fold,
  composition, line, JSON, flaky view), `core/spine/src/cli.mjs` (gate subcommand table, `parseArgs` `--` separator, `BOOL_FLAGS`),
  `core/spine/test/g2/gate-run.test.mjs`, `core/spine/test/g2/gate-clean-flaky.test.mjs`,
  `core/spine/test/g2/gate-real.test.mjs`, `core/spine/test/g2/fixtures/**`.
- After any `core/spine/src` change: `node core/spine/build.mjs` then `node scripts/sync-mirror.mjs --write`.
- Test seams (do-it internal, R19 pattern; `core/spine/test/helpers.mjs:21-28` strips every `DO_IT_*`, so each test
  sets them explicitly): `DO_IT_GATE_ADAPTERS` (directory of adapter descriptors that replaces the built-in one, used to register the stub runner), `DO_IT_REAL_JEST` (path of an installed jest 29.7 for `[REAL]` cases), both in
  CONTRACT §11 A11; a `[REAL]` case whose runner is absent reports IMPLEMENTED-NOT-VERIFIED. Runtime env names it reads
  or sets (do-it internal, A1, A8, A9): `DO_IT_GATE_MANIFEST`, `DO_IT_GATE_HOLDER`, `DO_IT_GATE_SCOPE`.

## 9. Amendment record (CONTRACT v1.1-draft §11)

| Proposed here | Ruling | Where it landed |
|---|---|---|
| AM-1 spine decides reuse | accepted, one runner invocation with `gate decide` inside the selection hook | A1; D4, D5 |
| AM-2 descriptor and manifest schema | accepted; descriptor is adapters lane, manifest schema store lane | A1, A2; D4 |
| AM-3 interruption is not taint | accepted | A4; D6, D20 |
| AM-4 `pid`, `pid_start` on `run_start` | accepted | A4; D5, D13 |
| AM-5 queue exports | accepted; inherited admission through `DO_IT_GATE_HOLDER`; REJECTED is `GATE_QUEUE_REJECTED` | A7, A8; D3 |
| AM-6 FRESH example | accepted | D8 |
| AM-7 FLAKY file-sticky | accepted | A5; D18 |
| AM-8 test switches | accepted, plus `DO_IT_REAL_PYTHON`, `DO_IT_REAL_VITEST` | A11; §8 |
| fold placement (squad-wide) | `gateFold` in `gate-results.mjs` | A3; D10 |
| CLI parser (squad-wide) | `--` separator and `status` in `BOOL_FLAGS`, owned by V1 | A7; D1 |
| nightly enforced clean (squad-wide) | `DO_IT_GATE_SCOPE=nightly` | A9; D16 |

---
_Authored for DevOtts (https://github.com/DevOtts)._
