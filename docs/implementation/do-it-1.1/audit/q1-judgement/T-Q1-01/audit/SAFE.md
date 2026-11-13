# SAFE — ../claims.md

Chain: author claude-opus-5-5 → auditor claude-sonnet-5-5 → ombudsman opus. Ledger sha256 7efa070a85efd14c744564169a30c355e89020996810a35b19e6d49445fcf914.
Tier check: every row resolved by doc-it.

## SAFE (38)

- C1 — do-it `origin/main` is at `d38cedb`, version 1.0.5; the local `main` checkout at `/Users/macbook/Workspace/Devotts/do-it` is 24 commits behind
- C2 — 1.0.5 passes the hook's session and cwd to `gate stop`, which gates only the run they own
- C3 — When a run's `owner.session_id` is null, `selectScopedRunId` matches any session whose cwd is inside the run's `owner.cwd`
- C4 — A run with no `owner` object is returned as a legacy fallback, and `gateStop` gates it without checking `owned`
- C5 — `gateStop` does not read the run's status before refusing; a status reader `peekRunStatus` already exists in `state.mjs:141`
- C6 — Engine-Core has 4 runs, all PARKED: 2 with `owner.session_id: null`, 1 owned by a real session (`r-20261103-214029-a6d0`), 1 with no owner *(corrected by audit: first draft said 3 null)*
- C7 — The finish line is one repo-wide file, 109 KB in Engine-Core
- C8 — In session `grokbot-plan` (2026-11-02/03) the installed do-it 1.0.5 stop hook refused 7 stops, showing "452 of 472" then "453 of 472" from be-claudecode-like
- C9 — Card B shipped in 1.0.1: 41 of 42 binding status cases verified against real artifacts, T-B-20 parked
- C10 — harness-status-tracking `status.json` shows 8 tasks done, 0 verified, progress 60%
- C11 — conclude-it `ledger-card.mjs close` refuses unless every task is verified or an owner note is given, then runs `status-write close --by conclude-it --move`
- C12 — conclude-it ship pipeline S4 archives the plan folder with `git mv` and does not call `status-write close`
- C13 — All 3 Engine-Core `0-done/` programs with a `status.json` have `closed: false` (be-claudecode-like, engine-do-it-squad, secrets-highway)
- C14 — secrets-highway was archived in `17e42f2a` with its board at 0 of 48; the disposition "E1 + E3 shipped; E2, E4 → backlog" is in the commit message
- C15 — init-it exists at `/Users/macbook/Workspace/Devotts/init-it`, CHANGELOG "0.1.0 (unreleased, for do-it 1.0.1)", not a git repo, absent from `core/companions.json` and `.claude-plugin/marketplace.json`
- C16 — Engine PR #727 was closed without merge on 2026-10-29 by owner decision; the hooks would open second paths beside the Engine highway; a do-it squad becomes an import format onto the `pipeline_definition` road
- C17 — The do-it README lists Engine as "Supported" and describes adoption through the Engine layer
- C18 — DevOtts/do-it is public
- C19 — review-it has no auditor/ombudsman/claim-ledger mode; plan-it SKILL and gate-check have no claim ledger, shipped-layer check, or behind-remote check
- C20 — prompt-it is pinned and listed at 1.0.0, but its only tag and GitHub release is v0.2.1
- C21 — Marketplace sibling entries carry no `ref`, so installs take the default branch head
- C22 — reconcile-it `scripts/reconcile-it.mjs` is tracked and byte-identical to `plugins/reconcile-it/skills/reconcile-it/scripts/reconcile-it.mjs`
- C23 — resumable-test-gates plans `do-it gate run`, `do-it gate queue`, an optional `gates` block in `.do-it/settings.json`, a T2 pipeline stage and a T3 nightly schedule (README §3–§7); its research names `core/spine/src/settings.mjs` for the settings code
- C24 — Review checkpoints, merge model and multi-round verdicts shipped in 1.0.1–1.0.5
- C25 — plan-it's SKILL tells the model to run `${CLAUDE_PLUGIN_ROOT}/scripts/status-from-plan.mjs` and `.../scripts/review-checkpoints.mjs`, but both live at `plugins/plan-it/scripts/`; in the installed cache (`~/.claude/plugins/cache/devotts/plan-it/5.2.0/`) the documented path does not exist
- C26 — do-it never reads the session id Claude Code provides: `start` takes it only from `--session` or `DO_IT_SESSION_ID`, never from `CLAUDE_CODE_SESSION_ID` (set by Claude Code in every Bash command); the plugin's `start` line passes neither, so by default a run is owned by its folder
- C27 — Engine-Core's stop-hook counter lists 30 sessions; 29 of them show three refused stops (the patience limit)
- C28 — All 62 questions in Engine-Core's owner packs (52, 1, 6, 3 across the 4 runs) were written by the stop gate; 59 sit on runs with no recorded session; 2 have been answered
- C29 — `status-write close` without `--move` closes an already-archived board in place; only conclude-it's wrapper refuses a package already in `0-done/`
- C30 — do-it's SKILL says `start "<request>"`, but the CLI requires `--request`
- C31 — Of the 2,034 times the stop gate parked an Engine-Core run, 1,997 hit a run that was already PARKED
- C32 — do-it 1.0.5 has no tag or GitHub release; the latest tag is v1.0.4
- C33 — Claude Code marketplace github sources accept `ref` (branch or tag, default branch when absent) and `sha`
- C34 — The audit chain's cost in this run: auditor (Fable) 132,544 tokens, ombudsman (Opus) 195,909 tokens; in `grokbot-plan` the ombudsman used 201,737
- C35 — `pack.mjs:21` already skips a question whose text exists in the pack; the 62 differ because the open-row list changed between parks
- C36 — Run statuses include PLANNING, AWAIT_RATIFY, VERIFYING, REVIEWING, FIXING, DEPLOYING, PROVING, CONCLUDING, PARTIAL_FAILURE, ROLLED_BACK besides INTAKE, BUILDING, PARKED, NEEDS_HUMAN, BLOCKED, DONE, ESCALATED, FAILED; READY is a slice status
- C37 — Engine host code lives in `core/`: `core/state-stores/engine.mjs` and `engine-drivers/*`, `state.engine` in `core/schemas/settings.schema.json:34` and `core/spine/src/settings.mjs:11`; G-12's word list in `core/spine/test/s1/s1.test.mjs:221` omits `engine`; no `.do-it/settings.json` under the pilot workspace sets a backend
- C38 — `claude`, `codex`, `opencode` appear in `core/` only under test folders (G-12 word lists, `core/routing/tests/meter.test.mjs:67-68` CLI probes, `router.test.mjs:58` request text)

## DO-NOT-PUBLISH (0)

- none

## Tokens per role

| Role | Model | Dispatches | Tokens |
|---|---|---|---|
| auditor | claude-sonnet-5-5 | 1 | 240000 |
| ombudsman | opus | 1 | 200000 |
