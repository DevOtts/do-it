# PRD 4 — Gate queue: memory-budget admission, FIFO, live-owner lock, child cleanup, one entry point

Squad SQ-C · tier T1 (crown jewel: queue admission) · piece P6 · lane `queue` (CONTRACT §5) · epics Q1 (W1), Q2 (W2)
Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

Where this PRD and CONTRACT.md disagree, CONTRACT.md wins.

## 1. Summary

`do-it gate queue [--peak-mb N] [--label T] [--timeout-s N] -- command` is one deterministic, per-machine admission
primitive (ruling D4). A gate waits in a strict FIFO under `{HOME}/.do-it/queue/` until the machine can take it: memory
pressure is normal, swap-out has stopped, the estimated available memory covers its declared peak, and the declared
peaks of live holders plus its own fit in the budget (R13). It never starts without admission: a wait past the timeout
ends in `[WAIT-TIMEOUT]` with exit 3 and the command never ran (G-10, R14). A holder whose process is dead, or whose PID
was reused by another process, is reclaimed at the next admission check (G-12). Once admitted, the command runs in its
own process group; on pass, fail or signal the queue ends the group and every tracked descendant by PID, never by name
(G-11), then releases the slot and exits with the command's own exit code. Pre-push hooks, the train and nightly stages
and manual runs all use this one command.

Q1 (W1) builds the admission half: `core/spine/src/gate-signals.mjs` (memory signals, process liveness) and the
admission core of `core/spine/src/gate-queue.mjs`. Q2 (W2) builds the run half: process group, descendant tracking,
signal forwarding, cleanup, release, exit passthrough, nested admission, `--status`, and the exported entry point.

## 2. Problem and goals

Problem (MEASURED, docs/01 §2 items 6–7, research/02 §2.3 lines 62–80, README §6):
- The pilot consumer has two half-queues that do not talk to each other. Its slot script counts slots, not memory
  (a slot count of 2), and after 1,800 s **proceeds without a slot** (slot script `:64-67` at the pilot's `origin/main`,
  verified 2026-11-06). It exists in only 3 of 12 repos and depends on Homebrew `flock`, which macOS does not ship.
  Its archived heavy-job script (58 lines) has a mkdir lock with dead-owner reclaim and a 75 % swap guard, but is opt-in,
  polls forever, has no FIFO (whoever polls first wins), cleans no children and hard-codes absolute paths
  (heavy-job script `:16-18,29-45`, verified).
- On 2026-11-06 at 09:3x two jest workers of one pilot gate held 6.6 GB RSS each on an 18 GiB Mac with swap at 3.5 of
  4 GB (README §6). One more gate on top thrashes, the reaper kills it, the run is lost.
- The obvious "free memory" number is wrong on macOS: `os.freemem()` read 0.94 GB on a healthy machine while the
  estimator read 4.68 GB (research/03 F30, `research/03-runners-and-fingerprint.md:456-466`). Admission on
  `os.freemem()` would block every gate.

Goals:
1. No gate starts into a loaded machine; no gate starts without admission (G-10, D4).
2. Small gates pass while a big one runs, if their declared peak fits (README §6.1 item 1, README T-14).
3. A waiter always sees why it waits, in one stable line (README §6.1 item 2).
4. A dead or reused-PID holder never blocks the machine (G-12, README T-13).
5. No process of a gate survives the gate (G-11, README T-15), including jest leftovers after green.
6. One entry point for pre-push, train, nightly and manual runs (README §6.1 item 6).
7. Waiting costs zero model turns (a pilot no-polling rule, via research/02 line 138).

Non-goals: a daemon; an LLM negotiation skill (D4); Windows (docs/02 §6); changing the Docker memory cap (D5); killing
processes the queue did not start; deciding a gate's peak automatically (the project declares it).

## 3. Users and jobs

| User | Job | What they must know at that moment |
|---|---|---|
| A worker agent pushing a branch (pre-push hook) | get the gate run without hand-coordinating with peer sessions | am I waiting, for what, behind whom, how long until timeout |
| The do-it conductor (train, nightly stages) | gate the integrated tree unattended | did the gate run or never start (exit 3 = retryable, not a red test) |
| Fernando at the terminal | run a heavy suite by hand safely | the same queue line; Ctrl-C leaves nothing running |
| An operator diagnosing a stall | see the queue | `do-it gate queue --status`: holders, FIFO, reasons, dead entries |

