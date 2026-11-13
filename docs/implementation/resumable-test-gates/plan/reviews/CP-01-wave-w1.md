checkpoint: CP-01
round: 2
verdict: PASS
tree: /Users/macbook/Workspace/Devotts/do-it/.worktrees/rtg-int, branch rtg/integration @ 39ce5a9
reviewer: independent (built none of this code); experiments ran in a temp copy, cleaned up

Why FAIL: one MEDIUM (F-1, a G-7 stale-reuse hole opened by builder amendment AM-F1-c). Everything else passes.

## Run results (merged tree, [REAL] env set)

| suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| core/spine/test/g1 (L1 16 + F1 16) | 32 | 32 | 0 | 0 |
| core/spine/test/g3 (Q1 17) | 17 | 17 | 0 | 0 |
| core/spine/test/g4 (S1 17) | 17 | 17 | 0 | 0 |
| core/spine/test/s1/fs-lint | 3 lint tests | 3 | 0 | 0 |
| tests/catalog (`tests/catalog/*.test.mjs`, incl. neutral-names) | 27 | 27 | 0 | 0 |

Note: passing the bare directory `tests/catalog` to `node --test` fails with MODULE_NOT_FOUND (it is not a file); use the glob.

## Findings

| ID | Sev | Case / rule | What is wrong | Reproducer |
|---|---|---|---|---|
| F-1 | MEDIUM | G-7, G-1, T-F1-03, T-F1-11, AM-F1-c (D19) | D19 says every string literal in a runner config that resolves to a repo-local file enters CORE. AM-F1-c narrows that to literals starting `./`, `../` or `<rootDir>/` (and no regex metacharacter). The narrowing is right for the unresolved wide-all decision, but it was also applied to literals that DO resolve. A config literal such as `setupFiles: ['test/setup.ts']` (valid in vitest, which resolves from root) is not keyed: editing `test/setup.ts` leaves every key unchanged and class NARROW, so a stale PASS is reused. T-F1-03 does not see it because its fixture only uses `./` and `<rootDir>/` forms. | Temp copy; `fpRepo({'package.json':..., 'jest.config.js':"module.exports={setupFiles:['test/setup.ts']};", 'test/setup.ts':..., 'src/a.spec.ts':...})`, `keysOf(spineOf(repo),[spec])`, append to `test/setup.ts`, recompute: key identical. Same fixture with `'./test/setup.ts'`, `'<rootDir>/test/setup.ts'` and `require.resolve('./test/setup.ts')`: key changes (correct). Also unkeyed: directory literal `./test` and a template literal. Fix: any literal that resolves to an existing repo-local file (against config dir and rootDir) is a CORE member; keep the `./`/extension rule only for deciding unresolved to wide-all. Add a T-F1-03 edit row with a bare literal. |
| F-2 | LOW | T-L1-10, T-Q1-17, G-15 | Both modules export upper-case constants (`GATE_ROW_SCHEMA`, `GATE_FP_*`, `GATE_STORE_*`, ...). The contract text says top-level names start with `gate`; the test regex is `/^gate/i`. G-15's own wording only requires unique names, which the build guard enforces, so this is a reading, not a hole. | `grep -E "^(export )?const [A-Z]" core/spine/src/gate-results.mjs` |
| F-3 | LOW | neutral names (R3/X18) | The pilot workspace package name (`llm-obs` under its scope) appears in tracked files outside `audit/`: `core/spine/test/g1/f1-real.test.mjs` and `delivery/epics/epics-1-store-fingerprint.md` (T-F1-14 text prescribes it). `tests/catalog/neutral-names.test.mjs` passes because its name list does not include it. No pilot repo name or path was found. | `git ls-files \| grep -v /audit/ \| xargs grep -lIE "llm-obs"` ; widen the NAMES list or read the package name from env. |
| F-4 | LOW | AM-L1-a, D12 | Compaction does not implement D12 (b) and (c) (drop old PASS groups, drop rows before a clear point), so growth is bounded only by dropped starts and duplicates. Correctness is fine (T-L1-14 mutation-checked by the builder). Track as a store-growth risk for a later epic. | n/a |

Not findings (probed): the Q1 under-lock admission recheck (`gateQueueTryAdmit`) is redundant with the pre-check, so mutating only one layer survives T-Q1-05; mutating both is caught. That is defence in depth, not a test gap.

## Governance probes (all in a temp copy; "caught" = the named test failed with an AssertionError or timed out)

