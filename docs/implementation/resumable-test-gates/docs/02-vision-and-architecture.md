# 02 — Vision and architecture

Where this doc and a PRD disagree, this doc wins; where this doc and `delivery/CONTRACT.md` disagree, the CONTRACT wins.

## 1. The want, in the owner's words, mapped

| Owner want (README / rulings) | Architectural answer |
|---|---|
| "reiniciar os 500 é um absurdo" — a partial pass must be saved | a per-test-file **gate results store** written the moment each file finishes (P1, P2) |
| "a própria implementation deveria salvar esse status" | the store lives with the code (`<git-common-dir>/do-it/gate-results/`), shared by every worktree, never tracked |
| reuse must never lie | a **fingerprint** of everything that can change a file's outcome (P3) + a **composed verdict** that names its sources (P4) + **T3 clean** that can catch what reuse cannot (P4) |
| do-it must not assume a project has tests (§5.1 ruling) | do-it owns *when* (push, train complete, nightly); the project owns *what* (`gates` block, optional, visible skip) (P5) |
| one deterministic machine queue, never run without a slot (§6.1 ruling) | `do-it gate queue`: memory-budget admission, visible FIFO, live-owner lock, child cleanup, one entry point (P6) |
| the largest suite first (80% of the cost) | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3); then pytest/vitest (P7) |

## 2. Principles (each solves a finding in docs/01)

1. **Every error path fails toward running more** (README §3). A missing, corrupt, unreadable, tainted or expired row,
   a resolver crash, an unresolved import, or an unknown key component means *run the file*. Reuse is the exception that
   must be proven, never the default that must be disproven.
2. **Key on what was actually tested, not on what git says** (docs/01 §6 H2–H4). Hash raw on-disk bytes with
   repo-relative paths; hash the installed dependency tree, not only the lockfile; hash declared env *values* with a
   machine-local salt.
3. **A PASS is a positive observation** (docs/01 §5.2). PASS needs zero failures, no execution error and at least one
   passing case. Crash, zero tests, all skipped, deselected, retried-then-passed are never a reusable PASS.
4. **A failure cannot be laundered** (research/03 §2.7). Any FAIL on the same key since the last two consecutive PASSes
   blocks reuse; "latest wins" is forbidden.
5. **A composed verdict says it is composed** (README §4). No bare `[OK]`. The line names fresh vs reused counts, the
   source run ids, the oldest reused timestamp and whether the tree was dirty.
6. **Reuse cannot see order, pollution or time; a clean run can.** T3 runs clean (no store reads), rewrites the store,
   and flags any file that passed composed but fails clean as `UNSTABLE_UNDER_REUSE`. Reused PASSes expire after 24 h or
   at the last T3, whichever is sooner (R9).
7. **do-it owns the trigger, the project owns the command** (§5.1). The spine never decides what a test is. A project
   with no `gates` block behaves exactly as today and prints a visible skip per stage.
8. **One queue per machine, deterministic, never bypassed** (§6.1). Memory budget, not slot count. A wait past the timeout
   ends in a retryable `[WAIT-TIMEOUT]`, never in a run on a loaded machine.
9. **Names do not collide** (docs/01 §4.3, §4.5). The store is `gate-results`, not "ledger"; gate scopes are
   `edit | push | train | nightly`, not T0–T3, inside do-it (T1–T3 stay model tiers).
10. **Zero dependency in the spine; runner code ships beside it** (docs/01 §4.2). CLI, store, fingerprint core, verdict
    and queue are bundled spine modules; jest/vitest reporters and the pytest plugin are standalone files that run inside
    the runner process and talk to the spine only through the store's files and a CLI call.

## 3. Shape

