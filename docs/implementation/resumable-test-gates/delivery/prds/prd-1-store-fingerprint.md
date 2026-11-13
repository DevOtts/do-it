# PRD 1 — Gate results store and fingerprint (lane: store, squad SQ-A1, tier T1)

Where this PRD and CONTRACT.md disagree, CONTRACT.md wins.

Aligned with CONTRACT v1.1-draft §11 (A1 selection protocol, A3 fold placement, A4 rows, A5 fold rules, A6 store
layout, A8 `gateProcStart`). Where §8 below proposes an amendment, the folded §11 text is the law.

Run `resumable-test-gates` (do-it run r-20261106-130657-7ff2), 2026-11-06. Pieces P1 (store) and P3 (fingerprint and
invalidation). Epics: **L1** (gate results store, W1, `epic/L1-store`) and **F1** (fingerprint and invalidation, W1,
`epic/F1-fingerprint`, depends on L1). Decision ids D1..D24 below are PRD-local; the owner rulings are cited as
"DECISIONS D1..D5" and the recorded defaults as R1..R23.

## 1. Summary

Two bundled spine modules carry the crown jewel of the program: deciding, from durable rows, that a test file need not
run again, without ever producing a false PASS.

- `core/spine/src/gate-results.mjs` (L1) is the append-only per-repository store under
  `{git-common-dir}/do-it/gate-results/`: one CRC-protected canonical JSON line per event, lock-free appends from many
  worktrees, compaction under a live-owner mkdir lock that can never lose a concurrent append, the machine salt, failure
  side files, the blob memo file, and the **pure M1 fold** `gateFold(rows, keyNow, now, opts)` that V1 and V2 consume.
- `core/spine/src/gate-fingerprint.mjs` (F1) builds the `rtg-key/1` manifest: on-disk SHA-256 of every input, the CORE
  sub-manifest with the closures of config-referenced modules, the installed dependency state (node and python), salted
  HMACs of declared env values, the platform line, the NARROW/WIDE class, the NEVER set, per-component digests and the
  `--why` diff. It hands adapters everything except the per-file closure through a manifest file.

## 2. Problem and goals

The owner's demand: a partial pass must be saved and reused ("reiniciar os 500 é um absurdo", DECISIONS D2). The danger
is the inverse: research/03 §2.6 (`research/03-runners-and-fingerprint.md:304-335`) lists 24 inputs the README key
misses, eight of them high severity (docs/01 §6 H1–H8). Each one is a path to reusing a PASS for code that would now
fail.

Goals:
1. G-1 everywhere: every error, unknown, corrupt or unreadable input makes the file run (CONTRACT §6, §9).
2. A key that changes whenever any outcome-affecting input changes (CONTRACT §2.2–§2.3), and that is identical across
   worktrees with identical bytes and installed state (G-8).
3. A fold that implements every M1 transition (CONTRACT §8) and cannot be laundered by re-runs, duplicates, compaction
   or torn rows (G-3 support).
4. A store that two worktrees and several runners append to concurrently with no torn or lost row (README T-10), and a
   compaction that ends in COMPACTION_ABORTED then ROLLED_BACK on a crash (M5).
5. Zero dependency: `node:` and relative imports only, unique top-level names, bundle builds (G-15).

Non-goals: a remote store backend (interface only, OQ-3); the closure walk itself (adapters, SQ-B); selection,
verdicts and CLI (V1/V2); queue (Q1/Q2).

## 3. Users and jobs

| User | Job | What they need from this lane |
|---|---|---|
| V1 `gate run` and `gate decide` | write the run directory, decide which files to skip, then compose a verdict | `gateFpManifestWrite` (`rtg-manifest/1`); `gateKeyAssemble` over the adapter's `keys.json`; `gateStoreScan` + `gateFold` per file; `gateReuseDecision` (NEVER precedence) |
| V2 clean / flaky | rewrite folds after a clean run, flag UNSTABLE | fold semantics for clean rows, `views/flaky.json` rebuilt by compaction |
| Adapters A1/A2/A3 (in-process jest, pytest, vitest) | compute per-file `class` and `dep` lines, write `keys.json` and closure sidecars, append rows; never read the store (CONTRACT §11 A1) | the row format and CRC rule, `rtg-manifest/1` (found through `DO_IT_GATE_MANIFEST` or `--do-it-manifest`), the line formats and golden vectors, the `closures/{sha256}.json` format |
| `gate results --why` (V1) | tell a human which input invalidated a reuse | `gateWhy(prevComponents, nowComponents)` with per-line detail for spine-computed components |
| Pilot consumer adopter | trust a composed push verdict | H2/H3/H4/H6/H7 keyed (installed state, `dist/` through symlinks, `.env` HMAC, WIDE readers, setupFiles closure) |

## 4. Solution design (decisions)

### 4.1 Store (L1)

**D1 — Location and discovery.** The store directory is
`{git rev-parse --path-format=absolute --git-common-dir}/do-it/gate-results/`, resolved by `gate-results.mjs` itself,
because `ctx.gitInfo` computes `common` but returns only `top` and `main` (`core/spine/src/ctx.mjs:10-25`, return at
`:21`) and `ctx.mjs` is outside this lane. When git is older than 2.31 (no `--path-format`), the relative output is
resolved against the cwd exactly as `ctx.mjs:19` does. Not a git repository, or the directory cannot be created ⇒
store unavailable ⇒ no rows read or written, every file runs (CONTRACT §6 "No store", G-1). No new environment
variable is introduced; tests create real temp repositories (`core/spine/test/helpers.mjs` `mkRepo`).

**D2 — Layout (amends docs/03 §1; see amendment AMD-2).**

