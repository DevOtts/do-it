# resumable-test-gates: never re-run a test that already passed on the same code

Status: proposal, 2026-11-06. Nothing is built. Opened by the session `study-bateria-testes-tempo` (in the pilot consumer),
after the owner's reply: *"Se o teste tem 700 testes, já rodamos 500 com sucesso e deu um erro, reiniciar os 500 é um
absurdo. A própria implementation deveria salvar esse status."* Diagnosis it builds on:
https://claude.ai/artifact/72H7m7ycfvBpsS2e2zm8Hk (`/read-chat "study-bateria-testes-tempo"` for the full context).

## 1. The problem, measured (the pilot consumer, the first consumer)

- The local pre-push gate is the merge gate because CI is billing-blocked. the pilot's largest suite (full jest) is about
  1,340 suites and 12,300 cases. The median of 20 archived full runs is 630 s (range 260–1,794 s). The real gate takes
  25–70 min under contention (pilot measurement, research/02).
- A gate is all or nothing. A run that is killed (reaper, OOM, the 10-min tool timeout) or that fails on one file starts
  again from zero. After the fix, the suites that already passed are paid for again, even though nothing in their
  dependency closure changed.
- The same tree is gated several times: branch push, merge, deploy, convergence. Only one pilot repo stores a tree-sha
  pass stamp (`<git-common-dir>/gate-stamps/<tree>.json`), and that stamp only matches an
  identical tree. One changed line voids it.

## 2. Idea: a per-test-file result ledger, keyed by what the test depends on

Record each test file's result the moment it finishes, keyed by a fingerprint of everything that can change its outcome.
On the next run, skip every file whose fingerprint still matches a PASS. That is the idea behind Bazel, Nx and Turborepo
caching, applied at test-file granularity and without adopting those tools.

```
key(test_file) = H( gate_version,
                    runner + runner-config hash   (jest.config, vitest.config, pyproject [tool.pytest], conftest set),
                    lockfile hash,
                    env fingerprint               (node/python version, TZ, the env var NAMES the gate pins, never values),
                    H(content of every file in test_file's dependency closure) )
```

