# CP-01 review: after W0, contract cases of the finished waves, on the merged tree

checkpoint: CP-01
round: 2 (re-run after the CP-01 fix commits)
verdict: PASS

Reviewer: an independent opus reviewer. It built none of the fixes. Date: 2026-11-07. Only this file was written. Every probe and mutation ran in temp copies under the session scratchpad, and every original was restored.

Trees reviewed (all clean, except where noted):
- do-it int/1.1 @ 71ea8a2. That is origin/main plus B1, H1, S1 and E1, plus 01ff2b0 (defect 1), 6f1646f (defect 3), 48c6f37 (defect 5), 9a6ae78 (defect 9) and K2-companions (a9566ab).
  - The bundle rebuilt from `core/spine/src` is byte-identical to `core/spine/do-it.mjs`, which is byte-identical to `plugins/do-it/scripts/do-it.mjs`.
  - `node scripts/sync-mirror.mjs --check` gives `mirror ok`.
  - The only untracked entry is `.do-it/host-claude-code/stop-refusals.json`, which holds `{"<this reviewer's session id>":0}`. It was written by the installed Stop hook of the reviewer's own session, not by a test.
- doc-it K1 @ 426a858.
- build-it A1 @ aaa6973.
- conclude-it A1 @ a1a8e73.
- reconcile-it H1 @ d8350f8.
- plan-it H1-skill-paths @ 617defc.
- init-it, freshly cloned at tag v0.1.0 (bfd4f00).

Env: the brief's `DO_IT_PILOT_DOIT`, `DOC_IT_PILOT_HOME`, `DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256`, `DOIT_STATUS_WRITE` and `DOC_IT_CLI`. `CLAUDE_CODE_SESSION_ID` was set for the session-id test. The pilot was read only and never written. The pilot-dependent N3 cases were not run against it, because they write into fixture paths.

Out of scope (release-time): T-K1-08, the network half of T-I1-02, and T-H1-03.

## Round-1 defects

| # | sev | status | evidence (re-run by this reviewer) |
|---|---|---|---|
| 1 | HIGH | **FIXED** | (details below the table) |
| 2 | MED | **FIXED** (judged genuine) | (details below the table) |
| 3 | MED | **FIXED** apart from the X21 exemption, which blocks the tag only | (details below the table) |
| 4 | LOW | **FIXED** | doc-it @426a858 with the brief's hash: `ok 1 - T-K1-02 [REAL] … 3 done_unclosed, nothing written`. With `DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256=0000` it gives `not ok 1`, `# fail 1`. With the var unset: `# note: … identity NOT checked`, so nothing passes silently. |
| 5 | LOW | **FIXED in do-it; OPEN (LOW) in plan-it and init-it** | do-it: without a writer, `b1-stale.test.mjs` gives `# T-B1-02 IMPLEMENTED-NOT-VERIFIED: set BUILD_IT_STATUS_WRITE or DOIT_STATUS_WRITE …`, `# skipped 2`. With a writer: `# pass 2`. Still hardcoded: plan-it `tests/status-json/check-commands.test.mjs:17-18`, `plan-to-status.test.mjs:18-19` and `id-renames.test.mjs:16` (each env-first, with `/Users/…` fallbacks), and init-it ADV-01c (skips: `ledger-card not found at /Users/…`). None of these turns red falsely, so this is not blocking. |
| 6 | LOW | **RECORDED (X16)** | `status-write view --json` on the board gives `stale false percent 100`. `b1-stale` gives `# pass 2`. |
| 7 | LOW | **RECORDED (X20)** | Every directory-argument check in this round was run as a quoted glob. |
| 8 | LOW | **RECORDED (X17)** | `s1.test.mjs` gives `ok 14 - T-E1-01 … zero hits`, `# pass 17`. |
| 9 | LOW | **FIXED** | (details below the table) |
| 10 | LOW | **FIXED** (one residual, N4) | doc-it `ok 6..8` (`archive_since`, `--summary`). conclude-it `ok 30 - T-A1-05 … 200 legacy packages … within ~15 lines`, `ok 31` (fallback). Mutation (`archive_since` filter removed) turns `not ok 6` red. Mutation (no `--summary`, no line cap) turns `not ok 27` red. |
| 11 | LOW | **FIXED** (residual N5) | `ok 16 - T-K1-03 carried link must be an existing relative path or an http(s) URL; n/a, TBD/x, # are refused`. Mutation (`validLink` returns true) turns `not ok 16` red. Probe: `n/a` gives rc=1, but `.`, `..`, any existing directory, and `https://x` give rc=0. |
| 12 | LOW | **RECORDED (X20)** | (details below the table) |

### Defect 1 (HIGH): FIXED

**Original probe, reproduced.** A cache-shaped copy (`…/cache/devotts/do-it/1.1.0/` = `cp -R plugins/do-it`, no `hosts/` beside it), run with `env -i` and a temp HOME:

| settings | result |
|---|---|
| `{"state":{"backend":"engine","engine":{"blobs":"bogus"}}}` | `{"outcome":"SETTINGS_INVALID","exit":1,"errors":[{… "pointer":"/state/engine/blobs","message":"must be one of \"rows\", \"r2\", \"fs-mirror\""}]` |
| `blobs: "r2"` | `DOCTOR_OK` |
| `{"backend":"foo","foo":{…}}` | `SETTINGS_INVALID … "no host \"foo\" is installed to validate state.foo"` |
| `{"backend":"local","foo":{…}}` | `SETTINGS_INVALID` |
| `{"state":{"engine":{"blobs":"r2"}}}` | `DOCTOR_OK` |
| user-level `backend: engine` + workspace `backend: local` | `DOCTOR_OK` |