| Path | Writer | Rule |
|---|---|---|
| `results.jsonl` | adapters and `gate run` | the **active** append file; the only file adapters ever write rows to |
| `results.base.jsonl` | compaction | compacted base; replaced only by `atomicWrite` rename |
| `results.seg-{n}.jsonl` | compaction | a frozen former active file, awaiting absorption (also what a crashed compaction leaves) |
| `results.seg-{n}.done-{bytes}.jsonl` | compaction | an absorbed segment kept until the next compaction so a late writer's row is not lost |
| `failures/{sha256}.txt` | spine helper and adapters | content-addressed, write-once, redacted |
| `blobmemo.jsonl` | fingerprint | `git blob id → SHA-256` memo with WIDE bits; corrupt line ignored |
| `components/{sha256}.txt` | fingerprint | content-addressed spine sub-manifests (gate, core, installed, env) for `--why` |
| `closures/{sha256}.json` | adapters (format below) | content-addressed closure sidecar `{"schema":"rtg-closure/1","file","leg","members":[paths],"unresolved":n}`, name = SHA-256 of its canonical JSON; read by `gateWhy` and vitest pre-run decisions; never read by the fold |
| `tmp/` | spine | scratch for compaction temps; the per-run manifest lives outside the store, in `{os.tmpdir()}/do-it-gate-{run_id}/manifest.json` (CONTRACT §11 A1) |
| `.salt` | first writer | 32 random bytes, mode 0600, never copied off the machine |
| `.lock/` | compaction only | mkdir lock with `owner.json` `{pid, pid_start, cwd, at, nonce}` |
| `views/flaky.json` | compaction | derived quarantine view, never authoritative |

