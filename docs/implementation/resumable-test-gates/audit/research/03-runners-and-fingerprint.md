# 03 — Runners, fingerprint soundness and invalidation (crown-jewel slice)

Run: plan-it `resumable-test-gates` (do-it r-20261106-130657-7ff2). Read-only research, 2026-11-06.
No test, jest, pytest, vitest, gate or pre-push hook was run. Engine repos were read via the installed
`node_modules`/`.venv` on disk and `git show origin/main:<path>`. Nothing was checked out.

Notation: `NM` = `/Users/macbook/Workspace/Engine/Engine-Core/brain-api-core/node_modules`,
`VNM` = `/Users/macbook/Workspace/Engine/Engine-Core/brain-admin-ui/node_modules/vitest/dist`,
`SP` = `/Users/macbook/Workspace/Engine/Engine-Core/brain-agent/.venv/lib/python3.12/site-packages`.
`api:`, `ui:`, `agent:` prefix `origin/main:` paths in those repos.

---

## 1. Scope (what I read)

- SHARED-CONTEXT.md and README.md (§2–§4 and §6 closely).
- Installed versions (MEASURED via `require(pkg/package.json).version`): brain-api-core jest 29.7.0, @jest/core,
  @jest/reporters, @jest/test-result, jest-resolve, jest-resolve-dependencies, jest-haste-map, jest-runner, jest-worker
  all 29.7.0, ts-jest **29.4.14**. processor jest 29.7.0 / ts-jest 29.4.6. brain-apps jest 29.7.0 / ts-jest 29.4.12.
  brain-admin-ui **vitest 4.1.9** on vite 8.1.3. brain-agent pytest **7.4.4** on Python 3.12.13, pytest-xdist **3.8.0**,
  execnet 2.1.2, pluggy 1.6.0, pytest-cov 4.1.0, pytest-rerunfailures 12.0, pytest-repeat 0.9.4, pytest-asyncio 0.21.2.
  brain-connectors declares jest ^29.7.0 (`package.json` test=`jest`), but **its main checkout has no node_modules
  installed** (MEASURED: empty listing), so I could not read its runner.
- jest source: `@jest/core/build/TestScheduler.js`, `ReporterDispatcher.js`, `SearchSource.js`, `runJest.js`;
  `@jest/reporters/build/index.d.ts`; `@jest/test-result/build/{index.d.ts,helpers.js}`;
  `jest-resolve-dependencies/build/index.js`; `jest-haste-map/build/lib/dependencyExtractor.js`;
  `jest-runner/build/index.js`; `jest-worker/build/workers/ChildProcessWorker.js`; `jest-config/build/{normalize,ValidConfig}.js`;
  `jest-util/build/createProcessObject.js`; `jest-cli/build/args.js`; `@jest/core/build/testSchedulerHelper.js`.
- ts-jest: `dist/types.d.ts`, `dist/legacy/config/config-set.js`, `dist/legacy/compiler/ts-compiler.js`,
  `dist/legacy/ts-jest-transformer.js`.
- vitest: `chunks/reporters.d.DtoKVV2s.d.ts`, `chunks/cli-api.24X8XwN1.js`, `chunks/cac.D3xHeqeL.js`,
  `chunks/defaults.9aQKnqFk.js`.
- pytest/xdist: `_pytest/hookspec.py`, `xdist/dsession.py`, `xdist/remote.py`, `xdist/newhooks.py`, `pytest_rerunfailures.py`.
- Engine configs: `api:jest.config.js`, `api:tsconfig.json`, `api:package.json`, `api:scripts/pre-push.sh` (872 lines),
  `api:scripts/lib/real-mongo-leg.sh`, `ui:vitest.config.ts`, `ui:scripts/pre-push.sh`, `agent:pyproject.toml`,
  `agent:scripts/gate/select.py` (392 lines, read in full), `agent:scripts/gate/run.sh` (223 lines).
- Live read-only readings: `sysctl`, `vm_stat`, `memory_pressure -Q`, `os.freemem()`, `ps` (2026-11-06T13:16:37Z).

---

## 2. Findings

### 2.1 jest 29.7 reporter API (P2 write path)

**F1. Hook names and signatures (MEASURED, `NM/@jest/reporters/build/index.d.ts:183-217`).** The `Reporter` interface:
`onTestFileResult?(test, testResult, aggregatedResult)` (189), `onTestResult?(test, testResult, aggregatedResult)` (184),
`onTestCaseStart?(test, Circus.TestCaseStartInfo)` (198), `onTestCaseResult?(test, TestCaseResult)` (202),
`onRunStart?(results, options)` (206), `onTestStart?(test)` (210), `onTestFileStart?(test)` (211),
`onRunComplete?(testContexts, results)` (212), `getLastError?()` (216). All may return a Promise.
`ReporterDispatcher.onTestFileResult` (`NM/@jest/core/build/ReporterDispatcher.js:27-33`) calls `onTestFileResult` if
the reporter defines it, else `onTestResult`. It **awaits each reporter in turn**, so a synchronous append inside the
hook is ordered and finishes before the next file result is dispatched. It then drops `testResult.coverage` and
`testResult.console` (lines 36-37), so a reporter that wants coverage must read it inside the hook. README §2 names
`onTestFileResult`: **confirmed**.

**F2. Process: the parent, always (MEASURED).** Reporters are constructed in the parent by
`TestScheduler._addCustomReporter` → `new Reporter(globalConfig, options, context)` (`TestScheduler.js:386-390`).
Worker results come back to the parent as `test-file-success` / `test-file-failure` events (`TestScheduler.js:253-258`).
Per-case results come as the `test-case-result` custom message relayed from the worker (`jest-runner/build/index.js:170-173`
→ `TestScheduler.js:269-277`). The ledger writer therefore runs in one process per jest invocation, with no worker
coordination needed. Two concurrent jest invocations (two worktrees) are still two writers (§2.6).

**F3. What a TestResult carries (MEASURED, `NM/@jest/test-result/build/index.d.ts:184-216`):** `testFilePath`,
`numFailingTests`, `numPassingTests`, `numPendingTests`, `numTodoTests`, `failureMessage?`, `testExecError?`, `skipped`,
`leaks`, `memoryUsage?` (only with `--logHeapUsage`), `openHandles`, `perfStats {start,end,runtime,slow}`,
`snapshot {added, matched, unmatched, updated, unchecked, uncheckedKeys, fileDeleted}`, `testResults[]` (per-case
`status: 'failed'|'passed'|'skipped'|'focused'|…`), `coverage?`, `v8Coverage?`.

