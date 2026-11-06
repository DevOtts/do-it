# PRD-3 — Runner adapters (jest, pytest, vitest)

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

Squad SQ-B (tier T2, spec'd drafting) · lane `adapters` · epics A1 jest (W2), A2 pytest (W3), A3 vitest (W4).
Where this PRD and CONTRACT.md disagree, CONTRACT.md wins. Where it and `docs/02` disagree, `docs/02` wins. PRD-local
decisions are numbered D1 to D26 here and are not the owner rulings D1 to D5 of `DECISIONS.md`.

## 1. Summary

The adapters are the only code that runs inside a test runner's process. For every test file the runner finishes they
append one self-validating row to the gate results store, and before a run they decide which files can be skipped
because a reusable PASS already exists for the exact same key. Three adapters, one per runner, ordered by owner question
OQ-2's default: the jest reporter, filter and closure module (A1, W2), the pytest plugin (A2, W3) and the vitest reporter
(A3, W4). Each ships as a standalone file set under `core/gates/adapters/` (not bundled into `do-it.mjs`), mirrored into
the plugin by one mirror-manifest row, with fixture repositories and a node:test suite under `core/gates/tests/`.

## 2. Problem and goals

Problem (docs/01, research/03): a gate that dies at 70% restarts all of its files, because nothing writes a per-file
verdict while the runner is alive. The runners already produce exactly the data needed (jest `onTestFileResult`, xdist
controller `pytest_runtest_logreport`, vitest `onTestModuleEnd`), but each hides a trap that turns a saved verdict into a
false PASS: jest reports a crashed suite with `numFailingTests: 0` (research/03 F4), `--runTestsByPath` silently drops
non-test paths (F7), xdist spreads one file over several workers (F22), vitest raises unhandled errors after the module
ended (F18).

Goals:

1. One row per finished file, written the moment the file finishes, by one process per runner invocation, one `write()`
   per row, at most 4096 bytes, CRC per row (CONTRACT §2.1, R23).
2. A PASS only under the PASS predicate (G-2). Crash, zero tests, all skipped, deselected, retried-then-passed and tainted
   runs never become a reusable PASS.
3. Skip through the runner's own selection hook so the runner never loads a reused file (docs/02 §3), with an exact-set
   check so a skip can never silently shrink or grow the selection (R22).
4. A forward closure per test file that is at least as wide as the runner's own resolver, so editing a module re-runs
   exactly the files that import it (README T-02) and anything the extractor cannot see fails toward WIDE or toward
   running (G-1).
5. The adapters stay standalone, dependency-free beyond the runner and the language standard library, and byte-compatible
   with the spine on rows, CRC and the `rtg-key/1` manifest (G-15 spirit; CONTRACT §2.1, §2.2).

Non-goals: composing the verdict, the fold of rows into states, the key components the spine computes (L1, F1, V1, V2);
queue admission (Q1, Q2); consumer wiring of the reporter into its jest config (moved to the pilot consumer's own program, do-it 1.1 R3).

## 3. Users and jobs

| User | Job | What the adapter gives them |
|---|---|---|
| A developer whose push gate died at file 1,100 of 1,607 | "Do not make me restart" (D2) | finished files are on disk before the kill; resume selects only the rest |
| The do-it conductor and `gate run` (V1) | Compose an honest verdict | one row per file, `keys.json` for `decide`, and a `runner-report.json` with taint facts |
| A reviewer reading `do-it gate results --why FILE` | Know why a file re-ran | per-component digests in each row plus the recorded closure list (D10) |
| A consumer maintainer | Add the reporter to jest config without losing existing reporters | a reporter that coexists with `default`, the real-mongo and failure-summary reporters |
| The nightly clean run (V2) | Prove reuse did not lie | adapters that, under `clean`, read no rows and run every file |

## 4. Solution design (decisions)

### 4.1 Common to all adapters

**D1. Row format and writing.** Adapters write only the documented row (CONTRACT §2.1). Serialize with sorted keys (the
spine `canonicalJson`; Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`), CRC = first 16
hex of sha256 over that string without `crc`, one `fs.writeSync` on an `O_APPEND` descriptor (Python `os.write`) per row,
size at most 4096 bytes. When a row would exceed 4096 bytes, the failure text goes to `failures/{sha256}.txt`
(write-once, content-addressed) and the row keeps `failure_ref` (docs/03 §1, §3; R23; research/03 §2.7 "Write path
rules"). A write error never fails the test run: the adapter prints one `[do-it-gate] row write failed` line, marks the
run for `runner-report.json` reason `ROW_WRITE_FAILED`, and the file simply has no finish row, so it runs again (G-1).

**D2. Standalone, not bundled; CommonJS for jest.** `build.mjs` bundles only spine modules and demands `node:` imports
and unique top-level names (research/01 §2.1 #5, `build.mjs:40-47`). Code that runs inside another process cannot be
bundled (research/01 §5 question 2), so adapters are separate files: `core/gates/adapters/jest/{reporter,filter,closure}.cjs`
(jest 29 loads reporters and filter modules with `require`, and the repo's jest config may be CommonJS), `pytest/do_it_gate.py`,
`vitest/reporter.mjs` (vitest 4 is ESM; CONTRACT §3). Each file imports only `node:` built-ins and the runner's own
packages resolved from the project, never `do-it.mjs`. Consequence: the adapter re-implements the row writer, CRC and
manifest composer; D18 binds those copies to the spine by golden-vector tests.

**D3. Mirror manifest.** One new pair in `scripts/mirror-manifest.json`: `{ "src": "core/gates/adapters", "dst":
"plugins/do-it/gates/adapters", "kind": "dir" }`. The CONTRACT says "the row for core/gates"; the narrower `core/gates/adapters`
source is deliberate, because `sync-mirror.mjs` copies a directory recursively (`scripts/sync-mirror.mjs:31`, research/01
§2.1 #6) and `core/pipelines/tests` already shows tests being mirrored, which would ship the 30-file jest fixture and the
pytest and vitest fixtures into every plugin install. Accepted as CONTRACT §11 A2. Locating the adapter directory at run
time (`dirname(do-it.mjs)/../gates/adapters` in the plugin, `../../gates/adapters` in the repo) belongs to V1.

**D4. Handshake: the run directory (CONTRACT §11 A1, A11).** `gate run` writes `{os.tmpdir()}/do-it-gate-{run_id}/` with `manifest.json` (`rtg-manifest/1`, schema `core/schemas/gate-manifest.1.schema.json`, store lane). jest and vitest find it through the do-it-internal environment variable `DO_IT_GATE_MANIFEST` (jest-cli validates argv and rejects unknown options: `jest-cli/build/run.js:156`, `jest-validate/build/validateCLIOptions.js:40-76`); pytest takes the real option `--do-it-manifest`. The variable is do-it-internal (R19), not a consumer env var. Each adapter ships `adapter.json` (CONTRACT §11 A2) read by `gate run`. Test-only switches: `DO_IT_REAL_JEST`, `DO_IT_REAL_PYTHON`, `DO_IT_REAL_VITEST` (A11).

**D5. Files exchanged in the run directory.** `manifest.json` (spine writes; `run_id`, `scope`, `leg`, `clean`, `resume`, `tree_dirty`, `components` with the spine-computed gate, runner, core, installed, env lines, platform and tree, `never`, `env_names` for redaction in D11, `repo_root`, optional `selection` with its sent count and optional `worker_idle_memory_limit`); `keys.json` (adapter writes: per file `{file, class, deps:[{path, sha256}], unknown}`); `run-list.json` (the spine's `decide` writes: the files to run, with the key and reason the spine computed); `runner-report.json` (adapter writes at exit: `tainted`, `reason`, `interrupted`, `unhandled_errors`, `sent`, `received`, `files_seen`). A missing, unreadable or schema-mismatched manifest means the adapter does nothing: no skip, no rows, runner exit code unchanged, one printed line (CONTRACT §6, G-1).

**D6. Who computes what.** The adapter computes only the per-file facts: the `class` (NARROW or WIDE by the CONTRACT §4.6 patterns over the test file and its repo-local closure members, or WIDE on any unresolved repo-local specifier) and the `dep` lines (repo-relative path, sha256 of raw bytes, `-` when missing, symlink hashed through the target with the realpath recorded, CONTRACT §2.2). The spine recomputes gate, core, installed, env and platform itself and composes the key. The adapter still carries a manifest composer (Node `Buffer.compare` ordering, Python `sorted(..., key=lambda s: s.encode())`, research/03 F27) to cross-check: the key it composes for a row must equal the key `decide` returned for that file; a mismatch writes no row for the file and sets runner-report reason `KEY_MISMATCH`. The dep hashes are taken when `keys.json` is written and re-hashed at finish; a change under the run writes no finish row and reason `KEY_DRIFT`, so a mid-run edit can never be reused.

**D7. The spine decides; the adapter never folds (CONTRACT §11 A1, A3).** Inside the runner's selection hook (jest `--filter`, pytest `pytest_collection_modifyitems`, vitest `select.mjs`) the adapter writes `keys.json`, calls `do-it gate decide --run-dir D` synchronously exactly once per run, reads `run-list.json` and runs only those files. Any decide error, non-zero exit, timeout, missing, unparseable or inconsistent `run-list.json` means the adapter runs every file (G-1). Files whose closure status is unknown (`unknown: true`) are added to the run list by the adapter. The adapter opens no store file for reading; `clean` therefore needs no special handling in the adapter (G-5 is the spine's). TTL, FLAKY, UNSTABLE, KILLED, NEVER and taint rules live in `gateFold` (L1) and `decide` (V1, V2). The reuse fold is not duplicated here.

**D8. Run list is law (R22).** The adapter runs exactly `run-list.json` and verifies it: jest counts `results.numTotalTestSuites` against the sent count, pytest checks `selected + deselected == collected`, vitest `select.mjs` prints exactly the list. A mismatch sets `COUNT_MISMATCH` in `runner-report.json` and returns a non-zero error from the runner hook where the runner supports it.

**D9. Rows and the runner report.** `gate run` writes `run_start` (with `pid` and `pid_start`, CONTRACT §11 A4) and `run_end`; the adapter writes at most one `start` and one `finish` per (file, leg, run) and, at exit, `runner-report.json`. The spine composes `run_end` from the report. Taint reasons: `UNHANDLED_ERRORS`, `FORCE_EXIT`, `OPEN_HANDLES`, `KEY_DRIFT`, `KEY_MISMATCH`, `ROW_WRITE_FAILED`, `COUNT_MISMATCH`. Interrupt and bail are reported with `interrupted: true` and reasons `INTERRUPTED` or `BAIL` and are not taint (A4); only `UNHANDLED_ERRORS`, `FORCE_EXIT` and `OPEN_HANDLES` set `tainted`. Reuse of rows of an interrupted run under `--resume` is the spine's rule.

**D10. Closure sidecar.** For each finish row the adapter writes the closure sidecar `closures/{sha256(leg:file)}.json` in the format the store lane documents (CONTRACT §11 A6): `{file, leg, key, deps:[{path, sha256}]}`, atomic rename, last writer wins. It serves `--why` and vitest's pre-run decision (D25). It is never authoritative: soundness comes only from the key, and a missing, corrupt or stale sidecar costs a re-run.

**D11. Failure side files and secrets.** A failing file's full text goes to `failures/{sha256}.txt`. Before hashing and
writing, the adapter replaces every occurrence of the value of each declared env name (`env_names`, value length at least 4)
with `[env:NAME]`, so values never reach rows, logs or side files (G-6, R7).

**D12. Every adapter error path fails toward running more (G-1).** No manifest, no store, unreadable store, corrupt row,
resolver or module-graph crash, unresolved repo-local import, unknown component: the file runs. An adapter exception inside
a runner hook is caught, printed once, and never changes the runner's exit code (CONTRACT §6).

### 4.2 jest adapter (A1)

**D13. Hooks.** One reporter in the parent process (research/03 F2; `TestScheduler.js:386-390`). `onRunStart` reads the run directory and the sent count; `onTestFileStart(test)` (dispatched from `TestScheduler.js:103`) writes the `start` row; `onTestFileResult(test, testResult)` writes the `finish` row (the dispatcher awaits each reporter in turn, `ReporterDispatcher.js:27-33`, so the append is ordered; it frees `coverage` and `console` right after, lines 36-37); `onRunComplete(contexts, results)` writes `runner-report.json`; `getLastError()` returns an error on `COUNT_MISMATCH` or `ROW_WRITE_FAILED` (jest reads it, `ReporterDispatcher.js:79-83`, `TestScheduler.js:311`) so the exit code is non-zero. The reporter is added through the repo's `reporters` array or by `gate run`; it never replaces the repo's own reporters (see Risks).

**D14. PASS predicate (F4).** `testExecError == null && numFailingTests == 0 && !failureMessage && numPassingTests > 0` is
PASS; `numPassingTests == 0` with pending or todo above zero is SKIPPED; everything else is FAIL, with `exec_error` true when
`testExecError` is set. `buildFailureTestResult` returns `numFailingTests: 0` with `testExecError` set
(`@jest/test-result/build/helpers.js:54-86`), and jest routes a worker crash, a zero-test suite (message "Your test suite
must contain at least one test", `TestScheduler.js:129-134`) and a detected leak through `onFailure`. Counts map as
`passed`, `failed`, `skipped` and `pending` (= `numPendingTests + numTodoTests`) (CONTRACT §2.1). `retried` is true when any case
has `invocations > 1` (`@jest/test-result/build/index.d.ts:121`), i.e. `jest.retryTimes`, and a retried PASS folds to
FLAKY (R18). A worker that died and was retried by jest-worker (`maxRetries: 3`, `jest-runner/build/index.js:136`,
`ChildProcessWorker.js:175-182`) is invisible to the reporter; it surfaces only as one FAIL after up to four attempts, which
is recorded as the single FAIL it is.

**D15. Interrupt and bail (F5).** `onResult` and `onFailure` return early when the watcher is interrupted
(`TestScheduler.js:125-127`) and `bail` sets interrupted (`:397-406`), so files finishing after the bail never reach the
reporter and get no row; they run again. "N of M" in the resume contract (README T-01) counts rows written, never files jest
started. A SIGKILL leaves `start` rows without `finish` rows, which the spine fold turns into KILLED using `run_start` `pid` and `pid_start` (CONTRACT §11 A4).

**D16. Exact-set execution (F7, R22).** The skip hook is `--filter` (`jest-cli/build/args.js:266`; applied in the parent after discovery, `SearchSource.js:369-388`): no argv-length limit, no regex collisions. The filter function receives only paths, so `filter.cjs` builds its own context from the manifest's runner argv using jest's public `readConfigs` (`jest-config/build/index.js:38`) and `Runtime.createContext` (`jest-runtime/build/index.d.ts:99`), reusing jest's haste cache, computes closures, writes `keys.json`, calls decide once and returns exactly the `run-list.json` files. If context building or decide fails it returns every path (G-1). Explicit-list legs use `--runTestsByPath`, which resolves against `config.cwd` and drops anything that is not a test file (`SearchSource.js:283-291`); the reporter compares the run-list size with `results.numTotalTestSuites` in `onRunComplete` and on a mismatch writes `COUNT_MISMATCH` to the report and returns an error from `getLastError()`. `--testPathPattern` is never used for exact sets. When every file is reused jest finds no tests and exits 1; `gate run` passes `--passWithNoTests` (V1).

**D17. Forward closure (F10, F11).** BFS from the test file using `DependencyResolver.resolve` (direct dependencies only,
`jest-resolve-dependencies/build/index.js:81-134`) with the resolver and haste fs from `test.context`
(`@jest/test-result/build/index.d.ts:157-170`) in the reporter, and from the filter's own context pre-run. Jest's resolver
reads the haste map's precomputed specifiers, which exclude `import type` and `jest.mock` literals
(`dependencyExtractor.js`), so `closure.cjs` additionally runs its own extractor over each member's text: the haste regex minus
the `import type` exclusion, plus `jest.mock`, `jest.doMock`, `jest.unmock` and `jest.requireActual` literals, plus the snapshot
path via the snapshot resolver (F11, F16), each specifier resolved through the same `resolver.resolveModule`. A specifier
that is repo-local-looking (relative, or matched by `moduleNameMapper` or `roots`) and does not resolve counts as unresolved and
makes the file WIDE. Template and variable `require` forms are treated as unresolved the same way. The closure is a strict
superset of `--findRelatedTests`, so README T-02 is tested as equality on plain import edges and as a documented superset on
type-only and mock-only edges. WIDE adds the manifest's tracked-tree hash (CONTRACT §2.2).

**D18. Parity with the spine.** The adapter keeps its own copies of canonical JSON, CRC and the manifest composer (D2). Every adapter epic carries golden-vector tests: the adapter's row bytes and `crc` equal the spine `canonicalJson` result over a golden corpus; the composed `rtg-key/1` manifest is byte-identical to F1's golden manifest; a row written by the adapter is accepted by the L1 scan. There is no differential test of a fold, because the adapter has none. A change to adapter source changes the `gate` component, since the spine hashes it (CONTRACT §2.2, G-7).

**D19. `workerIdleMemoryLimit` is a hint (F8).** The adapter exposes `memoryHint(config, totalMemBytes)`; `gate run` appends
`--workerIdleMemoryLimit` only when the repo config does not set it (repo config wins). It is checked only between files, takes
percentages of total RAM (`jest-config/build/normalize.js:969-973`) and does not stop one file that balloons. Correction to
research/03 F8 caveat (2): the in-band decision is `!workerIdleMemoryLimit && (oneWorkerOrLess || oneTestOrLess || fast ≤ 20)`
(`@jest/core/build/testSchedulerHelper.js:47-55`), so setting the hint forces worker processes even for small resume runs; it
does not become a no-op in band. That changes scheduling and so pollution exposure, which is why it is a hint the owner of the
repo config can override.

### 4.3 pytest plugin (A2)

**D20. Controller-only writes (F21, F22).** The plugin registers `pytest_runtest_logreport`, `pytest_collection_modifyitems`,
`pytest_collectreport`, `pytest_sessionfinish`. It writes only when `not hasattr(config, "workerinput")`: xdist workers load the
plugin too, serialize every report to the controller (`xdist/remote.py:281-289`), and the controller re-fires
`pytest_runtest_logreport` (`xdist/dsession.py:326-329`). Under plain `-n N` (`--dist load`) one file's items are spread over
workers, so per-file aggregation happens only on the controller. The expected node ids per file come from
`pytest_xdist_node_collection_finished(node, ids)` (`xdist/newhooks.py:89`; `dsession.py:274`) or, without xdist, from
`pytest_collection_modifyitems`. A file is complete when every expected node id has its teardown report. A crashed worker yields
a synthesized `failed` report with `when="???"` on the controller (`dsession.py:432-452`), recorded as FAIL with
`exec_error` true. A file that fails to collect is FAIL. A fully deselected file (`addopts -m "not integration"`,
a pilot repo's `pyproject.toml:172`) produces no reports and is written as DESELECTED, never missing and never PASS.

**D21. PASS and rerun.** PASS iff every expected node id has `call` outcome passed (or `skipped` is zero), no `rerun` outcome,
and at least one passed call. pytest-rerunfailures emits intermediate `rerun` outcomes (`pytest_rerunfailures.py:52-53`); a
pass after a rerun is `retried: true`, folds to FLAKY. xfail counts as `pending`. All-skipped is SKIPPED.

**D22. Closure and selection.** Forward closure is a Python port of a pilot repo's Python selector: AST `imports_of`, parent packages, `from a import b` as `a.b`, bare `x.y` retried under `src.` (selector `:132-192`), forward BFS (the original's reverse BFS is `:209-224`), plus modules named in `mock.patch("...")` string targets, plus non-py files the test text names (research/03 F24, F25). A syntax error in any closure member means closure unknown (`unknown: true`), so the file runs (the selector itself lets `SyntaxError` propagate to force the safe tier). `importlib.import_module` or `__import__` marks the file WIDE, as do the CONTRACT §4.6 Python patterns. In `pytest_collection_modifyitems` the plugin writes `keys.json`, calls decide once, and deselects every file not in `run-list.json`, checking `selected + deselected == collected`. The spine, not the plugin, computes `installed` and `platform` by spawning the project interpreter with `-I` (CONTRACT §11 A1); the plugin records the resolved `src` package root in `keys.json` only as a dep fact.

### 4.4 vitest reporter (A3)

**D23. Hooks (F17, F18).** `onTestModuleStart` (when a sidecar closure exists) writes `start`; `onTestModuleEnd(testModule)`
(`reporters.d.ts:1077`) writes `finish`, deciding by `testModule.state()` ∈ `passed|failed|skipped` and `errors()` for
collection or syntax errors; `onTestRunEnd(modules, unhandledErrors, reason)` (`:1058`, reason `passed|interrupted|failed` at
`:1040`) writes `runner-report.json`. Unhandled errors can surface after a module already ended passed, so any non-empty `unhandledErrors`
taints the run (`UNHANDLED_ERRORS`) and voids every PASS row of it. `onFinished` and `onTaskUpdate` do not exist in v4.

**D24. Closure with fallback (F19).** In `onInit(vitest)` the reporter keeps the project; at `onTestModuleEnd` it walks
`project.vite.environments.ssr.moduleGraph` (`getModuleById(id).importedModules`), stopping at `node_modules`, which is the graph the
run actually used, dynamic imports included. vitest's own `related` machinery uses the same idea internally
(`getTestDependencies`, `cli-api.24X8XwN1.js:11516-11531`) but on the private `Vitest.specifications` (`reporters.d.ts:1271`).
If the walk throws, that file's finish row is SKIPPED with `exec_error` true and a failure side file, never reusable, and the
run reason notes `CLOSURE_UNAVAILABLE` (CONTRACT §6; the exact row shape for "never reusable" is UNKNOWN and flagged in the
final report). `forceRerunTriggers` globs belong to CORE and are computed by the spine (CONTRACT §2.3).

**D25. Pre-run helper.** vitest's graph exists only after transform, so a fresh walk cannot precede the run. `vitest/select.mjs`, called by `gate run` before spawning vitest, reads each file's closure sidecar (D10), re-hashes the recorded dep lines into `keys.json` (a missing or corrupt sidecar sets `unknown: true`), calls decide once, and prints the `run-list.json` paths for vitest's file filter. A file whose closure gained a new import had a recorded member change, so its key still differs; the accepted hole is a new file shadowing a resolved import with no listed member changing, which the nightly clean run catches (R9, G-5).

**D26. No pool memory knob (F20).** vitest 4.1.9 has no `poolOptions`; `vmMemoryLimit` applies only to `vmForks` and `vmThreads`
(`cli-api.24X8XwN1.js:3772-3781`) and the default pool is `forks`. The adapter emits no memory hint, never sets a pool, and a source
check asserts the strings `poolOptions` and `vmMemoryLimit` do not appear in the adapter.

## 5. Epics

| Epic | Title | Wave | Branch | Depends on | Cases |
|---|---|---|---|---|---|
| A1 | jest adapter | W2 | `epic/A1-jest` | L1, F1 | 17 (Real 8) |
| A2 | pytest plugin | W3 | `epic/A2-pytest` | A1 | 12 (Real 7) |
| A3 | vitest reporter | W4 | `epic/A3-vitest` | A2 | 12 (Real 7) |

Wave order follows OQ-2's default (jest, pytest, vitest). A2 depends on A1 because the row writer, selection report, sidecar and
golden-vector harness are shared; A3 depends on A2 for the same reasons.

## 6. Acceptance criteria

1. On the 30-file jest fixture a run killed with SIGKILL after 20 finish rows resumes and runs exactly 12 files (10 unfinished plus
   the 2 NEVER guards), all on installed jest 29.7 (README T-01).
2. A planted crashing suite, zero-test suite and all-skipped suite never produce a PASS row on jest; the same classes on pytest and
   vitest never produce PASS (G-2).
3. Closure-derived dependents equal `jest --findRelatedTests` on plain edges (README T-02) and are a documented superset on type-only,
   mock-only edges.
4. A retried pass is `retried: true`; a worker crash is one FAIL; bail and interrupt leave valid rows and `COUNT_MISMATCH` is loud.
5. pytest under xdist `--dist load` writes only from the controller, records DESELECTED, FLAKY on rerun, and produces `crc` byte
   identical to the Node `canonicalJson`.
6. vitest writes from `onTestModuleEnd`, taints the run on unhandled errors, and a throwing module-graph walk makes the file
   never reusable.
7. Every adapter has a mutant case that proves its gate can fail (the pilot's prove-the-gate-can-fail rule) and a golden-vector parity case against the spine (D18).
8. `node core/spine/build.mjs` is unaffected, and `node scripts/sync-mirror.mjs --check` exits 0 with the new row.

## 7. Risks

- Adapter and spine copies drift (row writer, CRC, manifest composer). Mitigation: D18 golden-vector tests; the `gate`
  component hashes adapter source so a drift cannot reuse old rows.
- Handshake mismatch with V1: manifest shape, env channel, who injects the reporter. Mitigation: CONTRACT §11 A1 and A2; a shared manifest golden file under `core/gates/tests/fixtures/manifests/`.
- A reporter passed with `--reporters` replaces the repo's reporters (jest CLI semantic); a consumer's real-mongo and failure-summary
  reporters would vanish (research/03 F12). Mitigation: reporter registered in the repo's `reporters` array by the consumer, or `gate run`
  passes the repo's list too; a case proves coexistence is not broken by the adapter.
- jest private surface: `readConfigs`, `Runtime.createContext`, `DependencyResolver`, `test.context` are exported but jest
  upgrades could move them. Mitigation: pin the `runner` component version; any throw selects everything.
- vitest module graph is private in 4.1.9 and its pre-run decision rests on a sidecar. Mitigation: D24 fallback, D25 hole accepted and
  caught by nightly clean.
- The 30-file and other fixtures need an installed runner. `[REAL]` cases locate it through test-only variables
  (`DO_IT_REAL_JEST`, `DO_IT_REAL_PYTHON`, `DO_IT_REAL_VITEST`); when unreachable the case is IMPLEMENTED-NOT-VERIFIED (CONTRACT §7), never
  passed on a mock.
- Setting `workerIdleMemoryLimit` disables in-band runs (D19), changing scheduling.
- SIGKILL cannot be tested by calling hooks; kill cases drive a real runner process.

## 8. Repo and branch plan

Repository `/Users/macbook/Workspace/Devotts/do-it`, branched from `main` of DevOtts/do-it (CONTRACT §5). Lane paths:
`core/gates/adapters/**`, `core/gates/tests/**` (fixtures under `core/gates/tests/fixtures/`), and the mirror-manifest row
(`scripts/mirror-manifest.json`, then `node scripts/sync-mirror.mjs --write`). Branches `epic/A1-jest` (W2), `epic/A2-pytest` (W3),
`epic/A3-vitest` (W4). The adapters never touch `core/spine/src`; A1 depends on L1 (store layout, schema) and F1 (golden manifest,
fingerprint source for golden-vector tests; V1 supplies `gate decide`, which the A1 harness replaces by a stand-in built on L1 `gateFold` until V1 merges). Fixtures: `core/gates/tests/fixtures/jest-30/` (30 spec files, hand-authored graph in
`expected-closures.json`), `core/gates/tests/fixtures/pytest-xdist/`, `core/gates/tests/fixtures/vitest-8/`,
`core/gates/tests/fixtures/manifests/`. Tests: `node --test core/gates/tests/jest/*.test.mjs` (and `pytest`, `vitest` dirs).

## 9. Amendment status (CONTRACT v1.1-draft §11)

Accepted and folded: AM-1 (env var `DO_IT_GATE_MANIFEST`, §11 A1), AM-2 (manifest schema in the store lane, A1), AM-3 (interrupt not tainted, A4), AM-4 (closure sidecars, A6), AM-6 (`select.mjs`, A1), AM-7 (mirror source `core/gates/adapters`, A2). Rejected: AM-5 (the spine computes Python `installed` and `platform` with `-I`). Open sequencing note: A1 (W2) and V1 (W2) land in the same wave; the A1 harness uses a decide stand-in built on L1 `gateFold` (A3) and runs the real `do-it gate decide` once V1 merges.
