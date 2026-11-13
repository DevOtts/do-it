checkpoint: CP-03
verdict: PASS

## Roll-up (2026-11-09): CP-03 PASS

Rounds 1–4 reviewed all three areas together and FAILED (11, 6, 7 and 6 HIGH/MEDIUM findings). From round 5 on, each area was reviewed by its own fresh opus reviewer, and every HIGH/MEDIUM finding was fixed with a regression test that replays the attack. The section verdicts are in this folder:

| Area | Final section verdict | Tree reviewed | Notes |
|---|---|---|---|
| Q1 audit chain | `cp03-r6-q1.md`: PASS | review-it epic/Q1-audit-mode @8d09266 | Earlier sections: r5 FAIL (2 MEDIUM). The HFS+ case was verified on a real HFS+ image. 3 LOW. |
| A1 guarded archive | `cp03-r7-a1.md`: PASS (provenance stated) | conclude-it release/1.1-family @383e8c2, doc-it fix/cp03-closeout @378c0af, build-it release/1.1-family @0c6eb3a | Earlier: r5/r6 reviewers stalled (R6-A1-M9 found and fixed). In r7, P1–P5 were hand probes by a fresh reviewer. P6–P9 were replays of the attack-named regression tests, run by the coordinator, who wrote none of the A1 code. P10 (free attack) was not reached. |
| S1 stop gate | `cp03-r11-s1.md`: PASS | do-it fix/cp03-stopgate @8d16e64 | Earlier sections: r5 FAIL (2 HIGH, 4 MEDIUM), then r6–r10 FAIL with 1 MEDIUM each (M13 FIFO IO, M14 write cap, M15 refuse on write fail, M16 park-question spam, M17 re-park asks again). r11: no HIGH or MEDIUM, 1 LOW (R11-S1-L-h). |

Carried LOW findings and documented limits (not blocking; listed in the build report): no secret key on state digests or board_sha256 (a full-rewrite forgery remains possible); 1.0-era hand tampering of `.do-it`; unauthenticated owner note; a sha that resolves but did not ship; an uncounted refusal never parks until the write fault is fixed (S1 L-a, a CONTRACT §3.1 choice); R11-S1-L-h; the remaining LOWs in each section file.

Known environmental test failures at review time: hosts/opencode T-H3-04 (the `opencode models` CLI does not answer; hosts/opencode is unchanged by 1.1), and T-R1-14 during GitHub 504s (green again once GitHub recovered).

---

# CP-03 adversarial review: try to get a false pass through every gate and writer (S1, A1, Q1)


## Round 4 (2026-11-08, FAIL)

Reviewer: a fresh opus reviewer. It built none of S1, A1 or Q1 and wrote none of rounds 1 to 3.
- The attacks ran in temp repos under the session scratchpad, against `git archive` copies of each fixed tree.
- Rebuilding `core/spine/do-it.mjs` from `src/` gave a byte-identical bundle.
- The suites ran in detached worktrees at the same shas, and those worktrees were removed afterwards.
- No repo was edited. Each tree's HEAD and dirty count are the same as before the review.
- The pilot `.do-it` was only read. It still has 6 runs.
- The session registry was pointed at a temp dir (`DO_IT_USER_HOME`). The real `~/.do-it` was never written.

Trees attacked (branch heads, not pushed):
- do-it `fix/cp03-stopgate` @ 74b6a92
- build-it `release/1.1-family` @ 0c6eb3a
- conclude-it `release/1.1-family` @ 5c29608
- doc-it `fix/cp03-closeout` @ 37100ef
- review-it `epic/Q1-audit-mode` @ e0664ac

Setup:
- The tools and the package setup are the same as in round 3. `H` is the shipped `hosts/claude-code/hooks/stop-gate.mjs` and `HP` is its plugin mirror, both run with `DO_IT_SPINE` set to the bundle.
- Every hook call is `echo '{"session_id":"<s>","cwd":"<dir>"}' | $H`.
- Finish-line progress is made the way `tests/hosts/cp03-r3-hook.test.mjs` makes it: one OPEN row of the run is set to DONE, with evidence.

**Result:**
- All 24 HIGH and MEDIUM attacks from rounds 1 to 3 were replayed, and all 24 held.
- Attacking the round-3 fixes, and the gates around them, found 1 new HIGH and 5 new MEDIUM, all of which got through.
- The verdict is FAIL.

### 1. Replays (rounds 1 to 3, each re-run as written)

| ID | Result | Output on the fixed tree |
|---|---|---|
| S1-H1 | held | `gate stop --session sess-B` → `STOP_REFUSED owned:true open:[intake … conclude]`, and the hook exits 2. B's `next` → `wave: intake` |
| S1-H2 | held | `resume --session sess-B` → `NOT_PARKED` on B's own run. A keeps `owner.session_id: sess-A` |
| S1-M1 | held | A2's state.json gets one extra byte → `STOP_REFUSED run_id:<A1> unreadable:[<A2>]`, and the hook exits 2 |
| A1-H1 | held | Hand-set `closed:true` → archive-package and `status-write close --move` both `REJECTED … no "close" history entry backs it`. A bare `mv` into 0-done → `check archive` reports `done_closed_unverified`, exit 1. A real PARTIAL_FAILED (`STATUS_WRITE_TEST_CRASH=after-freeze`) followed by a title edit → `REJECTED … tampered`, nothing moved |
| A1-H2 | held | `waves: []` → `close refused: the board has no tasks` |
| A1-M1 | held | Board deleted but not committed → `DENIED … is tracked at HEAD`. Committed → `DENIED … existed in commit <sha>` |
| A1-M2 | held | `"yes"` → `FAIL … must cite something checkable`. `"."` → `FAIL … at least 3 distinct words` |
| Q1-H1 | held | `opusplan`, `claudeopus` → `G-6 … is the author's model`. `best` → `host pointer, not a model` |
| Q1-M1 | held | `nosuchrepo@deadbeef00` → `unchecked`; `` `echo TRUE` `` → `cites no repo@sha and no command`. The second try → `ESCALATED_TO_OWNER` |
| Q1-M2 | held | Forged state → `STATE_TAMPERED … does not match its digest` |
| Q1-M3 | held | C2 rewritten and C3 appended → `LEDGER_CHANGED`. `status` exits 1 |
| R2-S1-H3 | held | 1.0.x board (10 step ids, no run_id, all DONE except verify) → B's `next` gives `wave: intake`. The hook → `STOP_REFUSED`, 10 open rows. On an all-DONE legacy board, `next` gives `wave: intake` |
| R2-S1-H4 | held | A1 has open rows; a newer quick-question A2 has none → `STOP_REFUSED run_id:<A1>` |
| R2-A1-M3 | held | (a) `git mv` + `git rm`, committed → `DENIED … was deleted in commit …, with no close`. (b) The same, not committed → `DENIED … is deleted in the working tree`. (c) `--dir …/DEMO` → `DENIED … is tracked at HEAD` |
| R2-A1-M4 | held | `foo@deadbee1` → `does not resolve: no repo "foo"`. `#0` → `not a PR or issue number`. `http://a.b` is now refused (R3-L1). `#999999` and `nobody/nothing#1` still pass on format alone, which is the documented offline limit |
| R2-Q1-M4 | held | `opus-xl --model-family gemini` and `claude-opus-research --model-family sonnet` → `contradicts the known family … (opus)` |
| R2-Q1-M5 | held | C2 moved into SAFE by hand → `PUBLISHED_TAMPERED: SAFE.md`, exit 1. A deleted SAFE.md → exit 1 |
| R3-S1-H5 | held | Two owned runs, progress on both before each stop: 5 hook stops → `2,2,2,2,2`. Both stay INTAKE, with no park.json and no `host-claude-code/` counter. Single run through the plugin mirror, progress before each of 6 stops → all exit 2, never parked |
| R3-S1-H6 | held | `advance BUILDING/VERIFYING/CONCLUDING` → ADVANCED. `--to DONE` → `TRANSITION_REFUSED`. The hook exits 2 and `gate stop --run` → STOP_REFUSED. From CONCLUDING, `--to NEEDS_HUMAN/BLOCKED/FAILED/ESCALATED/PARKED/AWAIT_RATIFY` → all `TRANSITION_REFUSED`. The status stays CONCLUDING |
| R3-S1-H7 | held | With a fresh session id: hook with cwd X, a sibling repo Y and the non-git parent → exits `2,2,2`. Y gets no `.do-it/`. Another session from Y → exit 0 |
| R3-S1-M6 | held | One unattributed OPEN `old-slice-T-9`, B's 10 rows DONE → hook exit 0, `next` → FINISH_LINE_REACHED, `gate stop --run B` → STOP_ALLOWED, board `10 of 10 closed`, `gate conclude` → CONCLUDED |
| R3-A1-M5 | held | (a) rename + board removed + 301 files under `demo2/0/` → `DENIED: … demo/status.json was deleted in commit …`. (b) rename + board removed + PLAN.md rewritten, one commit → DENIED |
| R3-A1-M6 | held | `--repo <empty dir>` and `--repo <unrelated repo>` → `usage: package dir … is outside --repo`. Package in a submodule → `usage: … is inside the git repo … (a submodule or nested repo)` |
| R3-Q1-M6 | held | (a) forged SAFE.md + one byte added to the state, then `start --restart` → `refused: PUBLISHED_UNBOUND: audit/SAFE.md, audit/audit-sonnet.md, audit/ombudsman.md`, and `status` exits 1. (b) forged SAFE.md + state deleted, then `start` → refused the same way. `abort` exits 2 and `status` exits 1 |

Also held: R3-L7. A legacy run (owner removed, sidecar recomputed) re-bound by `resume --session leg-N` gets `adopted_legacy: true`, and its `next` → `wave: verify`. The hook → `STOP_REFUSED open:[verify]`. A 1.1 run of the same session on that board seeds its own 10 rows and starts at `intake`.

### 2. Attacks that got through

#### R4-S1-H8 HIGH: `record` of a run-level result takes a gating run to NEEDS_HUMAN, BLOCKED or FAILED with no question and no reason. FAILED then escalates to a terminal ESCALATED

```
A=start --preset feature --session S; next --run A; gate advance --run A --to BUILDING        # 10 OPEN rows
results/r.json = {"schema":"it-result/1","stage":"build-it","run_id":A,"slice_id":null,"status":"needs_human","exit_code":2,"verdicts":[]}
record --run A --result results/r.json → RECORDED; status NEEDS_HUMAN; no pack.json; next → NONE reason "needs_human"
hook S → exit 0                                                     # board: 0 of 10 closed
"status":"blocked","exit_code":3   → RECORDED; status BLOCKED; no reason anywhere; hook exit 0
"status":"failed","exit_code":1    → RECORDED; status FAILED; hook exit 0
  gate escalate --run A --reason "x y z" → ESCALATED; status ESCALATED, run_verdict null; hook exit 0
"status":"usage_limit","exit_code":3 → PARKED (same as `park`; contract choice)
```

This got through with one file write and one documented command, and no hand edit of protected state. Worker result files are agent-written by design.
- The R3-S1-H6 fix names the command that owns each non-gating status. In `NON_GATING_OWNERS`, NEEDS_HUMAN belongs to "record (a needs_human result with its owner-pack questions)", and BLOCKED to "record (a blocked result with a reason)".
- `record` checks neither. `applyStatusToState` sets `st.status` from `result.status` whenever no slice is named.
- `BLOCK_REASON_REQUIRED` fires only when a slice is named.
- A needs_human result is held to its questions only when it brings some. With questions, from BUILDING, G-8 turns them into defaults (MIDRUN_QUESTION_REFUSED) and the run stays BUILDING. With no questions, the run goes to NEEDS_HUMAN. So asking the owner nothing frees the stop, while asking keeps the gate.
- Every target is non-gating in §3.1, so the hook allows the stop.
- Nothing downstream flags a NEEDS_HUMAN run with no open owner-pack question, or a BLOCKED run with no reason.
- FAILED → `gate escalate` → ESCALATED is terminal, and the session registry prunes the run.
- This is the R3-S1-H6 class (round 3 listed "BUILDING → NEEDS_HUMAN … no owner-pack question exists" in that HIGH). It now goes through the owning command instead of `gate advance`. It is graded HIGH on round 3's standard.

Origin: pre-existing 1.0.x behaviour. `applyStatusToState` is unchanged since d38cedb, and `record.mjs` differs from d38cedb only in row adoption. The R3-S1-H6 fix (f2c9464) left it open.

