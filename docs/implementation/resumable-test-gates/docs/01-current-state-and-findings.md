# 01 — Current state and findings

Run: plan-it `resumable-test-gates` (do-it run r-20261106-130657-7ff2), 2026-11-06. Sources: `research/01-do-it-repo.md`
(do-it repo), `research/02-engine-gates.md` (the pilot consumer's gates), `research/03-runners-and-fingerprint.md` (runner internals and
fingerprint soundness). Every claim below cites a path:line from those reports or the code. MEASURED = read or counted on
2026-11-06; ESTIMATED = inference. No test, gate or suite was run to produce this document.

The owner's demand, verbatim: *"Se o teste tem 700 testes, já rodamos 500 com sucesso e deu um erro, reiniciar os 500 é
um absurdo. A própria implementation deveria salvar esse status."* (README header).

## 1. The cost, re-measured

| Claim in README §1 | Re-measured | Evidence |
|---|---|---|
| pilot's largest suite ≈ 1,340 suites / 12,300 cases | **1,624 spec files at origin/main** (190 `*.real-mongo.spec.ts`, 17 ignored by config) → ~1,607 jest-eligible. 1,328–1,363 suites was the 2026-10-09 snapshot; 1,451 at ~10-21 | MEASURED, research/02 §2.2, §2.9 |
| median of 20 archived full runs 630 s, range 260–1,794 s | **14** archived full runs with a duration (+1 count-only); median **686 s**; max 1,794 s confirmed; min **293.7 s** (not 260 s) | MEASURED, research/02 §2.9 table |
| real gate 25–70 min | the pilot's own doc says "~2 h" under contention (addendum 2026-11-02); no archived wall-clock for whole gates | ESTIMATED, research/02 §2.7 |
| spread is test content | spread is mostly **cold vs warm ts-jest transform cache** (same tree 696→300 s and 676→297 s) and contention | MEASURED, research/02 §2.9 |

Per-file distribution (warm run, 1,339 files): p50 0.28 s, p90 1.2 s, max 16.2 s, top 200 files = 56% of summed time,
real-mongo files = 32% of summed time. Contended run: p50 1.48 s, max 32 s, real-mongo 25%. No file exceeds 60 s
(MEASURED, research/02 §2.9). **Consequence:** per-file granularity pays; a killed run loses at most one ≤32 s file once
rows are written per file.

## 2. Pilot consumer gate surface today (P7 consumer)

