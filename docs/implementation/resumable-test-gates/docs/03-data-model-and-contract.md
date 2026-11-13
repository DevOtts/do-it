# 03 — Data model and interface contract (explained)

This is the explanation; `delivery/CONTRACT.md` §2–§8 is the frozen law. Defaults `Rn` are listed in `DECISIONS.md`.

## 1. Store layout (P1) — R1, OQ-3

Root: `$(git rev-parse --path-format=absolute --git-common-dir)/do-it/gate-results/` — one store per repository,
shared by all its worktrees, never tracked (it sits under `.git/`). Next to a consumer's existing `gate-stamps/`.

| Path | Purpose | Writer | Rule |
|---|---|---|---|
| `results.jsonl` | append-only event rows (`start`, `finish`, `run_start`, `run_end`, `clean`) | adapters and `gate run` | one `write()` per row, ≤ 4096 bytes, CRC per row |
| `failures/<sha256>.txt` | full failure text referenced by a row | adapter | content-addressed, write-once |
| `blobmemo.jsonl` | `git blob id → sha256(bytes)` speed memo | fingerprint | immutable facts; a corrupt line is ignored |
| `.salt` | 32 random bytes for env HMAC | first writer | mode 0600; never copied off the machine |
| `.lock/` | mkdir lock with `owner.json` `{pid, pid_start, cwd, at}` | compaction only | dead owner reclaimed (PID gone or start time differs) |
| `views/flaky.json` | derived quarantine view (files in FLAKY or UNSTABLE) | compaction | rebuilt, never authoritative |

Store interface (spine, sync, `fs-atomic`-based): `gateStoreAppend(row)`, `gateStoreScan(filter)`,
`gateStoreCompact()`, `gateStoreLock()/Unlock()`. Backend `local` only in v1; the interface leaves room for a remote
store (OQ-3). Names are chosen to stay unique in the bundle (`build.mjs:44-47`).

## 2. The key (P3) — R4, R6, R7, R8

`key(f) = sha256(manifest bytes)` where the manifest is UTF-8, LF line endings, tab-separated fields, lines sorted by
UTF-8 byte order (Node: `Buffer.compare`; Python: `sorted(lines, key=lambda s: s.encode())`):

```
rtg-key/1
gate	{sha256 of adapter source + fingerprint source + store source}
runner	{name}@{version}	{sha256 of normalized outcome-affecting argv}
core	{sha256 of the CORE sub-manifest}
installed	{sha256 of the installed-state sub-manifest}
env	{NAME}	{hmac-hex | - (unset) | * (name-only)}
platform	{node or python version, ICU, os, arch, cpu count}
class	NARROW | WIDE
tree	{sha256 of tracked-tree sub-manifest}        (WIDE only)
dep	{repo-relative path}	{sha256 | -}          (one line per closure member)
```

- **File hash** = sha256 of raw bytes; no newline or encoding normalisation; a symlink hashes its target's bytes and
  records the repo-relative realpath; a missing file hashes as the literal `-` (absence is a state).
- **CORE** = runner config files, every module the config references (setupFiles, globalSetup, reporters, transformer,
  testEnvironment) **and their closures**, tsconfig files, conftest set, `**/__mocks__/**`, the project-declared
  `gates.reuse.core` globs, and the gate's own code. A CORE change changes every key (T-03).
- **installed** = node: `node_modules/.package-lock.json` bytes + realpaths of workspace symlinks + lockfile bytes;
  python: sorted `name==version` from `importlib.metadata` + `.pth` contents + lockfile bytes (H2, H3).
- **env** = names in `gates.reuse.env` with `hmac-sha256(salt, value)`; files in `gates.reuse.env_files` (for example
  `.env`) hashed the same way; nothing else from the environment (undeclared vars are an accepted risk caught by T3).
  Values never appear in a row, a log or a verdict (H4).