Scan order (the fold's order): `results.base.jsonl`, then the tail of every `done` segment beyond its recorded byte
count, then live segments by ascending `n`, then `results.jsonl`.

**D3 — The line on disk is exactly `canonicalJson(row)`.** The writer builds the row object, computes
`crc = sha256Bytes(canonicalJson(rowWithoutCrc)).slice(0, 16)` (CONTRACT §2.1; `core/spine/src/hash.mjs:4-6,12-19`),
and writes `canonicalJson(rowWithCrc)` + LF. Because the stored text is canonical, a reader re-derives the CRC from the
parsed object without depending on `JSON.stringify` key order or `undefined` handling (`canonicalJson` maps
`undefined` to `null`, `hash.mjs:18`, which `JSON.stringify` would drop). Rows hold only strings, booleans, `null` and
integers, so the Python form `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` is byte-identical
(both escape the same control characters with lowercase `\u00XX`, neither escapes `/` or non-ASCII). A string holding a
lone surrogate (Python cannot encode it) or a path that is not valid UTF-8 is refused (`GATE_ROW_INVALID`): no row,
the file runs.

**D4 — One write per row, bounded, self-terminating.** `gateStoreAppend` opens `results.jsonl` with flag `a` (O_APPEND),
issues a single `fs.writeSync(fd, buf)` and checks the returned byte count. The canonical JSON is at most 4094 bytes, so
the buffer (optional leading LF + JSON + LF) is at most 4096 bytes (CONTRACT §2.1, R23). A larger row throws
`GATE_ROW_TOO_LARGE` and writes nothing. If the file's last byte is not LF (a torn tail left by a crash), the buffer is
prefixed with LF so the torn fragment cannot swallow the new row; blank lines are skipped by scan. A short write appends
a lone LF and throws `GATE_ROW_SHORT_WRITE` (the row is lost, so the file runs). The writer does **not** use
`appendLine` (`core/spine/src/fs-atomic.mjs:36-39`), because `appendLine` passes the text through `redactText`
(`fs-atomic.mjs:38`, `redact.mjs:23-34`): a redaction would change bytes after the CRC was computed and turn every such
row CORRUPT. Rows never contain free text that could hold a secret (CONTRACT §2.1 has no message field; failure text
goes to a side file, D8).

**D5 — Validation before write.** Every row is validated against `core/schemas/gate-result.1.schema.json` with the
spine validator (subset: type, enum, const, required, properties, items, additionalProperties, pattern, minLength,
minimum, maximum, minItems, oneOf; `core/spine/src/schema.mjs:6-7`; no `maxLength`, hence the size check in D4), then
against invariants the subset cannot express: `start`/`finish` carry `file` and `key`; run rows carry no `file`;
`result` only on `finish`; `tainted`/`reason`/`verdict` only on `run_end`; `file` contains no TAB, LF or CR and does
not start with `/` or contain a `..` segment; and the **PASS invariant** (R5, G-2 defence in depth): `result: PASS`
requires `exec_error: false`, `counts.failed == 0`, `counts.passed >= 1` and `failure_ref == null`. A violation throws
`GATE_ROW_INVALID` and writes nothing. The fold re-applies the PASS invariant to rows written by other writers (D13).

**D6 — Scan never throws on content.** `gateStoreScan(store, {file, leg})` returns
`{items, corrupt, unattributed, source}` where each item is `{pos, ok: true, row}` or
`{pos, ok: false, file?, leg?, key?, run_id?}`. A line that fails JSON parse, schema, invariant or CRC is a corrupt item.
Attribution of a corrupt line is a regex over its raw text for `"file":"…"`, `"leg":"…"`, `"key":"[0-9a-f]{64}"`, and
`g-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{4}`. With a `file` filter, scan returns that file's start/finish items, every run-level
row (`run_start`, `run_end`, `clean`), every corrupt item attributed to that file and every unattributed corrupt item.
Unreadable store files (EACCES, EIO) yield `source: 'unavailable'` and an empty item list: every file runs (G-1).

**D7 — Salt.** `.salt` is created by writing 32 random bytes (`crypto.randomBytes`) to a temp file opened with mode
0600, `fsync`, then `fs.linkSync(tmp, '.salt')` so a reader never sees a partial salt and two first-writers converge
(EEXIST ⇒ read the winner); the temp file is unlinked. A `.salt` whose size is not 32 bytes is rotated (atomic rename of
a fresh one) and `[gate-results] salt rotated` is printed: every env HMAC then changes, so keys change and files run
(the safe direction). Mode wider than 0600 is narrowed with `chmod`. The salt is excluded from compaction and from the
remote-store interface (CONTRACT §2.2, R7).

**D8 — Failure side files.** `gateStoreFailureWrite(store, text, redactValues)` replaces every value in
`redactValues` (and its JSON-escaped form, as `redact.mjs:10-16` does) of at least 6 characters with
`[REDACTED:NAME]`, truncates to 1 MiB with a `[truncated]` marker, then writes `failures/{sha256 of the redacted
bytes}.txt` with temp + `link` (write-once; an existing file is left untouched). It returns
`failures/{sha256}.txt`, the value of `failure_ref` (pattern `^failures/[0-9a-f]{64}\.txt$`). F1 supplies
`redactValues` from the declared env names and env files (D20) so G-6 also holds for side files. Adapters that write
side files in-process redact the same names (the manifest lists names and env file paths, never values; D22).

**D9 — Blob memo file.** `blobmemo.jsonl` lines are `{"b": blob id, "s": SHA-256 of on-disk bytes, "w": {pattern-set
digest: [nodeHit, pyHit]}, "crc": 16 hex}` in canonical JSON. Append-only, one write per line; a line failing parse or
CRC is ignored. Facts in it are immutable (a blob id is a content address; research/03 F26,
`research/03-runners-and-fingerprint.md:337-355`). The memo is used and verified by F1 (D18).

**D10 — Live-owner lock (M5 prerequisite).** `gateStoreLock(store)` does `mkdir .lock`; on success it writes
`owner.json` `{pid, pid_start, cwd, at, nonce}` with `atomicWrite` (`fs-atomic.mjs:11-30`, passing a Buffer so no
redaction is applied, `fs-atomic.mjs:17`). On EEXIST it reads `owner.json`: the owner is dead when
`process.kill(pid, 0)` throws ESRCH **or** the process start time differs from `pid_start` (PID reuse); a lock without
a readable `owner.json` and an mtime older than 60 s is dead (crash between `mkdir` and the owner write). A dead lock is
reclaimed by renaming `.lock` to `.lock.stale-{pid}-{random}` (atomic) and removing it, then retrying `mkdir` once. A
live owner ⇒ `COMPACTION_BUSY` (compaction is opportunistic and never waits). Process start time comes from
`gateProcStart(pid)`, imported from `core/spine/src/gate-signals.mjs` (queue lane, CONTRACT §11 A8); the store lane does
not define its own helper. A `null` start time on either side counts as "differs". Until Q1 merges, L1 tests inject a
start-time function through `opts.procStart`, so L1 can merge first without a stub in the bundle.

**D11 — Compaction that cannot lose a concurrent append (M5).** `gateStoreCompact(store, {now})`:
1. `COMPACTING`: take the lock (D10), else return `COMPACTION_BUSY`.
2. Rename `results.jsonl` to `results.seg-{n}.jsonl` (`n` = 1 + highest existing). New appends recreate
   `results.jsonl`; adapters open by path per row (D4), so the window is one `open`+`write`.
3. Wait until every frozen segment's size is unchanged across two reads 250 ms apart.
4. Read base + done tails + segments; apply the fold-preserving reduction (D12); write the result with `atomicWrite`
   (temp + fsync + rename, `fs-atomic.mjs:11-30`) onto `results.base.jsonl`. Immediately before the rename, re-read
   `.lock/owner.json` and compare the nonce: a different nonce ⇒ lock lost.
5. Rename each absorbed segment to `results.seg-{n}.done-{bytes}.jsonl` (bytes absorbed). Remove `done` segments from
   the previous compaction after re-appending any bytes beyond their recorded size to `results.jsonl` (late writers;
   printed `[gate-results] N late rows recovered`).
6. Rebuild `views/flaky.json`, release the lock ⇒ `COMPACTED`.

A throw, a fault hook (`DO_IT_FAULT=compact_after_tmp|compact_after_base_rename|compact_steal_lock`, the existing
fault-hook pattern, `core/spine/src/record.mjs:39`, R19) or a lost lock ⇒ `COMPACTION_ABORTED`; the rollback removes
the temp file, renames nothing further, leaves base and segments as they were and releases the lock (if still ours) ⇒
`ROLLED_BACK`. A crash after the base rename but before segment renames leaves rows present twice; the fold's de-dup
rule (D13 step 2) makes that harmless, and the next compaction absorbs the segment again. Retry from `ROLLED_BACK`
starts again at step 1 (M5 `ROLLED_BACK --> COMPACTING`). V1 calls compaction after `run_end` when the store's row
files total more than 16 MiB.

**D12 — Fold-preserving reduction.** Compaction keeps rows in their scan order and drops a row only when no future fold
can depend on it: (a) corrupt lines are **kept verbatim** (they void earlier PASSes, D13 step 4, so dropping them would
re-enable reuse); (b) inside one `(file, leg, key)` group, rows before the latest *clear point* (the second of two
consecutive valid PASS finishes after the last FAIL, retried PASS or corrupt line) are dropped when older than 8 days;
(c) a whole group is dropped when its newest row is older than 8 days and it holds no FAIL, retried PASS, kill or clean
row; (d) start rows followed by a finish on the same key are dropped; (e) run rows are kept for every run that still
owns a kept row, plus the latest `clean` row and its `run_start`. The 8-day horizon exceeds every window in the fold
(TTL 24 h, UNSTABLE 7 days, FLAKY carry-over 7 days; CONTRACT §4.5). The guarantee is a property, not a proof by
inspection: `fold(compact(rows)) == fold(rows)` for every key and for now, now + 1 h, now + 25 h and now + 8 days
(T-L1-14).

**D13 — The M1 fold `gateFold(rows, keyNow, now, opts)` (pure, no I/O).**

Inputs: `rows` = the `items` of `gateStoreScan` for one `(file, leg)`; `keyNow` = `{key, components}` or `null`;
`now` = epoch ms; `opts` = `{file, leg, resume = false, liveRuns: Set of run_id, ttlMs = 86400000,
unstableMs = 604800000, flakyCarryMs = 604800000, skewMs = 60000}`. `liveRuns` is computed by the impure helper
`gateStoreLiveRuns(items)` from the `run_start` fields `pid` and `pid_start` (CONTRACT §11 A4) with `gateProcStart`; the
fold never touches the OS.

Output: `{state, reuse, passRow, key, kills, flakyPasses, unstableUntil, invalidated, reason, corrupt}` where `state`
is a CONTRACT §4.2 token, `reuse` is `'PASS'`, `'SKIPPED'` or `null`, `passRow` is `{run_id, at}` of the row a reuse
rests on, `invalidated` lists component names that differ from the latest finish on another key, `reason` is one token
from: `no-store`, `key-unknown`, `no-row`, `invalidated`, `voided-by-corrupt`, `tainted-run`, `live-run`,
`pass-invariant`, `interrupted-run`, `flaky`, `flaky-carry`, `unstable`, `expired`, `future-timestamp`, `killed`, `suspect-killer`,
`failed`, `skipped`, `ok`.

Algorithm (each step cites the M1 edge it implements; CONTRACT §8, docs/03 §6 M1):
1. `keyNow == null` ⇒ `NEVER_RUN`, reuse null, reason `key-unknown` (G-1: unknown component). No items at all and
   `source: 'unavailable'` ⇒ reason `no-store`.
2. **De-dup**: for `start` and `finish`, keep the first item per `(type, run_id, file, leg)`; later ones are ignored.
   A run writes one finish per file and leg, so a second one is a duplicate from a crashed compaction or a defect, and
   counting it would let one pass look like two consecutive passes.
3. **Run table**: `run_end.tainted == true` marks a run tainted. The *horizon* is the `at` of the `run_start` of the run
   named by the latest valid `clean` row whose run is not tainted (fallback: that `clean` row's own `at`).
4. **Corrupt voiding** (`CORRUPT --> NEVER_RUN`, amendment AMD-6): a corrupt item attributed to this file voids every
   PASS/SKIPPED finish of this file positioned before it; an unattributed corrupt item voids every PASS/SKIPPED finish
   positioned before it. Voided rows never count as passes. If the latest item for the file is a corrupt one, the
   state is `CORRUPT`, reuse null.
5. **Normalise finishes**: PASS violating the PASS invariant (D5) ⇒ treated as FAIL, reason `pass-invariant` (G-2,
   H1, H5); PASS or SKIPPED from a tainted run ⇒ ignored as an outcome (`PASS from a tainted run ⇒ NEVER_RUN`), FAIL
   from a tainted run still counts (`tainted: true` only for unhandled errors, force-exited workers or open-handle kills;
   an interrupted run is not tainted, CONTRACT §11 A4); PASS or SKIPPED from a run whose owner is alive (no `run_end`,
   `run_id` in `liveRuns`) ⇒ not usable (reason `live-run`); PASS or SKIPPED from an **interrupted** run (`run_end`
   verdict `GATE_INTERRUPTED`, or no `run_end` and a dead owner) ⇒ usable only when `opts.resume` is true, else ignored
   as an outcome (reason `interrupted-run`). `DESELECTED` is folded as `SKIPPED`.
6. **Key-scoped state machine** over the normalised finishes on `keyNow.key`, in scan order, starting at `NEVER_RUN`
   with `n = 0` passes:
   - not-retried PASS: from `NEVER_RUN`, `KILLED`, `EXPIRED`, `SKIPPED`, `PASS` ⇒ `PASS` (`RUNNING --> PASS`);
     from `FAIL` ⇒ `FLAKY`, n = 1 (`FAIL --> FLAKY`); from `FLAKY` ⇒ n + 1, and at n = 2 ⇒ `PASS`
     (`FLAKY --> PASS`, G-3: two consecutive passes, never latest-wins).
   - retried PASS (`retried: true`) ⇒ `FLAKY`, n = 0 (`RUNNING --> FLAKY`).
   - FAIL: from `PASS` or `FLAKY` ⇒ `FLAKY`, n = 0 (`PASS --> FLAKY`); otherwise ⇒ `FAIL` (`RUNNING --> FAIL`).
   - SKIPPED: from `NEVER_RUN`, `KILLED`, `EXPIRED`, `PASS`, `SKIPPED` ⇒ `SKIPPED` (`RUNNING --> SKIPPED`); from
     `FAIL`/`FLAKY` ⇒ unchanged (a skip carries no evidence).
   - clean-run finishes (`clean: true`) count as ordinary passes and failures in this machine (so a clean PASS after a
     FAIL gives FLAKY n = 1, not PASS; amendment AMD-5) and additionally drive step 8.
7. **Kills**: a `start` on `keyNow.key` with no finish of the same `(run_id, file, leg)` whose run has a `run_end` or is
   not in `liveRuns` is a kill (`RUNNING --> KILLED`); if the run is live it is `RUNNING`. `kills` counts kills after the
   latest finish on the key. When the latest event on the key is a kill: `kills >= 2` ⇒ `SUSPECT_KILLER`
   (`KILLED --> SUSPECT_KILLER`), else `KILLED`; both reuse null, so the file runs (`KILLED --> NEVER_RUN`).
8. **UNSTABLE** (file-level, any key): a clean FAIL on key k positioned after a non-clean PASS on the same k marks
   `UNSTABLE_UNDER_REUSE` at its `at` = u (`PASS --> UNSTABLE_UNDER_REUSE`, G-5 support). It clears only when
   `now >= u + unstableMs` **and** the file's two most recent clean finishes after u are both PASS
   (`UNSTABLE_UNDER_REUSE --> PASS`). While set: state `UNSTABLE_UNDER_REUSE`, reuse null.
9. **FLAKY carry-over** (file-level; amendment AMD-4; research/03 `:402`): if the file had a flaky event (a FAIL after a
   PASS or a PASS after a FAIL on one key, or a retried PASS) at time f on any key other than `keyNow.key`, and
   `now < f + flakyCarryMs`, the key-scoped machine starts at `FLAKY`, n = 0 instead of `NEVER_RUN`. Flakiness is a
   property of the test, not of one key.
10. **No finish on `keyNow.key`** but finishes on other keys ⇒ `NEVER_RUN`, reason `invalidated`, and `invalidated`
    = the component names (order gate, runner, core, installed, env, platform, class, tree, deps) whose digest in the
    latest such finish differs from `keyNow.components` (`PASS --> NEVER_RUN`, `FAIL --> NEVER_RUN`).
11. **Age** (only when the state is `PASS` or `SKIPPED`): `passRow` = the finish that produced the state. If
    `passRow.at > now + skewMs` ⇒ reuse null, reason `future-timestamp`. If `passRow.at < now - ttlMs` or
    `passRow.at < horizon` ⇒ `EXPIRED`, reuse null (`PASS --> EXPIRED`, R9; `EXPIRED --> NEVER_RUN` is the caller
    running it). Otherwise reuse = the state (`'PASS'` or `'SKIPPED'`), reason `ok` or `skipped`.

The fold ignores `scope`. Rows from different legs never mix (filtered by `opts.leg`; research/03 §2.7 merge rule 6,
`research/03-runners-and-fingerprint.md:411-421`). `RUNNING` and `NEVER_RUN --> RUNNING` are what the fold reports for
a live run's start without a finish.

**D14 — Store interface for a later remote store (OQ-3).** All operations take a store handle
`{backend: 'local', dir}` returned by `gateStoreOpen({cwd, env})`: `gateStoreAppend`, `gateStoreScan`,
`gateStoreCompact`, `gateStoreLock`/`gateStoreUnlock`, `gateStoreFailureWrite`, `gateStoreSalt`,
`gateStoreMemoRead`/`gateStoreMemoAppend`. A future backend must guarantee: per-row atomic append; scan in append order
with corrupt markers; the de-dup key of D13; compaction optional; **the salt never leaves the machine**, so rows from
another machine carry env HMACs under another salt and can never match a local key (by design, not by accident).
Only `local` ships in v1 (docs/05 "Not built").

**D15 — Bundle constraints (G-15).** Both modules import only `node:` modules and `./fs-atomic.mjs`, `./hash.mjs`,
`./schema.mjs`, `./errors.mjs` (`core/spine/build.mjs:32-39`), use named declaration exports only (`build.mjs:40`), and
every top-level name starts with `gate` (`gateStore*`, `gateFold*`, `gateFp*`, `gateKey*`, `gateWhy`,
`gateReuseDecision`) so it cannot collide with `ledger.mjs` (`readLedger`, `writeLedger`; docs/01 §4.3) or any other
module (`build.mjs:44-47`). The schema file is picked up by `build.mjs:51-54` automatically. After any change:
`node core/spine/build.mjs` then `node scripts/sync-mirror.mjs --write` (CONTRACT §5).

### 4.2 Fingerprint (F1)

**D16 — The manifest and key (CONTRACT §2.2, R4; research/03 F27, `:356-380`).** Bytes: the header `rtg-key/1`, then
every other line sorted by UTF-8 byte order (`Buffer.compare`, never `Array.prototype.sort`, which compares UTF-16
code units and disagrees with Python for astral versus U+E000–U+FFFF characters), each line terminated by LF, fields
separated by TAB, no CR. `key = SHA-256(manifest bytes)`, lowercase hex. Line shapes:
`gate\t{d}`, `runner\t{name}@{version}\t{argv-d}`, `core\t{d}`, `installed\t{d}`, `env\t{NAME}\t{hmac|-|*}` and
`env\tfile:{path}\t{hmac|-|*}`, `platform\t{runtime}\t{version}\t{icu}\t{os}\t{os-release}\t{arch}\t{cpus}`,
`class\tNARROW|WIDE`, `tree\t{d}` (WIDE only), `dep\t{path}\t{sha256|-}`. A path containing TAB, LF or CR cannot be
encoded ⇒ key `null`, reason `path-unencodable` (the file runs). `gateKeyAssemble(spineLines, adapterLines)` is the
reference assembly; the Node and Python implementations must agree byte-for-byte on the golden vectors in
`core/spine/test/g1/fixtures/rtg-key-golden/` (input, manifest, key, and a stdlib-only `ref.py`), which SQ-B's A2
consumes unchanged.

**D17 — Component digests.** Row `components` (CONTRACT §2.1) = `gate`, `runner` (SHA-256 of the runner line), `core`,
`installed`, `env` (SHA-256 of the sorted env lines, each with LF; no env lines ⇒ SHA-256 of the empty string),
`platform` (SHA-256 of the platform line), `class`, `tree` (WIDE only), `deps` (SHA-256 of the sorted dep lines). The
spine writes the gate, core, installed and env sub-manifests to `components/{sha256}.txt` (write-once; HMACs only), so
`gateWhy` can name the line that changed, not only the component (research/03 F27 "store every component digest").

**D18 — File hashing (research/03 F26).** File hash = SHA-256 of raw on-disk bytes, no newline or encoding
normalisation. `gateFpHashTable(repo, store)` produces `{path → sha256|-}` for every tracked file
(`git ls-files -s -v -z`) and every untracked, non-ignored file (`git ls-files -o --exclude-standard -z`):
- **memo path**: a tracked file whose index entry is not flagged assume-unchanged (lowercase tag) or skip-worktree
  (`S`) and is not listed by `git diff-files -z --name-only` uses `blobmemo` (`blob id → sha256`); a miss is hashed from
  disk and appended to the memo.
- **memo disabled** for the whole repository when any `.gitattributes` exists, `core.autocrlf` is not `false`/unset, or
  any `filter.*` config is set: disk bytes may then differ from blob bytes for the same blob id.
- **verification**: every run re-hashes from disk a random 1% sample (at least 1) of memo hits; a mismatch prints
  `[gate-fingerprint] blob memo mismatch: memo discarded`, renames the memo to `blobmemo.jsonl.bad-{at}` and rehashes
  every file from disk (adversarial-verify; `DO_IT_FAULT=memo_verify_all` samples 100% in tests).
- **stat cache**: in-process only, keyed `(dev, ino, size, mtimeNs, ctimeNs)`; it never persists, so a cross-run racy
  stat can not serve a stale hash.
- **symlinks** are hashed through their target; the recorded path is the repo-relative realpath; a target outside the
  repository is recorded as `@outside/{SHA-256 of the absolute realpath}`, so no absolute path (user name, worktree
  name) enters a manifest (G-8). A missing file hashes as `-` (absence is a state).
Adapters look dep paths up in this table (shipped in the manifest file) and hash only paths absent from it (ignored
files such as `packages/*/dist/**`, H3) from disk with the same rule.

**D19 — CORE sub-manifest (CONTRACT §2.3; research/03 table #9 and #10, `:320-321`).** `rtg-core/1` header plus sorted
lines `c\t{path}\t{sha|-}`, `c-unresolved\t{from}\t{literal}` and `c-gate\t{gate digest}`. Members:
1. runner config files by name from a per-runner descriptor table in `gate-fingerprint.mjs`: jest
   `jest.config.{js,ts,cjs,mjs,json}`, `package.json`, `babel.config.*`, `.babelrc*`, `.swcrc`; pytest `pyproject.toml`,
   `pytest.ini`, `setup.cfg`, `tox.ini`; vitest `vitest.config.*`, `vite.config.*`, `vitest.workspace.*`, `package.json`.
2. every string literal in those config files that resolves to a repo-local file after substituting jest's rootDir token and
   resolution against the config's directory (extensions `.ts .tsx .js .jsx .mjs .cjs .json`, then `/index.*`), plus
   its static closure: breadth-first over `import … from '…'`, `export … from '…'`, `require('…')`, `import('…')`
   specifiers that are relative or match the root `tsconfig.json` `baseUrl`/`paths`. pilot example: `setupFiles` at
   the pilot's `jest.config.js:13` and reporters at `:75-79` (origin/main) both enter CORE this way (H7).
3. every tracked `tsconfig*.json`, every `conftest.py`, every file under any `__mocks__/` directory.
4. vitest `forceRerunTriggers` literals when they appear as an array of string literals in the config; any other shape
   ⇒ the CORE is marked *wide-all*.
5. `gates.reuse.core` globs (CONTRACT §2.4), matched against the hash table plus a direct walk under each glob's literal
   prefix directory (skipping `node_modules`), so a glob such as `packages/*/dist/**` reaches ignored files.
6. the gate digest (D21), so "the gate code" is literally in the CORE set.
A non-package specifier from a CORE member that does not resolve is recorded as `c-unresolved` and marks the CORE
*wide-all*: every key in the run becomes WIDE (G-1: fail toward running more). A specifier that resolves under
`node_modules` is covered by `installed` (D20). Adapters may add config-referenced modules to each file's dep lines as
well; the duplicate coverage is harmless.

**D20 — Installed, env, platform (CONTRACT §2.2; R7, R8; research/03 table #2, #4, #5, #14, #23).**
- `installed` = SHA-256 of `rtg-installed/1` + sorted lines: `lock\t{path}\t{sha|-}` for `package-lock.json`,
  `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Pipfile.lock`, `requirements*.txt`
  at the repository root; `node-installed\t{dir}/.package-lock.json\t{sha|-}` for the root `node_modules` and each
  `packages/*/node_modules`; `link\t{node_modules/name}\t{repo-relative realpath}` for each symlink at depth 1 or 2 of
  the root `node_modules` (workspace links, H2/H3); for pytest, `py\t{name}=={version}` sorted, and
  `pth\t{file}\t{sha}` per `.pth` in site-packages, from a stdlib probe run with the interpreter the gate uses
  (`argv[0]` when it is a python, else `.venv/bin/python` when present, else `python3`), started with `-I`. Probe failure
  ⇒ the installed component is unknown ⇒ key `null` for every file of that runner (G-1).
- `env` = for each name in `gates.reuse.env`: `-` when unset, else `HMAC-SHA-256(salt, UTF-8 value)` hex; for each
  path in `gates.reuse.env_files`: `-` when missing, else `HMAC-SHA-256(salt, raw file bytes)`. `*` means present but
  unhashable (a directory, EACCES, a name not matching `^[A-Za-z_][A-Za-z0-9_]*$`) and forces key `null`, reason
  `env-unhashable` (amendment AMD-8). An empty value and unset are different lines. Values and plain SHA-256 of values
  never appear in a row, a manifest, a components file, a log or a `--why` line (G-6); `gateFpRedactValues()` returns
  the `{NAME: value}` pairs (including `KEY=VALUE` pairs parsed from declared env files) for D8 and for the process
  redaction set (`redact.mjs:10-16`).
- `platform` is probed by spawning the gate's own runtime with the gate's environment (`node -e`, or the python of the
  probe above), not the spine's `process.version`: `node`, `process.version`, `process.versions.icu`, `os.platform()`,
  `os.release()`, `os.arch()`, `os.cpus().length` (the pilot's largest repo declares Node 20.x but runs v22.23.2;
  research/03 F12). Probe failure ⇒ key `null`. The manifest file also carries `platform_expect` so an adapter can
  refuse reuse when its in-process runtime differs.

**D21 — Gate component (CONTRACT §2.2; H8).** `gate` = SHA-256 of `rtg-gate/1` + sorted lines `{label}\t{sha256}` for:
every file in the runner's adapter directory (`core/gates/adapters/{runner}/`, located relative to the running bundle as
`../gates/adapters/{runner}`), the bundle sections `// ---- gate-results.mjs ----` and
`// ---- gate-fingerprint.mjs ----` of the running bundle (the bundler writes those markers, `build.mjs:48`), and the
canonical JSON of the embedded `gate-result.1.schema.json`. When the section markers are not found, the whole bundle
file is hashed instead (broader, safe). Never a hand-bumped integer (a pilot repo's `GATE_VERSION=2` drifts, its gate runner `:48`, docs/01 §2 item 4).

**D22 — Class, tree, dirty set (CONTRACT §4.6, R6; research/03 table #7 and #12, `:318,323`).**
- `wide_hits`: tracked and untracked files whose bytes match the Node patterns (applied to `.js .jsx .ts .tsx .mjs
  .cjs`) or the Python patterns (applied to `.py`) of CONTRACT §4.6. The bit is cached in the memo per pattern-set
  digest, so the scan costs nothing for unchanged blobs. The patterns over-match (the Node `git ` pattern matches the
  word "digit " too); over-matching only costs reuse.
- `gateClassify({members, unresolved, wideHits, wideAll})` ⇒ `WIDE` when any member is a wide hit, `unresolved > 0`,
  or the CORE is wide-all; otherwise `NARROW`. Adapters apply the same patterns to closure members missing from the
  table.
- `tree` = SHA-256 of `rtg-tree/1` + sorted `t\t{path}\t{sha|-}` over the whole hash table (tracked, including
  modified and deleted, plus untracked non-ignored). Ignored files are outside the tree; a WIDE test that reads ignored
  files is an accepted risk caught by the nightly clean run (V2).
- `dirty`: tracked paths modified in the working tree, shipped in the manifest file so adapters set `tree_dirty` when a
  closure intersects it (R11).

**D23 — NEVER set and reuse precedence (R16, G-16).** `gateNeverMatch(file, globs)`: globs from `gates.reuse.always_run`
and `gates.reuse.never_reuse`; syntax `**`, `*`, `?`, `[…]`, `{a,b}` (not nested); a pattern without `/` matches the
basename at any depth (`*.real-mongo.spec.ts`), a pattern with `/` is anchored at the repository root. A pattern that
does not parse makes **every** file NEVER and prints `[gate-fingerprint] invalid reuse glob: {pattern}` (fail toward
running more, visibly). `gateReuseDecision({fold, never})` returns `{reuse: false, reason: 'never-set', pattern}` for a
NEVER file whatever the fold says; otherwise it returns the fold's `reuse` and `reason`. V1 must use this function, so
NEVER precedence lives in one place.

**D24 — Run manifest and `--why` (CONTRACT §3, §11 A1).** `gateFpManifestWrite(runDir, run)` writes
`{os.tmpdir()}/do-it-gate-{run_id}/manifest.json` as `rtg-manifest/1`, validated against
`core/schemas/gate-manifest.1.schema.json` (store lane); jest and vitest adapters find it through
`DO_IT_GATE_MANIFEST`, pytest through `--do-it-manifest`. Shape: `{schema, run_id, scope, leg, clean, runner,
lines: [gate, core, installed, env…, platform], argv_sha, components, hashes: {path: sha256|-}, wide_patterns,
wide_hits, wide_all, tree, dirty, never: [globs], env_names, env_files, platform_expect}`. It holds names, paths, digests
and HMACs only (no value, G-6) and no absolute path except `store_dir`, which is never part of a key. The adapter
writes per-file `class` and `dep` lines (and its runner version) to `keys.json`; `gate decide` then **recomputes** the
gate, core, installed, env and platform components itself (never trusting the manifest copy), adds the `tree` line for
WIDE files, assembles each key with `gateKeyAssemble` (D16) and returns it in `run-list.json`, which the adapter copies
into its rows. Python `installed` and `platform` stay spine-computed (D20). The golden vectors still bind the Python
plugin, which reproduces the assembly to verify `run-list.json` keys and the row CRC.
`gateFpRunnerLine(name, version, argv, dropFlags)`: argv minus the adapter-declared selection-only flags (for jest
`--filter`, `--runTestsByPath`, positional test paths, `--json`, `--outputFile`, `--reporters`) in original order,
joined by NUL, hashed (research/03 table #19). `gateWhy(prev, now)` returns one line per differing component, for
example `invalidated: core (c jest.config.js changed)`, `invalidated: installed`, `invalidated: env (API_TOKEN)`,
`invalidated: deps`; when the previous file's closure sidecar exists, the deps line also names the changed members; env
lines name the variable, never a value or an HMAC.

### 4.3 High-severity inputs (docs/01 §6) — keyed or explicitly excluded

| # | Input | Handling in this lane | Case |
|---|---|---|---|
| H1 | crash classified as pass | PASS invariant at write (D5) and at fold (D13 step 5); classification itself is A1's predicate | T-L1-03, T-L1-05; excluded to T-A1-02 |
| H2 | installed deps ≠ lockfile | `node-installed` + `lock` + `link` lines (D20) | T-F1-05, T-F1-07, T-F1-14 |
| H3 | gitignored build output in the closure | disk-content hashing through symlinks, realpath recorded (D18) | T-F1-12, T-F1-14 |
| H4 | `.env` values | `env file:` HMAC (D20) | T-F1-08, T-F1-09 |
| H5 | self-skipped suite recorded as PASS | SKIPPED state, never reuse PASS; PASS invariant `passed >= 1` | T-L1-05; excluded to T-A1-02 |
| H6 | runtime file reads | WIDE class + tree line (D22) | T-F1-10, T-F1-11 |
| H7 | setupFiles, reporters, transformer and their closures | CORE closure of config literals (D19) | T-F1-03, T-F1-14 |
| H8 | the gate code itself | gate component from adapter + store + fingerprint sources (D21) | T-F1-04 |

Medium inputs: time (TTL and horizon, T-L1-07), platform and ICU (T-F1-16), root `__mocks__` (T-F1-03), runner flags
(T-F1-01). Snapshots, `import type`, `jest.mock` paths, runner seed and a Python repo's data files are closure inputs owned
by SQ-B; DB/fs pollution and external service versions are accepted risks caught by the nightly clean run (V2;
research/03 table #16, #17).

## 5. Epics

| Epic | Title | Wave | Branch | Depends on | Cases | Real |
|---|---|---|---|---|---|---|
| L1 | Gate results store | W1 | `epic/L1-store` | — | 16 | 1 |
| F1 | Fingerprint and invalidation | W1 | `epic/F1-fingerprint` | L1 (store handle, salt, memo file, components files) | 16 | 2 |

## 6. Acceptance criteria

1. Both Test Contracts in `delivery/epics/epics-1-store-fingerprint.md` pass 100%; T-L1-11, T-F1-05 and T-F1-14 run on
   real targets (CONTRACT §7).
2. `node core/spine/build.mjs` exits 0 and `node scripts/sync-mirror.mjs --check` exits 0 after each epic (G-15).
3. Every M1 transition of CONTRACT §8 has a fold fixture entry (T-L1-05: 24 of 24).
4. Every H1–H8 input is keyed or excluded by a named case (§4.3).
5. No env value is found anywhere in the store, a manifest, a components file or captured output (T-F1-08).
6. A crash at each compaction fault point ends in `COMPACTION_ABORTED` then `ROLLED_BACK` with the base unchanged, and a
   retry ends in `COMPACTED` with identical folds (T-L1-12).

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| A torn or lost FAIL row lets an earlier PASS be reused | laundered failure | corrupt lines void earlier PASSes and survive compaction (D12, D13 step 4); single bounded writes (D4) |
| Duplicate rows after a crash count as two passes | FLAKY cleared by one pass | de-dup by `(type, run_id, file, leg)` (D13 step 2), T-L1-08 |
| Blob memo serves a stale hash (filters, assume-unchanged, tamper) | false PASS | memo bypass rules, repo-wide disable under attributes or filters, 1% verification (D18), T-F1-13 |
| Spine CORE static closure misses a config-referenced module | CORE edit not keyed | wide-all on any unresolved CORE specifier (D19); adapters may add setup closures to dep lines |
| `platform` probe differs from the runtime the runner actually uses | key not describing the run | `platform_expect` assertion in adapters; probe uses the gate's environment (D20) |
| Edit during a run | row keyed to pre-edit bytes | accepted; the next run's key sees the edit; dirty-tree verdict rule R11 |
| Undeclared env vars (`TZ`, `CI`, `NODE_OPTIONS`) change outcomes | false PASS | accepted risk per docs/03 §2, caught by nightly clean; baseline list proposed as AMD-7 |
| `gateProcStart` (queue lane) lands after L1 | lock reclaim and KILLED detection unbuilt in the bundle | L1 takes `opts.procStart` in tests; the bundle wiring lands with Q1 (both W1); a `null` start time counts as dead-or-differs (G-1 direction) |
| Compaction window with a stalled writer | a late row | `done` segments kept one generation and late tails re-appended (D11 step 5) |
| Python plugin diverges from Node canonical JSON | every Python row CORRUPT (safe) or keys never match (no reuse) | golden row and golden manifest shared with A2 (T-L1-01, T-F1-02) |

## 7. Repo and branch plan

- Repository DevOtts/do-it, branched from `main` (CONTRACT §5). Lane paths (store): `core/spine/src/gate-results.mjs`,
  `core/spine/src/gate-fingerprint.mjs`, `core/schemas/gate-result.1.schema.json`,
  `core/schemas/gate-manifest.1.schema.json` (CONTRACT §11 A1), `core/spine/test/g1/**` (tests and
  fixtures, including `fixtures/rtg-key-golden/` and `fixtures/m1-transitions.json`).
- `epic/L1-store` first; `epic/F1-fingerprint` branches from `main` after L1 merges (it uses the store handle, salt,
  memo and components files).
- Files outside the lane that this design needs and that other lanes or an amendment must provide:
  `gateProcStart` in `core/spine/src/gate-signals.mjs` (queue lane, §11 A8), the adapter descriptors
  `core/gates/adapters/{runner}/adapter.json` and the mirror row sourced at `core/gates/adapters` (adapters lane, §11 A2,
  needed by D21), `gate decide` (verdict lane, §11 A1).
- After each change: `node core/spine/build.mjs`, `node scripts/sync-mirror.mjs --write`, then
  `node --test "core/spine/test/g1/*.test.mjs"`.

## 8. Proposed CONTRACT amendments (folded into CONTRACT v1.1-draft §11 A3–A6 and A8, except AMD-7; kept for the record)

- **AMD-1** §2.1: `run_start` rows carry `pid` (integer) and `pid_start` (string or null) so the fold can separate
  KILLED from RUNNING and refuse PASS rows of a still-live foreign run.
- **AMD-2** docs/03 §1 layout: add `results.base.jsonl`, `results.seg-{n}.jsonl`, `results.seg-{n}.done-{bytes}.jsonl`,
  `components/{sha256}.txt`, `tmp/manifest-{run_id}.json`. A compaction that renames over a single `results.jsonl`
  loses appends that land between its read and its rename (README T-10).
- **AMD-3** §5: add `core/schemas/gate-manifest.1.schema.json` (`do-it-gate-manifest/1`) to the store lane.
- **AMD-4** §8 M1: add `FLAKY --> FLAKY (key changed within 7 days: carry-over)` (research/03 `:402`).
- **AMD-5** docs/03 §6 M1 row "any | T3 clean PASS | PASS, age reset" conflicts with G-3 when the state is FAIL or FLAKY;
  a clean PASS counts as one pass there.
- **AMD-6** §8 M1 `CORRUPT --> NEVER_RUN (row ignored)`: the row is ignored as an event but voids earlier PASS rows of
  the files it may belong to; otherwise a torn FAIL row re-enables an earlier PASS.
- **AMD-7** §2.2: consider a built-in env baseline (`TZ`, `CI`, `NODE_ENV`, `NODE_OPTIONS`, `LANG`, `LC_ALL`,
  `PYTHONHASHSEED`) keyed by HMAC in addition to `gates.reuse.env`. Not applied in v1 (docs/03 §2 says nothing else).
- **AMD-8** §2.2: define the env token `*` as "present but unhashable", which forces key `null`.
- **AMD-9** §2.1: define the `clean` row as the end-of-run marker of a completed clean run; the TTL horizon is the `at`
  of that run's `run_start`.
- **AMD-10** §2.1: a run writes at most one `start` and one `finish` per `(file, leg)`; readers de-duplicate on
  `(type, run_id, file, leg)`.
- **AMD-11** §2.5 and §5: one PID start-time helper for the queue and the store lock (`gateStorePidStart` here, or the
  queue lane's equivalent), to keep one liveness rule and unique bundle names.
- **AMD-12** DECISIONS waiver "rollback/compensation for L1: N/A" is superseded by M5 (compaction rollback is tested in
  T-L1-12).
