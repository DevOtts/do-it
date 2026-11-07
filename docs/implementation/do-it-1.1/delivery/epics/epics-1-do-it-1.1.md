# Epics: do-it 1.1

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Dn ruling — see GLOSSARY.md

Every epic ends in its binding Test Contract (BINDING: 100% pass or /iterate). Size M: one package, a handful of cases per epic.

---

## S1 — Stop gate binds only the owning session (W0)

Wave: W0 · Repo: DevOtts/do-it · Branch `epic/S1-stop-gate-ownership` · Deps: none · Tier: sonnet
Scope: `core/spine/src/state.mjs` (`selectScopedRunId`), `core/spine/src/stopgate.mjs`, `core/spine/src/finish-line.mjs`, `core/spine/src/start` path, hook `hosts/claude-code/hooks/stop-gate.mjs`; rebuild `core/spine/do-it.mjs`.

- [ ] S1-00 `start` falls back to `CLAUDE_CODE_SESSION_ID` (after `--session` and `DO_IT_SESSION_ID`); `resume` after `/clear` re-binds the run to the new id with a history entry
- [ ] S1-06 `SKILL.md` `start` line uses `--request` (C30)
- [ ] S1-07 Patience parks only a run the hook's session owns
- [ ] S1-01 Match on `owner.session_id` only; cwd fallback only when the host gives no session and the run has none
- [ ] S1-02 Legacy runs (no owner) are never gated from a hook
- [ ] S1-03 Allow by exclusion: PARKED, NEEDS_HUMAN, BLOCKED, AWAIT_RATIFY and terminal statuses never gate; every other run status does
- [ ] S1-04 Finish-line rows carry `run_id`; a hook stop counts only the gated run's rows
- [ ] S1-05 `start` never records a null session id when the host supplies one
- [ ] S1-08 `do-it pack withdraw --by stop-gate [--run <id>]`: marks unanswered questions whose source is the stop gate as `withdrawn` (kept, with date and reason); answered questions and stage questions are untouched (D10)

### Test Contract — S1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases]  ·  Count: 11  ·  Surfaces: spine CLI, Claude Code hook
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-S1-01 | S1-01 | Session B stops in a repo whose only run is active and owned by session A | STOP_ALLOWED, `owned: false` | happy | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-02 | S1-01 | Run has `session_id: null`, cwd = repo; Claude hook stops with session B | STOP_ALLOWED | edge | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-03 | S1-02 | Run with no `owner` object; hook stop | STOP_ALLOWED, reason "legacy run has no owner"; `gate stop --run <id>` still refuses | edge | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-04 | S1-03 | Owner session stops while its run is PARKED, NEEDS_HUMAN, AWAIT_RATIFY, then VERIFYING with open rows | STOP_ALLOWED for the first three; STOP_REFUSED for VERIFYING (a run under review still gates) | edge | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-05 | S1-04 | Two runs in one repo, each with open rows; owner of run 1 stops | board and count show only run 1's rows; patience parks run 1 only, run 2's state is byte-identical | stress | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-06 | S1-01 | [REAL] Copy of the pilot consumer repo's `.do-it/` (path in the KICKOFF; 4 PARKED runs: 2 null-session, 1 owned, 1 no owner) on a temp dir; a fresh session stops, then the owning session stops | both STOP_ALLOWED (all PARKED), zero refusals, zero new pack questions | live | auto | `node --test core/spine/test/s2/stopgate-replay.test.mjs` |
| T-S1-11 | S1-08 | Pack with 3 stop-gate questions (1 answered) and 1 stage question; run `pack withdraw --by stop-gate` twice | 2 marked `withdrawn` with date and reason; answered and stage questions byte-identical; second run changes nothing | edge | auto | `node --test core/spine/test/s2/pack-withdraw.test.mjs` |
| T-S1-09 | S1-00 | [REAL] Fresh Claude Code session runs `do-it start --request "x"` with the plugin installed, no flags or exports | `state.json` `owner.session_id` equals `$CLAUDE_CODE_SESSION_ID`, not null; after `/clear` and `resume`, the run is re-bound to the new id | live | auto | `node --test core/spine/test/s2/session-id.test.mjs` |
| T-S1-10 | S1-07 | A non-owner session in the same folder hits the hook 5 times | no park event, no pack question, the owner's run state byte-identical | edge | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-08 | S1-03 | Owner's run `state.json` is corrupt; hook stop | STATE_ERROR, then ALLOWED (fail open); an event is logged and `do-it status` reports the unreadable run | edge | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |
| T-S1-07 | S1-05 | `start` from a host that gives session X; then grep settings schema diff | `owner.session_id == X`; no new settings key in `core/schemas` (G-8) | happy | auto | `node --test core/spine/test/s2/stopgate-owner.test.mjs` |