## 4. Solution design (decisions D1..D20, PRD-local)

**D1 Files and home.** Queue root = `path.join(ctx.userHome, '.do-it', 'queue')`; `ctx.userHome` = `env.HOME ||
os.homedir()` (`core/spine/src/ctx.mjs:49`, verified). Layout exactly CONTRACT §2.5: `.lock/` (mkdir lock with
`owner.json`), `seq`, `tickets/{seq}-{pid}.json`, `holders/{seq}-{pid}.json`. `{seq}` is zero-padded to 10 digits so a
lexical sort is FIFO order. Entry fields `{seq, pid, pid_start, pgid, cwd, repo, label, peak_mb, enqueued_at,
admitted_at}`; Q1 also writes `reason` and `checked_at` on tickets (proposed amendment A3). Writes go through
`atomicWriteJson` (`core/spine/src/fs-atomic.mjs:11-34`), admission is a `rename` from `tickets/` to `holders/` under the
lock. Tests sandbox HOME (`core/spine/test/helpers.mjs:21-27`; research/01 §2.4 #24, line 74), so no test touches the
real machine queue. No env override of the queue path is added (research/01 suggested `DO_IT_QUEUE_DIR`, line 137; HOME
sandboxing already covers it).

**D2 Lock.** A mkdir lock `.lock/` with `owner.json {pid, pid_start, at}`, held only for the read-modify-write of one
admission check (milliseconds, never while reading signals or running the command). A lock whose owner is not live (D3)
is stolen by renaming `.lock` to `.lock.stale-{pid}-{random}` and removing it, so two stealers cannot both delete a fresh
lock. No external `flock` (research/02 §2.3 line 71). The spine has no lock primitive today (research/01 §2.1 #8,
line 31); this one is queue-local and named with a `gateQueue` prefix.

**D3 Liveness = PID plus start time** (CONTRACT §2.5). Alive iff `process.kill(pid, 0)` succeeds (EPERM counts as alive)
AND the start time read now equals `pid_start`. Start time: darwin `LC_ALL=C ps -o lstart= -p {pid}` (live reading
2026-11-06T13:36:51Z: `Fri Nov  6 10:36:51 2026`), Linux field 22 of `/proc/{pid}/stat` (clock ticks since boot, read
with `node:fs`). Stored as `darwin:{text}` or `linux:{ticks}`. If the PID answers `kill 0` but the start time cannot be
read, it is treated as alive and a warning is printed (fail toward waiting; the timeout bounds it). This defeats PID reuse
(G-12) without a daemon.

**D4 Memory signals, darwin** (`gate-signals.mjs`). All through `execFileSync` with absolute paths (`/usr/sbin/sysctl`,
`/usr/bin/vm_stat`, `/bin/ps`), zero dependencies (research/03 F30):
- pressure: `kern.memorystatus_vm_pressure_level` 1 = normal, 2 = warn, 4 = critical
  (`dispatch/source.h:255-257` via research/03 F28, line 443). Anything other than 1 waits.
- total: `hw.memsize`; page size: `hw.pagesize` (or the `vm_stat` header).
- `avail_est = (total_pages − anonymous − wired − occupied_by_compressor) × pagesize` (research/03 F30, line 461),
  with `total_pages = hw.memsize / pagesize`. Never `os.freemem()` and never "Pages free".
- swap used: `vm.swapusage` parsed with `/used = ([\d.]+)([KMG])/` (research/03 F29, line 449). Only an absolute ceiling
  is used, and only when `queue.swap_used_max_mb` is set; macOS swap total grows on demand (live: 4096 MB at 13:16Z,
  5120 MB at 13:36Z), so a "% of total" is not a ceiling.
- swap-out rate: delta of the cumulative `Swapouts` counter between two `vm_stat` reads at least 5 s apart (CONTRACT §4.5
  swap-out window 5 s), in bytes per second. The head waiter samples every poll (2 s) and keeps a rolling window, so only
  the first check of a process pays the 5 s wait.

Live reading for the record (MEASURED 2026-11-06T13:36:51Z–13:36:57Z, read-only): pressure 1, `kern.memorystatus_level`
57, swap used 4602.81 of 5120 MB, `hw.memsize` 19,327,352,832, page 16,384, pages free 4,520 (≈ 70 MB), anonymous
469,011, wired 163,400, occupied by compressor 314,342 ⇒ `avail_est` = 232,895 pages = 3,815,751,680 B = 3,639 MB; no
jest, vitest or pytest process running. A declared 3,000 MB gate would be admitted on memory at that instant; `Pages
free` would have refused it.

**D5 Memory signals, Linux** (research/03 F31, line 468, from kernel documentation, not measurable on this host):
`MemAvailable` from `/proc/meminfo` is `avail_est`; `MemTotal` is total; swap used = `SwapTotal − SwapFree`; swap-out rate
= delta of `pswpout` in `/proc/vmstat` over 5 s (UNKNOWN on a live Linux host; chosen by analogy, flagged for a Linux
[REAL] run later); pressure from PSI `/proc/pressure/memory`: the `some` line's 10-second average above 10, or the `full`
line's 10-second average above 0, counts as warn. Inside a cgroup (control group version 2), when `memory.max` holds a
number: total = min(`MemTotal`, `memory.max`), `avail_est` = min(`MemAvailable`, `memory.max − memory.current`), and
`memory.pressure` replaces the PSI file. The reader takes a root path argument so tests feed a fixture directory.

**D6 Fallback.** Each signal is read independently. An unreadable signal skips only its check and prints
`[gate-queue] signal unavailable: {name}` once per invocation. When no memory signal is readable (unknown OS, sysctl
error, fixture `{"unavailable": true}`), admission is budget-only and prints exactly CONTRACT §6's line
`[gate-queue] memory signals unavailable: budget-only admission`. Total RAM for the budget then comes from `os.totalmem()`.

**D7 Test seam R19.** `DO_IT_GATE_SIGNALS` names a JSON fixture file, re-read on every poll so a test can change the
machine state mid-wait: `{"pressure": "normal"|"warn"|"critical"|null, "total_mb": N, "avail_mb": N|null,
"swap_used_mb": N|null, "swapout_mb_per_s": N|null, "unavailable": bool}`. With a fixture no `sysctl`/`vm_stat` runs and no
5 s window applies. The name is do-it-internal (stripped by `baseEnv`, `helpers.mjs:23`), never documented for consumers and
adds no consumer env var (R21).

**D8 Units.** MB means 1,048,576 bytes everywhere (the unit `vm.swapusage` prints). GB in a status line = MB / 1024 with
one decimal.

**D9 Budget.** `budget_mb = floor(queue.budget_pct / 100 × total_mb)`; default 60 % (CONTRACT §2.4, §4.5). On this Mac:
floor(0.6 × 18,432) = 11,059 MB. `held_mb` = sum of `peak_mb` of live holders.

**D10 Peak.** From `--peak-mb N` (integer ≥ 1). In Q2 the entry point also reads `gates.peak_mb` from the project's
workspace settings file when the flag is absent (a project property, not a machine loosening). When neither is given the
gate is **exclusive**: it reserves the whole budget, so it runs alone, and the line says `peak undeclared: exclusive`.
This keeps today's "one heavy gate per machine" behaviour for undeclared gates without inventing a number (proposed
amendment A1).