- **class**: `NARROW` by default. `WIDE` when the test file or any repo-local closure member contains a runtime-read
  pattern (`readFileSync|readdirSync|glob|execSync|spawnSync|execFileSync|child_process|git ` for Node;
  `open(|subprocess|Path(|glob` for Python) or has ≥1 unresolved repo-local specifier. A WIDE key also carries the
  tracked-tree hash, so it reuses on kill-and-resume of an unchanged tree but re-runs after any edit (H6).
- **NEVER** (not a key class, a selection rule): files matching `gates.reuse.always_run` or `gates.reuse.never_reuse`
  always run fresh in every gated run (pilot example: the guards and `*.real-mongo.spec.ts`, R16).
- Every component digest is stored in the row, so `do-it gate results --why <file>` prints *which* component changed.

Closure sources: jest — BFS of `DependencyResolver.resolve()` from the test file using the reporter's `test.context`
(same resolver as `--findRelatedTests`), with an extractor that keeps `import type` edges and `jest.mock` literals, plus
the snapshot path; pytest — BFS over `select.py`'s `imports_of` + `mock.patch("…")` targets + non-py files the test
names; vitest — the SSR module graph the run used (`importedModules`), or "never reusable" if it throws.

## 3. Result rows (P1, P2) — R5

```json
{"schema":"do-it-gate-result/1","type":"finish","run_id":"g-20261106T131000Z-ab12","at":"2026-11-06T13:12:01Z",
 "file":"src/x/x.service.spec.ts","leg":"unit","scope":"push","key":"9f…","components":{"gate":"…","runner":"…",
 "core":"…","installed":"…","env":"…","platform":"…","class":"NARROW","deps":"…"},"result":"PASS","retried":false,
 "counts":{"passed":12,"failed":0,"skipped":0,"pending":0},"exec_error":false,"duration_ms":812,"failure_ref":null,
 "clean":false,"tree_dirty":false,"crc":"3a9c0e…"}
```

- **PASS predicate (jest)**: `testExecError == null && numFailingTests == 0 && !failureMessage && numPassingTests > 0`.
  passing 0 with skipped/pending > 0 = `SKIPPED`; everything else = `FAIL`. pytest: every collected nodeid of the file has
  `call` outcome passed and no `rerun`; deselected-only = `DESELECTED`. vitest: `testModule.state() == 'passed'` and no
  errors, ≥1 passed case.
- `retried: true` when the runner or the project's retry leg re-ran the file; a retried PASS folds to FLAKY.
- `crc` = first 16 hex of sha256 over the canonical JSON of the row without `crc` (sorted keys, no spaces — the spine's
  `canonicalJson`). The Python plugin reproduces it byte-for-byte (`json.dumps(sort_keys=True, separators=(',',':'),
  ensure_ascii=False)`).
- `run_end` row: `{type:"run_end", run_id, tainted, reason, verdict}`; `tainted:true` when the runner reported unhandled
  errors, force-exited workers, open-handle kills or the run was interrupted.

## 4. Verdict line (P4) — honesty rules

Exactly one of:

```
[COMPOSED push: 1607/1607 files PASS · 1555 reused from 3 runs (oldest 2026-11-06T09:12Z) · 52 ran now · 9 skipped · 0 flaky-excluded] run=g-…
[FRESH nightly: 1607/1607 files PASS · 0 reused · 1607 ran now · 9 skipped] run=g-…
[FAIL push: 1 of 1607 files FAIL (src/a.spec.ts) · 1555 reused from 3 runs (oldest …) · 52 ran now] run=g-…
[skip] on_train_complete: no gate declared
[WAIT-TIMEOUT] gate-queue: waited 14400 s at position 2/3 for 2.1 GB · not started · retryable
```

Suffix ` · for WORKING TREE (dirty), not {sha}` when tracked files inside the selection's closure are modified (R11).
The JSON form (`--json`) carries the same fields plus `source_runs[]`. A bare `[OK]` is never printed by `gate run`.

## 5. Settings `gates` block (P5) — §5.1 ruling, R20

