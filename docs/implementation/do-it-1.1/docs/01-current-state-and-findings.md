# do-it 1.1: current state and findings

Every factual claim below is a row in the claim ledger (`audit/claims.md`). Each row carries its source tier and an exact source. The ledger was checked by an independent auditor and an ombudsman before this plan was frozen (`audit/`). This doc states the findings; the ledger is the evidence.

The field evidence comes from one consumer repo, the pilot, whose identity and paths live in the ledger and the KICKOFF only (R3: do-it docs name no project).

Source tiers (TRUST-PROPOSAL §3.1): `live@date` · `code@repo@sha:path:line` · `git` (commit or tag) · `durable-doc` · `program-doc` · `transcript` · `local` (an uncommitted file on this machine).

## F1. The stop gate traps sessions that do not own the run, and fills the owner pack with noise

do-it 1.0.5 records a run's owner as a session id plus a folder, and its stop hook passes its session and folder to the gate (C2). In practice the session part rarely works:

- **do-it ignores the session id Claude Code already provides.** `start` reads it only from `--session` or `DO_IT_SESSION_ID`, never from `CLAUDE_CODE_SESSION_ID`, which Claude Code sets in every Bash command. The plugin's `start` line passes neither (C26). So by default a run is owned by its folder, and any session working in that folder counts as its owner (C3). The one pilot run with a real owner got it because the model exported the variable by hand (C6).
- **Legacy runs** (no `owner`) can be gated for everyone (C4).
- **Status is never read.** Of 2,034 parks in the pilot repo, 1,997 hit a run that was already PARKED (C5, C31).
- **One repo-wide finish line** (472 rows) judges every run on every other run's rows (C7).

Pilot repo: 4 PARKED runs, 2 with no session id, 1 owned, 1 legacy (C6). 30 sessions hit the stop hook there, and 29 of them show three refused stops (C27). In `P2-plan` that was seven refusals showing the repo-wide board (C8).

**What it costs you:** the owner pack is meant to be the one place for your decisions. In the pilot repo all 62 of its questions were written by the stop gate, not by any stage, and 2 of them have been answered (C28). The duplicate guard exists (C35); the questions differ only because the open-row list changed between parks.

## F2. Archiving to `0-done/` bypasses the status guard

conclude-it has a guarded close: `ledger-card.mjs close` refuses unless every task is verified or the owner gives a note, then calls `status-write close --move` (C11). But the ship pipeline's archive step S4 says to move the folder with a plain `git mv` (C12). In the pilot repo, all 3 `0-done/` programs that have a `status.json` show `closed: false` (C13). The repair needs no new code: `status-write close` without `--move` closes an archived board in place. Only conclude-it's wrapper refuses a package already in `0-done/` (C29). One was archived with its board at 0 of 48 tasks while half of it had shipped; its real disposition lived only in the commit message (C14).

## F3. harness-status-tracking shipped, but its own board says otherwise

Card B (status.json, the shared writer, render, migration) shipped in 1.0.1. REAL-VERIFY.md re-ran 42 binding cases: 41 verified against real artifacts, 1 parked (T-B-20, stale half) (C9). The program's own `status.json` still reads 8 tasks done, 0 verified (C10). `verified` may be set by review-it or carried forward by conclude-it; one attempt to mark a task verified was reverted because the verifying session had written it itself (ombudsman §5 item 9).

## F4. init-it is built but not released

Card A's `init-it` exists at `/Users/macbook/Workspace/Devotts/init-it`, with scripts, tests and an adversarial suite. Its CHANGELOG says "0.1.0 (unreleased, for do-it 1.0.1)". It is not a git repository, it is not in `core/companions.json`, and it is not in the marketplace (C15). build-it and review-it try to register sessions through init-it and skip silently when it is missing, which today is always; plan-it only tells the user to run `/init-it` (C15).

## F5. The Engine adapter advertises an integration the Engine declined

Engine PR #727 (the four hooks the do-it Engine adapter needs) was closed without merge on 2026-10-29 by owner decision. The comment says the hooks would open second paths beside the Engine highway, and that a do-it squad becomes an import format onto the normal `pipeline_definition` road (C16). The do-it README still lists Engine as "Supported" and describes adoption through the Engine layer (C17). The repo is now public (C18), so this claim reaches readers.

## F6. None of the trust mechanisms exist yet

review-it has no auditor or ombudsman mode. plan-it has no claim ledger, no source tiers, no shipped-layer check, and no check that the checkout it reads is current (C19). This package is the evidence that the chain works: the auditor found 1 false and 4 partial rows out of 24 plus 7 missed items, and the ombudsman amended 4 more, before any of it reached you (`audit/`).

## F7. Release hygiene residuals

- prompt-it is pinned and listed at 1.0.0, but its only tag and release is v0.2.1 (C20). do-it's own 1.0.5 has no tag or release; the latest is v1.0.4 (C32).
- The marketplace entries carry no `ref`, so an install takes each sibling's default branch head, not the pinned version (C21). The marketplace format supports `ref` and `sha` (C33).
- reconcile-it still ships a duplicate `scripts/reconcile-it.mjs` that is byte-identical to the plugin copy (C22).
- The 1.0.0 KICKOFF and the 1.0.0/1.0.1 CHANGELOG entries say the repo is private; it is public (C18). The KICKOFF also says PR #727 is held (C16).
- do-it's own SKILL says `start "<request>"`; the CLI requires `--request` (C30).

## F9. plan-it documents script paths that do not exist when installed

plan-it's SKILL tells the model to run `status-from-plan.mjs` and `review-checkpoints.mjs` under `${CLAUDE_PLUGIN_ROOT}/scripts/`. Both scripts live under `plugins/plan-it/scripts/`, so in the installed cache the documented command fails with MODULE_NOT_FOUND (C25). Any run that follows the SKILL literally skips the status board and the review checkpoints, or improvises a path.

## F8. Coupling with resumable-test-gates (planned by another session)

That proposal adds `do-it gate run` and `do-it gate queue`, an optional `gates` block in `.do-it/settings.json`, a T2 pipeline stage and a T3 nightly schedule (C23). F1's fix lives in `core/spine/src/stopgate.mjs` and `state.mjs`. Both rebuild the single generated `core/spine/do-it.mjs`, so they conflict on that file even when their sources do not overlap.

## F10. One host leaked into the core

do-it keeps host integrations under `hosts/<name>/`, and rule G-12 "core names no harness" is tested (T-S1-13). But its word list is claude, codex, opencode and two removed hosts; `engine` is not in it. `core/state-stores/engine.mjs`, its drivers (`http-rows`, `r2`, `memory-engine`), the `state.engine` settings default and the schema key live in `core/`. `scripts/check-readme.mjs` and `scripts/generate-skill.mjs` hard-code the host list, and `tests/e2e/r4.test.mjs` imports `hosts/engine/live/probe.mjs`. No consumer repo on this machine sets `backend: engine`, and neither the spine nor the claude-code host imports the store (C37). Claude Code, Codex and OpenCode do not appear in core source; they appear only in core tests, as the G-12 word lists and as host CLI probes (C38).

## What is already shipped (do not re-plan)

- Review checkpoints from READINESS.json, merge model, multi-round verdicts (1.0.1–1.0.5; C24).
- Status tracking, Card B (C9).
- Stop-gate session/cwd scope (C2): F1 extends it, it does not replace it.