**D11 Admission rule R13, exact.** At each check, under the lock: reclaim dead holders and dead tickets (D3, G-12);
the ticket is the **head** iff its seq is the lowest among live tickets. Only the head reads signals (outside the lock),
then re-takes the lock, re-reads holders (the world may have changed) and is admitted iff all hold:
1. `pressure == normal` (or the pressure signal is unavailable);
2. swap-out rate ≤ 1 MB/s over the ≥ 5 s window (or unavailable) — the reading of R13's "about zero" (amendment A2);
3. `avail_est_mb ≥ peak_mb` (or unavailable);
4. `queue.swap_used_max_mb` is null, or swap used ≤ it;
5. `held_mb + peak_mb ≤ budget_mb`.
`peak_mb > budget_mb` at enqueue time ends in REJECTED before any ticket is written. Strict FIFO: a head that does not
fit blocks everyone behind it, so a big gate cannot starve (README T-14's third gate waits).

**D12 Status line** (README §6.1 item 2, exact format):
`[gate-queue] position {p}/{n} · waiting for {reason} · ahead: {label} ({cwd basename}, pid {pid})`.
`{n}` counts holders plus tickets; `ahead` names the ticket directly ahead, or for the head the holder that blocks it
(largest peak first), or `none` when nothing is ahead; reasons, in check order: `turn`, `memory pressure normal (now warn|critical)`, `swap-out to stop
({r} MB/s)`, `{need} GB free ({have} GB now)`, `swap used below {max} MB ({now} MB now)`, `budget ({held} MB held +
{peak} MB > {budget} MB)`. Printed to stderr when the reason or position changes, else at most once per 60 s.
Other lines: `[gate-queue] enqueued seq={s} position {p}/{n} peak={m} MB label={l}`;
`[gate-queue] admitted seq={s} after {w} s · peak {m} MB · held {h}/{b} MB · signals {source}`;
`[gate-queue] reclaimed seq={s} pid {pid} ({dead|start time differs})`;
`[gate-queue] stale queue lock (owner {pid} dead) reclaimed`; `[gate-queue] corrupt holder file {name} quarantined`;
`[gate-queue] holder file missing at release`; `[gate-queue] released seq={s} exit={c} cleaned={k}` where `{k}` counts
tracked processes still alive when cleanup started and ended by it. `{s}` is printed without padding.
Default label = `{repo basename}:{basename of the first argv word}`; `repo` = `git rev-parse --show-toplevel` of the cwd
or null.

**D13 Timeout R14.** Timeout = `--timeout-s` else global `queue.timeout_s` else 14,400 s. On expiry: remove the ticket,
print `[WAIT-TIMEOUT] gate-queue: waited {w} s at position {p}/{n} for {reason} · not started · retryable` (CONTRACT
§4.3; docs/03 §4 example), exit 3, outcome `GATE_WAIT_TIMEOUT` (§4.4). M3 `WAITING → WAIT_TIMEOUT`; a caller retry is a
new ticket (`WAIT_TIMEOUT → WAITING`). There is no proceed path and no force flag in v1.

**D14 Settings from the global layer only** (CONTRACT §2.4, R14). Q1 reads `gates.queue.{budget_pct,timeout_s,
swap_used_max_mb}` straight from the global file `settingsPaths(ctx).global` (`core/spine/src/settings.mjs:90-95`) and
never opens the workspace file for `queue.*`. Reason: Q1 ships in W1, before S1 (W2) teaches `settings.schema.json` the
`gates` block, and `loadSettings` would reject the block today (root `additionalProperties: false`, docs/01 §4 item 4).
Ranges: `budget_pct` integer 1–90, `timeout_s` integer ≥ 1, `swap_used_max_mb` integer ≥ 1 or null; out of range or
wrong type ⇒ outcome `QUEUE_SETTINGS_INVALID`, exit 1 (fail loudly, research/01 §4 #4). After S1 merges, S1 may route
this through `loadSettings` filtered to source `global`; the observable behaviour must not change (amendment A6).

**D15 Waiting is one blocking process (pilot no-polling rule).** The queue blocks inside the single `do-it gate queue` process: it polls
the files every 2 s (CONTRACT §4.5), never returns "come back later", and prints at most one line per minute while
nothing changes. A model-driven caller runs it once in the background and awaits the exit notification (pilot rule: ">60 s
jobs run in background, awaited by notification"); `--status` is a snapshot for humans, not a loop. Non-head waiters run
no `sysctl`/`vm_stat` at all.

**D16 Run in its own process group (Q2).** After admission: `spawn(argv[0], argv.slice(1), {detached: true, stdio:
'inherit', env: {...env, DO_IT_GATE_HOLDER: '{seq}-{pid}'}})`; the holder file is rewritten with `pgid = child.pid`. The
argv after `--` is executed as given, without a shell; a caller holding a command string (the `gates.*` settings) passes
`-- /bin/sh -c "{string}"`. A spawn error (ENOENT, EACCES) releases the holder and exits 127 with
`[gate-queue] command failed to start: {code}` (rollback of the admission).

**D17 Descendant tracking and cleanup (G-11).** While the command runs, every poll takes one snapshot
`ps -axo pid=,ppid=,pgid=,lstart=` and adds to a tracked set every process reachable from the root PID through ppid
links, plus every member of the root's pgid, keyed by (pid, start time). Walking only at exit would miss children already
re-parented to PID 1 once their parent died; accumulating snapshots keeps them. On exit of the root, or on a forwarded
signal: SIGTERM to `-pgid` and to every tracked (pid, start) still alive; wait up to a 10 s grace (amendment A2); SIGKILL
any survivor; re-snapshot to confirm; then release. Never `pkill`, never a name or argv match. A survivor of SIGKILL
(uninterruptible) is printed `[gate-queue] cleanup incomplete: pid {pid} still alive` and the slot is still released (the
memory signals keep protecting the machine).

**D18 Signals and exit codes.** SIGINT, SIGTERM and SIGHUP received by the queue while running are forwarded to `-pgid`,
then D17 runs. Exit = the command's exit code; a command killed by signal N exits 128 + N; a queue that received SIGINT or
SIGTERM exits 130 or 143 after cleanup (outcome `GATE_INTERRUPTED`, §4.4). While WAITING, the same signals remove the
ticket and exit 130 or 143; the command never ran (rollback). REJECTED exits 1 (amendment A4).

**D19 Nested admission.** A `do-it gate queue` call whose env carries `DO_IT_GATE_HOLDER={seq}-{pid}` naming a live holder
(D3) that is an ancestor of the current process (ppid walk) runs its command directly, with no second ticket, and prints
`[gate-queue] nested under holder seq={s}: no second admission`. A forged or stale value (not live, or not an ancestor) is
ignored and normal admission applies. The nested line also carries the CONTRACT §11 A8 token `admission: inherited`:
`[gate-queue] nested under holder seq={s}: no second admission · admission: inherited`. Without this, a consumer's slot script called inside a queued pre-push would wait
for its own parent's budget (today the pilot's heavy-job and slot scripts nest the same way, research/02 §2.3 line 79).

**D20 One entry point and `--status`.** Q2 exports `gateQueueRun(ctx, {argv, peakMb, label, timeoutS})` (returns the exit
code), `gateQueueCmd(ctx, args)` (CLI), and for `gate run`'s in-process admission (CONTRACT §11 A8)
`gateQueueHeldBySelf(ctx)` (returns the live ancestor holder named by `DO_IT_GATE_HOLDER`, or null) and
`gateQueueAdmit(ctx, {peakMb, label, timeoutS})` (blocks until ADMITTED, then returns `{seq, release()}`; ends in
WAIT_TIMEOUT or REJECTED exactly like the CLI). Q1 exports `gateProcStart(pid)` from `gate-signals.mjs`; the store
lane imports it (CONTRACT §11 A8). The train and nightly stages (S2) call `gateQueueRun`; pre-push hooks (consumer adoption moved to the pilot consumer's own program, do-it 1.1 R3)
call the CLI; manual runs call the CLI. A static lint in `core/spine/test/g3/` fails if any `core/spine/src` module other
than `gate-queue.mjs` spawns a detached child or a `gates.*` command. `--status [--json]` is read-only: it lists the
budget, live signals (single read, no 5 s window), holders (seq, pid, peak, label, cwd, repo, admitted_at, age) and the
FIFO with each ticket's last stored reason, and marks dead entries `dead (reclaim pending)` without touching files.
Exit 0.

### 4.1 M3 mapping (CONTRACT §8)

| M3 transition | Trigger | Observable |
|---|---|---|
| WAITING | ticket written | `tickets/{seq}-{pid}.json`, `enqueued` line |
| WAITING → ADMITTED | D11 all true | file renamed into `holders/`, `admitted` line |
| ADMITTED → RELEASED | D17 cleanup done | holder file removed, `released` line |
| WAITING → WAIT_TIMEOUT | D13 | `[WAIT-TIMEOUT]` line, exit 3, no ticket, command never started |
| WAIT_TIMEOUT → WAITING | caller retry | new seq |
| WAITING → REJECTED | peak above budget | `[REJECTED]` line, exit 1, no ticket |
| ADMITTED → RECLAIMED | holder not live (D3) at any check | `reclaimed` line by the checker |
| RECLAIMED → RELEASED | reclaimer removes the file | holder file absent; orphans are reported, not killed |

### 4.2 What is kept from a consumer's heavy-job script and slot script (research/02 §2.3)

| Today | Verdict | In the queue |
|---|---|---|
| heavy-job mkdir lock + owner PID (`:38,46`) | kept, hardened | `.lock/` + `owner.json`; liveness adds start time (D2, D3) |
| heavy-job dead-owner reclaim with `kill -0` (`:43`) | kept, hardened | PID reuse also reclaimed (G-12) |
| heavy-job swap guard `used/total > 75 %` (`:18,29-31`) | replaced | pressure level, swap-out rate, `avail_est`; optional absolute `swap_used_max_mb` (macOS swap total grows) |
| heavy-job busy() by argv regex and `lsof` cwd (`:21-28`) | dropped | name matching is banned (G-11); declared holders only |
| heavy-job conductor HOLD file (`:17,36`) | dropped | a conductor wanting the machine declares an exclusive peak (D10); owner question Q-1 below |
| heavy-job "second gate in the same worktree" refusal (`:32-34`) | dropped | not an admission concern; the results store handles concurrent rows (L1) |
| heavy-job `NODE_OPTIONS` export, absolute paths (`:16,50`) | dropped | the project's command owns its flags; root from HOME |
| heavy-job wait forever, 30 s poll (`:35-45`) | replaced | 2 s poll, timeout ⇒ WAIT_TIMEOUT |
| slot-script kernel-released flock (`:43-50`) | replaced | same "dead holder frees the slot" property via D3, no Homebrew `flock` |
| slot-script slot count (`:33`) | replaced | memory budget (D9, D11) |
| slot-script timeout then proceed without a slot (`:64-67`) | removed | ruling D4: never run without admission |
| slot-script "announce once" busy message (`:60-63`) | kept, extended | status line on change or per minute (D12) |
| slot-script env knobs (`:32-35`) | removed (consumer's own program, do-it 1.1 R3) | global `gates.queue` settings, no env var (R21) |
| slot-script lock dir outside every repo (under `/tmp`) | kept | `~/.do-it/queue/` is outside every repo |

## 5. Epics

| Epic | Title | Wave | Branch | Depends on | Cases | Real |
|---|---|---|---|---|---|---|
| Q1 | Memory-budget admission, FIFO and live-owner lock | W1 | `epic/Q1-admission` | none | 17 | 2 |
| Q2 | Child cleanup and the single entry point | W2 | `epic/Q2-cleanup` | Q1; V1's `cli.mjs` subcommand table and `--` handling (CONTRACT §5) | 15 | 2 |

## 6. Acceptance criteria

1. With pressure warn, a gate waits, prints why, and its command does not start (README T-08, T-Q1-02).
2. A wait past the timeout ends in WAIT_TIMEOUT, exit 3, command never started (G-10, README T-12, T-Q1-03).
3. A dead holder and a PID-reused holder are both reclaimed at the next check (G-12, README T-13, T-Q1-04).
4. A big gate admitted, a small gate that fits admitted, one that does not fit waits (README T-14, T-Q1-05).
5. A peak above the budget ends in REJECTED (T-Q1-06); unreadable signals give budget-only admission with CONTRACT §6's
   line (T-Q1-08).
6. After pass, fail and SIGTERM no descendant of the gate is alive, and an identically named decoy survives (G-11,
   README T-15, T-Q2-01).
7. A jest-style hang-after-green leftover is ended (T-Q2-03, T-Q2-15 on real jest 29.7).
8. Pre-push, train, nightly and manual runs go through `gate queue` (T-Q2-10, T-Q2-11).
9. Both modules build into the bundle with `node:` imports only and unique names (G-15, T-Q1-17), and
   `node scripts/sync-mirror.mjs --check` exits 0 (CONTRACT §7).

## Risks

| Risk | Effect | Mitigation (case) |
|---|---|---|
| `avail_est` too low on a cache-heavy Mac, the pilot's large suite (3,000 MB) waits for hours | pushes time out | estimator excludes reclaimable cache (research/03 F30); `--status` shows the number; budget-only fallback is not silent; [REAL] read (T-Q1-15) |
| declared peaks are guesses | over- or under-admission | memory signals stay a second check; peak is data in `gates.peak_mb`, revised from measurements (pilot's adoption) |
| head-of-line blocking: a big head stalls small gates | small pushes wait | strict FIFO is the ruling (README §6.1 item 2); a big gate cannot starve; visible reason (T-Q1-07) |
| timeout turns a slow push into a failed push (ruling) | unattended run sees a non-code failure | exit 3 + `[WAIT-TIMEOUT]` retryable, distinct from exit 1; conductor parks (S2) |
| queue process SIGKILLed: no cleanup | orphans keep memory | holder reclaimed (G-12); reclaimer reports orphan group, never kills what it cannot prove it owns; signals protect (T-Q2-13) |
| a descendant that calls `setsid` and whose parent exits within one 2 s poll escapes tracking | a leak survives | pgid plus accumulated ppid snapshots cover the common cases (jest workers fork in-group); limit stated, [REAL] jest leak (T-Q2-15) |
| a root command that never exits (jest parent hung on an open handle, in band) | queue waits on it | the caller's timeout signals the queue, which forwards and cleans (T-Q2-03); ending the runner after its `run_end` row belongs to `gate run` (proposed note A7) |
| child in a background process group reads the terminal | SIGTTIN stops it | stdin from git hooks is a pipe; documented; manual watch modes are out of scope |
| PID start time unreadable (`ps` missing, `/proc` hidden) | reuse undetectable | treated alive with a warning; timeout bounds the wait |
| parallel W1 lanes (L1 store lock) declare the same top-level helper names | bundle fails (`build.mjs:44-47`) | every top-level name here starts with `gateQueue`, `gateSignals` or `gateProc` (T-Q1-17); L1 may import `gateProc*` after Q1 merges |
| `parseArgs` has no `--` separator today (`core/spine/src/cli.mjs:32-55`: `--` becomes flag `''` and eats the next word) | `gate queue -- npx jest --ci` misparses | V1 lane must add `--` handling (proposed amendment A5); Q1 tests use a driver that splits argv itself |

## 7. Repo and branch plan

Repo DevOtts/do-it, branches from `main`. Lane paths (CONTRACT §5, queue lane only): `core/spine/src/gate-queue.mjs`,
`core/spine/src/gate-signals.mjs`, `core/spine/test/g3/**`. Branches `epic/Q1-admission` (W1), `epic/Q2-cleanup` (W2,
from `main` after Q1 merges). `cli.mjs` is not edited here: V1 wires `case 'queue'` to `gateQueueCmd` (CONTRACT §5). Until
then the tests call the exported functions through `core/spine/test/g3/driver.mjs` (in lane). After each change:
`node core/spine/build.mjs` then `node scripts/sync-mirror.mjs --write`. Builders start at T1 (RUN-POLICY). Heavy gates on
this machine stay one at a time until Q1 ships (RUN-POLICY); the g3 tests themselves are light (node child processes,
fixtures).

## 8. CONTRACT amendments

Accepted 2026-11-06 into CONTRACT v1.1-draft §11: A1–A4, A6, A7 as §11 A8 (queue), the REJECTED/127 exits as §11 A7;
A5 goes to the verdict lane (§11 A7 `--` separator); owner question Q-1's default is recorded as R24. Original wording:

- A1 §2.5/§3: a gate with no declared peak (`--peak-mb` absent and `gates.peak_mb` null) is exclusive (reserves the whole
  budget) and prints `peak undeclared: exclusive`.
- A2 §4.5 constants: swap-out "about zero" = at most 1 MB/s over the 5 s window; cleanup grace 10 s; status line reprinted
  at most once per 60 s when unchanged.
- A3 §2.5: tickets also carry `reason` (last waiting reason) and `checked_at`, so `--status` can show reasons without
  re-reading signals; seq is zero-padded to 10 digits in file names; a `corrupt/` directory holds quarantined
  entries that fail JSON parse.
- A4 §3/§4.3/§4.4: REJECTED exits 1 with token `[REJECTED] gate-queue: peak {m} MB above budget {b} MB · not started` and
  outcome `GATE_QUEUE_REJECTED`; invalid `queue.*` values give `QUEUE_SETTINGS_INVALID`, exit 1; spawn failure exits 127.
- A5 §3 (verdict lane): `parseArgs` must treat `--` as the end of flags and keep the rest as the command argv; `status`
  joins `BOOL_FLAGS` next to `resume` and `clean`.
- A6 §2.4: until S1 merges, Q1 reads `gates.queue` directly from the global settings file; S1 must keep that behaviour.
- A7 cross-lane (V1, A1): to honour G-10 end to end, `gate run` should refuse or self-admit when no live ancestor holder
  exists (`DO_IT_GATE_HOLDER`, D19), and should end its runner a grace period after the adapter's `run_end` row so an
  in-band jest that hangs after green does not hold the slot. `DO_IT_GATE_HOLDER` is a new do-it-internal name (R19 class),
  never a consumer env var.

## 9. Owner questions (none blocking; defaults applied)

- Q-1 Drop the heavy-job script's conductor HOLD file in favour of an exclusive peak? Default: yes (D10).
- Q-2 No force or bypass flag in v1 (research/02 5.2 suggested a CLI `FORCE`)? Default: none; ruling D4 says never run
  without a slot.

---
_Authored for DevOtts (https://github.com/DevOtts)._
