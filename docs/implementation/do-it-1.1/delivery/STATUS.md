<!-- generated from status.json by status-write; do not edit by hand -->

# do-it-1.1 — status

Progress: 60%
Tasks: 55 · verified 0 (claims) · re-checked 0 · done 55 · in-progress 0 · blocked 0 · not-started 0
Updated: 2026-11-13T18:33:35Z

## Blocked

None

## Verified claims

None

## Re-checks

- unchecked (no check command): S1-00 (live), S1-06 (epic-level case, not mapped to this task, live), A1-04 (epic-level case, not mapped to this task), B1-03 (epic-level case, not mapped to this task), I1-01 (live), I1-03 (live, epic-level case, not mapped to this task), K1-02 (epic-level case, not mapped to this task, live), K1-08 (live), E1-04 (epic-level case, not mapped to this task), E1-05 (epic-level case, not mapped to this task), E1-07 (epic-level case, not mapped to this task), H1-01 (epic-level case, not mapped to this task, owner-gated), H1-04 (owner-gated), H1-05 (epic-level case, not mapped to this task, owner-gated), L1-01 (epic-level case, not mapped to this task), L1-04 (epic-level case, not mapped to this task), K2-01 (judgement), Q1-02 (judgement)

## Pieces

| Piece | Status | Blocked on | What's left |
| --- | --- | --- | --- |
| S1 — Stop gate binds only the owning session (W0) | not-started | — | All 9 tasks |
| A1 — One guarded path to 0-done (W0) | not-started | — | All 4 tasks |
| B1 — harness-status-tracking board tells the truth (W0) | not-started | — | All 3 tasks |
| I1 — init-it is installable (W0, after D1) | not-started | — | All 3 tasks |
| K1 — doc-it 0.1.0: the standard and its first checks (W0, D11) | not-started | — | All 8 tasks |
| K2 — The family consumes doc-it (W2, D11) | not-started | — | All 4 tasks |
| E1 — Host integrations stay isolated under hosts/ (W0, R3) | not-started | — | All 7 tasks |
| H1 — Release hygiene (W0) | not-started | — | All 6 tasks |
| L1 — Claim ledger and source tiers (W1) | not-started | — | All 4 tasks |
| V1 — Grounding preflight reads what is current (W1) | not-started | — | All 3 tasks |
| Q1 — review-it audit mode (W2) | not-started | — | All 4 tasks |

## W0 Wave 0

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| S1-00 | `start` falls back to `CLAUDE_CODE_SESSION_ID` (after `--session` and `DO_IT_SESSION_ID`); `resume` after `/clear` re-binds the run to the new id with a history entry | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:31Z |
| S1-06 | `SKILL.md` `start` line uses `--request` (C30) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:31Z |
| S1-07 | Patience parks only a run the hook's session owns | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-01 | Match on `owner.session_id` only; cwd fallback only when the host gives no session and the run has none | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-02 | Legacy runs (no owner) are never gated from a hook | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-03 | Allow by exclusion: PARKED, NEEDS_HUMAN, BLOCKED, AWAIT_RATIFY and terminal statuses never gate; every other run status does | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-04 | Finish-line rows carry `run_id`; a hook stop counts only the gated run's rows | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-05 | `start` never records a null session id when the host supplies one | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| S1-08 | `do-it pack withdraw --by stop-gate [--run &lt;id>]`: marks unanswered questions whose source is the stop gate as `withdrawn` (kept, with date and reason); answered questions and stage questions are untouched (D10) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| A1-02 | conclude-it S4: guarded close when `status.json` exists; CLOSEOUT then move when it does not; never a bare `git mv` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| A1-03 | conclude-it Step 0 runs `doc-it check archive` and reports, never fixes; without doc-it it prints `[skip] doc-it not installed` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| A1-04 | conclude-it S4 writes CLOSEOUT.md from doc-it's template (K1-04), never its own copy | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| A1-05 | `ledger-card.mjs close` accepts a package already in `0-done/` and closes it in place (`status-write close` without `--move`) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| B1-01 | An independent review-it run (not the REAL-VERIFY session) syncs the board's 8 tasks from `REAL-VERIFY.md` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| B1-02 | Re-check T-B-20's stale half; it stays parked until a commit lands more than 24 h after the board | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| B1-03 | Close the program through the guarded close once every case is terminal | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| I1-01 | Create `DevOtts/init-it` (visibility per D1), push the local tree, tag `v0.1.0`, GitHub release | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| I1-02 | `core/companions.json` entry (`required: false`) and marketplace entry | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| I1-03 | plan-it hand-off prints "init-it not installed" when the plugin is missing | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:32Z |
| K1-01 | Plugin skeleton: `.claude-plugin/plugin.json`, `plugins/doc-it/skills/doc-it/SKILL.md` (DevOtts author fields and footer), `scripts/doc-it.mjs` (zero-dependency Node CLI) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-02 | Standard v0.1: OWNER-QUESTIONS 1–5 applied with their recommendations (D13); each rule DS-1..DS-8 marked `checked` or `not yet checked` in 0.1.0 | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-03 | `doc-it check archive`: read-only scan of the archive role; JSON (`done_unclosed`, `done_without_closeout`, `stale_active`) and exit codes 0 clean, 1 findings, 2 config error (DS-3) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-04 | CLOSEOUT template and its lint: one row per piece, `shipped` with evidence, `dropped`, or `carried` with a backlog link (DS-3) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-05 | `.doc-it/config.json`: role → paths map and `expiry_days` (default 60); `doc-it init` writes it from a short interview; a path with no role is reported as unowned | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-06 | `doc-it check checkout &lt;repo...>`: compares HEAD and working tree with `origin/&lt;default>`; exit 1 when behind, naming local and remote sha (DS-6) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-07 | `doc-it check expiry` (report only, never rewrites; DS-4) and `doc-it tiers --json` (the tier enum of STANDARD §2) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| K1-08 | Create `DevOtts/doc-it` public, push, tag `v0.1.0`, GitHub release; `core/companions.json` entry (`required: false`) and marketplace entry pinned with `ref: v0.1.0` (D4) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-01 | Move `core/state-stores/engine.mjs`, `core/state-stores/engine-drivers/*` and their tests to `hosts/engine/state-store/`; `core/state-stores/index.mjs` keeps `local-fs` and `git-branch` and loads any other backend from the `state_store` entry of `hosts/&lt;name>/adapter.manifest.json`; the engine cases in `core/state-stores/cli.mjs` and `conformance/run.mjs` move with it | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-02 | Settings: the core schema keeps `state.backend` and accepts one object keyed by the backend name, validated by that host's own schema (`hosts/engine/state-store/settings.schema.json`); `settings.mjs` drops the `engine` default. Existing `state.engine.blobs` files stay valid (no new key, G-8) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-03 | G-12 word list gains `engine`; the scan covers `core/` and `scripts/`, skips `hosts/` and `plugins/do-it/` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-04 | Host tables in README, SKILL and `generate-skill.mjs` are generated from `hosts/*/adapter.manifest.json` (`level`, `server_side`); `check-readme.mjs` reads the manifests instead of a fixed host list | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-05 | The Engine live case in `tests/e2e/r4.test.mjs` moves to `hosts/engine/tests/` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-06 | `hosts/engine/adapter.manifest.json` gains `"level": "experimental", "server_side": "declined"`; README, hero alt text and `hosts/engine/README.md` show "Experimental: server side declined (PR #727, 2026-10-29)" (D2) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| E1-07 | CHANGELOG 1.1.0 records the move and D2 | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| H1-01 | prompt-it: tag per D3 (v1.0.0 at the plugin.json 1.0.0 commit, or pin 0.2.1); do-it: tag v1.0.5 at `d38cedb` (C32) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| H1-02 | `check-pins` fails when a pinned version (do-it's own included) has no matching tag on the remote | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:33Z |
| H1-03 | reconcile-it 1.0.1: remove `scripts/reconcile-it.mjs` (duplicate) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| H1-04 | Marketplace `ref: v&lt;version>` pins per D4, only after each tag exists (C33) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| H1-05 | Replace the stale 1.0.0 KICKOFF with a pointer to this package | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| H1-06 | plan-it SKILL: script paths resolve in the installed layout (`plugins/plan-it/scripts/`), with a test that runs each documented command from a cache-shaped copy; and `handoff` stops reading plan-it's own generated `ENV-FACTS.md` (PRESENT/ABSENT) as a STATUS board when it sits in the delivery folder | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |

## W1 Wave 1

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| L1-01 | Ledger format in `references/formats.md`; the tier enum is read from `doc-it tiers --json` (K1-07), never copied; SKILL Phase 5 requires the ledger for decision-grade packages | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| L1-02 | `gate-check claims &lt;claims.md>`: tier enum, source present, sha/path rule for code/git, fact rule, count rule | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| L1-03 | "Evidence against the hypothesis" rule and its lint | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| L1-04 | `gate-check handoff` runs `claims` for decision-grade packages | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| V1-01 | Preflight probe `behind-remote` calls `doc-it check checkout` (K1-06) and records the remote sha; without doc-it the probe reports WARN `doc-it not installed`, never PASS | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| V1-02 | Preflight probe `shipped-layers` and the `research/SHIPPED-LAYERS.md` template | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| V1-03 | `gate-check handoff` requires SHIPPED-LAYERS for size M/L; KICKOFF pinning uses the remote sha | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |

## W2 Wave 2

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| K2-01 | conclude-it Step 2 (debrief) runs `doc-it check expiry` on the pages it touched and puts the result in the verdict; the supersession sweep asks doc-it for each fact kind's home | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| K2-02 | review-it audit mode (Q1) tags each claim with the tier from `doc-it tiers --json` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| K2-03 | One shared rule in every consumer: when doc-it is missing, print `[skip] doc-it not installed: &lt;what was not checked>` and never PASS that check (D14) | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| K2-04 | do-it README family table and SKILL list doc-it; `doctor --install` offers it | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:34Z |
| Q1-01 | `--audit &lt;claims.md>`: auditor dispatch (a different model from the author), primary sources only, verdict file per CONTRACT §2.5 | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:35Z |
| Q1-02 | Ombudsman dispatch and rulings; SAFE and DO-NOT-PUBLISH lists; tokens per role | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:35Z |
| Q1-03 | Audit-chain states per CONTRACT §3.2, including retry, escalation and abort | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:35Z |
| Q1-04 | `--stakes routine` runs only `gate-check claims` | done | `docs/implementation/do-it-1.1/plan/reviews/CP-04-pre-release.md` | — | 2026-11-13T18:33:35Z |

## Sessions

None

## History (latest 20)

- 2026-11-13T18:33:35Z Q1-04: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:35Z Q1-03: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:35Z Q1-02: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:35Z Q1-01: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z K2-04: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z K2-03: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z K2-02: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z K2-01: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z V1-03: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z V1-02: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z V1-01: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z L1-04: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z L1-03: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z L1-02: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z L1-01: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z H1-06: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z H1-05: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z H1-04: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:34Z H1-03: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
- 2026-11-13T18:33:33Z H1-02: not-started → done by build-it — do-it 1.1.0 released (v1.1.0 @88e4152); CP-04 A+B PASS