| Rule | Mutation | Test | Result |
|---|---|---|---|
| G-1 | disable `voided-by-corrupt` in `gateFold` | T-L1-04 | caught |
| G-1 | scan over results.jsonl as a directory, chmod 000, store dir as a file, NUL + 2 MB line | direct probe | scan never throws; reuse null in all 4 |
| G-6 | redaction skips every value | T-L1-15 | caught |
| G-6 | env line uses plain SHA-256 instead of the salted HMAC | T-F1-08 | caught |
| G-7 | drop the `c` CORE lines from the spine | T-F1-03 | caught (but see F-1 for the unmodelled input form) |
| G-8 | `node-installed` line carries the absolute repo path | T-F1-05 | caught. (A first mutation on `gateFpRealRel` survived because no dep path goes through it in that fixture; not a gap in the rule.) |
| G-10 | queue ignores held memory in both admission layers | T-Q1-05 | caught |
| G-12 | reclaim skips `start time differs` holders | T-Q1-04 | caught |
| G-15 | duplicate top-level name | T-L1-10 / T-Q1-17 | built-in mutant (the test proves the guard can fail); real build prints `built core/spine/do-it.mjs (53 modules, 376167 bytes)` |

## Bundle health

- `node core/spine/build.mjs` in a temp copy reproduces the committed `core/spine/do-it.mjs` byte-for-byte (bundle fresh).
- I stripped the CLI footer from a copy of the bundle and exported every `gate*` function (157). Every exported function of gate-results, gate-fingerprint, gate-queue and gate-signals exists in the bundle with identical source text.
- Through the bundle: `gateQueueCmd` with a signals fixture admits, runs the command, releases, prints the contract lines, exit 0; `gateStoreOpen`/`gateStoreAppend` write the golden line byte-identical to `golden-row.line`; `gateStoreScan`, `gateStoreSalt`, `gateGlobMatch` work. No TDZ or ordering failure found.
- Caveat: the bundle has no `gate queue` CLI route yet (builder Q1 says V1 must add `case 'queue'`, the `--` passthrough and an async `cliMain`); the bundle's `cliMain` footer is synchronous today. Flag for the W2 verdict-lane slice that wires it.
- Environment note: on this machine memory pressure read `warn` during the review, so an unfixtured `gate queue` blocks by design; probes used `DO_IT_GATE_SIGNALS`.

## L1 (case | ran | PASS/FAIL | assertion matches Expected?)

| case | ran | result | matches |
|---|---|---|---|
| T-L1-01 | y | PASS | y (byte-equal line and CRC against Python) |
| T-L1-02 | y | PASS | y (writeSync spy count, 4095 refused, torn-tail prefix) |
| T-L1-03 | y | PASS | y (7 of 7, size 0) |
| T-L1-04 | y | PASS | y (mutation caught) |
| T-L1-05 | y | PASS | y (24 entries) |
| T-L1-06 | y | PASS | y |
| T-L1-07 | y | PASS | y |
| T-L1-08 | y | PASS | y |
| T-L1-09 | y | PASS | y |
| T-L1-10 | y | PASS | y with F-2 reading (regex is case-insensitive) |
| T-L1-11 [REAL] | y | PASS | y (2 real worktrees, 4 processes x 500) |
| T-L1-12 | y | PASS | y (duplication asserted on disk, folds equal) |
| T-L1-13 | y | PASS | y (a-e all asserted) |
| T-L1-14 | y | PASS | y (300 streams, 2 x 1000 stress; the property holds because of AM-L1-a, see F-4) |
| T-L1-15 | y | PASS | y (mutation caught) |
| T-L1-16 | y | PASS | y (TAMPER-UNDETECTED printed for the mutant) |

## F1

| case | ran | result | matches |
|---|---|---|---|
| T-F1-01 | y | PASS | y |
| T-F1-02 | y | PASS | y (Python ref.py byte-identical) |
| T-F1-03 | y | PASS | weak: all 7 edits use the forms the fixture names; bare resolving literal not covered (F-1) |
| T-F1-04 | y | PASS | y (uses fixture adapter dir; adapters lane not on branch, acceptable) |
| T-F1-05 [REAL] | y | PASS | y (mutation caught) |
| T-F1-06 | y | PASS | y |
| T-F1-07 | y | PASS | y |
| T-F1-08 | y | PASS | y (mutation caught) |
| T-F1-09 | y | PASS | y |
| T-F1-10 | y | PASS | y |
| T-F1-11 | y | PASS | weak: asserts the unresolved-literal case only for the narrowed literal shape (AM-F1-c) |
| T-F1-12 | y | PASS | y |
| T-F1-13 | y | PASS | y |
| T-F1-14 [REAL] | y | PASS | y (ran on the pilot jest repo, read-only) |
| T-F1-15 | y | PASS | y (one line each) |
| T-F1-16 | y | PASS | y |