Fix:
- In `record`, a result with no `slice_id` takes the run to NEEDS_HUMAN only when its `pending_human.questions_path` yields at least one question that lands in the owner pack. Otherwise refuse with `NEEDS_HUMAN_WITHOUT_QUESTION`.
- It takes the run to BLOCKED only with a non-empty `reason` (the same `BLOCK_REASON_REQUIRED` as for slices).
- It takes the run to FAILED only with a reason or a failing verdict.
- `gate escalate` from FAILED also needs an open owner-pack question, or writes one.
- Regression test: run the four results above from BUILDING. Each must be refused, or must leave an open pack question or a stored reason, and the hook must stay refused when neither exists.

#### R4-S1-M7 MEDIUM: any read error in the session registry, or in another registered home, is thrown out of `gate stop`, and the hook fails open for every home, the cwd's own included

```
X: A=start --session reg-1; next --run A                     # 10 OPEN rows; hook from X → exit 2
printf '{"session_id":"reg-1","runs":[' > $DO_IT_USER_HOME/sessions/reg-1.json
gate stop --session reg-1 --cwd X → INTERNAL_ERROR "Unexpected end of JSON input"; hook from X → exit 0
registry file replaced by a directory    → INTERNAL_ERROR "EISDIR …";  hook → exit 0
registry file chmod 000                  → INTERNAL_ERROR "EACCES …";  hook → exit 0
two homes: A (open) in X, B in Y, same session; Y's finish-line.json garbled ("<<<<<<< HEAD" on line 1)
gate stop --session xh-1 --cwd X → INTERNAL_ERROR "Unexpected token '<'"; hook from X → exit 0
```

All of these got through.
- `sessionHomes` → `readJsonIfExists` throws on anything but ENOENT, and `gateStop` calls it outside any try.
- In the loop over homes, any error that is not STOP_REFUSED is rethrown.
- The CLI turns these errors into `INTERNAL_ERROR`. The thin hook maps every outcome except STOP_REFUSED to exit 0.
- §3.1's only failure path is "state.json unreadable", and it fails open for that run alone. Here a broken file outside the run turns off the gate for the session's valid run in its own repo.
- The fix report says that deleting the registry "brings back the cwd-only behaviour". Breaking the registry does worse: it brings back no gate at all.
- The garbled-board case in a single home is the same fail-open as in 1.0.x (LOW, S1-L3). The registry makes it cross repos: a bad board in Y opens X.

Origin: new 1.1 surface (session registry, 594da8e). The single-home garbled-board fail-open is pre-existing 1.0.x behaviour.

Fix:
- `sessionHomes` catches its own read and parse errors. It returns `[]` and reports `registry_error`, so the cwd home is still gated.
- `gateStop` evaluates each extra home inside a try. A home that throws is reported in `unreadable_homes`, the way an unreadable run is, and never stops the other homes from being gated.
- Regression test: run the four commands above. The hook from X must exit 2 each time.

#### R4-S1-M8 MEDIUM: the session registry is a read-modify-write with no lock, so starts that run at the same time lose entries, and the lost run's stop from another repo is allowed

```
4 parallel `start --session race-N` in repos X Y Z W, 8 trials → registry holds 2 2 2 1 2 2 2 2 entries (lost in 8/8)
2 parallel starts (X, Y) of race-e2e → registry: X only; start printed no session_registry_error
X's rows all closed, Y's run INTAKE with 10 OPEN rows, owned by race-e2e
hook from the parent folder → exit 0 ; hook from X → exit 0 ; gate stop → STOP_ALLOWED homes:[parent, X]
hook from Y → exit 2
```

This got through with no hand edit. The only condition is two `start`s for one session at the same moment, which an agent that sends independent tool calls in parallel does as a matter of course.
- `registerSessionRun` reads the list, adds an entry and writes the file back. `atomicWriteJson` keeps the file whole, but the last writer wins.
- The prune-write in `sessionHomes`, which runs at every hook stop, has the same race with a `start`.
- R3-S1-H7 is open again for the lost run. Nothing reports it: `start` saw no error.

Origin: new 1.1 surface (session registry, 594da8e).

Fix:
- Write one file per run, `sessions/<session>/<run_id>.json`, so a write never rewrites another entry, and prune by deleting files.
- Or take an exclusive lock (`fs.openSync(lock, 'wx')` with retry) around every read-modify-write.
- Regression test: 4 parallel starts, then 4 entries; each run's stop from the parent folder is refused.

#### R4-A1-M7 MEDIUM: a lost board counts as "accounted for" when any file named `status.json` is at its old path or at `0-done/<name>/`, even an empty placeholder or a copy of another package's closed board

```
demo (T-1, T-2 not started) → git mv demo demo2; git rm board; git commit
V3: mkdir docs/implementations/demo; : > docs/implementations/demo/status.json      # an empty, untracked file
    $AP --repo $T --impl demo2 --closeout-rows rows-drop.json → CLOSED_MOVED docs/implementations/0-done/demo2
    doc-it check archive → all lists empty, exit 0
V1: other = a verified package closed through the guarded close into 0-done/other
    mkdir 0-done/demo; cp 0-done/other/status.json 0-done/demo/
    $AP … --impl demo2 … → CLOSED_MOVED 0-done/demo2;  check archive → all lists empty, exit 0
V2: echo '{}' > 0-done/demo/status.json → CLOSED_MOVED; check archive → done_unclosed:[0-done/demo], exit 1   (detected)
```

V1 and V3 got through. V2, the case the fix report names, is the one that doc-it does catch.
- `boardHistory` skips a lost board on `fs.existsSync(<path>)` or `fs.existsSync(0-done/<name>/status.json)`. It never reads the file.
- doc-it checks only `0-done/` boards, and does not compare a board's `implementation` with its folder.
- An empty placeholder in an active folder is reported by nothing. A copied closed board in `0-done/` is reported clean.
- Each case starts from a deleted board, which is a hand edit, so this is MEDIUM. Downstream, nothing detects it.

Origin: 1.1 regression (CP-03 round-3 fix 2053f07).

Fix:
- A board on disk at the old path accounts for the lost one only when it parses, its `implementation` equals the folder name, and it is tracked or its content matches a committed version of that path.
- A `0-done/<name>/status.json` accounts only when it parses, `implementation` equals `<name>`, `closed:true` is backed by a close entry, and `board_sha256` verifies. The status-write `validate` check covers all of this.
- doc-it `check archive` reports a `0-done/` board whose `implementation` is not its folder name (`done_misnamed`).
- Regression test: V1 and V3 above must be DENIED.

#### R4-A1-M8 MEDIUM: in a shallow clone, or whenever git cannot answer in the package dir, every board-history check sees nothing and the CLOSEOUT path opens

```
mkpkg demo; git rm board + STATUS.md; git commit                                   # full clone → DENIED … existed in commit
git clone --depth 1 file://$T $SH; git rev-parse --is-shallow-repository → true
$AP --repo $SH --impl demo --closeout-rows rows-drop.json → CLOSED_MOVED docs/implementations/0-done/demo
doc-it check archive --root $SH → all lists empty, exit 0
same repo, full clone: GIT_CEILING_DIRECTORIES=$T/docs $AP --repo $T --impl demo … → CLOSED_MOVED
```

Both got through.
- In a depth-1 clone, the commit that deleted the board is a grafted root. `log --all -- <path>` and `--diff-filter=D` therefore return nothing.
- archive-package never checks `--is-shallow-repository`.
- Separately, `g()` turns every git failure into `''`. When `gitTop(pkg.dir)` fails, `hist` is null, so no history check runs, and the submodule check (`pkgTop && …`) is skipped too.
- Shallow clones are the default in many CI and cloud-agent checkouts. A deleted board is a hand edit, so this is MEDIUM.

Origin: 1.1 regression (the A1 board-history checks, from the A1-M1 fix through 2053f07; archive-package is new in conclude-it 2.2.0).

Fix:
- On the no-board path, refuse with `DENIED: shallow clone; run git fetch --unshallow` when `rev-parse --is-shallow-repository` is true.
- Fail closed when `gitTop(pkg.dir)` is null while `gitTop(root)` is not, or when any history query exits non-zero. Let `g()` return a failure, not `''`.
- Regression test: the depth-1 clone and the `GIT_CEILING_DIRECTORIES` call above must be DENIED.

#### R4-Q1-M7 MEDIUM: on a case-insensitive disk, a published file whose name differs only in case is never UNBOUND, so `status` exits 0 while `audit/SAFE.md` opens the forged file

```
(1) start claims.md --auditor-model sonnet … → AUDITING (never published)
    write audit/safe.md: "## SAFE (2) - C1 - C2 … DO-NOT-PUBLISH (0)" with the current ledger sha256
    status --ledger claims.md → "state AUDITING …", exit 0;  cat audit/SAFE.md → the forged list
(2) R3-Q1-M6 (b) with case variants: legit PUBLISHABLE chain; forge SAFE.md; mv SAFE.md safe.md,
    ombudsman.md → Ombudsman.md, audit-sonnet.md → Audit-sonnet.md; rm chain-state.json chain-state.sha256
    start claims.md … → AUDITING (no PUBLISHED_UNBOUND); status → exit 0; audit/SAFE.md lists C2 as SAFE
```

Both got through, on macOS's default case-insensitive APFS (Windows behaves the same).
- `isPublishedName` matches `'SAFE.md'`, `'ombudsman.md'` and `/^audit-.+\.md$/` exactly. So `publishedOnDisk` never lists `safe.md`, and `unboundPublished` is empty.
- SKILL.md says "Consumers trust SAFE.md only when `status` exits 0", and every consumer opens `audit/SAFE.md`, which on this disk is `safe.md`.
- (1) needs one planted file. (2) is the round-3 MEDIUM again, with renames added.
- When a SAFE.md hash is recorded, `publishedTampered` opens the same file through `existsSync('audit/SAFE.md')` and catches an edit. The gap is only where no hash names SAFE.md: a chain that never published, or a missing or tampered state.

Origin: new 1.1 surface (audit chain; `isPublishedName` from 5c6d27d).

Fix:
- Match published names case-insensitively: `f.toLowerCase() === 'safe.md'`, and so on, and `/^audit-.+\.md$/i`.
- Refuse two entries in `audit/` that fold to the same name.
- Regression test: cases (1) and (2) above must exit 1 with `PUBLISHED_UNBOUND: audit/safe.md`.

### 3. Attacks on the round-3 fixes that held

- **Thin hook.**
  - STOP_REFUSED → exit 2, and anything else → exit 0, on both the host hook and the plugin mirror. Neither keeps a counter or calls `park` (no `host-claude-code/` folder is created).
  - Patience without progress is the spine's, per run.
  - A blank `session_id` is treated as no session.
  - Malformed or unparseable spine output fails open. That is the documented 1.0.x rule; see R4-S1-M7 and R4-L4 for the ways to cause it.
- **TRANSITION_REFUSED and `gate escalate`.**
  - `gate advance` refuses all 7 non-gating targets, from BUILDING and from CONCLUDING.
  - `gate escalate` from BUILDING → TRANSITION_REFUSED, and with no `--reason` → USAGE.
  - From NEEDS_HUMAN it needs an open pack question. `gate escalate` itself never takes a gating run out of the gate. The way round it is R4-S1-H8, one step earlier.
- **Session registry.**
  - A forged entry pointing at another home only adds homes to gate, unless that home throws (R4-S1-M7).
  - A removed or moved home is pruned, and the run is still gated from its own repo (from the moved path → exit 2).
  - A missing registry gives the cwd-only rule.
  - An unwritable registry makes `start` succeed with `session_registry_error` (R4-L6).
  - A take-over to another session prunes the old owner's entry.
  - Ids that are not plain names are stored by digest.
- **rowsForRun adoption.**
  - A 1.1 run can never gain `adopted_legacy`. `start` always writes an owner object, and `resume` sets the flag only when `was` is null.
  - A legacy run keeps adopting after `resume`. A 1.1 run on the same board seeds its own rows.
- **conclude-it lost-board query.**
  - A deletion on a fetched remote-tracking branch is seen through `--all`. An unfetched branch holds no history that HEAD depends on.
  - `--owner-note demo2` does not name `demo` (whole-token match). Neither does `not-demo`.
  - A placeholder `{}` in `0-done/<name>/` is reported by `check archive` (V2).
- **review-it.**
  - `--quarantine-published` moves only unbound files, into `audit/.quarantine/<time>/`.
  - A planted exact-name `SAFE.md` in a never-published chain → `PUBLISHED_UNBOUND`, exit 1.
  - The lookalike fold refused no correct declaration among about 60 real ids (GPT, o-series, Claude, Bedrock, Gemini, Llama, Qwen, DeepSeek, Mistral family, Grok, Cohere, Kimi, GLM, Phi, Gemma, Nova, Sonar). Ids it does not know are refused until declared, which fails closed. The one false positive comes from the round-2 substring rule (R4-L8).

### 4. LOW