---

## A1 — One guarded path to 0-done (W0)

Wave: W0 · Repos: DevOtts/conclude-it (S4, Step 0), DevOtts/build-it (close in place) · Deps: K1 (doc-it `check archive`, CLOSEOUT template) · Tier: opus

- [ ] A1-02 conclude-it S4: guarded close when `status.json` exists; CLOSEOUT then move when it does not; never a bare `git mv`
- [ ] A1-03 conclude-it Step 0 runs `doc-it check archive` and reports, never fixes; without doc-it it prints `[skip] doc-it not installed`
- [ ] A1-04 conclude-it S4 writes CLOSEOUT.md from doc-it's template (K1-04), never its own copy
- [ ] A1-05 `ledger-card.mjs close` accepts a package already in `0-done/` and closes it in place (`status-write close` without `--move`)

### Test Contract — A1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases][stress]  ·  Count: 5  ·  Surfaces: CLI + skill
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-A1-03 | A1-02 | S4 on a package with unverified tasks and no owner note | REJECTED, folder not moved, message names the unverified tasks | edge | auto | `node --test tests/ship-pipeline/s4.test.mjs` |
| T-A1-04 | A1-02 | S4 on a package without `status.json` | first DENIED (no CLOSEOUT); S4 writes CLOSEOUT.md with one row per piece, then moves; a CLOSEOUT row `carried` without a backlog path is refused | edge | auto | `node --test tests/ship-pipeline/s4.test.mjs` |
| T-A1-06 | A1-02 | Partial failure: kill `status-write close --move` after the board is frozen and before the folder move | PARTIAL_FAILED; re-running close completes the move; board stays `closed: true` with one close history entry; no half-moved tree; recover by re-run | stress | auto | `node --test tests/status/close-partial-failure.test.mjs` |
| T-A1-07 | A1-05 | `ledger-card close --owner-note` on a synthetic archived package (`0-done/x`, board 0 of 4, `closed: false`) | `closed: true` in place, note in history, folder not moved; without a note it is refused | happy | auto | `node --test tests/ledger-card-archived.test.mjs` |
| T-A1-05 | A1-03 | Step 0 on a repo with findings, then on a home without doc-it installed | report lists them; zero files changed (git status clean); without doc-it it prints `[skip] doc-it not installed` and exit 0 | happy | auto | `node --test tests/ship-pipeline/step0-audit.test.mjs` |

---

## B1 — harness-status-tracking board tells the truth (W0)

Wave: W0 · Repo: DevOtts/do-it · Deps: none · Tier: haiku

- [ ] B1-01 An independent review-it run (not the REAL-VERIFY session) syncs the board's 8 tasks from `REAL-VERIFY.md`
- [ ] B1-02 Re-check T-B-20's stale half; it stays parked until a commit lands more than 24 h after the board
- [ ] B1-03 Close the program through the guarded close once every case is terminal