- **Closure** = the test file plus every module it transitively imports, taken from the runner's own resolver: jest
  `--findRelatedTests`/haste map, `vitest related`, a static import graph plus a text rule (the pilot's Python selector is the model).
  A static graph misses dynamic imports, so the text rule (a test naming a changed path or module) stays, as in
  the pilot's selector.
- **Write path**: one JSONL row per finished file, appended immediately. A killed run keeps everything that finished.
  - jest: reporter `onTestFileResult`.
  - vitest: reporter `onTestModuleEnd` (verify the hook name for the pinned vitest version).
  - pytest: plugin on `pytest_runtest_logreport`, aggregated per file. xdist-safe by writing from the controller.
- **Location**: `$(git rev-parse --git-common-dir)/do-it/test-ledger/`. It is shared by every worktree, never tracked,
  and sits next to a consumer's existing `gate-stamps/`.

## 3. Resume semantics

`do-it gate run --tier T1|T2 [--resume]` computes:

```
to_run = selected(tier)                                  # T2 = every test file; T1 = diff selection
       \ { f : ledger[f].result == PASS and ledger[f].key == key_now(f) }
       ∪ ALWAYS_RUN guards                               # cross-cutting specs the graph cannot see (the pilot's largest suite has 13 of them)
```

- 700 files, 500 passed, 1 failed, and the fix touched 2 modules: only the failed file, the files whose closure contains
  those 2 modules, and the 199 never-run files run again. The other ~490 are reused.
- A change in the CORE set invalidates everything: runner config, lockfile, global setup, conftest, the gate itself,
  plus a per-repo list (a pilot repo's `CORE_PATTERNS` list is the model).
- Every error path fails toward running more. No ledger, a corrupt row, or a resolver crash means that file runs again.

## 4. Honesty rules: a composed verdict says it is composed

- The output shows how the verdict was built, for example
  `[COMPOSED T2: 1,340/1,340 files PASS · 1,288 reused from 3 runs (oldest 2026-11-06T09:12Z) · 52 ran now]`.
  It never prints a bare `[OK]`.
- Reuse cannot see cross-test pollution or order dependence: a test that only fails after another one ran. So **T3
  always runs clean**. It runs nightly or before a release with `FORCE`, without the ledger, and rewrites it. A file that
  passes composed but fails clean is flagged `UNSTABLE_UNDER_REUSE` and loses reuse for 7 days.
- Flaky files (pass/fail on the same key) are recorded as such. They never become a reusable PASS until they pass twice
  in a row. This feeds the quarantine list. The consumer's own quarantine rules apply.
- A reused PASS is evidence with a timestamp, not a fresh observation. Gate output and STATUS boards cite the run ID that
  produced it.

## 5. Tiers and who triggers them (owner question, 2026-11-06)

| Tier | Trigger | Who knows when |
|---|---|---|
| T0 | while implementing, no push | the worker, on every edit |
| T1 | every branch push | the pre-push hook, mechanically from the diff |
| T2 | **after the implementation's last merge**, once per train | **the do-it conductor.** It holds the plan, so it knows the epic list and which PRs are merged. CI cannot know "last". Rule: when `merged(epics) == planned(epics)` or the owner closes the train, run T2 composed from the ledger, then deploy reuses that stamp. |
| T3 | nightly or pre-release | a schedule (launchd/cron, or `/schedule`). Needs no knowledge of "last merge". |

So T2 is not a GitHub Action, and it is not manual in the sense of a human remembering it. It is a pipeline stage that
fires from the plan's own state. Today build-it/review-it run gates ad hoc; this makes T2 a named stage in
`core/pipelines/feature.yaml` and `drain.yaml`.

### 5.1 do-it owns the trigger, the project owns the command (owner ruling, 2026-11-06)

do-it must not assume a project has tests ("fico com medo que isso possa engessar o do-it"). Split:

- **do-it (generic):** knows *when*: branch push, train complete (`merged(epics) == planned(epics)` or the owner closes
  the train), nightly schedule. It runs whatever the project declares and records the verdict. It never decides what a
  test is.
- **Project (data):** declares *what*, in an optional block of `.do-it/settings.json`:

```json
"gates": {
  "on_push":           null,
  "on_train_complete": "bash scripts/gate.sh --tier T2",
  "nightly":           "bash scripts/gate.sh --tier T3 --clean"
}
```

- A missing block or `null` skips the stage visibly (`[skip] on_train_complete: no gate declared`). A project with no
  tests behaves exactly as today.
- The key is `gates`, not `tiers`. `settings.tiers` already exists and means model tiers (`core/routing/tier-policy.mjs`).
- Not memory, and not CLAUDE.md alone. Memory only reminds a future session; it does not execute anything and does not
  reach other sessions or hosts. The *standard* lives in the project's docs (the pilot keeps it in a concept doc
  pointed at from CLAUDE.md), and the *commands* live in the settings block the harness reads.

## 6. Machine admission control (the swap problem, same session)

On 2026-11-06 at 09:3x, two jest workers of one pilot gate held 6.6 GB RSS each (4.5–4.8 GB of it compressed) on an
18 GB Mac. Swap was 3.5 of 4 GB. One more gate on top of that thrashes, the reaper kills it, and the whole run is lost.
With the ledger, the loss shrinks to the in-flight file. Prevention belongs in the gate too:

- Before starting a heavy tier, read `kern.memorystatus_vm_pressure_level` and `vm.swapusage`. Above the thresholds,
  **wait in the machine queue** and print why. Never start into a warn-level machine.
- A machine-wide slot (a consumer's existing slot script) moves into do-it as a host-level primitive, so every
  repo and every session shares one queue.
- Runner hints the adapters set by default: jest `workerIdleMemoryLimit` (recycles a bloated worker between files) and
  vitest `poolOptions` memory limits. These are hints only; the repo's config wins.

### 6.1 One deterministic gate queue per machine (owner ruling, 2026-11-06)

Not a /deploy-router-style skill. LLM negotiation by message is slow, costs tokens and fails when the peer is busy.
Instead: one script that every gate execution calls before it starts. Today the pilot consumer has two half-porters that do not talk
to each other:

| | slot script (in every pre-push hook) | archived single-heavy-job script |
|---|---|---|
| Used by | every `git push` | only callers who remember it |
| Counts | slots (a count of 2), not memory | one heavy gate, swap guard |
| Hole | after a 1800 s wait it **proceeds without a slot** | opt-in; ad-hoc `jest` bypasses it |

The queue (`do-it gate queue`, a host-level primitive):

1. **Memory budget, not slot count.** Each gate declares its expected peak (pilot examples: the large suite ~3 GB with
   `workerIdleMemoryLimit`, a UI suite ~1 GB). Admit when free memory covers the peak, pressure is normal and swap is under
   a threshold. Small gates pass while a big one runs.
2. **Visible FIFO.** Example: `[gate-queue] position 2/3 · waiting for 2.1 GB free · ahead: api-train (pid 27681)`.
3. **Never admitted without a slot.** A wait past the timeout fails with the reason. It never proceeds into a loaded machine.
4. **Live-owner lock.** The lock records PID + cwd. A dead holder frees its slot automatically, so no 33-min stale lock
   like the one on 2026-10-06.
5. **Cleans its own children on exit.** It ends the worker processes it started, by PID tree, never by name pattern.
   This covers jest hanging after green on open handles.
6. **One entry point.** pre-push, deploy gate and manual runs call the same command, so nobody has to remember it.

Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`).

## 7. Pieces

| ID | Piece | Notes |
|---|---|---|
| P1 | Ledger schema + store (`core/gates/ledger.mjs`, JSONL, compaction, lock) | zero-dependency like the spine |
| P2 | Runner adapters: jest reporter, vitest reporter, pytest plugin | incremental write; the adapter computes the closure |
| P3 | Fingerprint + invalidation (closure hash, CORE set, env fingerprint) | reuse a pilot repo's selector logic for Python |
| P4 | `do-it gate run` CLI: tiers, `--resume`, composed verdict, named legs | output contract in §4 |
| P5 | Pipeline stages: T2-at-last-merge in the conductor, T3 schedule, optional `gates` settings block | answers §5, §5.1 |
| P6 | Gate queue: memory-budget admission, FIFO, live-owner lock, child cleanup | §6, §6.1 |
| P7 | First consumer: the pilot consumer's pre-push calls `do-it gate run` | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3) |

## 8. Test contract sketch (binding once planned)

- T-01 A run killed after N of M files resumes and runs exactly M−N files, plus guards.
- T-02 Editing a module re-runs exactly the files whose closure contains it, compared against the resolver's own
  related-tests list.
- T-03 Editing a CORE file re-runs everything.
- T-04 A corrupt or missing ledger row re-runs that file and never skips it.
- T-05 A planted order-dependent test passes composed and fails under T3 clean, and is flagged `UNSTABLE_UNDER_REUSE`.
  This proves the T3 safety net can fail (pilot consumer rule R3).
- T-06 A flaky file never yields a reusable PASS until it has passed twice in a row.
- T-07 The composed verdict line names its reused count, its source runs and the oldest timestamp.
- T-08 Under simulated memory pressure the heavy tier waits in the queue and does not start.
- T-09 [REAL] the pilot consumer repo (path in KICKOFF): fail one suite at ~70% of a full run, fix it, resume. Wall time is below 25% of a clean
  full run, and the same tree then passes T3 clean.
- T-10 Two worktrees of the same repo share one ledger without corrupting it (concurrent append under lock).
- T-11 A project with no `gates` block runs the whole pipeline. Every gate stage prints a visible `[skip] … no gate
  declared` and nothing fails.
- T-12 A gate that waits past the queue timeout fails with the reason. It never runs without a slot.
- T-13 A slot whose owner PID is dead is reclaimed on the next admission check.
- T-14 With a big gate admitted, a small gate whose peak fits the remaining budget is admitted. One that does not fit
  waits.
- T-15 On exit (pass, fail or SIGTERM) the queue leaves no child process of the gate alive.

## 9. Open questions for the owner

1. Does a **composed T2** count as the merge/deploy gate, with T3 clean every night as the safety net? Recommended: yes.
   Otherwise the saving only applies to fix-and-retry loops.
2. Runners for v1: jest + vitest + pytest (all pilot repos), or jest first (the largest suite is about 80% of the cost)?
   Recommended: jest first, then pytest (a dense import graph benefits less), then vitest.
3. Ledger scope: per machine (`git-common-dir`) only, or also shareable with a future off-box gate runner?
   Recommended: per machine in v1, with a store interface that allows a remote store later.

Next step: `/plan-it` on this folder. It is planning only, with zero code until G4.

---
_Authored for DevOtts (https://github.com/DevOtts)._