**The engine backend still loads from the install.** The probe imported `<cache>/core/state-stores/index.mjs` and got:
- `hostBackend(engine): true …/1.1.0/hosts/engine`.
- `openStore({backend:'engine', transport: MemoryEngine})` gives `EngineStore engine`, and a put/get round-trip returns the bytes.
- `openStore({backend:'nohost'})` gives `DRIVER_UNKNOWN … host "nohost" is not installed`.

**Contract tests.**
- `tests/hosts/installed-settings.test.mjs`: `ok 1..4`, `# pass 4`.
- `settings-host.test.mjs`: `# pass 6`. Case 6 now asserts refusal.
- `isolation.test.mjs`: `# pass 4`.

**Mutation probe.** Dropping the `../hosts` candidate from the shipped bundle turns `not ok 2` and `not ok 3` red in installed-settings.

**Weakness.** See N1 and N2.

### Defect 2 (MED): FIXED, judged genuine

Read: `plan/reviews/evidence/T-S1-09/{run.exp,sid1,sid2,start.out,resume.out}`, the evidence.md row from 12:09Z, the s109 scratch run's `state.json` and `events.jsonl`, and the coordinator's tool results.

**Why the evidence is genuine:**
- One `spawn claude --plugin-dir … --model haiku` process ran interactively. `/clear` was sent between two Bash-tool prompts.
- The host gave two distinct ids, read inside the agent's Bash: `5b23dcf6-…` and then `ff928098-…`. Within one process, the id only changes through `/clear`.
- `start.out` shows `STARTED r-20261107-120714-944c`.
- `resume.out` shows `"outcome":"REBOUND"` and `owner.session_id = ff928098-…`, with `history:[{session_id:5b23dcf6-…, reason:"resume"}]`. `events.jsonl` has `run_started` at 12:07:14 and `owner_rebound {from:5b23dcf6…, to:ff928098…}` at 12:08:09, a gap that matches the script's sleeps.
- No flag or export was passed.

**The frozen plugin copy predates the fix commits, but the binding code is the same.**
- Its `hooks/` folder is identical to HEAD's.
- The REBOUND, `owner_rebound` and `DO_IT_SESSION_ENV` lines of the bundle hash the same as at HEAD.

**Weaknesses:**
- `tui.log` kept only the spawn line, and the two transcripts are gone from `~/.claude/projects`, so there is no screen record of `/clear` itself. The id change is the proof.
- My own attempt to repeat the live run with the same `run.exp` against HEAD's plugin hung at the TUI. The cause was the test harness, not the product: nothing was produced, and I killed it. So the live evidence is the coordinator's run alone.

**Test re-run.** `session-id.test.mjs` gives `ok 1 - T-S1-09 [REAL] …`, and `stopgate-owner` gives `ok 12 - T-S1-12 resume re-binds …`.

### Defect 3 (MED): FIXED apart from the X21 exemption, which blocks the tag only

**Scans.**
- `neutral-names.test.mjs`: `# pass 2`.
- My own `git grep -i` for the pilot repo's names, its programs and its workspace path (the list in tests/catalog/neutral-names.test.mjs), excluding `docs/implementation/*/audit/**`, finds exactly 2 files: `delivery/CONTRACT.md:37,39` and `delivery/CONTRACT.html:282,284`. That is the X21 exemption.
- Broader spelling variants of those names find nothing else. The only other `/Users/macbook` hits are owner-home paths, which X18 does not cover.

**Mutation probes.** Each planted name turns `not ok 1` red: in README, in a new tracked `.json`, a pilot workspace path in KICKOFF.md, and a lowercase variant. Weakness: the exemption covers whole files (N3).

**plan-it mirror check.**
- Command: `gate-check.mjs handoff …/int/docs/implementation/do-it-1.1/delivery` gives rc=1.
- The output differs from origin/main's package only in sha prefixes. Both have 66 identical `STATUS.md … "not-started" outside the 4-term vocabulary` lines (X8, pre-existing), every count `declared == counted`, and `57 distinct test-case IDs`.
- All 7 html twins are `MIRROR_FRESH`.
- The 1.1 CONTRACT.md sha256 is still `5ba3c156…3abf`.
- No new failure.

### Defect 9 (LOW): FIXED

- `stopgate-owner`: `ok 10 - T-S1-08 an unreadable run owned by someone else is logged once, not on every stop`, `# pass 12`.
- Mutation (src `lastEventIs` guard removed) turns `not ok 10` red.
- The same mutation applied only to the bundle stays green. No test compares the bundle to src (N2). A rebuild today is byte-identical.

### Defect 12 (LOW): RECORDED (X20)

- `check-pins --marketplace` gives `no drift`, rc=0.
- Live `check-pins --tags` now gives rc=1: `tags: doc-it 0.1.0: cannot read tags of DevOtts/doc-it (… repository … not found)`. That is the same root cause as T-R1-14 (doc-it is not published). It arrived with K2, and it clears at doc-it publish (N6).

## W0 cases (re-run on the trees above)