### Test Contract — B1   (BINDING: 100% pass or /iterate)
Types: [use-cases]  ·  Count: 2  ·  Surfaces: status-write
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-B1-01 | B1-01 | `status-write validate` + `view` on the harness-status-tracking board after sync | the 8 tasks whose cases REAL-VERIFY verified are `verified`, with REAL-VERIFY.md as evidence and `by: review-it` from a different session id than REAL-VERIFY's | happy | auto | `node ../build-it/plugins/build-it/scripts/status/status-write.mjs validate --file docs/implementation/harness-status-tracking/status.json` |
| T-B1-02 | B1-02 | Stale check on the board today (newest folder commit about 3.8 h after `updated_at`) | not flagged; T-B-20 stays parked with that reason; a fixture with a commit 25 h newer is flagged `stale` | edge | auto | `node ../build-it/plugins/build-it/scripts/status/status-write.mjs recheck --file docs/implementation/harness-status-tracking/status.json` |

---

## I1 — init-it is installable (W0, after D1)

Wave: W0 · Repos: DevOtts/init-it (new), DevOtts/do-it · Deps: owner D1 · Tier: haiku

- [ ] I1-01 Create `DevOtts/init-it` (visibility per D1), push the local tree, tag `v0.1.0`, GitHub release
- [ ] I1-02 `core/companions.json` entry (`required: false`) and marketplace entry
- [ ] I1-03 plan-it hand-off prints "init-it not installed" when the plugin is missing

### Test Contract — I1   (BINDING: 100% pass or /iterate)
Types: [use-cases]  ·  Count: 2  ·  Surfaces: install
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-I1-01 | I1-01 | [REAL] init-it's own suite at the tagged commit | `node --test test/` passes, T-A-01..T-A-20 | live | auto | `git -C ../init-it checkout v0.1.0 && node --test ../init-it/test/` |
| T-I1-02 | I1-02 | `do-it doctor --install` on a clean temp home | init-it installed at 0.1.0; `check-pins --marketplace` passes | happy | auto | `node scripts/check-pins.mjs --marketplace` |

---

## K1 — doc-it 0.1.0: the standard and its first checks (W0, D11)

Wave: W0 · Repo: DevOtts/doc-it (new, public) · Branch `epic/K1-doc-it-0.1.0` · Deps: D11, D12, D13 · Tier: sonnet
Scope: the local tree at `~/Workspace/Devotts/doc-it` (standard v0, learnings, owner questions) becomes the plugin. Project-neutral (R3): no project name in code, docs or tests.

- [ ] K1-01 Plugin skeleton: `.claude-plugin/plugin.json`, `plugins/doc-it/skills/doc-it/SKILL.md` (DevOtts author fields and footer), `scripts/doc-it.mjs` (zero-dependency Node CLI)
- [ ] K1-02 Standard v0.1: OWNER-QUESTIONS 1–5 applied with their recommendations (D13); each rule DS-1..DS-8 marked `checked` or `not yet checked` in 0.1.0
- [ ] K1-03 `doc-it check archive`: read-only scan of the archive role; JSON (`done_unclosed`, `done_without_closeout`, `stale_active`) and exit codes 0 clean, 1 findings, 2 config error (DS-3)
- [ ] K1-04 CLOSEOUT template and its lint: one row per piece, `shipped` with evidence, `dropped`, or `carried` with a backlog link (DS-3)
- [ ] K1-05 `.doc-it/config.json`: role → paths map and `expiry_days` (default 60); `doc-it init` writes it from a short interview; a path with no role is reported as unowned
- [ ] K1-06 `doc-it check checkout <repo...>`: compares HEAD and working tree with `origin/<default>`; exit 1 when behind, naming local and remote sha (DS-6)
- [ ] K1-07 `doc-it check expiry` (report only, never rewrites; DS-4) and `doc-it tiers --json` (the tier enum of STANDARD §2)
- [ ] K1-08 Create `DevOtts/doc-it` public, push, tag `v0.1.0`, GitHub release; `core/companions.json` entry (`required: false`) and marketplace entry pinned with `ref: v0.1.0` (D4)