1. **12 pilot repos carry a pre-push hook script** (11 in the pilot's hook installer + 1 docs repo), not 9
   (pilot measurement, research/02 §2.5).
2. **The pilot's largest repo has a pre-push hook with several legs** (872 lines): delete fast path
   `:89-104`; gate slot acquired `:117-120` **before every leg including 1-minute lints**; `.env` + Mongo probes; lints
   `:379-487`; **leg 3/5 diff-coverage runs `npx jest --coverage` over the WHOLE suite** when the diff touches
   four source directories (`:501-522`, diff-coverage script `:15-17,110,174`); leg 4/5
   `jest --changedSince` unit leg + real-mongo in-band leg (`:557-629`); leg 4b 13 ALWAYS_RUN_GUARDS (`:175-253`,
   `:638-662`); leg 5/5 `npm run build` = the type gate (`:669-676`); highway (`:699-790`); verdict tokens `[OK]`,
   `[OK-PARTIAL]`, `[OK-RETRIED]`, `[BLOCK] … Failing leg(s)` (`:142-164,849-872`) (research/02 §2.1).
3. **The unit leg and the real-mongo leg already write jest `--json --outputFile` and delete it**
   (the unit-leg retry script and the real-mongo leg script `:104`) — the per-file results are in hand and
   thrown away (research/02 §2.1).
4. **No stamp in the largest repo.** Only one Python pilot repo keeps a tree stamp: `<git-common-dir>/gate-stamps/<tree>.json`
   (its gate runner `:124-133,212-221`), reuse iff `result==pass`, same hand-bumped `GATE_VERSION=2`
   (`:48`), tier rank ≥ requested (research/02 §2.4).
5. **`jest.config.js` (the pilot's largest repo):** single project; `setupFiles: ["dotenv/config", …loopback-default.setup.ts]` (`:13`);
   `maxWorkers: 2` (`:15`); per-worktree `cacheDirectory` (`:39`); `collectCoverage: true` (`:67`); custom reporters
   (`:75-79`); ts-jest inline tsconfig with `emitDecoratorMetadata` and `diagnostics: false`, **no `isolatedModules`**
   (`:80-100`); no `workerIdleMemoryLimit`. Installed jest 29.7.0, ts-jest 29.4.14, TypeScript 5.9.3 (research/02 §2.2).
6. **The slot script** is a per-repo copy in **3 of 12 pilot repos** (two identical, one differing by one line),
   flock-based (kernel releases a dead holder), a slot count of 2, a timeout of 1800 s, and **proceeds without a slot
   after the timeout** (slot script `:64-67`) by design of a pilot rule. It depends on Homebrew `flock`, which macOS
   does not ship (research/02 §2.3).
7. **An archived single-heavy-job script** (58 lines):
   mkdir lock with owner PID, dead-owner reclaim, swap guard 75% (`:18,29-31`), polls forever, opt-in, counts only
   two repos' pushes (research/02 §2.3).
8. **Env vars:** the slot dir, poll and timeout variables are already "approved cleanup (W2/W3)" in the curated catalog
   (pilot env-var catalog `:302-304`), the slot count variable live (`:519`). The Python repo's gate env vars are absent from the
   catalog (research/02 §2.8).
9. **Runners in the fleet:** jest 29 (three repos), jest 30 (one backend), vitest 2/3/4
   (three repos, one on 4.1.9), pytest 7.4.4 + xdist 3.8.0 (one repo), plain pytest
   (three small repos), mixed per app (one multi-app repo) (research/02 §2.5, research/03 §1).

## 3. Pilot consumer rules the plan must honour or amend

The pilot's local-merge-gate rules are the consumer's own. Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`). The relations below stay as design inputs.

| Rule | Text (short) | Relation to this plan | Cite |
|---|---|---|---|
| scoping | scope big suites to the change and say so; the Python repo's stamp "never run the same tree twice" | compatible; per-file reuse generalises the stamp | pilot rules doc `:76-100` |
| prove-it | prove the gate can fail (inject defect → `[BLOCK]`; revert → `[OK]`) | binds every new leg; T-05 class | `:102-129` |
| full run | run the FULL suite once after the last merge | **conflict** with a composed T2 unless amended; founding incidents were grep fences with no import edge | `:464-494` |
| no re-run | do not re-run a passed tree; quote the `[reuse]` line; no per-turn polling | compatible; queue waits must not poll per model turn | `:496-518` |
| flake retry | real-mongo flake retry with a named token; a failed retry is real | a retry-pass must be FLAKY, not a reusable PASS | `:679-696` |
| red baseline | judge a red by "adds failures vs origin/main" | stored FAIL rows give a failure-set baseline | `:698-746` |
| machine cap | machine cap; **degrade to proceed without a slot** after timeout | **conflict** with owner ruling §6.1 #3; must be amended | `:863-886` |
| scoped retry | scoped retry only for failed files, named `[RETRIED]` | compatible; resume generalises it | `:908-943` |

No pilot rule defines "quarantine" or "pass twice in a row" (MEASURED grep, research/02 §2.7) — both are new.

## 4. do-it repo surface (P1–P6 home)

1. **CLI:** 12 verbs (`core/spine/src/cli.mjs:30`); `gate` already exists with 7 run-bound lifecycle subcommands
   (`cli.mjs:180-193`) that call `selectRunId` and throw `NO_RUN` without a run. A pre-push hook has no run, so the new
   test-gate subcommands must be run-free. `BOOL_FLAGS` is a closed set (`cli.mjs:29`): a missing `--resume` entry makes
   `--resume T2` parse as `resume=T2` (research/01 §2.1).
2. **Zero-dependency** is enforced only by the bundler `core/spine/build.mjs`: `node:`/relative imports only (`:32-39`),
   named exports only (`:40`), **globally unique top-level names** (`:44-47`), schemas auto-embedded (`:51-54`).
   `core/gates/` is not a bundler source. Code that must run inside jest/vitest/pytest cannot be bundled at all.
   Mirror pairs live in `scripts/mirror-manifest.json` (research/01 §2.1).
3. **"ledger" is taken three times:** `core/spine/src/ledger.mjs` (`do-it-ledger/1`, per-run DoD evidence; exports
   `readLedger/writeLedger` — bundled names), `core/pipelines/drain-ledger.mjs` (card dispositions), `ledger.json`
   (research/01 §2.6). A module named `ledger.mjs` with the same exports fails the bundler.
4. **Settings:** defaults → `~/.do-it/settings.json` → `<main>/.do-it/settings.json` → `--set`
   (`settings.mjs:106-173`); schema root `additionalProperties: false` (`settings.schema.json:5`) so `gates` is rejected
   today; `--set` accepts only default leaves (`settings.mjs:160-162`), so `gates` must be in `SETTINGS_DEFAULTS` with
   `null` leaves; `settings.tiers` = MODEL tiers (`tier-policy.mjs:18,28`, `hosts/claude-code/tiers.json:6`)
   (research/01 §2.2).
5. **Tier label collision:** README gate tiers T0–T3 reuse the spine's model-tier labels with inverted cost meaning; the
   pipeline `tier:` field and events `tier` column already mean model tier (`lint-pipelines.mjs:11`,
   `events.schema.json`) (research/01 §2.2 #17).
6. **Pipelines:** step types `persona|checkpoint|decision|code` (`lint-pipelines.mjs:9`, duplicated in
   the host compile guards); the spine never executes a `code` step — `next.mjs:13` returns
   `action: RUN_CODE` and the conductor runs it and records an `it-result/1`. A `gate-train` step can be `type: code`
   with a new `adapter:` label and zero step-type changes (research/01 §2.3).
7. **"Merged" is unknown to the spine.** `slice.status = DONE` means a result was recorded, not that a PR landed
   (`record.mjs:341-365`); the nearest data is `it-result/1.head_sha` (`it-result.1.schema.json:12`) (research/01 §2.3).
8. **No lock primitive** anywhere (`fs-atomic.mjs:10-44`; grep). **No recurring scheduler**: only a run-scoped one-shot
   wake via `DO_IT_HOST_WAKE` (`wake.mjs:16-36`) (research/01 §2.1 #8, §2.7).
9. **Host-level state** today is only `~/.do-it/settings.json` and `~/.do-it/bin/`; tests sandbox `HOME`
   (`core/spine/test/helpers.mjs:25-31`) (research/01 §2.4).
10. **Tests** run on `node:test`; fault injection via `DO_IT_FAULT` / `DO_IT_STORE_CRASH` env hooks (`fs-atomic.mjs:19`,
    `local-fs.mjs`); case IDs appear in test names (research/01 §2.5).

## 5. Runner facts that decide correctness (P2, P3)

1. **jest reporters run in the parent and are awaited per file** (`@jest/core/build/ReporterDispatcher.js:27-33`,
   `TestScheduler.js:386-390`) — a synchronous append per file is ordered (research/03 F1–F2).
2. **A crashed suite reports `numFailingTests: 0`** with the error in `testExecError`
   (`@jest/test-result/build/helpers.js:54-86`): worker crash, zero-test suite and leak all look like "no failures".
   The PASS predicate must be `testExecError == null && numFailingTests == 0 && !failureMessage && numPassingTests > 0`
   (research/03 F4). **This is the single most dangerous false-PASS path.**
3. Interrupt/bail drops later results silently (`TestScheduler.js:126-127,162-163`) — safe: they rerun (F5).
4. A worker crash is retried up to 4 times (`jest-runner/build/index.js:136`) (F6).
5. **Forward closure:** `DependencyResolver.resolve()` gives direct deps only and silently drops unresolvable specifiers
   (`jest-resolve-dependencies/build/index.js:81-134`); a BFS from the test file with the reporter's own
   `test.context.{resolver,hasteFS}` gives the closure with the same resolver `--findRelatedTests` uses (F10). The regex
   extractor misses dynamic requires, `jest.mock` paths, `import type`, fs reads, snapshots, setup files, root
   `__mocks__` (`jest-haste-map/build/lib/dependencyExtractor.js`) (F11).
6. **Exact-set execution:** `--filter <module>` is the clean skip hook (`jest-cli/build/args.js:266`,
   `SearchSource.js:369-388`); `--runTestsByPath` silently drops non-test paths (`SearchSource.js:283-291`) (F7).
7. **`workerIdleMemoryLimit`** exists in 29.7, is a % of **total** RAM, is checked only **between** files, and is a
   no-op in band (auto when `maxWorkers<=1` or ≤20 fast tests) (`jest-config/build/normalize.js:969-973`,
   `testSchedulerHelper.js:47-55`) (F8).
8. **ts-jest `isolatedModules`** (deprecated option in 29.4; effective switch is tsconfig `isolatedModules`) changes emit
   (`const enum`, decorator metadata that NestJS DI uses); for the pilot's largest repo type errors already do not fail tests
   (`diagnostics: false`) (F14–F15).
9. **vitest 4.1.9:** per-file hook is `onTestModuleEnd`; `onFinished`/`onTaskUpdate` are gone; unhandled errors arrive
   only at `onTestRunEnd`; **`poolOptions` memory limits do not exist** — only `vmMemoryLimit` for vm pools (F17–F20).
10. **pytest 7.4.4 + xdist 3.8.0:** every report (incl. synthesized crash reports) reaches the controller
    (`xdist/dsession.py:326-329,432-452`); `--dist load` spreads one file over several workers, so "file finished" is
    computed on the controller from the collected item list; a deselected file produces no reports (F21–F22).
    `pytest-rerunfailures` 12.0 is installed: a pass after a rerun is FLAKY (F23).

## 6. Fingerprint soundness — what README §2's key misses (crown jewel)

research/03 §2.6 lists 24 inputs; the high-severity ones that would produce a **silent false PASS in the pilot today**:

| # | Missed input | Evidence (MEASURED) |
|---|---|---|
| H1 | crash classified as pass | F4 above |
| H2 | **installed deps ≠ lockfile**: the pilot's largest repo main checkout `package-lock.json` vs `node_modules/.package-lock.json` differ in 198 of 860 entries | research/03 table #2 |
| H3 | **gitignored build output in the closure**: two internal workspace packages resolve to `packages/*/dist/index.js` (gitignored, built by postinstall) | research/03 F12 |
| H4 | **`.env` values** loaded by `dotenv/config` in every test decide whether 190+ real-mongo specs run or self-skip | research/03 F12 |
| H5 | self-skipped suites recorded as PASS | research/03 table #6 |
| H6 | **runtime file reads**: 208 specs call `readFileSync|readdirSync|execSync|spawnSync|git ls-files` vs 13 hand-kept guards (~6%) | research/03 F12 |
| H7 | setupFiles/reporters/transformer and their closures | `jest.config.js:13,75-99` |
| H8 | the gate code itself (a hand-bumped `GATE_VERSION` drifts) | `run.sh:48` |

Medium: snapshots, root `__mocks__`, `import type` edges, Node/ICU/OS/CPU count (declared Node range 20.x vs installed v22.23.2),
**time** (406 specs touch the clock), DB/fs pollution, external images, runner seed and flags, non-py data
files in the Python repo. Full table: research/03 §2.6.

**Content vs blob:** git blob ids cannot see ignored/untracked inputs or the installed tree. Hash raw on-disk bytes with
repo-relative POSIX paths; use `blob id → sha256` only as a speed memo (research/03 F26). **Dirty tree:** the hook tests
the working tree but git pushes the commit (pilot addendum 2026-11-02 item 1) — a content-keyed row is sound, but a
verdict from a dirty tree must never stamp a commit (research/02 §2.1, research/03 F26).

## 7. Admission signals (P6)

Live 2026-11-06T13:13–13:16Z (MEASURED, read-only): `kern.memorystatus_vm_pressure_level` = 1 (normal; 2 warn, 4
critical per `dispatch/source.h:255-257`), `kern.memorystatus_level` = 60, swap used 2,627–2,643 of 4,096 MB (macOS swap
total grows on demand, so a "% of total" is not a ceiling), `hw.memsize` 18 GiB, page size 16 KiB, `vm_stat` free pages ≈
69–870 MiB, `os.freemem()` 0.94 GB, estimator `(total − anonymous − wired − compressor) × pagesize` = 4.68 GB, no gate
process running (research/02 §2.10, research/03 §2.8). **`os.freemem()` and "Pages free" would block every gate on a
healthy Mac.** Linux: `/proc/meminfo MemAvailable`, PSI `/proc/pressure/memory`, cgroup v2 `memory.max/current`
(research/03 F31, from kernel docs — not measurable here).

## 8. Contradictions with the README, adjudicated

| # | README says | Finding | Adjudication |
|---|---|---|---|
| C1 | ~1,340 suites, median 630 s over 20 runs | 1,624 files; 14 runs, median 686 s | corrected in docs; the decision does not change |
| C2 | slot script "in every pre-push" | 3 of 12 repos | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3) |
| C3 | key uses lockfile hash | installed tree diverges from lockfile | key the installed state; keep the lockfile hash too |
| C4 | env names only, never values | values gate real-mongo | names + salted HMAC of declared values (R7) |
| C5 | closure from runner resolver + text rule | config inputs and runtime reads escape | add CORE closure, WIDE key class, never-reuse globs |
| C6 | "one row per finished file" implies pass/fail | crash = 0 failures | explicit PASS predicate in the CONTRACT |
| C7 | vitest `poolOptions` memory limits | do not exist in 4.1.9 | vitest hint = `maxWorkers` + `execArgv` only |
| C8 | `isolatedModules` evaluation = type-error risk | emit-semantics risk; types already off | evaluation is a measured spike behind T3 clean, no flip in this program (R10) |
| C9 | composed T2 can feed every leg | diff-coverage needs lcov of every file | diff-coverage stays a fresh leg in v1 (owner question OQ-4) |
| C10 | "~490 of 700 reused" after an edit | NestJS closures are probably wide; ratio UNKNOWN | measure in the pilot's adoption (closure-size spike, no test run) before claiming a saving |
| C11 | stale lock incident blamed on slot design | the slot script is kernel-released; the stale lock was the single-heavy-job script's mkdir lock | live-owner lock still required (PID + start time) |
| C12 | conductor knows which PRs are merged | spine has no merged field | train detection via `head_sha` ancestry or an owner "train closed" answer (R12) |
| C13 | `ledger.mjs`, T0–T3 labels | names taken | store renamed `gate-results`; CLI scopes `edit|push|train|nightly` (R1, R2) |
| C14 | owner ruling "never run without a slot" | a pilot rule says the opposite | the ruling stands; the pilot amends its rule in its own program (do-it 1.1 R3); the gate returns a retryable `[WAIT-TIMEOUT]` (not `[BLOCK]`) |