| case | verdict | command | quoted output |
|---|---|---|---|
| T-S1-01..05, 07, 08, 10, 12 | PASS | `node --test core/spine/test/s2/stopgate-owner.test.mjs` | `ok 1 - T-S1-01 …` … `ok 12 - T-S1-12 …` `# pass 12 # fail 0` |
| T-S1-06 [REAL] | PASS | `DO_IT_PILOT_DOIT=<pilot>/.do-it node --test …/stopgate-replay.test.mjs` | `ok 1 - T-S1-06 [REAL] a fresh session and the owning session both stop freely on a copy of the pilot board` |
| T-S1-09 [REAL] | PASS | session-id.test.mjs + live evidence (defect 2) | `ok 1 - T-S1-09 [REAL] start records CLAUDE_CODE_SESSION_ID …; resume after /clear re-binds`; live REBOUND as quoted above |
| T-S1-11 | PASS | pack-withdraw.test.mjs | `ok 1..4`, `# pass 4` |
| T-E1-01 | PASS | s1.test.mjs | `ok 14 - T-E1-01 G-12 with the engine word: core/ and scripts/ have zero hits …` `# pass 17` |
| T-E1-02 | PASS | tests/hosts/isolation.test.mjs | `ok 2 - … DRIVER_UNKNOWN naming the missing host`, `ok 3 - every core suite still passes without the engine host` `# pass 4` |
| T-E1-03 | PASS | `node --test 'hosts/engine/state-store/tests/*.test.mjs'` | `ok 4 - T-E1-03 conformance … same pass count as at d38cedb` `# pass 15` |
| T-E1-04 | PASS | settings-host + installed-settings + cache probe | `# pass 6`; `# pass 4`; probe `SETTINGS_INVALID … /state/engine/blobs` |
| T-E1-05 | PASS | `node --test 'tests/readme/*.test.mjs'` | `ok 1..8 - T-E1-05 …` (the suite's only red is T-R1-14, out of W0) |
| T-H1-01 | PASS | reconcile-it H1 `node --test 'tests/**/*.test.mjs'`; `git ls-files scripts/reconcile-it.mjs` | `ok 14 - T-H1-01 duplicate … removed` `# pass 15`; count 0 |
| T-H1-02 | PASS | `node --test 'tests/catalog/*.test.mjs'` | `ok 17 - T-H1-02 pin with no remote tag v<version> exits 1 …` `# pass 23` |
| T-H1-04 | PASS | plan-it H1 `tests/plugin/skill-paths.test.mjs` | `ok 1..4`, `# pass 4`; run-contract `58/58 mechanism-ready cases correct` |
| T-B1-01 | PASS | `status-write validate` / `view` (build-it aaa6973) | `valid` rc=0; `harness-status-tracking: 100% [closed]` `verified 8 (claims) … total 8`, `claimed by review-it … verdict …/b1-review-it/ST-0N-review-it.md` |
| T-B1-02 | PASS (X16) | `view --json` + b1-stale.test.mjs | `stale false percent 100`; `ok 1 - … 25 h … stale`, `ok 2 - control` |
| T-K1-01, 03..07 | PASS | doc-it K1 `npm test` (pilot env) | `# tests 26 # pass 26 # fail 0 # skipped 0` |
| T-K1-02 [REAL] | PASS | same | `# done_unclosed=3 done_without_closeout=200 …`, `ok 1 - T-K1-02 [REAL] …`; identity checked by hash |
| T-A1-03..05, 07 | PASS | conclude-it A1 `npm test` (real writer + doc-it) | `ok 19..31` `# tests 31 # pass 31 # fail 0`; without doc-it `# pass 25 # skipped 6 # fail 0` |
| T-A1-06 | PASS | build-it A1 `node --test 'tests/**/*.test.mjs'` | `ok 99 - T-A1-06 kill after freeze, before move: PARTIAL_FAILED …` `# tests 211 # pass 210 # fail 0 # skipped 1` |
| T-I1-01 [REAL] | PASS | fresh clone v0.1.0, `node --test 'test/*.test.mjs'` | `# tests 41 # pass 40 # fail 0 # skipped 1` (ADV-01c, defect 5) |
| T-I1-02 offline half | not re-graded (K2, W3 scope per X4) | `check-pins --marketplace` | `no drift` |

## Whole suites

**do-it int @71ea8a2.** `run-suites.sh` with the pilot and writer env set gives:
- spine 134/134, routing 24/24, pipelines 11/11, review-loop 23/23, personas 7/7, state-stores 13/13, _interface 18/18, codex 17/17, opencode 18/18.
- engine: 36 tests, 29 pass, 0 fail, 7 skip.
- engine/state-store 15/15, plugin 17/17, catalog 23/23, hosts 8/8, status 2/2, r4 25 pass + 1 skip.
- readme: 32 tests, 31 pass, **1 fail**.

**Compared with `results/int-w0.txt`, nothing is newly red except T-R1-14.**
- T-R1-14 fails only on `https://github.com/DevOtts/doc-it 404`. That is the single URL in the assertion's actual array, and it is the expected cause.
- engine went from 30 pass / 5 fail / 1 skip to 29 pass / 0 fail / 7 skip. T-N3-01/02/03/11/12/13 now skip without `DO_IT_PILOT_REPO` (X22). T-N3-12 used to pass and now skips (N7).
- The new tests are spine +1 (defect 9), catalog +4 (neutral-names, i1-02), hosts +4 (installed-settings) and readme +2 (k2).

The other trees:

| tree | result |
|---|---|
| doc-it K1 | 26/26 |
| build-it A1 | 210 pass, 1 skip, 0 fail |
| conclude-it A1 | 31/31 |
| reconcile-it H1 | 15/15 |
| plan-it H1 | run-contract 58/58; plugin + review-checkpoints + status-json 83/83 with the writer set |
| init-it v0.1.0 | 40 pass, 1 skip |

## New findings in this round (all LOW, none blocks W0)

- **N1: one 1.0.5 settings shape is now refused.**
  - The shape is a single settings file with `{"state":{"backend":"local","engine":{"blobs":"r2"}}}`. Installed 1.0.5 gives `DOCTOR_OK`. 1.1 gives `SETTINGS_INVALID … is keyed "engine" but state.backend is "local"`.
  - It comes from E1 (f302f0f), not from the fix. It follows E1-02's "one object keyed by the backend name". It conflicts with "existing state.engine.blobs files stay valid" only for this dormant-block shape.
  - Owner decides: accept and add a release note, or downgrade it to a warning.
- **N2: nothing guards the shipped copies against drift.**
  - Nothing fails when `hosts/*/state-store/settings.schema.json` drifts from its `plugins/do-it/hosts/` copy. `sync-mirror --check` reports `DIFF`, but T-R2-08's real-tree assertion accepts a DIFF status.
  - Likewise, no test compares the bundle to `core/spine/src` (`build.mjs` has no `--check`; argv[2] is the output path).
  - Both are clean today. Make `sync-mirror --check` exit 0 an assertion in a test or in the release gate, and add a bundle-equals-rebuild check.
- **N3: the neutral-names exemption covers whole files.** A third pilot mention planted in the frozen `delivery/CONTRACT.md` passes. Pin the exemption to the two known lines, or to the file's frozen sha.
- **N4: `archive_since` also hides real findings.** It drops `done_unclosed` packages (boards with `closed:false`) that are older than the cutoff, so a real finding can be hidden by the date. Keep `done_unclosed` out of the legacy filter, or report it with a "(legacy)" mark.
- **N5: the CLOSEOUT carried-link rule still accepts junk links.** It accepts `.`, `..`, any existing directory, and `https://x`. Require a file, or a URL with a dot in the host.
- **N6: live `check-pins --tags` is red on doc-it 0.1.0.** The repo is not found. It is the same release-time cause as T-R1-14 and must be green at the tag (X20).
- **N7: one previously passing case now only skips.**
  - T-N3-12 passed in int-w0 and now skips without `DO_IT_PILOT_REPO` (X22).
  - `hosts/engine/conformance/pilot-baseline.json` still lists pilot-internal paths. Those paths are outside the X18 name list, but they should be reviewed before the tag.

## What must be fixed

- **For W0 promotion:** nothing. Every in-scope W0 case passes on real evidence, and no HIGH or MEDIUM defect is open.
- **Before the 1.1.0 tag:**
  - Publish DevOtts/doc-it, so that T-R1-14 and `check-pins --tags` go green.
  - Resolve the X21 exemption: either redact the frozen v1 contract by a dated amendment, or pin the exemption (N3).
  - Decide N1.
  - Add the mirror and bundle drift guards (N2).
- **Follow-ups:** defect 5 in plan-it and init-it, plus N4, N5 and N7.


## Round 1 (2026-11-07, FAIL)


Round 1 checkpoint: CP-01 (first run)
Round 1 verdict was FAIL.

Reviewer: an independent opus reviewer, fresh to this build. Date: 2026-11-06/07. Only this file was written. Every probe ran in temp copies under the session scratchpad.
Trees reviewed:
- do-it int/1.1 @ f302f0f (origin/main 49a3002 + H1, B1, S1, E1). Bundle rebuilt from source is byte-identical to `core/spine/do-it.mjs`. The mirror check passes.
- doc-it K1 @ 7b18038.
- build-it A1 @ aaa6973, plus build-it origin/main bea0e4a for the B1 writer.
- conclude-it edb8f07. HEAD has moved to 69cc4ff, so I reviewed edb8f07 from `git archive`.
- reconcile-it H1 @ d8350f8.
- plan-it H1-skill-paths @ 617defc.
- init-it, freshly cloned at tag v0.1.0 (bfd4f00). The repo is PUBLIC and release v0.1.0 is not a draft.

Env used:
- `DO_IT_PILOT_DOIT`, `DOC_IT_PILOT_HOME`, `DOIT_STATUS_WRITE` and `DOC_IT_CLI`, as given in the brief.
- `CLAUDE_CODE_SESSION_ID` was set to this session's id.
- The pilot was read only and never written.

Release-time cases were skipped as instructed: T-K1-08, the network half of T-I1-02, and T-H1-03.

## Cases

| case | verdict | command | quoted output | weakness found |
|---|---|---|---|---|
| T-S1-01 | PASS | `node --test core/spine/test/s2/stopgate-owner.test.mjs` (int) | `ok 1 - T-S1-01 a session that does not own the run is allowed, owned:false; the owner is refused` … `# pass 11 # fail 0` | none. Probe M1 (null-session runs treated as owned) turns T-S1-02 red. |
| T-S1-02 | PASS | same | `ok 2 - T-S1-02 a run with session_id null is not gated for a session; the cwd fallback is only for a host that gives none` | none |
| T-S1-03 | PASS | same | `ok 3 - T-S1-03 a run with no owner object is never gated from a hook; an explicit --run still gates` | none. Probe M3 (gate legacy runs) turns it red. |
| T-S1-04 | PASS | same | `ok 4 - T-S1-04 allow by exclusion: PARKED, NEEDS_HUMAN, AWAIT_RATIFY and the rest never gate; VERIFYING does` | none. Probe M4 (VERIFYING in the non-gating list) turns it red. |
| T-S1-05 | PASS | same | `ok 5 - T-S1-05 two runs, each with open rows: the owner sees and parks only its own run` (+05b, 05c) | none. Probe M2 (rows not scoped by run_id) turns 05 and 05b red. |
| T-S1-06 [REAL] | PASS | `DO_IT_PILOT_DOIT=<pilot>/.do-it node --test core/spine/test/s2/stopgate-replay.test.mjs` | `ok 1 - T-S1-06 [REAL] a fresh session and the owning session both stop freely on a copy of the pilot board # pass 1 # fail 0` | Real pilot copy. The test asserts the 4-run census: 4 PARKED, 2 with a null session, 1 owned, 1 legacy. Without the env var it skips with IMPLEMENTED-NOT-VERIFIED, never a silent pass. |
| T-S1-07 | PASS | stopgate-owner | `ok 8 - T-S1-07 start records the host session and adds no settings key (G-8)` | §2.1 names `CLAUDE_CODE_SESSION_ID`. Core instead reads `DO_IT_SESSION_ENV`, which the host hook sets, to satisfy G-9. That reconciliation is sound. But if the SessionStart hook did not run (plugin enabled mid-session, or no `CLAUDE_ENV_FILE`), `start` records null even though the host has an id. |
| T-S1-08 | PASS | stopgate-owner | `ok 9 - T-S1-08 a corrupt state.json fails open with an event, and status reports the unreadable run` | Minor: when the hook's session owns no run, a `stop_gate_state_unreadable` event is appended to every unreadable run, including runs owned by other sessions, on every foreign stop (see defect 9). |
| T-S1-09 [REAL] | FAIL | `node --test core/spine/test/s2/session-id.test.mjs` (CLAUDE_CODE_SESSION_ID set) | `ok 1 - T-S1-09 [REAL] start records CLAUDE_CODE_SESSION_ID with no flag or export; resume after /clear re-binds # pass 1` | Only half live. The `start` half is backed by a live `claude -p --plugin-dir` run in the evidence ledger. The `/clear` half sets `CLAUDE_CODE_SESSION_ID` to `<id>-after-clear` by hand and re-runs the hook. The host behaviour the case exists to prove is mocked: Claude Code re-running SessionStart on /clear and exposing the new id to Bash. The evidence ledger says so itself: "not by a live /clear". |
| T-S1-10 | PASS | stopgate-owner | `ok 10 - T-S1-10 a non-owner hits the hook 5 times: no park, no pack question, the owner run is byte-identical` | none |
| T-S1-11 | PASS | `node --test core/spine/test/s2/pack-withdraw.test.mjs` | `# pass 4 # fail 0` | none. Probe (withdraw answered questions too) turns 11 and 11b red. |
| T-E1-01 | PASS | `node --test core/spine/test/s1/s1.test.mjs` | `ok 14 - T-E1-01 G-12 with the engine word: core/ and scripts/ have zero hits; a planted word fails naming the file (R3)` `# pass 17` | Zero hits only with an allowlist of 4 `scripts/` files for `claude`. The allowlist is not recorded in decisions X1–X15 (see Governance). The scan also skips `test`/`tests` folders. Probe: a planted host word in a temp copy's `core/state-stores/index.mjs` turns T-S1-13 and T-E1-01 red. |
| T-E1-02 | PASS | `node --test tests/hosts/isolation.test.mjs` | `ok 1..4 - T-E1-02 …` `# pass 4 # fail 0` | It deletes only `hosts/engine`. I also deleted each of claude-code, codex and opencode in a temp copy and ran every core suite: `# tests 229 # pass 228 # fail 0` each time. |
| T-E1-03 | PASS | `node --test 'hosts/engine/state-store/tests/*.test.mjs'`, plus the runner directly at f302f0f and at d38cedb | `# tests 15 # pass 15`; runner `PASS 12/12` at both shas | The contract's `node --test hosts/engine/state-store/tests/` (a directory argument) errors on Node 22, so I used a glob (see defect 7). |
| T-E1-04 | FAIL | `node --test core/spine/test/s2/settings-host.test.mjs`, plus a probe on a cache-shaped install | test: `# pass 6 # fail 0`. Probe: a copy of `plugins/do-it` laid out as `cache/devotts/do-it/1.1.0/` and run on `{"state":{"backend":"engine","engine":{"blobs":"bogus"}}}` gives `{"outcome":"DOCTOR_OK","exit":0…}`. The repo layout gives `SETTINGS_INVALID … "/state/engine/blobs","message":"must be one of \"rows\", \"r2\", \"fs-mirror\""`. Installed 1.0.5 gives `SETTINGS_INVALID`. `{"state":{"backend":"foo","foo":{"anything":true}}}` is also `DOCTOR_OK` on 1.1. | The test passes only in the dev repo layout. The marketplace installs `./plugins/do-it` alone, with no `hosts/` folder. There `settingsHostSchema` returns `{absent:true}` and every `state.<name>` object is accepted unchecked. Test 6 encodes this: "without any hosts folder it is not checked". This is a shipped regression against 1.0.5. It also opens the `state` namespace to any key, which is G-8 in spirit. |
| T-E1-05 | PASS | `node --test 'tests/readme/*.test.mjs'` | `ok 1..8 - T-E1-05 …` `# pass 30 # fail 0` | none. Probe: disabling the declined→Supported check (check-readme.mjs:211) turns T-E1-05 #1 and #3 red. |
| T-H1-01 | PASS | `node --test 'tests/**/*.test.mjs'` + `git ls-files scripts/reconcile-it.mjs` (reconcile-it H1) | `# tests 15 # pass 15 # fail 0`; ls-files count `0` | The literal `node --test ../reconcile-it/tests/` gives `Cannot find module …/tests`, `# fail 1` on Node 22. It is a contract spelling issue, not code. Probe: re-adding the file in a temp git copy turns it red. |
| T-H1-02 | PASS | `node --test 'tests/catalog/*.test.mjs'` (int); live `node scripts/check-pins.mjs --tags` | `ok 17 - T-H1-02 pin with no remote tag v<version> exits 1 naming the sibling and version` `# pass 19`; live: `no drift` rc=0 | `--tags` is opt-in: `--marketplace` does not run it (defect 12). Probe: removing the tag test (`if (false)`) turns case 1 red. |
| T-H1-04 | PASS | `node --test tests/plugin/skill-paths.test.mjs` (plan-it H1) | `ok 1..4 … # pass 4 # fail 0` | It extracts only `node ${CLAUDE_PLUGIN_ROOT}/…` forms. I grepped SKILL.md and found no other `node` command form, so the coverage is complete today. |
| T-B1-01 | PASS | `node <build-it origin/main bea0e4a>/status-write.mjs validate --file docs/implementation/harness-status-tracking/status.json` + `view` (int) | `valid` rc=0; `harness-status-tracking: 100% [closed]` / `verified 8 (claims) … total 8`; each task's evidence is `evidence/b1-review-it/ST-0N-review-it.md`, `by: review-it` | The writer was re-checked at build-it origin/main as the evidence ledger asked: the same result. The 8 verdicts check REAL-VERIFY rows against committed run-output files. They do not re-run the harness, and B1.md says so. The reviewer session (44a2d822) differs from REAL-VERIFY's, as the contract requires. It is the coordinator team's session, not a separate review-it run. Probe: hand-editing one task to `done` makes `validate` fail with `has no matching history entry`. |
| T-B1-02 | PASS | contract command `status-write recheck --file …` (build-it bea0e4a), then `view --json` and `BUILD_IT_STATUS_WRITE=<bea0e4a> node --test tests/status/b1-stale.test.mjs` | recheck: `refused: … plan.json is not committed at HEAD`; view: `stale false percent 100`; test: `ok 1 … 25 h … stale`, `ok 2 … control` `# pass 2`; REAL-VERIFY.md:14 `PARKED \| 1 (T-B-20, stale half)` | Uses a substitution that is not recorded in decisions. B1.md says "`status-write recheck` does not exist". That is wrong at build-it origin/main: it exists and refuses because this package has no committed plan.json. The test hardcodes `/Users/macbook/Workspace/Devotts/build-it/...` as its default writer (defect 5). Probe: a 48 h threshold in a temp writer copy turns the 25 h case red. |
| T-K1-01 | PASS | `DOC_IT_PILOT_HOME=<pilot> node --test 'test/*.test.mjs'` (doc-it K1) | `ok 2 - T-K1-01 check archive lists done_unclosed and done_without_closeout, omits the clean one` … `# tests 22 # pass 22 # fail 0 # skipped 0` | none. Probe: line 198 `closed !== true` replaced by `closed === "never"` turns T-K1-01 and T-K1-02 red. |
| T-K1-02 [REAL] | PASS | same | `# done_unclosed=3 done_without_closeout=200 stale_active=0 unowned=0` / `ok 1 - T-K1-02 [REAL] …: 3 done_unclosed, nothing written` | It asserts the count, not the identity. I listed the 3 by hand on a scratch copy and they are the 3 programs of claim C13 (names withheld here per R3). Product issue: 200 legacy `done_without_closeout` entries (see defect 10). |
| T-K1-03 | PASS | same | `ok 10 - T-K1-03 carried row without a backlog link fails naming the row; complete one passes` | The backlog-link rule `/[\/#]\|\.md\|https?:/` accepts any text with a slash, such as `n/a` (defect 11). Probe: disabling the push at line 266 turns it red. |
| T-K1-04 | PASS | same | `ok 13 - T-K1-04 no config: check archive exits 2 "run doc-it init"; unmapped notes/ is reported unowned` (+14, 15) | none |
| T-K1-05 | PASS | same | `ok 6 - T-K1-05 local main 3 behind remote: exit 1 naming both shas; then up to date: exit 0` | It fetches, so it writes remote-tracking refs. That is acceptable. |
| T-K1-06 | PASS | same | `ok 7 - T-K1-06 verified 61 days old is listed, 10 days old is not; zero files changed` (+8) | none |
| T-K1-07 | PASS | same | `ok 16..19 - T-K1-07 …` | It uses a hardcoded banned-name list. `git grep` found zero pilot names in doc-it (only `engines` in package.json). |
| T-A1-03 | PASS | `node --test tests/ship-pipeline/s4.test.mjs …` (conclude-it edb8f07, real status-write aaa6973, real doc-it K1) | `ok 3 - T-A1-03 S4 on a package with unverified tasks and no owner note: REJECTED, not moved, names the tasks` … `# tests 11 # pass 11` | Probe: removing ledger-card's pre-check (line 363) keeps s4 green. build-it's own close guard refuses with the same message, so the mutant is equivalent. The pre-check's no-write purpose is covered by ledger-card.test.mjs CLOSE-02 (16/16). |
| T-A1-04 | PASS | same | `ok 5 - T-A1-04 … DENIED first, then CLOSEOUT (one row per piece) written and moved` `ok 6 … carried without a backlog path is refused` `ok 7 … without doc-it … [skip] line` | none. Probe: removing DENIED turns it red. |
| T-A1-05 | PASS | `node --test tests/ship-pipeline/step0-audit.test.mjs` | `ok 9 … zero files changed (git status clean)` `ok 10 … prints [skip] doc-it not installed and exits 0` | Probe: Step 0 reporting "clean" without doc-it turns 10 red. |
| T-A1-06 | PASS | `node --test tests/status/close-partial-failure.test.mjs` (build-it aaa6973) | `ok 1 - T-A1-06 kill after freeze, before move: PARTIAL_FAILED; re-run completes the move; one close entry; never half-moved` `# pass 3` | A real SIGKILL at a test hook (`STATUS_WRITE_TEST_CRASH`): the child's exit is `null`. |
| T-A1-07 | PASS | `node --test tests/ledger-card-archived.test.mjs` | `ok 1 - T-A1-07 ledger-card close --owner-note on an archived package (0-done/x, 0 of 4, closed: false): closed in place` | Probe: always passing `--move` turns it red. |
| T-I1-01 [REAL] | PASS | fresh clone of v0.1.0, `DOIT_STATUS_WRITE=<build-it bea0e4a> node --test 'test/*.test.mjs'`; conclude-it `node --test 'plugins/**/*.test.mjs'` for T-A-14/15 (init-it D-12) | `# tests 41 # pass 40 # fail 0 # skipped 1` (ADV-01c: `ledger-card not found at /Users/macbook/...`). conclude-it: `ok 1 - T-A-14 …` `ok 3 - T-A-15 …` `# pass 16` | All 20 T-A ids are present: T-A-14/15 in conclude-it, the rest in init-it. The contract's `node --test ../init-it/test/` is a directory argument and fails on Node 22 (defect 7). ADV-01c's default is a hardcoded absolute path. |
| T-I1-02 | DEFERRED (not in W0 scope) | `node scripts/check-pins.mjs --marketplace` (int) | `no drift` rc=0; `grep -c init-it core/companions.json .claude-plugin/marketplace.json` gives `0` / `0` | Under X4 (amended), the init-it entries arrive on epic/K2-companions and the pins in W3. The Expected result ("init-it installed at 0.1.0") cannot hold on int yet. CP-03 or the release checkpoint must re-run it. |

## Whole-suite runs

| repo / tree | command | result | vs baseline |
|---|---|---|---|
| do-it int f302f0f | `run-suites.sh <int>` (DO_IT_PILOT_DOIT set) | spine 133/133, routing 24/24, pipelines 11/11, review-loop 23/23, personas 7/7, state-stores 13/13, _interface 18/18, codex 17/17, opencode 18/18, **engine 36: 30 pass 5 fail 1 skip**, engine/state-store 15/15, plugin 17/17, catalog 19/19, readme 30/30, hosts 4/4, status 2/2, r4 25+1 skip | Nothing newly red. Engine's 5 failures are T-N3-01/02/03/11/13, the same as d38cedb. The new skip is T-R4-05 moved from r4 (`IMPLEMENTED-NOT-VERIFIED: no live Engine`). The state-stores drop from 21 to 13 is 8 cases moved to hosts/engine/state-store. |
| doc-it K1 7b18038 | `node --test 'test/*.test.mjs'` | 22/22 with pilot env; 21 + 1 explicit skip without | new repo |
| build-it A1 aaa6973 | `node --test 'tests/**/*.test.mjs'` | 211: 210 pass, 0 fail, 1 skip | origin/main bea0e4a: 208: 207 pass, 1 skip. No regression. |
| conclude-it edb8f07 | `npm test` equivalent | 27/27 | — |
| reconcile-it H1 | `node --test 'tests/**/*.test.mjs'` | 15/15 | — |
| plan-it H1 617defc | `run-contract.mjs` + `node --test tests/{plugin,review-checkpoints,status-json}/*.test.mjs` | 58/58; 83 tests with DOIT_STATUS_WRITE set: 83/83. Without it: 74 pass, 1 fail (AT-01), 8 skip | origin/main bfbfaa1 behaves the same: 77/77 with the writer set, the same AT-01 failure without it. Not new. |
| init-it v0.1.0 | fresh clone | 40/41, 1 skip | — |

## Mutation probes (temp copies only; every original restored)

| epic | mutation | expected red | result |
|---|---|---|---|
| S1 | `selectScopedRunId`: a null-session run counts as owned by any session | T-S1-02 | red (`not ok 2`) |
| S1 | `rowsForRun` returns every row | T-S1-05 | red (05, 05b) |
| S1 | legacy run (no owner) pushed as owned | T-S1-03 | red |
| S1 | VERIFYING added to NON_GATING_STATUSES | T-S1-04 | red |
| S1 | withdraw also marks answered questions | T-S1-11 | red (11, 11b) |
| E1 | host word planted in `core/state-stores/index.mjs` | T-E1-01 | red (T-S1-13, T-E1-01) |
| E1 | check-readme declined→Supported rule disabled | T-E1-05 | red (#1, #3, plus R1-09/10) |
| H1 | check-pins `--tags` comparison disabled | T-H1-02 | red |
| H1 | duplicate script re-added (reconcile-it copy) | T-H1-01 | red |
| B1 | stale threshold 24 h → 48 h in writer copy | T-B1-02 | red (25 h case) |
| B1 | board task hand-edited to `done` | validate | `has no matching history entry`, rc=1 |
| K1 | `check archive` never flags `closed:false` | T-K1-01/02 | red (both) |
| K1 | CLOSEOUT carried-without-link not reported | T-K1-03 | red |
| A1 | conclude-it pre-check for unverified tasks removed | T-A1-03 | **stayed green**. The mutant is equivalent because build-it close refuses the same; CLOSE-02 covers the no-write intent |
| A1 | S4 DENIED branch removed | T-A1-04 | red |
| A1 | Step 0 prints "clean" without doc-it | T-A1-05 | red |
| A1 | ledger-card always passes `--move` | T-A1-07 | red |

## Governance

- **G-1: PASS.** T-S1-01..06 pass, and the mutation probes bite.
- **G-2: PASS.** S4 has one path, `archive-package.mjs`. A grep of conclude-it, build-it, plan-it and do-it code finds no bare `git mv`/`mv` into `0-done/`. SKILL.md, ship-pipeline.md and the README all say "never a bare git mv".
- **G-3: PASS for W0.** Live `check-pins --tags` reports `no drift`. Weakness: it is opt-in and not part of `--marketplace` (defect 12).
- **G-4: PASS.** See T-E1-05 and its mutation probe.
- **G-8: FAIL in the shipped layout.** The core schema no longer names `state.engine`, but `state` now carries `additionalProperties: {type: object}`. Without a reachable `hosts/` folder, which is the case in the marketplace install, any `state.<x>` object is accepted unchecked (see T-E1-04).
- **G-9: PASS, with one exception to ratify.**
  - Zero host words in `core/` and `scripts/` outside test folders, apart from the allowlist. Deleting any single host folder leaves the core suites green.
  - Allowlist verdict: `scripts/check-pins.mjs` and `scripts/mirror-manifest.json` name `.claude-plugin/` and the `hosts/claude-code` → `plugins/do-it` packaging map. These are plugin-format paths, not integration logic, so they are acceptable.
  - `scripts/gen-claims.mjs` and `scripts/gen-motion-assets.mjs` carry host-specific prose and a host measurement file ("real Claude Code host", `feature-overnight.claude-code.json`). That is host content in `scripts/`. It existed before W0 and became visible when E1 widened the scan. It is tolerable for 1.1.0 only as a recorded, dated exception (X16). It should move under `hosts/claude-code/` later.
  - The allowlist itself is not in decisions.md.
- **G-10: PASS for W0 scope.**
  - conclude-it calls doc-it for the template, `check closeout` and `check archive`. It holds no copy of the tier enum or the template.
  - Without doc-it it prints `[skip] doc-it not installed: check closeout|check archive`. The `archive` path still DENIES. Step 0 exits 0 and never reports PASS.
- **R3 (no pilot name): W0 commits are clean, the tree is not.**
  - `git diff origin/main..int` adds zero pilot names, and doc-it has zero.
  - The do-it tree on origin/main names the pilot repo in 18 files of `docs/implementation/do-it-1.1/`, merged with PR #14 (audit/claims.md, docs/01, the PRDs, KICKOFF, DECISIONS…). It also names it in `docs/implementation/do-it-v1`, `.build-it-reports/REPORT.md`, `.taskstate/*` and `hosts/engine/{tests,live,conformance,README.md}`.
  - That is pre-W0 debt, not a W0 builder defect. It contradicts R3 and must be cleaned before 1.1.0 is tagged (defect 3).

## Defects, ranked

1. **HIGH: T-E1-04 / G-8. Host settings go unvalidated in the installed plugin.**
   - The problem: `settingsHostsDirs` only looks for `../../hosts` and `../../../hosts` next to the bundle. The marketplace installs `plugins/do-it` alone, so a typo such as `state.engine.blobs: bogus` and any arbitrary `state.<x>` object pass `doctor`. 1.0.5 refused them.
   - Fix, either one:
     - (a) Ship the host manifests and settings schemas inside the plugin: mirror `hosts/*/adapter.manifest.json` and `hosts/*/state-store/settings.schema.json` into `plugins/do-it/hosts/` via `scripts/mirror-manifest.json`, and add that candidate path.
     - (b) When no hosts folder is reachable, refuse `state.<name>` objects for any backend other than local/local-fs/git-branch with "host <name> not installed".
   - In both cases, replace test 6's "not checked" assertion. Add a case that runs `plugins/do-it/scripts/do-it.mjs` from a cache-shaped copy (the T-H1-04 pattern) and expects `SETTINGS_INVALID` for `blobs: bogus`.
2. **MEDIUM: T-S1-09 [REAL]. The /clear half is mocked.**
   - Fix: run one live check. In an interactive Claude Code session with `--plugin-dir <int>/plugins/do-it`, run `do-it start --request x`, then `/clear`, then `do-it resume --json`, and read `state.json`. `owner.session_id` should be the new id, with one history entry. Record the quoted output in evidence.md.
   - Alternatively, the owner can amend the case so the /clear half is attended, the same way T-H1-03 is.
3. **MEDIUM: R3. The pilot repo name appears in tracked do-it files.**
   - 18 files are in the 1.1 plan package, plus the v1 package, `.build-it-reports`, `.taskstate`, and `hosts/engine` tests and README.
   - Fix before the 1.1.0 tag: replace the name with "the pilot consumer repo" (and its programs with P1–P3) in the docs. Read pilot paths only from env in `hosts/engine` tests (X3). Add a do-it-side name scan, like doc-it's T-K1-07 neutral test, so this cannot come back.
4. **LOW: T-K1-02 asserts the count, not the identity.**
   - Fix: take the expected names from env (for example a sorted, comma-joined `DOC_IT_PILOT_EXPECT_UNCLOSED`), or compare a sha256 of the sorted list against a recorded hash. Either keeps names out of the repo.
5. **LOW: Hardcoded absolute owner paths in tests.**
   - Where: `do-it/tests/status/b1-stale.test.mjs:11`, init-it ADV-01c, and plan-it `tests/status-json/check-commands.test.mjs:17-18`.
   - Fix: read from env and skip with IMPLEMENTED-NOT-VERIFIED when unset. Today `run-suites.sh` turns red on any other machine.
6. **LOW: The T-B1-02 substitution is unrecorded and misreported.**
   - B1.md says `recheck` does not exist. At build-it bea0e4a it exists and refuses because `plan.json` is not committed.
   - Fix: add a dated contract amendment, or decision X16/X17, naming `view --json` (`stale`) as the T-B1-02 check. Correct the evidence line.
7. **LOW: Contract check commands use directory arguments, which fail on Node 22.**
   - Where: T-H1-01 `node --test ../reconcile-it/tests/`, T-E1-03, T-I1-01.
   - Fix: amend them to quoted globs (the run-memory lesson already says so).
8. **LOW: The G-12 allowlist is unrecorded.**
   - Fix: record the 4-file `claude`-only allowlist as a dated decision. Later, move the host measurement and prose out of `gen-claims.mjs` and `gen-motion-assets.mjs`.
9. **LOW: The stop gate writes into runs it does not own.**
   - When the hook's session owns nothing, `gateStop` appends `stop_gate_state_unreadable` to every unreadable run on every stop, including other sessions' runs.
   - Fix: log once per run (dedupe on the last event), or log to a home-level events file.
10. **LOW (product): Step 0 noise on a real archive.**
    - doc-it reports 200 legacy `done_without_closeout` packages on the pilot home, so conclude-it Step 0 will list 200+ lines at every close and bury the 3 real `done_unclosed` findings.
    - Fix: add a config cutoff such as `archive_since: <date>`, or count-only output for legacy packages, so the report stays readable.
11. **LOW: The CLOSEOUT backlog-link rule is too loose.**
    - It accepts any string containing `/` or `#`, such as `n/a`.
    - Fix: require an existing relative path, or a URL.
12. **LOW: `check-pins --tags` is not part of the release gate.**
    - Fix: make `--marketplace` imply `--tags`, or add `--tags` to the release script, so G-3 cannot be skipped by omission.

## What must change for CP-01 to PASS

- Fix defect 1 and add the installed-layout test. Re-run T-E1-04 and the do-it suite.
- Produce live evidence for the T-S1-09 /clear half, or get an owner amendment that makes it attended.
- Record the T-B1-02 substitution and the G-12 allowlist as dated decisions (defects 6 and 8).
- Defect 3 (R3) does not block W0 promotion, but it does block the 1.1.0 tag.