| ID | Origin | Finding | Suggested fix |
|---|---|---|---|
| R4-L1 | pre-existing 1.0.x | `gate conclude` has no status precondition. A run whose rows were never seeded (no `next`) concludes straight from INTAKE: `CONCLUDED`, `DONE_WITH_RESIDUALS`. Its hook stop was never gated either | Require CONCLUDING or PROVING, and at least one row of the run |
| R4-L2 | pre-existing 1.0.x | A row recorded BLOCKED with any reason (`"x"`) is terminal. A BUILDING run with all 10 rows BLOCKED stops (hook exit 0) and concludes `DONE_WITH_RESIDUALS`. The verdict says so, which is why this is LOW | Apply doc-it's 3-distinct-words rule to row reasons |
| R4-L3 | pre-existing 1.0.x | `park --run A` parks any non-terminal run with any reason, and the stop is then allowed. Contract choice (PARKED does not gate); explicit and logged | None; list self-parks in `status` and `conclude` |
| R4-L4 | pre-existing 1.0.x | Redaction rewrites protocol fields. With `.secrets/token` = `STOP_REFUSED`, `gate stop` prints `"outcome":"[REDACTED:token]"` and the hook exits 0. Needs a planted file | Redact only free-text fields; the hook also refuses on the spine's STOP_REFUSED exit code |
| R4-L5 | new 1.1 surface | On a case-insensitive disk, session ids that differ only in case (`CaseSess`, `casesess`) share one registry file and prune each other's entries. Both stops from a third folder are then allowed. Claude Code ids are lowercase UUIDs; explicit `--session` names can collide | Always name the file by the digest of the exact id |
| R4-L6 | new 1.1 surface (documented) | An unwritable registry: `start` succeeds, `session_registry_error` appears only in its output, and a stop from a sibling repo is allowed. A moved repo's entry is pruned for good | Repeat the registry error in `status` and in the hook's stop answer |
| R4-L7 | 1.1 (unauthenticated note) | `noteNames` matches case-insensitively, so on a case-sensitive repo `--owner-note DEMO` accounts for `demo`'s board. Inside the A1-L2 boundary | Match case-sensitively when `core.ignorecase` is false |
| R4-L8 | 1.1 regression (R2-Q1-M4 fix) | The "word contains a family" rule refuses `ollama/qwen2.5:7b`, `ollama/mistral` and `ollama/deepseek-r1` even when declared ("names more than one family (llama, …)"), and fixes `ollama/gemma3` as llama. Fails closed | Add `ollama` (and `openrouter`, `groq`, `together`) to the prefixes |
| R4-L9 | pre-existing 1.0.x | A garbled `finish-line.json` in the run's own home fails the gate open (`INTERNAL_ERROR`). This is S1-L3; R4-S1-M7 is the cross-home version | Covered by the R4-S1-M7 fix if the home's error is reported, not thrown |

Judged against the CONTRACT:
- **X25** (an explicit `--take-over`) is consistent with §3.1 and S1-00. Ownership moves only on an explicit, logged command, and `status` shows the last take-over. A live owner losing the gate this way is the R2-L1 LOW, not a false pass.
- **X26** (declared repos; model ids resolve to a family or are refused) satisfies G-6. It is stricter than G-6 asks: same family, different version, is refused. The declared author model stays the Q1-L1 trust boundary.

### 5. Suites (detached worktrees at the shas above)

| Repo | Command | Result |
|---|---|---|
| do-it | `.taskstate/1.1/run-suites.sh <tree>` with `DO_IT_PILOT_DOIT=<pilot>/.do-it` and `DOIT_STATUS_WRITE` set | **EXIT 0, green.** core/spine: 157 tests, 156 pass, 1 skip. Re-run with `CLAUDE_CODE_SESSION_ID` set: 157/157, and T-S1-06 [REAL] ran on the pilot copy and passed. hosts/engine: 36 tests, 29 pass, 7 skip. tests/plugin: 17 tests, 16 pass, 1 skip. e2e r4: 26 tests, 25 pass, 1 skip. tests/hosts: 17/17. Every other folder passes in full. claude-code hook cases T-H1-04..07 run by name, plus conformance: 6/6 |
| build-it | `tests/lints/run-all.sh`; `t20-release.sh`; `node --test 'tests/status/**/*.test.mjs' 'tests/checkpoints/**/*.test.mjs'` | ALL LINTS + UNIT TESTS GREEN; T20 PASS; 218 tests: 217 pass, 0 fail, 1 skip |
| conclude-it | `npm test` with `DOIT_STATUS_WRITE` and `DOC_IT_CLI` | 54 tests: 54 pass, 0 fail, 0 skip |
| doc-it | `npm test` with `DOC_IT_PILOT_HOME` and `DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256` | 40 tests: 40 pass, 0 fail, 0 skip. T-K1-02 [REAL] ran its identity check |
| review-it | `node --test 'tests/**/*.test.mjs'` with `DOC_IT_CLI` and `PLAN_IT_GATE_CHECK` | 65 tests: 65 pass, 0 fail, 0 skip |

Skips:
- do-it core/spine (1): the session-id case skips because I unset `CLAUDE_CODE_SESSION_ID` for the run. It passes when the variable is set.
- do-it hosts/engine (7): T-N3-01, 02, 03, 11, 12 and 13 skip because `DO_IT_PILOT_REPO` is not set. T-R4-05 [REAL] skips because no live server URL is set.
- do-it tests/plugin (1): T-R2-06 [REAL] skips because the sibling repos are not next to the scratch worktree.
- do-it e2e (1): T-R4-02 [REAL] skips because `DOIT_REAL_CALLS` is not set.
- build-it (1): AT-21, an existing skip.

Not counted:
- My first build-it unit run passed the folders as `tests/status tests/checkpoints`. Node 22 then runs the `tests/checkpoints` folder as a file and reports it `not ok`.
- Run with globs, as round 3 did, the suite is green.

The review-it suite leaked 25 `rev-sync-*` dirs into `$TMPDIR` again (the known leak). I removed those 25. Another 25, from an earlier run by someone else, were left alone.

### 6. Summary of attacks that got through

| ID | Sev | Gate | Origin | One line | Fix owner |
|---|---|---|---|---|---|
| R4-S1-H8 | HIGH | §3.1 / G-1 / G-8 | pre-existing 1.0.x (left open by the R3-S1-H6 fix) | a run-level `record` result (needs_human with no question, blocked with no reason, failed) takes a gating run out of the gate, and failed → `gate escalate` ends it | do-it spine (record) |
| R4-S1-M7 | MEDIUM | §3.1 | new 1.1 surface (session registry) | any read error in the registry, or in another registered home, becomes INTERNAL_ERROR, and the hook fails open everywhere | do-it spine |
| R4-S1-M8 | MEDIUM | §3.1 / G-1 | new 1.1 surface (session registry) | concurrent `start`s lose registry entries (8/8 trials), which reopens R3-S1-H7 for the lost run | do-it spine |
| R4-A1-M7 | MEDIUM | G-2 | 1.1 regression (2053f07) | a lost board counts as accounted for by any `status.json` at its old path or in `0-done/<name>/`: an empty placeholder or a copied closed board | conclude-it + doc-it |
| R4-A1-M8 | MEDIUM | G-2 | 1.1 regression (A1 history checks) | in a shallow clone, or when git fails in the package dir, no board-history check runs | conclude-it |
| R4-Q1-M7 | MEDIUM | §3.2 | new 1.1 surface (5c6d27d) | `audit/safe.md` is never UNBOUND on a case-insensitive disk; `status` exits 0 while `audit/SAFE.md` opens the forgery | review-it |

Re-run condition: each of the six above is fixed, with a regression case that replays the commands shown and asserts a refusal. Then CP-03 runs again on the fixed trees.

---

## Round 3 (2026-11-08, FAIL)

Reviewer: a fresh opus reviewer. It built none of S1, A1 or Q1 and wrote neither round 1 nor round 2. The attacks ran in temp repos under the session scratchpad, against `git archive` copies of each fixed tree. Rebuilding `core/spine/do-it.mjs` from `src/` gave a byte-identical bundle. The suites ran in detached worktrees made from the same shas, and those worktrees were removed afterwards. No repo was edited. The pilot `.do-it` was only read; its count of 5 runs is unchanged.

Trees attacked (branch heads, not pushed):
- do-it `fix/cp03-stopgate` @ 6f7a83f
- build-it `release/1.1-family` @ 0c6eb3a
- conclude-it `release/1.1-family` @ 08afc64
- doc-it `fix/cp03-closeout` @ 883a4fe
- review-it `epic/Q1-audit-mode` @ ec073d3

Setup:
- Env: `SP`, `W`, `AP`, `C`, `DOIT_STATUS_WRITE` and `DOC_IT_CLI` point at the copies. The hook is `H="node <do-it>/hosts/claude-code/hooks/stop-gate.mjs"`, run with `DO_IT_SPINE` set to the bundle.
- Each package is `docs/implementations/demo`, made by `status-write init` with T-1 and T-2 not started, plus a tracked `PLAN.md`, and committed. Its `plan.json` sits outside the package.
- `rows-drop.json` is `[{"piece":"Core","disposition":"dropped","detail":"we decided not to build this piece"}]`.

**Result:**
- All 17 HIGH and MEDIUM attacks from rounds 1 and 2 were replayed, and all 17 held.
- Attacking the round-2 fixes, and the gates around them, found 3 new HIGH and 4 new MEDIUM, all of which got through.
- The verdict is FAIL.

### 1. Replays (rounds 1 and 2, each re-run as written)

| ID | Result | Output on the fixed tree |
|---|---|---|
| S1-H1 | held | `gate stop --session sess-B` → `STOP_REFUSED owned:true open:[intake … conclude]`. B's `next` → `wave: intake` |
| S1-H2 | held | `resume --session sess-B` → `NOT_PARKED` on B's own run. A keeps `owner.session_id: sess-A` |
| S1-M1 | held | A2's state.json gets one extra byte → `STOP_REFUSED run_id:<A1> unreadable:[<A2>] open:[10 rows]` |
| A1-H1 | held | Hand-set `closed:true` → archive-package and `status-write close --move` both `REJECTED … no "close" history entry`. A bare `mv` into 0-done → `check archive` reports `done_closed_unverified`, exit 1. A PARTIAL_FAILED freeze followed by a title edit → `board_sha256 … does not match`, nothing moved |
| A1-H2 | held | `waves: []` → `close refused: the board has no tasks` |
| A1-M1 | held | Board deleted but not committed → `DENIED … is tracked at HEAD`. Committed → `DENIED … existed in commit <sha>` |
| A1-M2 | held | `"yes"` → `FAIL … must cite something checkable`. `"."` → `FAIL … at least 3 distinct words` |
| Q1-H1 | held | `opusplan`, `claudeopus` → `G-6 … is the author's model`. `best` → `host pointer, not a model` |
| Q1-M1 | held | `nosuchrepo@deadbeef00` → `unchecked`; `` `echo TRUE` `` → `cites no repo@sha and no command`. The second try → `ESCALATED_TO_OWNER` |
| Q1-M2 | held | Forged state with zero ruling rows → `STATE_TAMPERED` |
| Q1-M3 | held | C2 rewritten and C3 appended → `LEDGER_CHANGED`. `status` exits 1 |
| R2-S1-H3 | held | 1.0.x board (10 step ids, no run_id, all DONE except verify) → B's `next` gives `wave: intake`. B gets 10 rows of its own and the 10 legacy rows are untouched. Hook → `STOP_REFUSED … 0 of 10 closed`. On an all-DONE legacy board, `next` gives `wave: intake`, not FINISH_LINE_REACHED |
| R2-S1-H4 | held | A1 has open rows; a newer A2 (INTAKE) has none → `STOP_REFUSED run_id:<A1>` |
| R2-A1-M3 | held | (a) `git mv` + `git rm`, committed → `DENIED … PLAN.md lived in docs/implementations/demo/; renamed here`. (b) The same, not committed → `DENIED … deleted in the working tree`. (c) `--dir …/DEMO` → `DENIED … is tracked at HEAD` |
| R2-A1-M4 | held | `foo@deadbee1` → `does not resolve: no repo "foo"`. `#0` → `not a PR or issue number`. `#999999`, `nobody/nothing#1` and `http://a.b` still pass on format alone. That is the documented offline limit (LOW, §4) |
| R2-Q1-M4 | held | `opus-xl --model-family gemini` and `claude-opus-research --model-family sonnet` → `contradicts the known family … (opus)` |
| R2-Q1-M5 | held | C2 moved into SAFE by hand → `PUBLISHED_TAMPERED: audit/SAFE.md does not match`, exit 1. A deleted SAFE.md → `PUBLISHED_TAMPERED … is missing`, exit 1 |

### 2. Attacks that got through