```json
"gates": {
  "on_push": null,
  "on_train_complete": "bash scripts/gate.sh --scope train",
  "nightly": "bash scripts/gate.sh --scope nightly --clean",
  "peak_mb": 3000,
  "reuse": { "core": [], "always_run": [], "never_reuse": [], "env": [], "env_files": [] },
  "queue": { "budget_pct": 60, "timeout_s": 14400, "swap_used_max_mb": null }
}
```

All keys optional; every leaf defaults to `null` or `[]` in `SETTINGS_DEFAULTS` so `--set` and `doctor` work
(research/01 §2.2 #13). The three owner-ruled keys keep their names. `queue.*` is honoured from the global layer
(`~/.do-it/settings.json`) only — a repository cannot loosen the machine queue.

## 6. Core-logic models

### M1 — result-row fold (per file, key-scoped)

| From | Event | To | Reusable |
|---|---|---|---|
| NEVER_RUN | start row | RUNNING | no |
| RUNNING | finish PASS, not retried | PASS | yes |
| RUNNING | finish PASS after a retry | FLAKY (passes 0) | no |
| RUNNING | finish FAIL / exec error / synthesized crash | FAIL | no |
| RUNNING | finish SKIPPED or DESELECTED | SKIPPED | counted, never PASS |
| RUNNING | no finish and the run's owner PID is dead | KILLED | no (kills +1) |
| KILLED twice on the same key | next selection | SUSPECT_KILLER | no; scheduled solo, printed |
| PASS | key_now differs | NEVER_RUN | no (`invalidated: {component}`) |
| PASS | finish FAIL on the same key | FLAKY (0) | no |
| FAIL | finish PASS on the same key | FLAKY (1) | no — a re-run does not clear a failure |
| FAIL | key changes (the fix) | NEVER_RUN | no |
| FLAKY (n) | finish PASS | FLAKY (n+1); at 2 consecutive | PASS at 2 |
| FLAKY | finish FAIL | FLAKY (0) | no |
| PASS reused | T3 clean FAIL on the same key | UNSTABLE_UNDER_REUSE (7 days) | no |
| UNSTABLE_UNDER_REUSE | 7 days elapsed and 2 consecutive clean passes | PASS | yes |
| any | T3 clean PASS | PASS, age reset | yes |
| PASS | age > TTL (24 h or older than the last T3) | EXPIRED, then NEVER_RUN | no |
| any | row fails CRC or JSON parse | CORRUPT (row ignored) | no |
| PASS from a tainted run | run_end tainted | NEVER_RUN | no |

### M2 — one gate run

`QUEUED → ADMITTED → SELECTING → RUNNING → COMPOSING → PASSED | FAILED`; `RUNNING → INTERRUPTED` (SIGTERM, kill, OOM,
tool timeout) leaves every finished row on disk; `INTERRUPTED → RESUMED → RUNNING` on the next `--resume` runs exactly
the files without a reusable PASS plus the NEVER set; `SELECTING → FAILED` on a resolver crash only if the fallback
(run the whole selection) also cannot start; `COMPOSING → FAILED` when any required file lacks a PASS.

### M3 — queue ticket

`WAITING → ADMITTED → RELEASED`; `WAITING → WAIT_TIMEOUT` (never runs, exit 3, retryable); `ADMITTED → RECLAIMED` when
the holder PID is dead or its start time differs (next admission check); `ADMITTED → RELEASED` after the process group
is cleaned (pass, fail or signal); `WAITING → REJECTED` on invalid input (`--peak-mb` above the whole budget).

### M4 — train gate

`TRAIN_OPEN → TRAIN_INCOMPLETE` (some planned slice not merged; exit 3, lists them) `→ TRAIN_OPEN` after merges;
`TRAIN_OPEN → TRAIN_GATING → TRAIN_PASSED | TRAIN_FAILED`; `TRAIN_OPEN → TRAIN_SKIPPED` when `on_train_complete` is null;
`TRAIN_FAILED → TRAIN_GATING` after a fix (resume reuses everything that still matches); `TRAIN_FAILED → ESCALATED`
after the review-loop cap, into the owner pack. Deploy proceeds only from TRAIN_PASSED or TRAIN_SKIPPED and only for the
gated tree SHA.