### Test Contract — K1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases]  ·  Count: 8  ·  Surfaces: doc-it CLI, install
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-K1-01 | K1-03 | Fixture docs home (roles from `.doc-it/config.json`): one `0-done/x` with `closed:false`, one `0-done/y` with no board and no CLOSEOUT, one clean | exit 1; JSON lists x in `done_unclosed`, y in `done_without_closeout`; clean one absent | happy | auto | `node --test test/check-archive.test.mjs` |
| T-K1-02 | K1-03 | [REAL] `doc-it check archive` on a read-only copy of the pilot consumer repo's plan home (path in the KICKOFF) | lists exactly the 3 programs measured on 2026-11-06 in `done_unclosed`; writes nothing | live | auto | `node --test test/check-archive-consumer.test.mjs` |
| T-K1-03 | K1-04 | CLOSEOUT with a `carried` row and no backlog link, then one complete | first fails naming the row; second passes | edge | auto | `node --test test/closeout.test.mjs` |
| T-K1-04 | K1-05 | Repo with no `.doc-it/config.json`; then a config whose role map leaves `notes/` unmapped | `check archive` exit 2 "run doc-it init"; second run reports `notes/` as unowned | edge | auto | `node --test test/config.test.mjs` |
| T-K1-05 | K1-06 | Fixture repo whose local main is 3 behind its remote, then up to date | exit 1 naming both shas; then exit 0 | edge | auto | `node --test test/check-checkout.test.mjs` |
| T-K1-06 | K1-07 | Durable doc with `verified:` 61 days old and one 10 days old, `expiry_days` 60 | report lists only the first; zero files changed | happy | auto | `node --test test/check-expiry.test.mjs` |
| T-K1-07 | K1-01 | Name scan of the repo (and K1-02 rule marks) for any project name, and the SKILL footer check | zero project names (R3); SKILL has `author: DevOtts` and the footer | happy | auto | `node --test test/neutral.test.mjs` |
| T-K1-08 | K1-08 | [REAL] Install from the marketplace on a clean temp home | doc-it 0.1.0 installed from tag `v0.1.0`; `doc-it tiers --json` prints the six tiers | live | auto | `node scripts/check-pins.mjs --marketplace` |

---

## K2 — The family consumes doc-it (W2, D11)