#### R3-S1-H5 HIGH: the host hook keeps its own patience counter. It ignores progress and parks only the first run, so a stop goes through while an owned run is open and was never parked

```
A1, A2 = two feature runs owned by sess-A (next → 10 OPEN rows each)
loop 4×: echo '{"session_id":"sess-A","cwd":"<repo>"}' | $H ; then close one row of each run (progress)
stop 1..3 → exit 2 (refused); host stop-refusals.json {"sess-A":3}; spine stop_refusals stays 1 (rows changed)
stop 4    → exit 0 (ALLOWED); A2 PARKED by the hook's `park --run <json.run_id>`; A1 still INTAKE
gate stop --session sess-A → STOP_REFUSED run_id:<A1> open:[build … conclude]
single-run variant: progress before every stop → 4th stop: run PARKED, park.json reason
  "stop-gate patience reached without progress", while spine stop_refusals = 1
```

This got through with ordinary use and no hand edit.
- `stop-gate.mjs` counts refusals per session in `.do-it/host-claude-code/stop-refusals.json`. It resets that count only on STOP_ALLOWED, or when `json.progress === true`, and the spine never sends `progress`.
- When the count reaches patience, the hook calls `park --run <json.run_id>`, which parks only the first refused run, and then exits 0.
- §3.1 says to refuse up to patience and then park this run only. The spine does that per run, and resets the count on progress. The hook overrides it.
- In the two-run case the session stops while A1, an owned active run with open rows, was neither at patience nor parked. That is a false pass of G-1 / §3.1 row 1. A1 still reads as an ordinary active run, and nothing records that its gate was skipped.
- In the single-run case, a run that made progress before every stop is parked, and its park record says the opposite of what happened. That part is a wrong state.

Fix:
- Drop the hook's own counter. The spine already counts per run with a progress reset, and parks per run.
- The hook maps STOP_REFUSED to exit 2, and PARKED or STOP_ALLOWED to exit 0. It never calls `park` itself.
- Regression test: run the commands above through the hook. The 4th stop must still be refused while A1 is making progress, and the single-run variant must not park.

#### R3-S1-H6 HIGH: `gate advance` takes an owned run with open rows to DONE without `gate conclude`

```
A=$($SP start --preset feature --request a --session sess-A --json | jq -r .run_id); $SP next --run $A
for s in BUILDING VERIFYING CONCLUDING DONE; do $SP gate advance --run $A --to $s; done   → ADVANCED ×4
$SP gate stop --session sess-A --cwd $PWD   → STOP_ALLOWED owned:true "run is DONE, it does not gate"
$SP gate stop --run $A                      → STOP_ALLOWED
$SP status --run $A → status DONE, run_verdict null, board "FINISH LINE: 0 of 10 closed"
also: BUILDING → NEEDS_HUMAN via advance → STOP_ALLOWED, no owner-pack question exists
```

This got through with four documented CLI commands and no hand edit.
- `advanceRunStatus` checks only `RUN_TRANSITIONS`, and that table allows CONCLUDING→DONE and PROVING→DONE.
- That skips everything `gate conclude` enforces (unaccounted rows, live workers, pending wake, deploy legs; G-13).
- DONE is non-gating in §3.1, so both stop paths allow the stop.
- Nothing downstream flags a DONE run that has `run_verdict: null` and 0 of 10 rows closed. No `concluded` event is written, but nothing checks for one.
- The same command reaches NEEDS_HUMAN, BLOCKED, FAILED and ESCALATED from BUILDING, with no question and no reason. Those are non-gating too.
- The agent the gate is meant to hold can switch the gate off with two commands.

Fix:
- `gate advance` refuses any `--to` in `NON_GATING_STATUSES` (DONE above all).
- Each of those states is entered only by the command that owns it: DONE by `gate conclude`, PARKED by `park`, NEEDS_HUMAN or AWAIT_RATIFY by the pack or readiness, BLOCKED or FAILED or ESCALATED by `record` with a reason.
- Regression test: the loop above must be refused at `--to DONE`, the hook stop must stay refused, and `--to NEEDS_HUMAN` must be refused when no pack question is open.

#### R3-S1-H7 HIGH: the gate looks for runs only in the repo of the hook's cwd, so a stop made from another repo finds no run

```
repo X: A=$($SP start --preset feature --request a --session sess-A …); $SP next --run $A     # 10 OPEN rows
echo '{"session_id":"sess-A","cwd":"X"}'        | $H → exit 2 (refused)
echo '{"session_id":"sess-A","cwd":"<repo Y>"}' | $H → exit 0 (allowed)    # a sibling repo
echo '{"session_id":"sess-A","cwd":"<parent>"}' | $H → exit 0 (allowed)    # the non-git parent folder
A stays INTAKE in X; Y gets only an empty .do-it/host-claude-code/
```

This got through with no hand edit.
- `makeCtx` derives `.do-it` from the cwd: the git main checkout of the cwd, else the cwd itself. The hook passes `input.cwd`.
- The hook input's `cwd` is the session's current directory. In the main session, a Bash `cd` into another working directory moves it.
- So the gate stops working whenever the session stops while its cwd is in a different repo, or in the non-git parent folder. Multi-repo runs like this release, which spans 5 repos, do that as a matter of course.
- The run stays active and nothing records the skipped stop. §3.1 row 1 keys on the session owning the run, not on the cwd.
- Graded HIGH on the host's documented hook-input semantics. The demonstration drives the shipped hook with the sibling cwd.

Fix:
- At `start`, record the run's home under the session: `<user home>/.do-it/sessions/<session_id>.json` → `[home…]`. Or have the SessionStart hook export `DO_IT_HOME` once the first run starts.
- `gate stop --session` checks the homes on that list, and also the cwd's home.
- Regression test: the three hook calls above must all refuse.

#### R3-S1-M6 MEDIUM: on a 1.0.x board with open rows, a 1.1 run can never finish, while the hook says it has nothing open

```
board: one unattributed OPEN row "old-slice-T-9"; B = feature run of sess-B; B's own 10 rows set DONE
hook gate stop --session sess-B → STOP_ALLOWED "no open rows for this run"
next --run B                    → NEXT action NONE reason "waiting"        (never FINISH_LINE_REACHED)
gate stop --run B               → STOP_REFUSED open:["old-slice-T-9"]       (and parks B at patience)
gate conclude --run B           → CONCLUDE_REFUSED unaccounted_row ids:["old-slice-T-9"]
status --run B board            → "10 of 11 closed  OPEN (1): old-slice-T-9"
```

This got through, and it is the open item in the S1 fix report.
- The hook path is strict, but the views are not. The `next` finish check, the explicit stop, `gate conclude` and `status` all read `rowsForRun(…, true)`.
- `record` is strict, so B can never close the legacy row.
- On the pilot board, 12 of its 475 unattributed rows are OPEN, so every 1.1 run there would be stuck before CONCLUDED. The ways out are a hand edit of someone else's rows, or the R3-S1-H6 bypass. A board you trust becomes a board the agent learns to route around.
- The views and the gate also disagree on whether the run is done.

Fix:
- Every view uses the same rule as seeding: `rowsForRun(board, runId, adoptsUnattributed(state))`. That covers next, explicit stop, conclude, status, handoff and the BLOCKED board.
- Narrow T-S1-05b to legacy runs.
- Regression test: the commands above give FINISH_LINE_REACHED and CONCLUDED for B, and a legacy run with no owner still counts the old row.

#### R3-A1-M5 MEDIUM: the rename follow is beaten by the 300-file cap, or by a rename made together with an edit

```
(a) git mv demo demo2; git rm -f demo2/status.json demo2/STATUS.md; add demo2/0/n000.md … n300.md; git commit
    $AP --repo $ROOT --impl demo2 --closeout-rows rows-drop.json → CLOSED_MOVED docs/implementations/0-done/demo2
(b) git mv demo demo2; git rm -f board files; rewrite demo2/PLAN.md; git commit (one commit)
    git log --follow demo2/PLAN.md → only demo2/PLAN.md
    $AP … --impl demo2 → CLOSED_MOVED docs/implementations/0-done/demo2
```

Both got through.
- In (a), `ls-files` sorts `0/…` before `PLAN.md`, and `.slice(0, MAX_FOLLOW)` stops after the 300 new files. The one file that would lead back to `demo/` is never followed.
- In (b), git's rename detection needs at least 50% similarity, so `--follow` never finds the old folder.
- Each case is a deleted board, which is a hand edit, so this is MEDIUM.
- `git status` is clean afterwards and `doc-it check archive` reports nothing.

Fix:
- Stop relying on per-file `--follow`. Run one uncapped history query over the implementations root, `git log --all --diff-filter=D --name-only --format=%H -- '<impls>/**/status.json'`.
- Refuse the CLOSEOUT path while any board deleted in history belongs to a folder that is now gone and not in `0-done/`, unless `--owner-note` names that board.
- If a cap is kept, refuse once it is reached.
- Regression test: cases (a) and (b) above.

#### R3-A1-M6 MEDIUM: the deleted-board check asks the `--repo` repo, not the package's own, so `--repo` elsewhere or a submodule skips it

```
mkpkg $T demo; rm demo/status.json demo/STATUS.md          # tracked board deleted
$AP --repo <empty dir> --dir $T/docs/implementations/demo --closeout-rows rows-drop.json → CLOSED_MOVED ../t-x1/…/0-done/demo
$AP --repo <unrelated git repo> --dir <same, absolute> …                                 → CLOSED_MOVED
package inside a submodule (board deleted and committed in the submodule):
$AP --repo <outer repo> --dir docs-sub/docs/implementations/demo …                        → CLOSED_MOVED
doc-it check archive --root $T → all lists empty, exit 0
```

All three got through.
- `deletedBoard` runs `rev-parse --show-toplevel` in `root` (the `--repo` value). It returns null when that fails, or when the package's path relative to it starts with `..`.
- `locate` accepts an absolute `--dir` anywhere, and git does not list a submodule's files from the outer repo.
- The move happens in the package's real repo, so a tracked, deleted board reaches `0-done/` and the archive check reports it clean.

Fix:
- Take the git top from `git -C <pkg.dir> rev-parse --show-toplevel`. That is the innermost repo, so it covers submodules.
- Refuse (USAGE) when `pkg.dir` is not inside `--repo`.
- Run the history checks with `--all`.
- Regression test: the three commands above must be DENIED.

#### R3-Q1-M6 MEDIUM: a forged SAFE.md survives a `--restart` from a tampered or missing state, and `status` then exits 0

```
legit chain → PUBLISHABLE (SAFE 1: C1; DO-NOT-PUBLISH 1: C2)
edit audit/SAFE.md: C2 into SAFE, DO-NOT-PUBLISH → none
(a) echo " " >> audit/chain-state.json; $C start claims.md --auditor-model sonnet --restart … → AUDITING
    kept_published: none; $C status --ledger claims.md → "state AUDITING", exit 0
(b) rm audit/chain-state.json audit/chain-state.sha256; $C start claims.md --auditor-model sonnet … → AUDITING
    $C abort → "ABORTED → LEDGER_READY"; $C status → "state LEDGER_READY (rolled back …)", exit 0
SAFE.md still lists C2 as SAFE, and its "Ledger sha256" matches the unchanged ledger
```

This got through.
- SKILL.md tells every consumer to act on SAFE.md only when `status` exits 0. It also says a restart keeps the published files, and §3.2 ROLLBACK says "the last published version stays".
- `start --restart` accepts a tampered state. It then drops `kept_published`, because the old digest fails. A plain `start` with no state does the same.
- After that, `status` never looks at the SAFE.md on disk. The forged file becomes the trusted "last published version", and FALSE claims are presented as safe to repeat.
- This needs a hand edit of SAFE.md, plus a second hand edit (state tampered or deleted), so it is MEDIUM.

Fix:
- When `start` finds published files in `audit/` that no valid `published` or `kept_published` hash covers, it moves them to `audit/.unbound-<time>/` or refuses.
- `status` exits 1 with `PUBLISHED_UNBOUND` whenever SAFE.md exists and no recorded hash covers it.
- Regression test: cases (a) and (b) above.

### 3. Attacks on the round-2 fixes that held

- **S1 strict rows versus explicit `gate stop --run`.** Counting unattributed rows on the explicit path only adds open rows; it never frees a stop. The cost is the wrong state in R3-S1-M6.
- **Multi-run gate:**
  - A newer VERIFYING run with every row closed does not hide an older run with open rows (`STOP_REFUSED run_id:<A1>`).
  - When the run with open rows is in VERIFYING and the other run is PARKED → refused.
  - With both runs making no progress, the spine parks each run when it reaches patience.
  - The cwd fallback for a session-less run, from a subfolder → refused.