```
                    ┌────────────────────────────── project (data) ──────────────────────────────┐
                    │ .do-it/settings.json  gates.{on_push,on_train_complete,nightly,peak_mb,reuse} │
                    └───────────────┬───────────────────────────────────────────────────────────────┘
 trigger (do-it)                    │ command string
  pre-push hook ─┐                  ▼
  gate-train step ├──► do-it gate queue --peak-mb N -- <command>   (P6: admit, FIFO, lock, cleanup)
  nightly job ───┘                  │
                                    ▼
                   <command> = do-it gate run --scope push|train|nightly [--resume|--clean] --runner jest -- <jest argv>
                                    │  (P4)
             ┌──────────────────────┼─────────────────────────────┐
             ▼                      ▼                             ▼
   fingerprint (P3)          runner adapter (P2)            verdict composer (P4)
   key_now(f) per file       jest reporter + filter          reads store fold, writes
   CORE / WIDE / NEVER        writes one row per file         [COMPOSED …] / [FRESH …] / [FAIL …]
             │                      │                             │
             └──────────────► gate results store (P1) ◄───────────┘
                     <git-common-dir>/do-it/gate-results/*.jsonl  (append-only, CRC per row, lock for compaction)
```

- `do-it gate run` is **run-free** (works from a pre-push hook with no do-it run); `do-it gate train` is run-bound (it
  reads the plan's slices) and calls `gate run` under the queue.
- The adapter computes the closure inside the runner process (it holds the resolver); the spine computes the CORE,
  installed and env components (it does not need the runner). Both sides use the same `rtg-key/1` canonical manifest and
  SHA-256, so Node and Python agree byte-for-byte (research/03 F27).
- Skip is applied by the adapter through the runner's own selection hook (jest `--filter`, pytest
  `pytest_collection_modifyitems`, vitest file list), so the runner never even loads a reused file.

## 4. The confusing parts, modeled

Four workflows are stateful and failure-laden; each is modeled explicitly in `docs/03` §6 and frozen in CONTRACT §8:

- **M1 result-row fold** — the lifecycle of one test file's reusability (PASS, FAIL, FLAKY, KILLED, UNSTABLE, EXPIRED,
  CORRUPT …).
- **M2 gate run** — one `do-it gate run` from selection to verdict, including interruption and resume.
- **M3 queue ticket** — waiting, admission, dead-owner reclaim, timeout, cleanup.
- **M4 train gate** — train detection, gating the integrated tree, skip, failure and escalation.

## 5. What is reused, kept, discarded

| Existing thing | Verdict | Why |
|---|---|---|
| a consumer's existing tree stamp + scratch worktree | **keep**; its scratch-worktree pattern becomes the train gate's tree isolation | proven, and solves working-tree vs commit (research/02 §2.4) |
| a consumer's Python static graph + text rule + `CORE_PATTERNS` | **promote** into the pytest adapter's forward closure (BFS over `imports_of` + text rule) | reverse selector already handles dynamic `mock.patch` strings (research/03 F24) |
| a consumer's unit-leg and real-mongo-leg JSON | **replace** the discard with a store write (the reporter writes rows directly) | per-file results are already produced (research/02 §2.1) |
| a consumer's 13 ALWAYS_RUN_GUARDS | **promote** into `gates.reuse.always_run` (data), plus the grep-fence spec its full-run rule names | the graph cannot see them (research/02 §2.7) |
| a consumer's existing slot script (3 repos) | **replace inside**: the function body calls `do-it gate queue`; the never-proceed rule replaces the timeout-proceed | owner ruling §6.1 |
| a consumer's archived heavy-job script | **retire** | subsumed by the queue (swap guard, owner lock, HOLD) |
| jest `--onlyFailures` / `.jest-cache` | **not reused** for verdicts | not durable, not keyed (research/03 F13) |
| Bazel / Nx / Turborepo | **not adopted** | same idea, but each is a new dependency and build model; the spine is zero-dependency |

## 6. Honest limits (said up front, carried into the CONTRACT)

- Reuse after an edit depends on closure width. For NestJS specs the reuse ratio after a typical edit is **UNKNOWN**
  until the pilot's closure-size spike measures it. Kill-and-resume with no code change reuses ~100% regardless.
- A composed verdict cannot see cross-file pollution or time bombs; T3 can, at most 24 h later.
- The diff-coverage leg cannot be composed in v1 (needs every file's lcov) — OQ-4.
- vitest's forward graph is a private API in 4.1.9 (research/03 F19); the vitest adapter falls back to "never reusable"
  if the walk throws.
- Windows is out of scope (process groups, sysctl).