Wave: W2 · Repos: DevOtts/conclude-it, DevOtts/plan-it, DevOtts/review-it, DevOtts/do-it · Deps: K1, V1, Q1 (K2-02 edits Q1's audit mode after it lands) · Tier: sonnet

- [ ] K2-01 conclude-it Step 2 (debrief) runs `doc-it check expiry` on the pages it touched and puts the result in the verdict; the supersession sweep asks doc-it for each fact kind's home
- [ ] K2-02 review-it audit mode (Q1) tags each claim with the tier from `doc-it tiers --json`
- [ ] K2-03 One shared rule in every consumer: when doc-it is missing, print `[skip] doc-it not installed: <what was not checked>` and never PASS that check (D14)
- [ ] K2-04 do-it README family table and SKILL list doc-it; `doctor --install` offers it

### Test Contract — K2   (BINDING: 100% pass or /iterate)
Types: [use-cases]  ·  Count: 4  ·  Surfaces: skills, install
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-K2-01 | K2-01 | conclude-it close on a session that touched a page with expired `verified:` | verdict lists the page as expired; nothing rewritten | happy | judgement | conclude-it eval `evals/doc-it-expiry.yaml` |
| T-K2-02 | K2-02 | review-it `--audit` on a 3-row ledger | each row carries a tier from doc-it's enum; an unknown tier is refused | happy | auto | `node --test tests/audit/tiers.test.mjs` |
| T-K2-03 | K2-03 | conclude-it, plan-it preflight and review-it `--audit` on a temp home without doc-it | each prints the `[skip] doc-it not installed` line; none reports that check as PASS | edge | auto | `node --test tests/doc-it-missing/*.test.mjs` |
| T-K2-04 | K2-04 | README check and `doctor --install --dry-run` | doc-it in the family table; doctor lists it as optional | happy | auto | `node --test tests/readme/*.test.mjs` |

---

## E1 — Host integrations stay isolated under hosts/ (W0, R3)

Wave: W0 · Repo: DevOtts/do-it · Branch `epic/E1-host-isolation` · Deps: R3, D2 · Tier: sonnet
Scope: `core/state-stores/**`, `core/schemas/settings.schema.json`, `core/spine/src/settings.mjs`, `hosts/engine/**`, `scripts/check-readme.mjs`, `scripts/generate-skill.mjs`, `tests/e2e/r4.test.mjs`, `core/spine/test/s1/s1.test.mjs`; rebuild `core/spine/do-it.mjs`.

- [ ] E1-01 Move `core/state-stores/engine.mjs`, `core/state-stores/engine-drivers/*` and their tests to `hosts/engine/state-store/`; `core/state-stores/index.mjs` keeps `local-fs` and `git-branch` and loads any other backend from the `state_store` entry of `hosts/<name>/adapter.manifest.json`; the engine cases in `core/state-stores/cli.mjs` and `conformance/run.mjs` move with it
- [ ] E1-02 Settings: the core schema keeps `state.backend` and accepts one object keyed by the backend name, validated by that host's own schema (`hosts/engine/state-store/settings.schema.json`); `settings.mjs` drops the `engine` default. Existing `state.engine.blobs` files stay valid (no new key, G-8)
- [ ] E1-03 G-12 word list gains `engine`; the scan covers `core/` and `scripts/`, skips `hosts/` and `plugins/do-it/`
- [ ] E1-04 Host tables in README, SKILL and `generate-skill.mjs` are generated from `hosts/*/adapter.manifest.json` (`level`, `server_side`); `check-readme.mjs` reads the manifests instead of a fixed host list
- [ ] E1-05 The Engine live case in `tests/e2e/r4.test.mjs` moves to `hosts/engine/tests/`
- [ ] E1-06 `hosts/engine/adapter.manifest.json` gains `"level": "experimental", "server_side": "declined"`; README, hero alt text and `hosts/engine/README.md` show "Experimental: server side declined (PR #727, 2026-10-29)" (D2)
- [ ] E1-07 CHANGELOG 1.1.0 records the move and D2

### Test Contract — E1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases]  ·  Count: 5  ·  Surfaces: core scan, state-store factory, settings, README check
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-E1-01 | E1-03 | G-12 scan with `engine` in the word list, over `core/` and `scripts/` | zero hits; a planted `engine` word in a temp copy of `core/spine/src` fails the scan naming the file (R3) | happy | auto | `node --test core/spine/test/s1/s1.test.mjs` |
| T-E1-02 | E1-01 | Temp copy of the repo with `hosts/engine/` deleted | every core suite still passes; `openStore({backend:'engine'})` fails with DRIVER_UNKNOWN naming the missing host, not a crash | edge | auto | `node --test tests/hosts/isolation.test.mjs` |
| T-E1-03 | E1-01 | State-store conformance suite run against the engine store from its new path | same pass count as at `d38cedb`; `openStore({backend:'engine'})` loads it through the manifest | happy | auto | `node --test hosts/engine/state-store/tests/` |
| T-E1-04 | E1-02 | A settings file with `state.backend: engine, state.engine.blobs: r2`, then one with `state.engine.blobs: bogus` | first validates with no schema diff in `core/schemas` keys (G-8); second fails with the host schema's error | edge | auto | `node --test core/spine/test/s2/settings-host.test.mjs` |
| T-E1-05 | E1-06 | README check with the host table generated by E1-04 | Engine row reads Experimental; check fails if any host whose manifest says `server_side: declined` is listed as Supported (G-4), or if a host folder has no row | happy | auto | `node --test tests/readme/*.test.mjs` |

---

## H1 — Release hygiene (W0)

Wave: W0 · Repos: DevOtts/do-it, DevOtts/prompt-it, DevOtts/reconcile-it · Deps: owner D3, D4 · Tier: haiku

- [ ] H1-01 prompt-it: tag per D3 (v1.0.0 at the plugin.json 1.0.0 commit, or pin 0.2.1); do-it: tag v1.0.5 at `d38cedb` (C32)
- [ ] H1-02 `check-pins` fails when a pinned version (do-it's own included) has no matching tag on the remote
- [ ] H1-03 reconcile-it 1.0.1: remove `scripts/reconcile-it.mjs` (duplicate)
- [ ] H1-04 Marketplace `ref: v<version>` pins per D4, only after each tag exists (C33)
- [ ] H1-05 Replace the stale 1.0.0 KICKOFF with a pointer to this package
- [ ] H1-06 plan-it SKILL: script paths resolve in the installed layout (`plugins/plan-it/scripts/`), with a test that runs each documented command from a cache-shaped copy; and `handoff` stops reading plan-it's own generated `ENV-FACTS.md` (PRESENT/ABSENT) as a STATUS board when it sits in the delivery folder

### Test Contract — H1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases]  ·  Count: 4  ·  Surfaces: check-pins, plan-it SKILL
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-H1-01 | H1-03 | reconcile-it suite after removal | passes; `git ls-files scripts/reconcile-it.mjs` empty | happy | auto | `node --test ../reconcile-it/tests/` |
| T-H1-02 | H1-02 | Fixture pin to a version with no remote tag | `check-pins` exit 1 naming the sibling and version (G-3) | edge | auto | `node --test tests/catalog/*.test.mjs` |
| T-H1-04 | H1-06 | Every `node ${CLAUDE_PLUGIN_ROOT}/…` command in plan-it SKILL.md, run against a copy laid out like the marketplace cache | each path exists; `--help` exits 0 | edge | auto | `node --test tests/plugin/skill-paths.test.mjs` |
| T-H1-03 | H1-04 | Marketplace entry with `ref` installs on Claude Code | installed sibling version equals the pin | live | attended | — |

---

## L1 — Claim ledger and source tiers (W1)

Wave: W1 · Repo: DevOtts/plan-it · Deps: K1 · Tier: sonnet

- [ ] L1-01 Ledger format in `references/formats.md`; the tier enum is read from `doc-it tiers --json` (K1-07), never copied; SKILL Phase 5 requires the ledger for decision-grade packages
- [ ] L1-02 `gate-check claims <claims.md>`: tier enum, source present, sha/path rule for code/git, fact rule, count rule
- [ ] L1-03 "Evidence against the hypothesis" rule and its lint
- [ ] L1-04 `gate-check handoff` runs `claims` for decision-grade packages

### Test Contract — L1   (BINDING: 100% pass or /iterate)
Types: [unit]  ·  Count: 5  ·  Surfaces: gate-check
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-L1-01 | L1-02 | This package's `audit/claims.md` (24 rows) | exit 0 | happy | auto | `node scripts/gate-check.mjs claims tests/fixtures/claims/do-it-1.1.md` |
| T-L1-02 | L1-02 | Row with tier `code` and no sha anywhere | exit 1 naming the row and "sha/path rule" | edge | auto | `node --test tests/claims/*.test.mjs` |
| T-L1-03 | L1-02 | Row "5 credential ways" with tier `code`, no list | exit 1 "count rule" (the P2-plan defect) | edge | auto | `node --test tests/claims/*.test.mjs` |
| T-L1-04 | L1-02 | Row tier `program-doc` stated as plain fact | exit 1 "fact rule"; the same row prefixed "the study says" passes | edge | auto | `node --test tests/claims/*.test.mjs` |
| T-L1-05 | L1-03 | Findings doc with "your suspicion is confirmed" and no evidence-against heading | exit 1 "evidence against" | edge | auto | `node --test tests/claims/*.test.mjs` |

---

## V1 — Grounding preflight reads what is current (W1)

Wave: W1 · Repo: DevOtts/plan-it · Deps: K1 · Tier: sonnet

- [ ] V1-01 Preflight probe `behind-remote` calls `doc-it check checkout` (K1-06) and records the remote sha; without doc-it the probe reports WARN `doc-it not installed`, never PASS
- [ ] V1-02 Preflight probe `shipped-layers` and the `research/SHIPPED-LAYERS.md` template
- [ ] V1-03 `gate-check handoff` requires SHIPPED-LAYERS for size M/L; KICKOFF pinning uses the remote sha

### Test Contract — V1   (BINDING: 100% pass or /iterate)
Types: [unit][use-cases]  ·  Count: 3  ·  Surfaces: gate-check preflight
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-V1-01 | V1-01 | Fixture repo whose local main is 3 behind its remote | probe WARN naming the repo, local and remote sha; ENV-FACTS records the remote sha (G-7) | edge | auto | `node --test tests/preflight/behind-remote.test.mjs` |
| T-V1-02 | V1-03 | Size M package without `research/SHIPPED-LAYERS.md` | `handoff` exit 1 naming the file | edge | auto | `node --test tests/preflight/shipped-layers.test.mjs` |
| T-V1-03 | V1-02 | 02 doc proposes a new registry with no "extends" citation | `handoff` exit 1 naming the section | edge | auto | `node --test tests/preflight/shipped-layers.test.mjs` |

---

## Q1 — review-it audit mode (W2)

Wave: W2 · Repo: DevOtts/review-it · Deps: L1 (ledger format) · Tier: opus

- [ ] Q1-01 `--audit <claims.md>`: auditor dispatch (a different model from the author), primary sources only, verdict file per CONTRACT §2.5
- [ ] Q1-02 Ombudsman dispatch and rulings; SAFE and DO-NOT-PUBLISH lists; tokens per role
- [ ] Q1-03 Audit-chain states per CONTRACT §3.2, including retry, escalation and abort
- [ ] Q1-04 `--stakes routine` runs only `gate-check claims`

### Test Contract — Q1   (BINDING: 100% pass or /iterate)
Types: [use-cases][stress]  ·  Count: 6  ·  Surfaces: skill-eval
Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Task | Scenario | Expected | Kind | Verify | Check |
|---|---|---|---|---|---|---|
| T-Q1-01 | Q1-01 | [REAL] Audit this package's ledger | verdict file covers C1–C24, each with a repo@sha or command evidence | live | judgement | — |
| T-Q1-02 | Q1-03 | Auditor returns a file missing 3 rows | AUDIT_RETRY_FAILED, one re-dispatch with those rows; a second miss → ESCALATED_TO_OWNER, nothing published | stress | auto | `node --test tests/audit/chain.test.mjs` |
| T-Q1-03 | Q1-01 | Author model = auditor model requested | refused before dispatch (G-6) | edge | auto | `node --test tests/audit/chain.test.mjs` |
| T-Q1-04 | Q1-02 | Adversarial verify: planted false TRUE (a claim citing a deleted file) | ombudsman overturns it → PARTIAL_TRUST; the auditor re-checks that class; claim lands in DO-NOT-PUBLISH | stress | judgement | — |
| T-Q1-06 | Q1-03 | Owner aborts during ADJUDICATING | ABORTED; rollback keeps the artifact at its last published version; no SAFE.md written | edge | auto | `node --test tests/audit/chain.test.mjs` |
| T-Q1-05 | Q1-04 | `--stakes routine` | no subagent dispatched; only `gate-check claims` runs | happy | auto | `node --test tests/audit/chain.test.mjs` |