**F4. CRITICAL: a crashed suite reports `numFailingTests: 0` (MEASURED).** `buildFailureTestResult(testPath, err)`
(`@jest/test-result/build/helpers.js:54-86`) returns `numFailingTests: 0, numPassingTests: 0, failureMessage: null`
with `testExecError: err` (line 80). The scheduler fills `failureMessage` afterwards (`TestScheduler.js:165-176`). Jest
routes three cases through `onFailure`: a worker crash or exception, a suite with zero tests ("Your test suite must
contain at least one test", `TestScheduler.js:129-134`), and a detected leak (`:137-152`). **Rule for P2: a row is PASS
only if** `testExecError == null && numFailingTests == 0 && !failureMessage && numPassingTests > 0`. A row with
passing == 0 and pending/todo > 0 is `SKIPPED`, never PASS. Any other shape is FAIL. If you classify on
`numFailingTests == 0`, every crashed or OOM-killed suite is recorded as a PASS and reused forever.

**F5. Interrupt and bail drop results silently (MEASURED).** `onResult` / `onFailure` return early when
`watcher.isInterrupted()` (`TestScheduler.js:126-127, 162-163`). `bail` sets interrupted (`:399-406`). Files that
finished after the bail never reach the reporter. That is safe (they run again). T-01's "runs exactly M−N" must count N
as rows written, not as files jest started.

**F6. A worker crash is retried (MEASURED).** jest-runner creates the pool with `maxRetries: 3`
(`jest-runner/build/index.js:136`), and `ChildProcessWorker` re-sends the request after a child exception until
`_retries > maxRetries` (`ChildProcessWorker.js:175-182`). A file whose worker dies of OOM can be attempted up to 4
times before its FAIL is reported. To the ledger that looks like one long FAIL. Record `perfStats` and the fact that it
went through `onFailure`. I recommend a `RUNNING` start row from `onTestFileStart` (`TestScheduler.js:105`) so that a
file that keeps killing the process becomes visible (§2.6 state `SUSPECT_KILLER`).

**F7. Exact-set execution (MEASURED).** There are three working ways to run exactly a set of files:
(a) `--runTestsByPath <paths…>` → `SearchSource.findTestsByPaths` (`SearchSource.js:283-291`). It resolves against
`config.cwd` and **silently drops any path that is not a test file** (`.filter(this.isTestFilePath)`), so the adapter
must check that the count it gets back equals the count it sent.
(b) `--filter <module>` (`jest-cli/build/args.js:266`): an async function `(testPaths) => ({filtered:[{test}]})`, applied
in the parent after discovery (`SearchSource.js:369-388`). This is the cleanest skip hook. It runs inside jest's own
discovery, with no argv-length limit, and it can read the ledger directly.
(c) A custom `testSequencer` (`args.js:646`; `runJest.js:227`) that sorts or filters.
`--testPathPattern` (`SearchSource.js:186-223, 335-336`) is a regex and unsafe for exact sets, because paths that are
prefixes of each other collide. **Recommend (b) for skip and (a) for the explicit-list legs.**

**F8. `workerIdleMemoryLimit` exists in 29.7 (MEASURED).** It is validated in `jest-config/build/ValidConfig.js:220`
(`0.2 | '50%'`) and normalized in `normalize.js:969-973` via `stringToBytes(value, os.totalmem())`, so percentages are
of **total** RAM, not free RAM. It is passed as `idleMemoryLimit` to jest-worker (`jest-runner/build/index.js:130-135`).
After each request, `ChildProcessWorker` checks child memory and recycles the child (`ChildProcessWorker.js:389-394, 472`).
Two caveats. (1) It is checked only **between files**, so one file that balloons to 6.6 GB (README §6) is not stopped.
(2) It is ignored when jest runs in band, and jest runs in band automatically when `maxWorkers <= 1`, or when there are
≤20 tests that were all fast last time (`testSchedulerHelper.js:47-55`). A resume run with few files will often be in
band, with tests in the parent process. That is fine for correctness, but the memory hint is a no-op there.

**F9. Per-file `process.env` isolation (MEASURED).** jest gives each test file a deep copy of `process` with a fresh
env object (`jest-util/build/createProcessObject.js:27, 79-101`). Env mutations do not leak between files in a worker.
Pollution between files flows only through external state: the Mongo DB, the filesystem, ports, child processes and
native singletons. This narrows the order-dependence risk to the real-mongo population (§2.5 F27).

### 2.2 jest dependency resolution: can we get ONE file's forward closure? (P3)

**F10. Yes, with jest's own objects. There is no forward-closure API, but the parts are public (MEASURED).**
- `DependencyResolver.resolve(file, options)` (`jest-resolve-dependencies/build/index.js:81-134`) returns the **direct**
  dependencies only. It is not transitive. For each extracted specifier it calls `resolver.resolveModule` (applying
  `moduleNameMapper`, `modulePaths`, `roots` and Node resolution), and falls back to `resolver.getMockModule`. It also
  adds an adjacent `__mocks__/<basename>` (lines 111-130). **An unresolvable specifier is silently dropped** (`catch {}`,
  lines 98-106).
- `resolveInverse` / `resolveInverseModuleMap(paths, filter)` (`:135-195`) is what `--findRelatedTests` uses
  (`SearchSource.js:231-282`). It calls `resolve()` on **every file in the haste FS** and then does a BFS backwards.
  It maps a changed `.snap` path to its test via `snapshotResolver.resolveTestPath` (`:171-174`).
- Forward closure = BFS of `resolve()` from the test file. A reporter already holds everything it needs:
  `test.context = {config, hasteFS, moduleMap, resolver}` (`@jest/test-result/build/index.d.ts:157-170`). So
  `new DependencyResolver(test.context.resolver, test.context.hasteFS, await buildSnapshotResolver(config))`, then BFS.
  This adds no extra crawl. The resolver is the same one `SearchSource._getOrBuildDependencyResolver` builds
  (`SearchSource.js:175-185`), so T-02 ("equals the resolver's own related list") holds by construction.
  Standalone scripts can use `Runtime.createHasteMap` / `Runtime.createResolver` (`jest-runtime/build/index.d.ts:108-115`).
- `hasteFS.getSha1()` exists (`jest-haste-map/build/index.d.ts:65`) but is null unless `computeSha1` is on, so P3 must
  hash file bytes itself.

**F11. What the static extractor sees, and what it misses (MEASURED, `jest-haste-map/build/lib/dependencyExtractor.js`).**
It is regex-based, not an AST. It matches `import/export … from '<lit>'` (excluding `import type` / `export type`,
lines ~45-50), `require('<lit>')` / `import('<lit>')`, and `jest.requireActual|requireMock|genMockFromModule|createMockFromModule('<lit>')`.
Comments are stripped first. Gaps:

| Input | Seen by resolver? | Evidence |
|---|---|---|
| `require(variable)`, `import(expr)`, `` require(`./x/${n}`) `` | **No.** The template case is captured as a garbage literal, fails to resolve and is dropped | extractor regex; `resolve()` catch at :98-106 |
| `jest.mock('./m', factory)` path | **Not extracted** (`jest.mock` is not in `JEST_EXTENSIONS_RE`) | extractor lines ~52-62 |
| Imports inside a `jest.mock` factory body | Yes, extracted lexically | same regex over the whole file |
| `import type` / `export type` | **Excluded** | `(?!type(?:of)?\s+)` |
| `fs.readFileSync` fixtures, JSON read via fs, templates, `git ls-files`, `execSync` | **No** | not imports |
| `require('./x.json')` | Yes (json is in moduleFileExtensions) | — |
| Snapshot `.snap` of this test | **No** (forward). Inverse only | `:171-174` |
| `setupFiles`, `setupFilesAfterEach`, `globalSetup`, custom reporters, transformer | **No.** Config-level, not imports | — |
| Root `<roots>/__mocks__/<pkg>` for node_modules packages (auto-applied) | **No**: the adjacency check `dependencyMockDir === dirname(mock)` rejects it | `:120-129` |
| node_modules internals | Resolution stops at the boundary (not in hasteFS) | `getDependencies` null → `[]` (:82-85) |
| env var values, `.env` (`dotenv/config`) | No | — |
| A `// …` inside a string on the same line as an import | The import can be **lost** (`LINE_COMMENT_RE = /\/\/.*/g`) | extractor |

**F12. api-core specifics that widen the gap (MEASURED at `api:`).**
- `setupFiles: ["dotenv/config", "<rootDir>/src/common/testing/loopback-default.setup.ts"]` (`jest.config.js:13`). **The
  gitignored `.env` is loaded into every test file.** Its *values* gate whether 192 `*real-mongo*` spec files
  (filename count) actually run or self-skip. 268 spec files mention `SEC_TEST_MONGO_URI|REQUIRE_REAL_MONGO|realMongo|real-mongo`.
- Custom reporters `scripts/jest-real-mongo-reporter.js` and `scripts/jest-failure-summary-reporter.js` (`:75-79`) are
  part of the verdict. They belong in CORE.
- `collectCoverage: true` (`:67`). lcov feeds the 60% diff-coverage gate (`pre-push.sh:501-521`). **A composed run
  produces lcov only for the files that ran**, so the diff-coverage leg cannot be composed unless the ledger stores
  per-file coverage. This is a contradiction (§3).
- ts-jest inline `tsconfig` object with `emitDecoratorMetadata: true` and **`diagnostics: false`** (`:80-99`).
- Workspace packages `@brain/llm-obs` and `@brain/client-bible-schema` resolve via symlink (`node_modules/@brain/* ->
  ../../packages/*`, MEASURED with `ls`) to **`main: dist/index.js`**, which is **gitignored build output**
  (`.gitignore:33 dist/`). That output is produced by `postinstall=npm run vercel-build` → `build:packages && tsc`
  (`api:package.json`). 6 spec files import these packages. A git-blob-based key cannot see `dist/`. A disk-content key
  can, because the resolver follows the realpath into `packages/*/dist`.
- `engines.node = "20.x"` while the local node is **v22.23.2** (MEASURED). The env fingerprint must carry the real
  `process.version`.
- 13 `ALWAYS_RUN_GUARDS` (`pre-push.sh:175-~250`, MEASURED count). In comparison, **208 spec files** at origin/main call
  `readFileSync|readdirSync|execSync|spawnSync|execFileSync|git ls-files` (MEASURED, `git grep -l`), led by
  `src/scripts` (31), `src/backbone-connections` (14), `src/squads` (9), `src/kinetic/policies` (9) and `scripts` (9).
  Many read adjacent fixtures, not the tree. Still, the hand-kept guard list covers ~6% of the specs whose outcome
  depends on files outside their import closure.
- Spec inventory: 1,613 `*.spec|test.ts(x)` outside `test/` at origin/main (1,606 outside `packages/`, 6 `.e2.spec.ts`
  ignored). That gives ESTIMATED ~1,607 jest-selected files, against README §1's "about 1,340 suites", which comes from
  archived runs and is now stale.
- Other risk patterns in specs (MEASURED, files matching): `process.env` 570, `Date.now|new Date()|useFakeTimers` 406,
  `jest.mock(` 57, `mongodb-memory-server` 40, subprocess 47, snapshot 2. The snapshot files are
  `src/common/{graph,vector}/__snapshots__/*.snap`. There are no `__mocks__` dirs today. `scripts/generate-action-type-manifest.ts:186`
  does `require(abs…)` dynamically, as its guard comment says.

**F13. jest's built-in alternatives are not durable (MEASURED).** `--onlyFailures` uses `FailedTestsCache`
(`runJest.js:291`), which lives in memory for watch mode. The `cacheDirectory` (`api:jest.config.js:39`, per checkout)
holds transform and timing caches, not results. Nothing in jest 29 persists per-file verdicts, so P1/P2 are needed.

### 2.3 ts-jest 29.4 `isolatedModules`

**F14. Semantics (MEASURED).** The ts-jest-level `isolatedModules` option is **deprecated** in 29.4
(`ts-jest/dist/types.d.ts:42-48`: "use TsConfigCompilerOptionsJson.isolatedModules instead"). Setting it copies it into
`parsedTsConfig.options.isolatedModules` and logs a deprecation (`config-set.js:216-228`). The effective switch is
`configSet.isolatedModules = parsedTsConfig.options.isolatedModules ?? false` (`:228`). When it is false, ts-jest builds
a full **LanguageService** (`ts-compiler.js:78, 495-496`) and emits through it (`:286-296`). When it is true, it uses
`ts.transpileModule` per file (`:363-379`).

**F15. What flipping it changes:**
(a) Speed: no program and no cross-file type info. The ts-jest cache key also stops including the TS-resolved module
list and their **mtimes** (`ts-jest-transformer.js:269-288`), which today makes an edit to an imported file re-transform
its importers.
(b) Type errors: for api-core **nothing changes**. `diagnostics: false` (`api:jest.config.js:97`) already hides type
errors from jest, and the type gate is the separate `npm run build` → `tsc` leg (`pre-push.sh:23`, step 5). README's
"type errors no longer fail tests" risk is therefore already the status quo, and the tsc leg already covers it.
(c) **Behavioral risk**: `const enum` across files and type-directed emit (`emitDecoratorMetadata` choosing
`design:paramtypes`) change under transpileModule. NestJS DI relies on that metadata. Flipping it is a migration that
must be proven by a T3 clean run, not a free speed-up. **Recommend: out of scope for this program.**

**F16. Corollary for the fingerprint (MEASURED, inference).** In LanguageService mode, a file's emitted JS depends on
the *types* of what it imports, including `import type` edges. ts-jest's own cache key admits this by hashing the
TS-resolved modules (`ts-jest-transformer.js:269-288`). The haste extractor drops `import type` (F11). **P3 should use
an extractor that keeps type-only edges** (the haste regex minus the `(?!type…)` lookahead). That is a strict superset
and remains sound. Severity is low to medium (decorator metadata, const enums).

### 2.4 vitest 4.1.9 (brain-admin-ui is the only Engine repo using it, plus engine-trainning and ~15 brain-apps)

**F17. Per-file completion hook = `onTestModuleEnd(testModule)` (MEASURED, `VNM/chunks/reporters.d.DtoKVV2s.d.ts:1077`).**
The v4 `Reporter` interface (`:1041-1115`) contains `onInit`, `onTestRunStart(specs)`, `onTestRunEnd(modules,
unhandledErrors, reason)`, `onTestModuleQueued|Collected|Start|End`, `onTestCaseReady|Result`, `onTestSuiteReady|Result`,
`onHookStart|End`, `onCoverage`. **`onFinished` and `onTaskUpdate` are not in the v4 interface.** `onTaskUpdate` survives
only on `BenchmarkReporter` (`:2470`). `TestModule` exposes `moduleId` (absolute, `:309`), `relativeModuleId` (`:313`),
`state(): 'queued'|'pending'|'skipped'|'failed'|'passed'` (`:321, 351-352`), `diagnostic()` (`:335`), and `errors()` for
collection or syntax errors (`:252`). `TestRunEndReason = 'passed'|'interrupted'|'failed'` (`:1040`). README §2's
"verify the hook name" is now verified: `onTestModuleEnd` is right for 4.1.9.

**F18. Unhandled errors arrive after module end.** `onTestRunEnd` receives `unhandledErrors` separately (`:1058`).
An error can surface after a module already ended `passed`. The vitest adapter must append a run-end event, and a run
that ends with unhandled errors must taint its rows (§2.6 merge rule).

**F19. `vitest related` / `--changed` (MEASURED).** `cli.command("related [...filters]")` (`chunks/cac.D3xHeqeL.js:2262,
2296-2299`; sets `passWithNoTests`). `filterTestsBySource` (`chunks/cli-api.24X8XwN1.js:11484-11515`) applies
`forceRerunTriggers` (default `["**/package.json/**", "**/{vitest,vite}.config.*/**"]`,
`chunks/defaults.9aQKnqFk.js:59`), which is vitest's own CORE set. It then computes each spec's **forward** closure with
`getTestDependencies` (`:11516-11531`). That function walks vite SSR `transformResult.deps` **plus `dynamicDeps`** and
stops at `node_modules` (`:11526`). This is exactly P3's forward closure, but it lives on the internal
`VitestSpecifications` class (`:11414`), and `Vitest.specifications` is **private** (`reporters.d.ts:1271`). Public route
for the adapter: in `onInit(vitest)`, walk `project.vite.environments.ssr.moduleGraph` (`getModuleById(id).importedModules`)
at `onTestModuleEnd`. That graph is the one the run actually used, and it includes executed dynamic imports. ESTIMATED
from the code at `:11520`; not exercised.

**F20. Pool memory: README §6's "vitest `poolOptions` memory limits" does not exist in v4 (MEASURED).** There are 0
occurrences of `poolOptions` in the v4 types. The knob is top-level `vmMemoryLimit` (`reporters.d.ts:2836`), and
`getMemoryLimit` returns null unless `pool` is `vmForks` or `vmThreads` (`cli-api.24X8XwN1.js:3772-3781`). The default
pool is `forks` (`reporters.d.ts:2840-2845`), so **there is no memory recycling unless the pool is changed to vm***, which
changes isolation semantics. Other levers: `maxWorkers` (`:2848`) and `execArgv` (`--max-old-space-size`, `:2830`).
admin-ui's config sets none (`ui:vitest.config.ts:1-45`). It does pin `env.NEXT_PUBLIC_API_URL` in config, which a
config hash covers.

### 2.5 pytest 7.4.4 + xdist 3.8.0 + brain-agent selector

**F21. Hooks (MEASURED).** `pytest_runtest_logreport(report)` (`SP/_pytest/hookspec.py:586`),
`pytest_collectreport(report)` (`:323`), `pytest_sessionfinish(session, exitstatus)` (`:673`),
`pytest_runtest_makereport` (`:571`). One logreport arrives per phase (setup/call/teardown). A file is done when every
collected nodeid of that file has its teardown report.

**F22. Under xdist, the controller receives every logreport (MEASURED).** Workers serialize reports and
`sendevent("testreport")` (`xdist/remote.py:281-289`). The controller's `DSession.worker_testreport` re-fires
`self.config.hook.pytest_runtest_logreport(report=rep)` (`xdist/dsession.py:326-329`). A crashed worker produces a
synthesized `outcome="failed", when="???"` report for the in-flight item, fired on the controller
(`handle_crashitem`, `:432-452`). Collection: workers forward **only failed or skipped** collect reports
(`worker_collectreport` asserts `not rep.passed`, `:357-368`, de-duplicated at `_failed_worker_collectreport`). The
controller learns the full item list from `pytest_xdist_node_collection_finished(node, ids)` (`xdist/newhooks.py:89`;
`dsession.py:274`). **Plugin rule:** the plugin is loaded in workers too, so it writes only when
`not hasattr(config, "workerinput")`. It builds `expected[file] = {nodeids}` from `collection_finished` (xdist) or
`pytest_collection_modifyitems` (no xdist), marks the file complete on the last teardown, and treats a file collect
error as FAIL. run.sh uses plain `-n N` (`agent:scripts/gate/run.sh` pytest leg), i.e. `--dist load`, so **one file's
items are spread over several workers**. Per-file aggregation must be done on the controller, which is the case
described above. `addopts = -m "not integration"` (`agent:pyproject.toml:172`) deselects items. A fully deselected file
produces no reports, so it must be recorded as `DESELECTED`, not missing and not PASS.

**F23. Rerun plugins taint verdicts.** pytest-rerunfailures 12.0 is installed and emits intermediate `rerun` outcomes
(`pytest_rerunfailures.py:52-53`). A pass after a rerun is FLAKY by definition (§2.6). It is not enabled in `addopts`
today. The api-core analogue is live: `real-mongo-leg.sh` "retr[ies] an in-band flake once" (header lines 1-30). **A
retry that passes must be recorded as FLAKY, never PASS.**

**F24. `select.py` mechanics (MEASURED, `agent:scripts/gate/select.py`).** `CORE_PATTERNS` (`:50-61`): `conftest.py`,
`*/conftest.py`, `pyproject.toml`, `poetry.lock`, `pytest.ini`, `setup.cfg`, `src/core/tools/factory.py`,
`src/core/tools/allow_set.py`, `scripts/pre-push.sh`, `scripts/gate/*`. The import graph is AST-based and
over-approximates. Parent `__init__` packages count, `from a import b` maps to `a.b`, and imports nested in functions
count (`:152-192`). Bare `x.y` imports are re-tried as `src.x.y` (`:142-149`). Dependents are found by reverse BFS
(`:209-224`). The text rule matches the changed path, dotted module and fixture basename as substrings of **test files
only** (`:227-240`). Escalation to T2 happens on: merge in range, a CORE file, a selector exception, an empty selection
while `src/` changed, an unmapped `tests/` support change, or a selection over 60% (`:259-325`).

**F25. `select.py` blind spots (MEASURED or ESTIMATED as marked).**
- It only walks `.py` files (`walk_py`, `:132-139`). `src/` plus `config/` hold 10 non-py runtime files (5 json, 2
  yaml, 2 md, 1 template; MEASURED), and the root holds `brain-agent.yaml`. A change to one of them with no textual
  mention escalates to T2 through `empty-selection-while-src-changed` (`:319-320`), but only for `src/`. A
  `config/*.yaml` change selects nothing and passes T1 silently. ESTIMATED from the code path: `config/` is neither
  `src/` nor `tests/`, so `contribution()` is empty and there is no escalation.
- Dynamic imports: 1 `src` file uses `importlib.import_module` / `__import__` (MEASURED). `factory.py` is CORE for this
  reason.
- The text rule scans only test files, not the helper modules they import.
- It does not know env, `.env` or installed site-packages beyond `poetry.lock` (`CORE`). run.sh copies the main
  checkout's `.env` into the scratch worktree (`run.sh:100`), so `.env` values are a live input.
- `brain_agent.pth` in the venv points at the **main checkout** path (MEASURED content). With `tests/__init__.py`
  present, pytest's prepend mode puts the worktree root first, and run.sh uses `python -m pytest`, which puts cwd
  first. So worktree code wins today, but only by convention. A bare `pytest` entry point or `--import-mode=importlib`
  could import main-checkout code into a worktree run. ESTIMATED, not exercised.
- For the ledger, `select.py` is a **reverse** selector. P3 needs a **forward** closure per test: BFS over
  `imports_of`, plus modules named in `patch("src.…")` strings (9 test files, MEASURED), because `mock.patch` imports
  its target. Any `src/` non-py file the test names textually is added too.

### 2.6 Fingerprint soundness (the crown jewel)

README `key()` = H(gate_version, runner + config hash, lockfile hash, env fingerprint [names only], closure content).
Every input below can change a file's outcome without changing that key. Severity: **H** = silent false PASS likely in
Engine today; **M** = plausible; **L** = rare.

| # | Omitted or under-specified input | Sev | Evidence | Handling |
|---|---|---|---|---|
| 1 | **Crash classified as pass** (`numFailingTests:0` on exec error) | H | F4 | P2 classification rule; T-04 must plant a crashing suite |
| 2 | **Installed deps ≠ lockfile.** Main api-core checkout: `package-lock.json` 860 entries vs installed `node_modules/.package-lock.json` 836, **198 entries differ** (version or integrity or missing), mtimes 2026-11-02 vs 2026-09-28 | H | MEASURED, node diff of both files | Key on the **installed** state: H(`node_modules/.package-lock.json`) plus H(realpaths of workspace symlinks); Python: sorted `importlib.metadata` name==version plus `.pth` contents. Keep the lockfile hash as well |
| 3 | **Gitignored build output in the closure** (`packages/*/dist` via workspace symlink) | H | F12 | Content-hash the resolved realpaths on disk, never only git blobs. Add `packages/*/dist/**` ⇒ closure, `packages/*/src/**` ⇒ CORE-for-importers |
| 4 | **`.env` values** (dotenv in setupFiles; run.sh copies `.env`) | H | F12, F25 | HMAC-SHA256(salt, `.env` bytes) into env component; salt per machine in ledger dir, never stored values |
| 5 | **Env var values that gate behavior** (`REQUIRE_REAL_MONGO`, `SEC_TEST_MONGO_URI`, `CI`, `NODE_ENV`, `TZ`, `LANG/LC_*`, `NODE_OPTIONS`, `FORCE_COLOR`) | H | 268 specs reference the mongo gates; jest `ci` default comes from env | Names **and** salted HMAC of values for a declared allowlist (data, in the adapter's settings block). Undeclared vars: names only (accepted risk, T3) |
| 6 | **Self-skipped suites recorded as PASS** (real-mongo self-skip when URI unset) | H | F4, F12 | Row result `SKIPPED` (passing==0, pending>0); store `numPendingTests`; composed verdict counts skipped separately; a SKIPPED row never satisfies a run where the gate env says "must run" |
| 7 | **Files read at runtime** (fixtures, `git ls-files`, tree scans, `execSync`) | H | 208 specs vs 13 guards (F12) | Static classifier in P3: a test whose own text (or a repo-local closure file's) contains `readFileSync|readdirSync|glob|execSync|spawnSync|execFileSync|child_process|git ` gets the **WIDE** key class: closure hash ⊕ H(tracked tree content of the repo). It still reuses on kill/resume of an unchanged tree (T-01). ALWAYS_RUN stays for guards that must run on every push |
| 8 | Snapshot file of the test | M | F11; 2 `.snap` today | Add `snapshotResolver.resolveSnapshotPath(test)` to the closure (hash "absent" when missing); key on `ci`/`updateSnapshot` mode |
| 9 | setupFiles / setupFilesAfterEach / globalSetup / globalTeardown / testEnvironment / custom reporters / transformer + its tsconfig and their closures | H | `api:jest.config.js:13, 75-99` | CORE: hash the **closure** of each config-referenced module, not just the config file |
| 10 | Root `__mocks__/<pkg>` auto-mocks | M (0 today) | F11 adjacency check | CORE pattern `**/__mocks__/**` (vitest: `__mocks__` too) |
| 11 | `import type` edges under LanguageService emit | L–M | F16 | Extractor keeps type-only edges |
| 12 | Unresolvable or dynamic specifiers dropped silently | M | F11, `resolve()` catch | Count unresolved repo-local specifiers per file. If >0 ⇒ WIDE key class (fail toward more) |
| 13 | `jest.mock(path, factory)` path not extracted | L | F11 | Add `jest.mock|doMock|unmock` literals to the extractor |
| 14 | Node/Python version, **ICU/Intl data**, OS, arch, CPU count (maxWorkers ⇒ scheduling ⇒ pollution exposure) | M | node 22 vs engines 20 (F12) | env component: `process.version`, `process.versions.{v8,icu,unicode}`, `os.platform/arch/release`, `os.cpus().length`; Python `sys.version`, `platform.platform()` |
| 15 | **Time** (406 specs touch the clock): a test that passes today can fail tomorrow | M | F12 | Global reuse TTL (recommend 24 h, or "since the last T3 clean", whichever is shorter). README only has a 7-day TTL for UNSTABLE |
| 16 | Order and pollution via the DB, fs, ports (env is per-file isolated, F9) | M | F9, real-mongo leg | Accepted risk caught by T3 clean (README §4). Rows from the real-mongo leg are keyed with leg id = `real-mongo` and never mixed with unit-leg rows |
| 17 | External service versions (engine-mongo-dev image, Docker) | M | real-mongo leg | Optional per-project `fingerprint_cmd` (data) whose stdout is hashed, e.g. `docker image inspect --format {{.Id}} mongo:…`; else accepted risk under T3 |
| 18 | Runner seed (`--randomize`; jest always generates a `seed`, `normalize.js:1063`) | L | jest-cli `args.js:458, 524` | Key on `randomize` flag; when randomized, record the seed and treat the result as non-reusable unless the seed is pinned |
| 19 | Runner flags that change outcome (`--ci`, `-m` marker expr, `--testNamePattern`, `--shard`, coverage on/off with thresholds) | M | args.js | Hash the normalized argv that affects selection or outcome into the runner component |
| 20 | Generated code checked in or out of git (manifests, `dist/`, codegen) | M | `generate-action-type-manifest` guard | Covered by disk-content hashing (#3); generators are CORE |
| 21 | postinstall side effects, `npm link`, `file:` deps | L (none today: 0 `file:/link:` deps MEASURED; postinstall builds packages) | `api:package.json` | Covered by #2 + #3 |
| 22 | brain-agent non-py data (`config/*.yaml`, `brain-agent.yaml`, `src/**/*.json|md|template`) | M | F25 | Forward text rule adds named data files; anything else non-py under `src/`/`config/` ⇒ CORE (whole-suite invalidation), matching `select.py`'s T2 escalation instinct |
| 23 | Cross-worktree code bleed via `.pth` | L | F25 | Env component records the resolved `src` package `__file__` root, so a mismatch voids reuse |
| 24 | The gate/adapter/ledger code itself | H | README has `gate_version` | `gate_version` = H(adapter + fingerprint + ledger source), not a hand-bumped integer (run.sh's `GATE_VERSION=2` drifts when someone forgets to bump it) |

**F26. Content hash vs git blob id. Recommendation: hash raw on-disk content, and use git only as a memo.**
- Git blob ids cannot see untracked or ignored inputs (#3, #4, #20), the installed tree (#2), or dirty edits. A
  blob-only key is unsound for api-core today (workspace `dist/`).
- Disk-content hashing records exactly what was tested. A row written from a dirty tree is keyed by the dirty bytes, so
  it can never match the clean commit's key unless the bytes are identical. That is sound by construction.
- **Dirty-tree rule for verdicts:** the composed verdict is *about content*. When the pre-push hook gates commit C but
  the worktree has tracked modifications inside the selection's closure, the gate must either run in a scratch worktree
  of C (run.sh's existing pattern, `run.sh:91-102`) or print `[COMPOSED … for WORKING TREE, not <C>]` and refuse to
  stamp C. Never stamp a commit from a dirty run.
- **Two worktrees:** use repo-relative POSIX paths in the key, never absolute paths. Identical bytes plus identical
  installed state then give identical keys, so worktree B legitimately reuses A's PASS. The installed-state component
  (#2) is what stops reuse when B's `node_modules` differs. That is the case today: each worktree may have its own
  stale install.
- **Speed memo (sound):** `blob_id → sha256` is immutable, because a blob id is a content address. Cache it in
  `<git-common-dir>/do-it/test-ledger/blobmemo`. For tracked files that are clean per `git ls-files -s` plus
  `git diff-files --name-only`, look up the memo. Hash everything else from disk with a `(dev, ino, size, mtime_ns)`
  stat cache per worktree. Use a Merkle layout: hash each file once, then key = H(sorted closure (path, filehash)). This
  matters because closures overlap heavily (Nest modules).

**F27. Algorithm and canonical serialization (zero dependency, byte-identical in Node and Python).**
- SHA-256: `require('node:crypto').createHash('sha256')` and `hashlib.sha256`. Both are in the standard libraries, give
  identical digests over identical bytes, and avoid SHA-1. Output is lowercase hex.
- File hash = sha256(raw bytes), with no newline or encoding normalization. A symlink is hashed through its target
  content, recording the repo-relative realpath. A missing file is hashed as the literal token `-` (absence is a state).
- Key manifest (UTF-8, `\n` line endings, LF only, no trailing spaces), sorted **by UTF-8 byte order**. JS
  `Array.prototype.sort()` compares UTF-16 code units, which disagrees with Python's code-point order for astral vs
  U+E000–U+FFFF characters. Node must sort with `(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))`; Python uses
  `sorted(xs, key=lambda s: s.encode())`.
  ```
  rtg-key/1
  gate	<sha256 of adapter+fingerprint+ledger source>
  runner	jest@29.7.0	<sha256 of normalized outcome-affecting argv>
  core	<sha256 of the CORE sub-manifest>
  installed	<sha256 of node_modules/.package-lock.json | pip-metadata listing>
  env	<NAME>	<hmac-hex | "-" unset | "*" name-only>
  class	NARROW|WIDE
  dep	<repo-relative path>	<sha256 | ->
  ```
  `key = sha256(manifest bytes)`. **Store every component digest in the row** (not the manifest text), so an
  invalidation can print *why*, for example `invalidated: dep src/common/x.ts changed` or `installed changed`. That
  makes the honesty rule actionable.
- Env values: `hmac-sha256(machine_salt, value)` with a 32-byte random salt in `test-ledger/.salt` (mode 0600). A bare
  hash of a low-entropy secret can be brute-forced, which is why the HMAC is needed. Values never leave the machine.

### 2.7 Invalidation model: one ledger row stream per test file

The ledger is append-only events. State is a **fold per (file)** with a key-scoped sub-state. The "row" is the folded
view. Event rows: `start`, `finish{result∈PASS|FAIL|SKIPPED|DESELECTED, retried:bool}`, `run_end{run_id, tainted}`,
`clean{T3 result}`, plus integrity `{crc}` per row.

| From state | Event | To state | Reusable? | Note |
|---|---|---|---|---|
| NEVER_RUN (no row for key_now) | start | RUNNING(k) | no | `start` written from onTestFileStart / logstart |
| RUNNING(k) | finish PASS, not retried | PASS(k) | yes | if no FAIL on k within window |
| RUNNING(k) | finish PASS after retry (in-run or real-mongo retry) | FLAKY(k, passes=0) | no | retry-pass is flake evidence (F23) |
| RUNNING(k) | finish FAIL / exec error / crash report | FAIL(k) | no | |
| RUNNING(k) | finish SKIPPED / DESELECTED | SKIPPED(k) | only as SKIPPED | never satisfies "must run" |
| RUNNING(k) | owner PID dead, no finish (next run start) | KILLED(k) → NEVER_RUN | no | kills++ on (file,k) |
| KILLED ×2 on same k | — | SUSPECT_KILLER(k) | no | schedule solo / in band; print it (OOM culprit) |
| PASS(k) | key_now ≠ k | NEVER_RUN(key_now) | no | `invalidated: <component>` |
| PASS(k) | finish FAIL on same k | FLAKY(k, passes=0) | no | same code, different outcome |
| FAIL(k) | finish PASS on same k (no code change) | FLAKY(k, passes=1) | no | a re-run that passes does **not** clear the failure |
| FAIL(k) | key_now ≠ k (the fix) | NEVER_RUN(key_now) | no | the normal fix path |
| FLAKY(k, n) | finish PASS | FLAKY(k, n+1); n+1 = 2 ⇒ PASS(k) | at 2 | two **consecutive** passes |
| FLAKY(k, n) | finish FAIL | FLAKY(k, 0) | no | feeds quarantine list |
| FLAKY(any) | key change | FLAKY(new k, 0) for 7 d (file-sticky) | no | flakiness is a property of the test, not the key |
| PASS(k) reused in composed run | T3 clean FAIL on same k | UNSTABLE_UNDER_REUSE(until now+7 d) | no | file-level flag; README §4 |
| UNSTABLE_UNDER_REUSE | 7 d elapsed and 2 consecutive clean passes | PASS(k) | yes | |
| any | T3 clean PASS on k | PASS(k), age reset | yes | T3 rewrites |
| any | T3 clean FAIL on k' ≠ ledger k | FAIL(k') | no | no UNSTABLE: different code |
| PASS(k) | age > TTL (24 h or older than last T3) | EXPIRED ⇒ NEVER_RUN | no | §2.6 #15 |
| any | row fails CRC or JSON parse | ignore row; if it is the latest for file ⇒ NEVER_RUN | no | CORRUPT never becomes PASS (T-04) |
| rows of run R | `run_end{tainted:true}` (unhandled errors, open-handle force-exit, vitest unhandledErrors) | each PASS from R ⇒ NEVER_RUN | no | F18 |

**Composed-verdict merge rule (across source runs).**
1. For each selected file f: gather rows with `key == key_now(f)`, `gate` component equal, machine equal, age ≤ TTL,
   from runs not tainted.
2. If **any** FAIL exists on that key since the last two consecutive PASSes, f is not reusable. Not "latest wins":
   latest-wins lets a re-run launder a failure.
3. f is satisfied iff its folded state is PASS (reused) or it ran fresh in this run with PASS. SKIPPED satisfies only
   if the leg's gate env does not require it, and is counted separately.
4. `ALWAYS_RUN` and WIDE-class files, when the tree changed, must be fresh in **this** run.
5. Verdict PASS iff every f is satisfied and no fresh FAIL exists. Output names the counts per source (fresh, reused,
   skipped, flaky-excluded), the distinct source run ids and the **oldest** reused timestamp (T-07). Dirty-tree runs are
   labeled per F26.
6. A composed verdict never mixes legs (unit vs real-mongo vs diff-coverage). Each leg composes independently, and
   diff-coverage either re-runs or uses stored per-file coverage (§3 C2).

**Write path rules.** One `write()` per row (`fs.appendFileSync` with flag `a` / `os.write` on `O_APPEND`). Keep rows
≤ 4 KB: store a truncated `failureMessage` in the row and the full text in a side file. Include a per-row CRC so torn
or interleaved rows from two worktrees are detected as CORRUPT (T-10). Use compaction under the ledger lock only.

### 2.8 macOS / Linux admission signals (P6), with live readings

Live readings, **2026-11-06T13:16:37Z** (MEASURED, all read-only):
```
kern.memorystatus_vm_pressure_level: 1
kern.memorystatus_level: 60            (memory_pressure -Q: "System-wide memory free percentage: 60%")
vm.swapusage: total = 4096.00M  used = 2627.00M  free = 1469.00M  (encrypted)
hw.memsize 19327352832 (18.0 GiB) · hw.pagesize = vm.pagesize = 16384
vm_stat pages: free 53278 · speculative 5069 · active 316509 · inactive 310831 · wired 148090 · purgeable 332
               file-backed 191829 · anonymous 440580 · stored in compressor 862252 · occupied by compressor 305201
node v22.23.2 os.freemem() = 942424064 (0.94 GB)
ps: no jest/vitest/pytest process running at read time
```

**F28. Pressure level values (MEASURED, `$(xcrun --show-sdk-path)/usr/include/dispatch/source.h:255-257`):**
`DISPATCH_MEMORYPRESSURE_NORMAL 0x01`, `WARN 0x02`, `CRITICAL 0x04`. The sysctl reports the same encoding
(1 = normal, 2 = warn, 4 = critical). README §6's "never start into a warn-level machine" maps to `level != 1 ⇒ wait`.
`kern.memorystatus_level` is the kernel's own available-memory percentage, and it equals what `memory_pressure -Q`
prints (60 = 60, MEASURED). It is cheap, zero-dependency and second-opinion-worthy.

**F29. `vm.swapusage` format and semantics.** The format is the literal string above (`xsw_usage {xsu_total, xsu_avail,
xsu_used, xsu_pagesize, xsu_encrypted}`, `sys/sysctl.h:534-540`). Parse it with
`/used = ([\d.]+)([KMG])/`. **macOS swap is dynamic.** `total` grows as swapfiles are added, so "3.5 of 4 GB" is not a
ceiling. Threshold on absolute `used` plus the **swapout rate**: the delta of the cumulative `Swapouts` counter over a
~5 s window from two `vm_stat` reads is the real thrash signal. Swap used was 2627 MB now, against 3.5 GB at 09:3x per
README §6.

**F30. "Free memory" without dependencies; why `os.freemem()` under-reports.** libuv on darwin returns
`free_count × pagesize` from `host_statistics`. `vm_stat` prints "free" as `free_count − speculative`. MEASURED:
(53278 + 5069) × 16384 = 0.956 GB ≈ `os.freemem()` 0.942 GB (reads ~ms apart). This is libuv source behavior, not on
disk, and it is consistent with the measurement. It excludes reclaimable file cache, purgeable and inactive pages, so
on a healthy Mac it reads ~1 GB and would block every gate. Recommended estimator:
`avail_est = (total_pages − anonymous − wired − occupied_by_compressor) × pagesize`. MEASURED now:
(1179648 − 440580 − 148090 − 305201) × 16384 = **4.68 GB**. For comparison, free + speculative + inactive + purgeable
= 6.05 GB, which over-counts anonymous inactive pages that need compression to reclaim. Admission rule:
`pressure_level == 1 && swapout_rate ≈ 0 && avail_est ≥ declared_peak + margin && swap_used < threshold`. With
api-core's ~3 GB declared peak, the machine would admit it right now. Use `vm_stat` and `sysctl` via `execFileSync`
(`node:child_process`) or `subprocess.run`; both are zero-dependency.

**F31. Linux equivalents (from kernel documentation, not measurable on this host).** `/proc/meminfo` `MemAvailable:`
in kB (kernel ≥ 3.14) is the right "free" number. PSI `/proc/pressure/memory` has lines
`some avg10=… avg60=… avg300=… total=…` and `full …` (kernel ≥ 4.20, `CONFIG_PSI`). Wait if `some avg10 > ~10` or
`full avg10 > 0`. Inside containers, read cgroup v2 `memory.max`, `memory.current` and `memory.pressure`.
`os.freemem()` ignores cgroup limits.

---

## 3. Contradictions with the README

- **C1. vitest `poolOptions` memory limits (§6) do not exist in 4.1.9.** The only memory recycle is `vmMemoryLimit`,
  and only for `vmForks`/`vmThreads` (F20). Fix §6: "vitest: `maxWorkers` + `execArgv --max-old-space-size`; recycling
  only with a vm pool (semantics change)".
- **C2. A composed T2 cannot satisfy api-core's diff-coverage leg.** `collectCoverage: true` + `scripts/diff-coverage.sh`
  (F12) needs lcov for every changed line's covering tests. Either the ledger stores per-file coverage keyed like the
  verdict (coverage is in `testResult.coverage` inside `onTestFileResult` before it is freed, F1), or diff-coverage stays
  a fresh leg and the program says so.
- **C3. "lockfile hash" is the wrong dependency input.** The installed tree measurably diverges from the lockfile
  (198/860 entries, F26 table #2). Key on the installed state.
- **C4. "env var NAMES, never values" is unsound for Engine.** `.env` values decide whether 192+ real-mongo specs run or
  self-skip (F12). Use salted HMAC of declared values (F27).
- **C5. Closure "from the runner's own resolver" misses config-level inputs and runtime fs reads at scale.** There are
  208 fs/subprocess-reading specs against 13 guards (F12). The text rule from `select.py` is a reverse-selection rule.
  For forward keys you need the WIDE class (table #7), not just ALWAYS_RUN.
- **C6. Using `numFailingTests` to mean failure is a trap** (F4). README §2's "one JSONL row per finished file" needs the
  explicit PASS predicate.
- **C7. Suite count is stale.** There are ~1,607 selectable api-core spec files at origin/main (ESTIMATED from 1,613
  MEASURED filenames), not ~1,340.
- **C8. "isolatedModules → type errors stop failing tests"** is moot for api-core. `diagnostics: false` already does
  that, and the tsc leg covers types (F15). The real risk is emit semantics.
- **C9. README §3's "~490 reused" example assumes narrow closures.** NestJS spec closures are probably wide (shared
  modules, `app.module` chains). The reuse ratio after a typical edit is **UNKNOWN**. Kill/resume with no code change
  (T-01) reuses ~100% regardless. Measuring the closure-size distribution is a cheap spike, a haste build plus BFS with
  no test run, that belongs before G4.

---

## 4. Risks and failure modes the plan must model

1. False PASS from a crashed suite (F4). T-04 must include "a suite that throws at import" and "an OOM-killed worker".
2. False PASS from self-skip (table #6). Add a test: unset `SEC_TEST_MONGO_URI` ⇒ the row is SKIPPED and the composed
   real-mongo leg does not pass.
3. Retry laundering: real-mongo `retry once` or `--reruns` turning a FAIL into a reusable PASS (F23). Add a test: a
   retry-pass ⇒ FLAKY.
4. Stale install reuse across worktrees (C3): same source bytes, different node_modules ⇒ the key must differ.
5. Built-artifact drift (`packages/*/dist`) (F12, table #3).
6. Time-bomb tests reused past midnight (table #15). This needs a TTL test.
7. Cross-file bleed: an unhandled rejection from file A surfaces in file B. B fails, A's PASS is reused, and the bleed
   vanishes in composed runs. Only T3 clean sees it, so T-05 is the right guard. Rows from a run with force-exited
   workers or unhandled errors are tainted (§2.7).
8. Torn or interleaved JSONL from concurrent appends. Per-row CRC plus a single `write()` per row (§2.7).
9. Ledger poisoning by the gate itself: `gate` component = H(adapter source), not a manual integer (table #24).
10. Silent shrinkage of exact-set runs: `--runTestsByPath` drops non-test paths (F7). Assert sent == received.
11. Resume runs flip to in-band (F8). `workerIdleMemoryLimit` stops applying, and tests run in the reporter's process,
    so a heavy file can now take down the ledger writer. The append-per-row design survives that.
12. `os.freemem()`-based admission would block forever (F30). Use `avail_est` plus the pressure level.
13. The xdist `--dist load` split means no single worker knows a file finished. Aggregate on the controller only (F22).
14. vitest's forward graph is internal or private API (F19) and may move between minors. Pin the vitest version in the
    `runner` component, and fall back to "no closure ⇒ never reusable" if the moduleGraph walk throws.

---

## 5. Open questions only the owner can answer (with recommendation)

1. **Reuse TTL.** Should a reused PASS older than 24 h (or older than the last T3 clean) be re-run? *Recommend yes: 24 h
   or since the last T3, whichever is shorter.* 406 api-core specs touch the clock.
2. **Env values.** May the ledger store salted HMACs of `.env` and of declared env values, with the salt local to the
   machine and values never stored? *Recommend yes.* Without it, the real-mongo self-skip class is a silent false PASS.
3. **WIDE key class.** Accept that the 208 fs/subprocess-reading specs reuse only when the whole tracked tree is
   unchanged (kill/resume yes, after-edit no)? *Recommend yes.* It is sound and keeps T-01's saving, and a guard can opt
   into NARROW with a declared data-file list.
4. **diff-coverage under composition (C2).** Store per-file coverage in the ledger (bigger rows, side files), or keep
   diff-coverage as a fresh leg? *Recommend a fresh leg in v1.* It already runs only on rollout-set paths.
5. **ts-jest `isolatedModules`.** Keep it out of this program? *Recommend yes* (F15c): it is a separate, T3-proven change.
6. **vitest memory.** Accept no per-worker recycling for admin-ui (~1 GB declared peak) rather than switching to
   `vmForks`? *Recommend yes.* The risk is small and the semantics change is not worth it.

---
_Research for DevOtts (https://github.com/DevOtts) — resumable-test-gates plan-it, slice 03._