- **`loadState`.** A copied `runs/<A>z` is refused as `run_id_mismatch` (the fix report's case).
- **conclude-it rename follow:**
  - Detached HEAD with a rename → DENIED.
  - Linked worktree, with the board deleted in place or renamed → DENIED.
  - A folder with the same name recreated after the package was deleted → DENIED.
- **doc-it `repo@sha`:**
  - An unknown repo, or a sha missing from the named repo, is refused.
  - `#0`, `#01` and `#1234567` are refused.
  - `--repos` must point at a repo's top folder (it is checked with `realpath`).
  - Names are lowercased before lookup. On a case-insensitive disk the sibling lookup finds the same folder, and on a case-sensitive one a miss fails closed.
- **review-it family binding:**
  - `o-p-u-s` and `ｏｐｕｓ` with no declaration → `unknown model family`.
  - `opus` followed by an invisible joiner character → G-6 refusal.
  - `OPUS` → G-6 refusal.
  - An empty `--auditor-model` → usage error; a blank one → `empty model id`.
- **PUBLISHED_TAMPERED:**
  - An edited SAFE.md, or a missing one → exit 1.
  - A deleted state → exit 2 ("no audit chain state").
  - An untampered `--restart` carries `kept_published`, and a later edit is caught.

### 4. LOW

| ID | Finding | Suggested fix |
|---|---|---|
| R3-L1 | `#1`, `owner/repo#1` and `http://a.b` count as shipped evidence on format alone (documented offline limit). `#1` is as cheap to write as round 1's `"yes"` | Resolve `#n` with `gh` when it is available and print `[skip]` when it is not; or require a sha or path next to a `#n` |
| R3-L2 | A sha that resolves is not proof that the piece shipped. Any old commit of `--root` passes, and so does `<planted sibling repo>@<sha>` or a branch named like hex (`git branch deadbeef`) | Require `merge-base --is-ancestor <sha> origin/<default>` in a repo whose origin matches the name |
| R3-L3 | `git checkout --orphan` hides the board's history from `git log` (the old branch still has it) | Use `--all` in every history lookup (folded into the R3-A1-M5 and M6 fixes) |
| R3-L4 | With a declaration, lookalike ids are accepted: `o-p-u-s`, Greek `οpus`, fullwidth `ｏｐｕｓ`, `claude-0pus-5-5`, `claude-opu5-5-5`, `o pus`. This is inside the Q1-L1 trust boundary, but a host that falls back to its default model for an unknown id would run the author's model | NFKC-normalise; refuse ids that are not ASCII; refuse ids within edit distance 1 of a family name unless they are known |
| R3-L5 | A package that holds only its board can be renamed and emptied with nothing left to follow (documented residual). Removing the marker line of an uncommitted STATUS.md reopens CLOSEOUT outside git (the R2-L2 residual) | Covered by the R3-A1-M5 history query when the board was ever committed |
| R3-L6 | Renaming a run folder makes `loadState` refuse it as `run_id_mismatch`. If it was the owner's only run, the hook fails open (`state unreadable`). This is the S1-L3 tampering class | None beyond S1-L3; `status` already lists it in `unreadable_runs` |
| R3-L7 | A legacy run re-bound by `resume` gets an owner and re-seeds 10 new rows, so it starts again at `intake` (from the fix report's open list; fails closed) | Record `owner.adopted_legacy: true` on the re-bind and keep adopting |

### 5. Suites (detached worktrees at the shas above)

| Repo | Command | Result |
|---|---|---|
| do-it | `.taskstate/1.1/run-suites.sh <tree>` with `DO_IT_PILOT_DOIT=<pilot>/.do-it` and `DOIT_STATUS_WRITE` set | **EXIT 0, green.** core/spine 149/149; T-S1-06 [REAL] ran on the pilot copy and passed. hosts/engine 36: 29 pass, 7 skip. tests/plugin 17: 16 pass, 1 skip. e2e r4 26: 25 pass, 1 skip. Every other folder passes in full |
| build-it | `tests/lints/run-all.sh`; `t20-release.sh`; `node --test tests/status tests/checkpoints` | ALL LINTS + UNIT TESTS GREEN; T20 PASS; 218 tests: 217 pass, 0 fail, 1 skip |
| conclude-it | `npm test` with `DOIT_STATUS_WRITE` and `DOC_IT_CLI` | 46 tests: 46 pass, 0 fail, 0 skip |
| doc-it | `npm test` with `DOC_IT_PILOT_HOME` and `DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256` | 39 tests: 39 pass, 0 fail, 0 skip. T-K1-02 [REAL] ran its identity check |
| review-it | `node --test 'tests/**/*.test.mjs'` with `DOC_IT_CLI` and `PLAN_IT_GATE_CHECK` | 59 tests: 59 pass, 0 fail, 0 skip |

Skips:
- do-it hosts/engine (7): T-N3-01, 02, 03, 11, 12 and 13 skip because `DO_IT_PILOT_REPO` is not set. T-R4-05 [REAL] skips because no live server URL is set.
- do-it tests/plugin (1): T-R2-06 [REAL] skips because the sibling repos are not next to the scratch worktree.
- do-it e2e (1): T-R4-02 [REAL] skips because `DOIT_REAL_CALLS` is not set.
- build-it (1): AT-21, an existing skip.

The review-it suite leaked 25 `rev-sync-*` dirs into `$TMPDIR` again (the known leak). They were removed.

### 6. Summary of attacks that got through

| ID | Sev | Gate | One line | Fix owner |
|---|---|---|---|---|
| R3-S1-H5 | HIGH | §3.1 / G-1 | the host hook's own patience counter ignores progress and parks only `json.run_id`, so the stop is allowed while another owned open run was never parked | do-it hosts/claude-code (+ plugin mirror) |
| R3-S1-H6 | HIGH | §3.1 / G-1 / G-13 | `gate advance` → DONE (or NEEDS_HUMAN, BLOCKED …) skips `gate conclude`, and the stop is then allowed with 0 of 10 rows closed | do-it spine |
| R3-S1-H7 | HIGH | §3.1 / G-1 | the hook finds runs only in the cwd's repo, so a stop made from a sibling repo or the parent folder is allowed | do-it spine + hosts |
| R3-S1-M6 | MEDIUM | §2.1 | the views count unattributed rows, so on a legacy board with open rows a 1.1 run can never reach FINISH_LINE_REACHED or conclude, while the hook says nothing is open | do-it spine |
| R3-A1-M5 | MEDIUM | G-2 | the rename follow is beaten by the 300-file cap, or by a rename made together with an edit | conclude-it |
| R3-A1-M6 | MEDIUM | G-2 | the deleted-board check uses `--repo`'s repo, so `--repo` elsewhere or a submodule skips it | conclude-it |
| R3-Q1-M6 | MEDIUM | §3.2 | a forged SAFE.md survives a restart from a tampered or missing state, and `status` exits 0 | review-it |

Re-run condition: each of the seven above is fixed, with a regression case that replays the commands shown and asserts a refusal. Then CP-03 runs again on the fixed trees.

---

## Round 2 (2026-11-08, FAIL)

Reviewer: a fresh opus reviewer. It built none of the code under review and did not write round 1. Every attack ran in temp repos under the session scratchpad, against `git archive` copies of each fixed tree. The suites ran in detached worktrees, and those worktrees were removed afterwards. No repo was edited. The pilot was only read, and the one suite case that needs it also ran on a scratch copy.

Trees attacked (branch heads, not pushed):
- do-it `fix/cp03-stopgate` @ b5d257d. Rebuilding `core/spine/do-it.mjs` from `core/spine/src` gives a byte-identical bundle, so the bundle tested is the source.
- build-it `release/1.1-family` @ 6fa7851 (`status-write.mjs`).
- conclude-it `release/1.1-family` @ 65f1529 (`archive-package.mjs`).
- doc-it `fix/cp03-closeout` @ 91aaa37.
- review-it `epic/Q1-audit-mode` @ c6f8245 (`audit-chain.mjs`).

Env: `DOIT_STATUS_WRITE` and `DOC_IT_CLI` point at the copies above. `SP`, `W`, `AP`, `C` and the package setup are the same as in round 1. `--repos review-it=<review-it Q1 tree>` is used where a chain cites shas.

Severity scale: as in round 1. Forgery that rewrites every file and its hash, and 1.0-era hand tampering of `.do-it/`, are known LOW limits.

**Result:**
- All 11 round-1 HIGH and MEDIUM attacks were replayed exactly, and all 11 held.
- Attacking the fixes found 2 new HIGH and 4 new MEDIUM, all of which got through.
- 11 LOW were found.
- The verdict is FAIL.

### 1. Round-1 replays (each re-run as written)

| ID | Result | Output on the fixed tree |
|---|---|---|
| S1-H1 | held | `gate stop --session sess-B` → `STOP_REFUSED owned:true open:[intake … conclude]`. B's `next` → `wave: intake` |
| S1-H2 | held | `resume --session sess-B` → `NOT_PARKED` on B's own run. A stays the owner |
| S1-M1 | held | tampered newer A2 → `STOP_REFUSED run_id:<A1> open:[R1] unreadable:[<A2>]` |
| A1-H1 | held | hand-set `closed:true` → archive-package `REJECTED … closed is true but no "close" history entry backs it`. `status-write close --move` is refused the same way. A bare `mv` into 0-done makes `check archive` report `done_closed_unverified`, exit 1. Editing a real freeze (PARTIAL_FAILED from the crash hook, then a title change) → `board_sha256 … does not match`, nothing moved |
| A1-H2 | held | `waves: []`, `status-write close --move` → `close refused: the board has no tasks` |
| A1-M1 | held | tracked board deleted → `DENIED: board deleted … is tracked at HEAD`. Deleted in an older commit → `DENIED … existed in commit <sha>` |
| A1-M2 | held | `"yes"` → `FAIL … shipped evidence must cite something checkable`. `"."` (dropped) → `FAIL … at least 3 words` |
| Q1-H1 | held | `opusplan`, `claudeopus` → `G-6 … is the author's model`. `best` → `host pointer, not a model` |
| Q1-M1 | held | `nosuchrepo@deadbeef00` → `unchecked`; `` `echo TRUE` `` → `cites no repo@sha and no command`. The second miss leads to `ESCALATED_TO_OWNER` |
| Q1-M2 | held | forged state → `STATE_TAMPERED … does not match its digest`. With the digest recomputed through the exported `chainDigest` → `STATE_TAMPERED: the ombudsman was asked to rule on no rows` |
| Q1-M3 | held | C2 rewritten and C3 appended → `LEDGER_CHANGED … changed since start`. `status` exits 1 |

### 2. Attacks on the fixes that got through

#### R2-S1-H3 HIGH: a run on a board with older unattributed rows gets no rows, so its owner's stop is allowed

```
# finish-line.json from a 1.0.x run: the 10 feature step ids, no run_id, all DONE except verify
B=$($SP start --preset feature --request new-work --session sess-B --json | jq -r .run_id)
$SP next --run $B           → {"outcome":"NEXT","action":"SPAWN","wave":"verify"}      # intake..build skipped
board after next            → 10 rows, every run_id null (nothing seeded, nothing adopted)
$SP gate stop --session sess-B --cwd $PWD
                            → {"outcome":"STOP_ALLOWED","owned":true,"reason":"no open rows for this run","board":"FINISH LINE: 0 of 0 closed"}
# same board with every row DONE: next → FINISH_LINE_REACHED for a run that just started (INTAKE)
```

The attack got through. It needs no hand edit. The rows are simply what a 1.0.x run left on the board.
- `nextWave` (next.mjs:52) seeds only `if (!hasRow(fl, id, runId))`, and readiness.mjs:144 and :201 do the same.
- `findRow` falls back to an unattributed row, so a row from the old run counts as the new run's own. The new run therefore seeds nothing.
- The hook path is strict: `rowsForRun(…, false)` ignores unattributed rows, so the run has zero rows and its stop is allowed while it is active.
- The waves follow the old run's states. The new run starts at the old run's first OPEN wave, or is told the finish line is already reached.

This is S1-H1 again, on the upgrade path. CONTRACT §2.1 says "Finish-line rows carry `run_id`", and this run's rows do not. It is realistic: the read-only pilot board has 475 rows, every one without a `run_id`, including all 10 `feature` step ids (461 DONE). So the first 1.1 `feature` run in that repo would never gate.

Fix:
- Seeding guards and `rowOf` look only at the run's own rows: `fl.rows.some(r => r.id === id && r.run_id === runId)`.
- A run that has an `owner` object (a 1.1 run) never adopts an unattributed row, so leave the fallback in `findRow` only for runs with no owner.
- `record` stays as is: it writes rows tagged with its own `run_id`.
- Add a T-S1-05c case: a legacy board with the same step ids, a new run seeds its own 10 rows, `next` starts at `intake`, and the owner's hook stop is refused.

#### R2-S1-H4 HIGH: a newer owned run with no open rows hides an older owned active run that has open rows

```
A1=$($SP start --preset feature --request a --session sess-A --json | jq -r .run_id); $SP next --run $A1   # 10 OPEN rows
A2=$($SP start --request quick-question --session sess-A --json | jq -r .run_id)                          # INTAKE, no rows
$SP gate stop --session sess-A --cwd $PWD
→ {"outcome":"STOP_ALLOWED","owned":true,"run_id":"<A2>","reason":"no open rows for this run"}
```

The attack got through with one ordinary command and no hand edit. The S1-M1 fix walks `ranked` only past unreadable runs. It gates on the first readable owned run, and allows the stop when that run has no open rows. A1 is active, owned by the hook's session and has open rows, so §3.1 row 1 says the stop must be refused. Any owner can switch off its gate by starting a second run, and nothing downstream notices. A newer run that is still VERIFYING with all its rows closed has the same effect.

Fix:
- On the hook path, gather the open rows of every readable owned run whose status gates.
- Refuse when any of them is open, and name the runs: `open: {<run>: [ids]}`.
- Count patience and park per run, so the run reaching patience is parked and the others are not.
- Add a regression case with the two commands above.

#### R2-A1-M3 MEDIUM: a deleted tracked board escapes the git check through a rename or a change of letter case

```
# (a) rename and delete in one commit
git mv docs/implementations/demo docs/implementations/demo2; git rm -f demo2/status.json demo2/STATUS.md; git commit
$AP --repo $ROOT --impl demo2 --closeout-rows rows-drop.json   → CLOSED_MOVED docs/implementations/0-done/demo2
doc-it check archive → all lists empty, exit 0
# (b) uncommitted mv + rm                                       → CLOSED_MOVED docs/implementations/0-done/demo3
# (c) case-insensitive filesystem (macOS default): board tracked as demo/, deleted
$AP --repo $ROOT --dir docs/implementations/DEMO --closeout-rows rows-drop.json → CLOSED_MOVED docs/implementations/0-done/DEMO
```

All three got through. `deletedBoard` asks git about the literal path `<dir>/status.json`. A rename leaves that path with no history. On macOS, `--dir …/DEMO` opens the real `demo/` folder, but git's pathspec `DEMO/status.json` is case-sensitive and matches nothing. Each case is still a deleted board, which is a hand edit, so this is MEDIUM. With (a), `git status` is also clean.

Fix:
- Resolve `pkg.dir` with `fs.realpathSync.native` before building `rel`, which gives the true case.
- Follow renames. For each tracked file in the package, `git log --follow --name-only --format= -- <file>` lists its past folders. Refuse when any past folder ever held a `status.json` (`git log -1 -- <past>/status.json`).
- Refuse when `git status --porcelain` shows a deleted `status.json` anywhere under the implementations root.

#### R2-A1-M4 MEDIUM: `repo@sha` and `#n` evidence is never resolved, so fakes still close a package

```
shipped "foo@deadbee1"                         → CLOSED_MOVED   (no repo foo, no such sha)
shipped "#0" / "#999999" / "nobody/nothing#1"  → CLOSED_MOVED
shipped "http://a.b"                           → CLOSED_MOVED
shipped "<real sha of another repo>"           → REJECTED (held: bare shas are resolved in --root)
```

The attack got through. The A1-M2 fix resolves a bare sha with `git cat-file -e`, but `<anything>@<hex7+>` is accepted on format alone. `foo@deadbee1` is as cheap as round 1's `"yes"`, and doc-it's own template says "repo@sha" counts as checkable. `#0` can never be a real PR or issue. A URL with a dotted host stays format-only, because doc-it is offline (LOW).

Fix:
- Resolve `repo@sha` as review-it does. The repo is the `--root` repo when the name matches its folder or remote, or a sibling folder, or one named by a `--repos name=path` flag. Refuse when the sha does not resolve or the repo is unknown.
- Refuse `#0`.
- Optionally, look up `#n` with `gh` when it is available, and print a `[skip]` line when it is not.

#### R2-Q1-M4 MEDIUM: `--model-family` can relabel an id that names the author's family

```
$C start claims.md (Author model: opus) --auditor-model opus-xl --model-family gemini
→ ledger 2 rows; author opus; auditor opus-xl; ombudsman opus; state AUDITING
$C start … --auditor-model claude-opus-research --model-family sonnet → state AUDITING
(held: opus-xl alone → unknown family; sonnet --model-family sonnet=opus → "contradicts the known family")
```

The attack got through. `resolveFamily` treats an id as "known" only when every word after the family word is a version or tier word. `opus-xl` and `claude-opus-research` both start with `opus`, but their last word is not on the list, so a declaration of any family is accepted. G-6 then compares gemini or sonnet with opus and lets the auditor through. The fix report says "a declaration cannot relabel a known alias", but here it does. MEDIUM, not HIGH: the label is supplied by the caller, which is the Q1-L1 trust boundary, and the id still shows in SAFE.md.

Fix:
- When any word of `familyWords(id)` is a family or an alias, the family is fixed to that word. A declaration must equal it, and is refused otherwise.
- Refuse an id that contains two different family words.
- Add `opus-xl` and `claude-opus-research` with a `sonnet` declaration to Q1-H1, and assert a refusal.

#### R2-Q1-M5 MEDIUM: a hand edit of the published SAFE.md is not detected

```
legit chain → PUBLISHABLE; SAFE (1): C1; DO-NOT-PUBLISH (1): C2 (FALSE)
edit audit/SAFE.md: move C2 into SAFE, DO-NOT-PUBLISH → none
$C status --ledger claims.md → "state PUBLISHABLE … published …: SAFE 1, DO-NOT-PUBLISH 1", exit 0
```

The attack got through. SKILL.md says "Never edit `audit/chain-state.json` or the published files by hand", and it says readers check SAFE.md's ledger sha256 ("`status` does this"). Nothing binds the published files, though. `status` prints the lists from the state and never re-reads SAFE.md. SAFE.md is the file consumers act on ("only SAFE rows may be repeated as fact"). Round 1 graded this class MEDIUM for chain-state (Q1-M2).

Fix:
- At publish, store the sha256 of each published file in `st.published.files`. The chain digest already covers `st`, so this binds them.
- `status` re-hashes the files and exits 1 with `PUBLISHED_TAMPERED` on a mismatch.
- Any consumer (plan-it handoff) checks the same digest along with the ledger sha256.

### 3. Attacks on the fixes that held

- `resume --take-over` without `--run`: USAGE. `--take-over` with no session: NOT_PARKED, nothing re-bound. A self take-over is NOT_PARKED. A missing `events.jsonl` is recreated and the `owner_taken_over` event is written. An `owner.history` that is not an array is replaced by a fresh array.
- A caller that owns nothing gets OWNED_BY_OTHER_SESSION. A caller with no session never re-binds.
- Ranking with a tampered newer run: the gate goes on to the older readable run.
- status-write freeze:
  - a hand-set `closed:true`, a close entry with no digest, and an edit after a real freeze are each refused (status-write, S4 and doc-it);
  - a task history entry appended after the close entry: `validate` reports both a digest mismatch and "reset by hand?";
  - an empty board is refused without a note.
- conclude-it: a board removed in an older commit with later commits on top is DENIED. Pointing `--repo` at a subfolder is still DENIED.
- doc-it CLOSEOUT:
  - a bare sha from an unrelated repo, `.`, `docs`, `/etc/hosts` and `plan.json` are refused as shipped evidence;
  - `a1 b2 c3` is refused as a dropped reason;
  - a `carried` row with no link is refused.
- review-it model ids:
  - case and spacing (`OPUS`, ` Sonnet `), provider prefixes (`bedrock/anthropic.…`, `eu.anthropic.…-v1:0`), `@date` and `opus4.8` all resolve correctly;
  - unknown ids (`o-p-u-s`, `s0nnet`, `projects/x/models/…`, `sonnet-opus`) fail closed;
  - `--model-family` cannot relabel a fully known id or the author.
- `--repos ""` and `Repos: =x` are refused or ignored. With no repos, every cited sha is `unchecked`, which counts as uncovered.
- Q1 partial rewrite: a forged state with a recomputed digest is refused (no rows asked, no recorded auditor file). A full rewrite of every copy, hash and digest is the documented LOW limit.

### 4. LOW

| ID | Finding | Suggested fix |
|---|---|---|
| R2-L1 | `resume --run <id> --take-over` lets any session take a live, active run. The old owner's stop is then allowed (`owned:false`). It is explicit and logged, gives no more power than `park`, and the contract can't tell `/clear` from a live session. But `status` and `handoff` never show it. | `status` prints the last `owner.history` take-over; `conclude` lists take-overs |
| R2-L2 | When a board was never committed, or the package is outside git, deleting `status.json` opens the CLOSEOUT path (`CLOSED_MOVED`). git has no record of the board. | Refuse the CLOSEOUT path when the package holds `plan.json` or `STATUS.md` |
| R2-L3 | The close entry's `note` is not covered by `board_sha256`, so the owner-note text can be rewritten after the freeze. This adds to A1-L2. | Include the close entry minus `board_sha256` in the digest |
| R2-L4 | `dropped` accepts `no no no`, `it is it`, `xx yy zz`. That meets the 3-word rule the contract chose. | Require 3 distinct words |
| R2-L5 | A data command with no sha (`` `ls` ``, `` `cat /dev/null` ``) counts as evidence. This is the documented M1 residual, and the ombudsman rules on content. | Require a sha or a path argument for `cat` and `ls` |
| R2-L6 | `--repos` and `Repos:` are declared by the host. `review-it=<do-it tree>` makes a do-it sha "verify" a review-it claim. `Repos: x=` resolves to the ledger's folder, and `git -C` then walks up to any enclosing repo. This is the Q1-L1 boundary. | Check that the repo's remote or folder name matches the repo name in the citation |
| R2-L7 | An empty `Repos:` header reports `got "\|"`, because it reads the next line. It fails closed, so this is cosmetic. | Match the header line with `[^\n]*` |
| R2-L8 | `LEDGER_CHANGED` fires on whitespace-only changes and on reordered rows. That fails closed and forces a restart. | None needed; document it |
| R2-L9 | doc-it `archive_since: "2099-01-01"` puts every boardless archive package into `legacy_count`, and the check reports `clean`, exit 0. It is a config edit. | Refuse a date later than today |
| R2-L10 | S1-L3 is still open. A copied `runs/<A>z` with the same `run_id` wins the tie (`STOP_ALLOWED owned:true run_id:<A>z`). This is 1.0-era tampering. | `loadState` refuses when the folder name differs from `state.run_id` |
| R2-L11 | T-S1-06 [REAL] hard-codes "the pilot has 4 runs". The pilot gained a 5th (PARKED) run at 2026-11-08T15:39Z, so the do-it suite is red with the pilot env (see §5). | Assert at least 4 runs and check each run's properties, or pin a snapshot of the pilot |

### 5. Suites

| Repo | Command | Result |
|---|---|---|
| do-it | `node --test <dir>/*.test.mjs` for each test folder in the run-suites list, with `DO_IT_PILOT_DOIT` and `DOIT_STATUS_WRITE` set | **one red case**: core/spine/test/s2 has 70 tests, 69 pass and 1 fails. T-S1-06 [REAL] fails with `5 !== 4` because the pilot drifted (R2-L11). tests/hosts T-E1-02 fails for the same reason. Run on a scratch copy of the pilot without today's run, T-S1-06 passes. Everything else passes, apart from the skips below. |
| build-it | `tests/lints/run-all.sh`; `t20-release.sh`; `node --test tests/status tests/checkpoints` | lints green, T20 green, 217 tests: 216 pass, 0 fail, 1 skipped |
| conclude-it | `npm test` with env | 39 tests: 39 pass, 0 fail, 0 skipped |
| doc-it | `npm test` with `DOC_IT_PILOT_HOME` set to the pilot plan home | 33 tests: 33 pass, 0 fail, 0 skipped. T-K1-02 [REAL] ran; it checked the count but not the identity, because the expected sha256 was not set |
| review-it | `node --test 'tests/**/*.test.mjs'` with `PLAN_IT_GATE_CHECK` | 51 tests: 51 pass, 0 fail, 0 skipped |

Skips:
- do-it, the pilot host-integration suite (7 skips): T-N3-01, 02, 03, 11, 12 and 13 skip because `DO_IT_PILOT_REPO` is not set. T-R4-05 [REAL] skips because no live server URL is set.
- do-it tests/e2e: T-R4-02 [REAL] skips because `DOIT_REAL_CALLS` is not set.
- do-it tests/plugin: T-R2-06 [REAL] skips because the sibling repos sit next to the real tree, not next to the scratch worktree.
- build-it: AT-21 is an existing skip.

Not counted:
- `hosts/_interface` T-H0-03 failed only because my `TMPDIR` was inside the scratchpad. It passes (18 of 18) with the default `TMPDIR`.
- The mirror tests under `plugins/do-it/{personas,pipelines}` fail in place: they look for `plugins/delivery/CONTRACT.md`. This branch does not touch them, and they are not in the fixers' suite list.

### 6. Summary of attacks that got through

| ID | Sev | Gate | One line | Fix owner |
|---|---|---|---|---|
| R2-S1-H3 | HIGH | §2.1 / §3.1 / G-1 | on a board with older unattributed rows, a new run seeds no rows, so its owner's stop is allowed (the pilot board is in this state) | do-it spine |
| R2-S1-H4 | HIGH | §3.1 / G-1 | a newer owned run with no open rows hides an older owned active run that has open rows | do-it spine |
| R2-A1-M3 | MEDIUM | G-2 | a deleted tracked board escapes the git check through a rename or a case change | conclude-it |
| R2-A1-M4 | MEDIUM | G-2 / G-10 | `foo@deadbee1` and `#0` pass as shipped evidence | doc-it |
| R2-Q1-M4 | MEDIUM | G-6 | `--model-family` relabels `opus-xl` or `claude-opus-research` as another family | review-it |
| R2-Q1-M5 | MEDIUM | §3.2 | a hand edit of SAFE.md is not detected; `status` reads only the state | review-it |

Re-run condition: each of the six above is fixed, with a regression case that replays the command shown and asserts a refusal. R2-L11 is fixed so the do-it suite is green with the pilot env. Then CP-03 is run again on the fixed trees.

---

## Round 1 (2026-11-07, FAIL)

Reviewer: an independent opus reviewer. It built none of S1, A1 or Q1. Date: 2026-11-08. This file is the only one written. Every attack ran in temp repos under the session scratchpad. The code under test came from detached worktrees or copies, and no repo was edited.

Trees attacked:
- do-it origin/main @ e51b44a (detached worktree). Rebuilding `core/spine/do-it.mjs` from `core/spine/src` left the tree clean, so the bundle tested is the source.
- build-it origin/main @ 656d91d (`plugins/build-it/scripts/status/status-write.mjs`).
- conclude-it origin/main @ ae28879 (`archive-package.mjs`, `ledger-card.mjs`, `docit-locate.mjs`).
- review-it epic/Q1-audit-mode @ 74245a3, a copy of `plugins/review-it/`.
- doc-it working tree @ e1c1da0. The brief named 426a858, but main has moved one commit, to e1c1da0, which tightens the `carried` link check. None of the CLOSEOUT findings below depend on that commit.

Severity scale: HIGH means a false pass of a governance rule with no detection downstream. MEDIUM means a wrong state, or a false pass that needs a hand edit the system says it rejects. LOW means cosmetic, or behavior the contract chose on purpose.

Result: 5 HIGH, 6 MEDIUM, 9 LOW. The rule says PASS only if no HIGH or MEDIUM attack succeeds, so the verdict is FAIL.

---

### 1. Stop gate (S1, G-1, §3.1)

Setup for every case: `SP="node <do-it>/core/spine/do-it.mjs"`, a fresh `git init` temp repo, and `DO_IT_SESSION_ID` and `DO_IT_SESSION_ENV` unset unless stated. The hook path is the call `stop-gate.mjs` makes: `gate stop --session <id> --cwd <repo> --json`.

#### S1-H1 HIGH: two runs that share finish-line row ids. The second owner's active run never gates.

```
A=$($SP start --preset feature --request a --session sess-A --json | jq -r .run_id); $SP next --run $A
B=$($SP start --preset feature --request b --session sess-B --json | jq -r .run_id); $SP next --run $B
# finish-line.json: intake, prompt, plan, ratify, build, verify, review, deploy, prove, conclude — every row run_id = A
$SP gate stop --session sess-B --cwd $PWD --json
→ {"outcome":"STOP_ALLOWED","owned":true,"run_id":"<B>","reason":"no open rows for this run","board":"FINISH LINE: 0 of 0 closed"}
```

The attack got through. Run B is active (INTAKE) and owned by sess-B, and its owner's stop is allowed. That is a false pass of §3.1 row 1 (owner and active run, so the stop must be refused). The rows are keyed by `id` across the whole board. `nextWave` (next.mjs:52), `cmdReadiness` (readiness.mjs:144, 201) and `finishLineUpsert` all skip or patch an existing row with the same id, so the second run gets no rows of its own. `rowsForRun` (finish-line.mjs) then filters by `run_id`, and B has none. Two runs of the same preset always collide on their pipeline step ids. Two plans with the same slice ids (S1, A1 and so on) collide on their slice rows. Reading next.mjs:57 also shows a side effect: B's waves follow A's row states, so a wave A closed is skipped for B. In 1.0.x the board was not scoped by run, so B would have been gated by every row. The scoping added in 1.1 is what opened this hole. T-S1-05 passes only because its two runs use distinct row ids.

Fix: make row identity `(run_id, id)`. `finishLineUpsert(fl, id, patch, runId)` should find `r.id === id && (r.run_id || null) === (runId || null)`. The seeding guards in next.mjs and readiness.mjs and the lookups `rowOf` and `rowClosed(rowOf(n))` should be scoped to the run in the same way. Add a T-S1-05b with two runs of one preset: each owner is refused on its own rows only, and B's `next` starts at `intake`.

#### S1-H2 HIGH: `resume` from another session takes over an active run with no warning.

```
B=$($SP start --request b --session sess-B); sleep 1; A=$($SP start --request a --session sess-A)   # A newest, active
$SP resume --session sess-B --json          # B meant its own run
→ {"outcome":"REBOUND","run_id":"<A>","status":"INTAKE","owner":{"session_id":"sess-B",...}}
hook sess-A → STOP_ALLOWED owned:false      hook sess-B → STOP_REFUSED owned:true (A's rows)
```

The attack got through. `cmdResume` picks its run with `selectRunId`, which takes the newest run and ignores ownership. If that run is not PARKED, `rebind()` hands it to the caller anyway (resume.mjs:22-28). The result is that session A's active run lets A stop (a false pass of §3.1 row 1), and session B is refused on a run it never started (§3.1 row 3 breaks: a non-owner is refused). B's own PARKED run stays parked. SKILL.md step 1 says "Start or resume a run … (or `resume`)" and gives no `--run`, so an agent following the skill does this by accident. The contract allows a rebind only for the `/clear` case (S1-00), where the old session is gone. Nothing here can tell that case apart from a live second session.

Fix:
- `resume` with no `--run` picks with `selectScopedRunId` (runs the caller owns, then null-session runs inside the cwd), not the newest run in the repo.
- Rebinding a run owned by a different, non-null session needs an explicit `--run <id>` plus `--take-over`. The result names the previous owner, and the event says `taken_over`.
- SKILL.md step 1 says to use `resume --run <id>` after `/clear`.
- Add a test where session B runs `resume` in a repo where A's newer run is active: A stays owner, and B is told its own run (or NO_RUN).

#### S1-M1 MEDIUM: an unreadable newer run hides an older, valid active run of the same owner.

```
A1=start --session sess-A; sleep 1; A2=start --session sess-A; board R1@A1 OPEN; echo " " >> runs/A2/state.json
gate stop --session sess-A → STOP_ALLOWED owned:true run_id:A2 reason "state unreadable" state_error STATE_TAMPERED
```

The attack got through. `selectScopedRunId` ranks runs from the raw JSON, so the tampered A2 still parses and wins. `loadState(A2)` then fails, and the gate fails open, even though A1 is readable, active and has an open row. §3.1 fails open for the run whose state is unreadable. It does not fail open for the owner's other runs.

Fix: in `gateStop`, when `loadState` fails for the picked run, log the event and try the next owned gating run. Fail open only when none of them is readable. `selectScopedRunId` could return the ranked list for this.

#### S1-L1 LOW: a stale or explicit `DO_IT_SESSION_ID` outranks the host's live id.

`DO_IT_SESSION_ID=stale-old CLAUDE_CODE_SESSION_ID=real-A DO_IT_SESSION_ENV=CLAUDE_CODE_SESSION_ID start` records `stale-old`, and the real owner's hook is then allowed. `DO_IT_SESSION_ENV=HOME` records `/Users/<user>` as the session. Both follow the §2.1 order, which puts `--session` and `DO_IT_SESSION_ID` first, so the contract chose this. A stale export silently turns the gate off for that run, though.

Fix: when a host variable named in `DO_IT_SESSION_ENV` is set and differs from the id being recorded, put `session_conflict: {recorded, host}` in the `start` output and record `owner.host_session_id`. The hook can then match either id.

#### S1-L2 LOW: a blank session id is recorded.

`start --session "  "` records `"  "`. So does `DO_IT_SESSION_ID=" "`. No hook ever matches that value, so the run never gates. An empty `DO_IT_SESSION_ID=""` falls through correctly to the host variable.

Fix: `resolveSessionId` trims each candidate and skips blank ones. The hook does the same with `input.session_id`.

#### S1-L3 LOW: tampering with `.do-it/` files bypasses the gate. This was already true in 1.0.x.

- Copying `runs/<A>` to `runs/<A>z`: the copy has the same `run_id` inside and a valid sidecar, it wins the tie, and its rows match nothing, so the result is `STOP_ALLOWED owned:true run_id:<A>z`. `loadState` never checks that the directory name equals `state.run_id`.
- Editing a row's `run_id` in `finish-line.json` (or marking it DONE with any evidence) frees the owner's stop. The board has no sidecar.
- A corrupt `state.json` fails open on every stop. §3.1 chose that, and T-S1-08 covers it. Note that the run's own agent can switch off its gate by editing one byte.

Fix: `loadState` refuses when `state.run_id !== dirname`. A digest sidecar for `finish-line.json` would match how state.json is protected. The fail-open rule is the contract's choice: leave it, and put it in the owner notes.

#### Attacks that failed (the gate held)

- A non-owner hits the hook: STOP_ALLOWED with `owned:false` and nothing written (code read plus T-S1-01 and T-S1-10).
- A run whose `owner.session_id` is `""` or `null`, stopped by a session with an id: allowed. The cwd fallback applies only when the hook has no session (§3.1 row 5).
- A legacy run with no `owner`: allowed, and `gate stop --run` still refuses.
- `pack withdraw --by stop-gate`: answered questions (by `answers.json` `n`) and stage questions are untouched. A second run is PACK_NOOP. Without `--run`, any session can withdraw any run's unanswered stop-gate questions. D10 made the command generic, so this is LOW at most.
- Symlinked run folders are followed. They are only reachable by planting files, the same as S1-L3.

---

### 2. Archive (A1, G-2, §3.3)

Setup: `W="node <build-it>/…/status-write.mjs"`, `AP="node <conclude-it>/…/archive-package.mjs"`, `DOIT_STATUS_WRITE=<W>`, `DOC_IT_CLI=<doc-it.mjs>`. Each package is `docs/implementations/demo` with T-1 and T-2 not started, created with `status-write init`.

#### A1-H1 HIGH: setting `closed: true` by hand moves an unverified package through the S4 front door.

```
node -e '…d.closed=true…' status.json          # T-1, T-2 still not-started; no close history entry
$AP --repo $ROOT --impl demo
→ CLOSED_MOVED docs/implementations/0-done/demo
  board already closed; resumed the move (PARTIAL_FAILED recovered)
$W validate --file 0-done/demo/status.json → 'closed is true but no "close" history entry backs it (set by hand?)' exit 1
doc-it check archive --json → {done_unclosed:[], done_without_closeout:[], …} exit 0
```

The attack got through. Both `ledger-card close` (ledger-card.mjs:348-357) and `status-write close --move` (status-write.mjs:363-371) treat `closed === true` as a PARTIAL_FAILED resume and move the folder without checking anything. They do not check verification, the owner note, the close history entry, or `validate`. The validator already knows this board is forged, but the resume path never calls it. Afterwards `doc-it check archive` reports the package clean. The same path covers "PARTIAL_FAILED, then the board is edited before the re-run": after a real freeze, any hand edit (a task set back, an evidence path removed) moves with the folder unchecked.

Fix: in `cmdClose`'s resume branch, before `moveFolder`, require four things:
1. `validate(cur)` is ok.
2. The last `task:'*'` history entry is `to:'closed'` by `conclude-it`.
3. Either every task is `verified`, or that close entry carries a non-empty note.
4. The board has not been written since that entry: `updated_at` is not after the entry's `at`, or the board's digest is stored in the entry.

`ledger-card close` should also stop trusting `closed` and call status-write. Separately, `doc-it check archive` should run the board validator, or at least require a close history entry, so that it reports `done_unclosed` for a board where only the flag says closed.

#### A1-H2 HIGH: an empty board closes with no owner note when status-write is called directly.

```
status.json with waves: [] → $W close --by conclude-it --move --file status.json
→ closed and moved to …/0-done/demo   (exit 0)
$AP --repo … --impl demo (same board) → REJECTED: … has no tasks on its board … pass --owner-note
```

The attack got through. Zero tasks counts as "all verified" in `status-write close`. Only the conclude-it wrapper refuses it. CONTRACT §2.2 says "build-it keeps `status-write close` (the board writer)", and `--by conclude-it` is a value the caller asserts, so this writer is itself a door into `0-done/`. Downstream, `doc-it check archive` sees a closed board and reports nothing.

Fix: move the empty-board refusal into `status-write cmdClose`: `if (!allTasks(doc).length && !nonEmpty(flags['owner-note'])) refuse`. Add a case to tests/status for it.

#### A1-M1 MEDIUM: deleting a tracked `status.json` sends an unverified package down the CLOSEOUT path.

```
git commit (board with T-1, T-2 not-started); rm status.json STATUS.md
$AP --repo … --impl demo --closeout-rows rows.json   # [{"piece":"Core","disposition":"shipped","detail":"yes"}]
→ CLOSED_MOVED docs/implementations/0-done/demo ; doc-it check archive → clean
```

The attack got through. `archive-package` picks its branch from whether `status.json` exists in the working tree. A board that git still tracks at HEAD (or that ever existed) is ignored. This is a hand edit, and the deletion shows in `git status`, which is why it is MEDIUM. Nothing in the chain detects it, though.

Fix: when `status.json` is missing, run `git log --format=%H -1 -- <pkg>/status.json` (or `git ls-files`). If a board was ever tracked, refuse the CLOSEOUT path with "the package had a board; restore it and use the guarded close, or close with --owner-note". `doc-it check archive` can flag the same case, as `done_board_removed`.

#### A1-M2 MEDIUM: any non-blank text counts as `shipped` evidence or a `dropped` reason.

```
rows [{"piece":"Core","disposition":"shipped","detail":"yes"}]   → ok: 1 piece(s), CLOSED_MOVED
rows [{"piece":"Core","disposition":"dropped","detail":"."}]     → CLOSED_MOVED
rows [{"piece":"Core","disposition":"dropped","detail":""}]      → REJECTED (held)
CLOSEOUT with zero rows                                          → REJECTED (held)
```

The attack got through for "yes" and ".". The template promises "merged PR, sha reachable from the default branch, or deploy record", but `lintCloseout` only rejects blanks and placeholders. "One row per piece" is never checked against the program's pieces, so a single row can cover a whole package.

Fix (in doc-it, G-10):
- `shipped` evidence must contain a sha (`[0-9a-f]{7,40}`), a PR reference (`#\d+` or a PR URL) or a deploy/record path.
- With `--root`, the sha must resolve: `git cat-file -e <sha>^{commit}`, and ideally `merge-base --is-ancestor` with the default branch.
- `dropped` needs at least a few words, for example 3 or more word characters.
- When the package has a PRD, epics or a `plan.json` listing pieces, the CLOSEOUT must have a row for each one.

#### A1-L1 LOW: a symlinked package dir

`status-write close --move --owner-note n` renames the symlink into `0-done/`, and the real content stays outside the archive. This needs an owner note, so it is not a false pass.

Fix: refuse `--move` when `lstat(dir).isSymbolicLink()`.

#### A1-L2 LOW: the owner note is not authenticated

Any non-blank `--owner-note` given by the agent unlocks an unverified close. A whitespace note is correctly refused. This matches §3.3 as written.

Fix (later): record who supplied the note (for example the pack answer id) in the close history.

#### Attacks that failed (the guard held)

- `status` hand-set to `verified` with no evidence: refused by validation ("verified requires evidence", "no matching history entry").
- An unverified board with a whitespace `--owner-note`: REJECTED, nothing moved.
- An existing `0-done/demo` target: refused before the freeze. The board stays `closed:false`.
- A path with `..` (`x/../demo/status.json`): it resolves to the real package and is guarded the same way.
- Two concurrent `archive-package --owner-note` runs: one CLOSED_MOVED, one REJECTED ("closed (frozen)"). No nested or half-moved tree.
- No status.json and no CLOSEOUT: DENIED. A `dropped` row with an empty reason or a zero-row CLOSEOUT: REJECTED, with nothing written or moved.

---

### 3. Audit chain (Q1, G-6, §3.2)

Setup: `C="node <copy>/review-it/scripts/audit-chain.mjs"`, `DOC_IT_CLI=<doc-it.mjs>`. The ledger has `Author model: opus` and rows C1 (`code`) and C2 (`code`). The auditor file is written by `model: sonnet` and the ombudsman file by `model: opus`.

#### Q1-H1 HIGH: G-6 is beaten by a model alias the family list does not know.

```
$C start claims.md --auditor-model opusplan   → state AUDITING (author opus)
$C start claims.md --auditor-model claudeopus → state AUDITING
$C start claims.md --auditor-model best       → state AUDITING
(held: claude-opus-5-5, Opus, OPUS5.5, us.anthropic.claude-opus-5-5-v1:0, claude-opus-5-5[1m])
```

The attack got through. `modelKey` falls back to the raw string when no family regex matches, and `sameModel` then compares strings. So an alias that resolves to Opus ("opusplan" is a real host alias), or a family name joined to a word, counts as a different model. The comparison fails open. G-6 is a "never" rule.

Fix: fail closed. If `modelKey` finds no known family for the author, the auditor or the ombudsman, refuse with "cannot verify G-6: unknown model family <m>; pass a model id containing one of <FAMILIES>". Map the known host aliases (`opusplan`→opus, `sonnet[1m]`→sonnet, `default`/`best`→refuse) and add them to T-Q1-03.

#### Q1-M1 MEDIUM: evidence is checked for format only. A sha that does not exist and `echo` both count as evidence.

```
verdicts: C1 TRUE "nosuchrepo@deadbeef00", C2 TRUE "`echo TRUE`"; ombudsman UPHELD both
→ state PUBLISHABLE; SAFE (2): C1, C2
```

The attack got through. `evidenceOk` accepts any `x@<hex7+>` and any backticked command whose first word is in `CMD_WORDS`, which includes `echo`, `printf`, `test` and `date`. The ombudsman is the only check on content, and its UPHELD is accepted as is.

Fix:
- Drop `echo`, `printf`, `test`, `true`, `date` and `env` from `CMD_WORDS`.
- For `repo@sha`, when the repo resolves (a sibling folder, or the ledger's repo), require `git cat-file -e <sha>`, and treat a row that does not resolve as uncovered.
- For `<sha>:<path>`, require `git cat-file -e <sha>:<path>`.

#### Q1-M2 MEDIUM: `chain-state.json` has no integrity check. Hand-forged state publishes a SAFE list with no audit at all.

```
after start: edit state → state:"ADJUDICATING", audit.verdicts = {C1,C2: TRUE "forged"}, ombudsman.requested = []
$C record-ombudsman o.md (a header only, zero ruling rows) → state PUBLISHABLE; SAFE (2): C1, C2
variant: drop C2 from state.rows + audit.requested → PUBLISHABLE; C2 is in neither SAFE nor DO-NOT-PUBLISH
```

The attack got through. SKILL.md says never to edit the state by hand, but nothing enforces it. The published SAFE.md still reads "Chain: author opus → auditor sonnet → ombudsman opus", so the forgery cannot be seen. It is MEDIUM only because it needs a hand edit.

Fix:
- Write a `.chain-state.sha256` sidecar, as do-it does for state.json, and refuse on a mismatch.
- `publish()` re-derives from sources and does not trust the state. It re-parses the ledger and requires `sha256 == st.ledger_sha256` and `rows == st.rows`. It requires every ledger row to have a verdict tied to a recorded audit file, using the sha256 of each audit and rulings file stored at record time and checked again at publish. It requires every row to have a ruling.
- `record-ombudsman` refuses a file with zero ruling rows.

#### Q1-M3 MEDIUM: the ledger is never checked again before publish, so a SAFE.md is published for a ledger that has changed.

```
start; then edit claims.md: C2 "thing two" → "the moon is cheese", append C3; audit + rule C1, C2
→ PUBLISHABLE; SAFE lists C1, C2 ("thing two"); "Ledger sha256 4621…" ; current ledger sha 3cbc…; C3 nowhere
```

The attack got through. The sha256 recorded at start is never compared again, and C3 is in neither list. A reader who sees a SAFE.md next to the ledger takes the current ledger as audited. The same staleness applies to a SAFE.md from an earlier chain while a new chain is in flight.

Fix: at `publish()`, refuse with "ledger changed since start; abort and restart" when the ledger's sha256 differs. Consumers such as plan-it handoff must compare SAFE.md's `Ledger sha256` with the current ledger before trusting it.

#### Q1-L1 LOW: the author model is declared by the author

`Author model:` is whatever the ledger says, and the auditor file's `model:` line is likewise declared by whoever wrote it. G-6 is only as honest as those lines.

Fix (later): take the author model from the do-it meter or the run's tier record when one exists.

#### Q1-L2 LOW: the ombudsman can be the author's model

The ombudsman defaults to opus (D6), so with an Opus author the final ruling (which can turn FALSE into TRUE) comes from the author's model. G-6 covers only the auditor, so this matches the contract. Flagged for the owner.

#### Q1-L3 LOW: duplicate verdict rows

A verdict file with C1 TRUE and then C1 FALSE is accepted, and the first row wins without a warning.

Fix: refuse duplicate ids in a verdict or rulings file.

#### Q1-L4 LOW: a bogus `DOC_IT_CLI` skips the tier check

With `DOC_IT_CLI=/nonexistent`, a ledger with tier `vibes` reaches PUBLISHABLE. SAFE.md says "[skip] doc-it not installed: tier enum (not checked, not PASS)", which matches G-10 and D14. Disclosed, so LOW.

Fix: when `DOC_IT_CLI` is set but missing, refuse as a config error (exit 2) rather than treating doc-it as not installed.

#### Attacks that failed (the chain held)

- Tier cells doc-it refuses (`vibes`): refused at start, nothing written.
- An ombudsman file that leaves out C2: refused, and the state stays ADJUDICATING.
- A record-ombudsman after an abort during ADJUDICATING: refused ("not valid in state LEDGER_READY"), with no SAFE.md written and only chain-state.json left.
- Common spellings of the author's model (`claude-opus-5-5`, `Opus`, `OPUS5.5`, a Bedrock id, `[1m]`): refused before dispatch.
- Rows missing on the first audit cause one re-dispatch, and a second miss goes to ESCALATED_TO_OWNER (code read, as in T-Q1-02).

---

### Summary of successful attacks

| ID | Sev | Gate | One line | Fix owner |
|---|---|---|---|---|
| S1-H1 | HIGH | §3.1 / G-1 | a second run sharing row ids has no rows, so its owner's active run is allowed | do-it spine |
| S1-H2 | HIGH | §3.1 / G-1 | `resume` with no `--run` takes over another session's active run | do-it spine + SKILL |
| A1-H1 | HIGH | G-2 | a hand-set `closed:true` is treated as a PARTIAL_FAILED resume and moved unchecked, then reported clean | build-it + conclude-it + doc-it |
| A1-H2 | HIGH | G-2 | an empty board closes through `status-write close` with no note | build-it |
| Q1-H1 | HIGH | G-6 | an unknown alias (`opusplan`) passes the same-model check | review-it |
| S1-M1 | MEDIUM | §3.1 | a tampered newer run makes the gate fail open over a valid older active run | do-it spine |
| A1-M1 | MEDIUM | G-2 | deleting a tracked status.json sends the package down the CLOSEOUT path | conclude-it + doc-it |
| A1-M2 | MEDIUM | G-2 / G-10 | CLOSEOUT evidence or reason is any non-blank text | doc-it |
| Q1-M1 | MEDIUM | §3.2 | evidence is format only (fake sha, `echo`) | review-it |
| Q1-M2 | MEDIUM | §3.2 | a forged chain-state publishes SAFE with no audit | review-it |
| Q1-M3 | MEDIUM | §3.2 | SAFE is published for a ledger changed after start | review-it |
| S1-L1..L3, A1-L1..L2, Q1-L1..L4 | LOW | — | see the sections above | — |

Re-run condition for CP-03: every HIGH and MEDIUM above is fixed, each with a regression case that reproduces the attack command shown here and asserts a refusal. Then this review is run again on the fixed trees.