## Q1

| case | ran | result | matches |
|---|---|---|---|
| T-Q1-01 | y | PASS | y |
| T-Q1-02 | y | PASS | y |
| T-Q1-03 | y | PASS | y |
| T-Q1-04 | y | PASS | y (mutation caught) |
| T-Q1-05 | y | PASS | y (mutation caught) |
| T-Q1-06 | y | PASS | y |
| T-Q1-07 | y | PASS | y |
| T-Q1-08 | y | PASS | y |
| T-Q1-09 | y | PASS | y |
| T-Q1-10 | y | PASS | y |
| T-Q1-11 | y | PASS | y (reading 4 below) |
| T-Q1-12 | y | PASS | y |
| T-Q1-13 | y | PASS | y |
| T-Q1-14 | y | PASS | y |
| T-Q1-15 [REAL] | y | PASS | y |
| T-Q1-16 [REAL] | y | PASS | y |
| T-Q1-17 | y | PASS | y with F-2 reading |

S1 (merged, light review): T-S1-01..16 all PASS (g4), fs-lint and catalog pass.

## Amendment verdicts

| Amendment | Verdict |
|---|---|
| AM-L1-a (exact reduction instead of D12 b/c) | Acceptable. Keeps T-L1-14's deep-equal property, which is the binding case; record in CONTRACT §11 and carry the growth risk (F-4). |
| AM-L1-b (absorbed segments in a CRC'd base metadata line) | Acceptable. Strictly safer than a second non-atomic rename; T-L1-12 still asserts on-disk duplication after the fault. |
| AM-L1-c (PASS-invariant violation kept and folded to FAIL, not scanned as corrupt) | Acceptable. Matches T-L1-05, stricter. |
| AM-F1-a (class change subsumes deps/tree lines in `--why`) | Acceptable. Informational output only. |
| AM-F1-b (declared env files excluded from table/tree/memo, keyed by HMAC) | Acceptable. Strengthens G-6. |
| AM-F1-c (CORE literal shape rule) | NOT acceptable as written: weakens D19 for resolving literals (F-1). Acceptable only if limited to the unresolved wide-all decision. |
| AM-F1-d (fingerprint-error key null; installed-unknown beats platform-unknown) | Acceptable. Fails toward running (G-1). |
| AM-F1-e (spec bytes always a dep line) | Acceptable. |
| Q1 #1 (gateQueueCmd/Admit async) | Acceptable, but creates a W2 dependency: cliMain must pass a thenable through. |
| Q1 #2 (release is a lock-free unlink) | Acceptable. Only lowers held memory; conservative on interleaving. |
| Q1 #3-#5, #7 (WAIT-TIMEOUT reason text, position-line reading, exclusive gate skips avail check, new outcomes) | Acceptable. |
| Q1 #6 (Linux pswpout at 4 KiB pages, unmeasured) | Acceptable for W1; needs a Linux [REAL] later. |

## Round 2 (fix commit abf24b2, parent 39ce5a9)

Verdict: PASS (F-1 and F-3 closed; no new finding).

- g1 with the [REAL] env on the fix tree: 32 tests, 32 pass, 0 fail, 0 skipped. T-F1-03 now reports "8 of 8 CORE edits change 5 of 5 keys"; T-F1-14 passes on the pilot jest repo.
- F-1 probe re-run on a temp copy of abf24b2: a bare `setupFiles: ['test/setup.ts']` now changes the key on edit in both a jest config and a vitest-style config (was unchanged in round 1). A tracked-or-untracked repo file named by a bare literal is keyed.
- Adversarial bare literals (all behave safely):
  - literal naming a package that also exists as a repo file (`lodash` with `lodash.js`): keyed, which over-keys conservatively (fails toward running);
  - `test/../../outside.ts` (escapes the repo): ignored, no outside path or absolute path in the CORE lines;
  - bare name that is a symlink to a file outside the repo: not keyed, no outside path leaked;
  - bare string resolving to nothing: not keyed, wideAll stays false (no widening).
- Residual note (not a finding): bare literals resolve against the config's own directory only, not a separate rootDir/root; a config placed in a subdirectory with root elsewhere would still need the `<rootDir>/` form. Within D19's stated resolution rule.
- F-3: no tracked file outside `audit/` names the pilot package any more except the frozen plan doc `epics-1-store-fingerprint.md` (accepted by the lead). T-F1-14 prints the derived pilot package name in its console log line; that is test output, not a tracked file.
- F-2 (reading) and F-4 (AM-L1-a) remain LOW and accepted.
