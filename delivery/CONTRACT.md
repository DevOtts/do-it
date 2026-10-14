# CONTRACT: do-it v1

**Version:** v1.1 · 2026-10-14 · run `do-it-v1` · autonomous-draft, ratified at G4 by Fernando Ott (defaults R1 to R8 stand; open O1 to O3 carried to the build)
Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

This is the law for every squad. Squads write to it; cross-cutting findings fold back as dated amendments (v1.0 to v1.1). Explanation lives in docs/02 and docs/03.

## 1. Vocabulary
Run, slice, stage, spine, conductor, host, owner pack, finish line, tier: as defined in GLOSSARY.md. Stages: prompt-it, plan-it, build-it, review-it, deploy-it, conclude-it, reconcile-it. Hosts in v1: claude-code, codex, opencode, engine. Hermes and OpenClaw are out of scope (D6); no folder, adapter or test for them exists in v1.

## 2. Schemas
- **it-result/1** (every stage, atomic write): fields schema, stage, run_id, slice_id, version, head_sha, status (ok, needs_human, blocked, failed, context_reset, usage_limit), exit_code, verdicts (row, verdict, evidence, real), run_verdict (DONE_ALL_VERIFIED, DONE_WITH_RESIDUALS, BLOCKED, NEEDS_RESET, USAGE_LIMIT), next, pending_human, artifacts (path, kind, sha256), resume (state_files, next_action), tokens (meter, peak_ctx, tier_mix, estimated). exit_code mirrors status: ok 0, failed 1, needs_human 2, blocked or usage_limit or context_reset 3.
- **do-it-state/1** (runs/{run_id}/state.json, spine only): run_id, preset, request, status, size, host, stage, slices, gates, handoffs, stop_refusals, review, created_at, updated_at.
- **events row**: ts, run_id, slice_id, stage, persona, tier, model, host, event, parent_id, verdict. **token-meter row**: events fields plus tokens_in, tokens_out, cache_read, cache_write, estimated, source (provider, estimate, unknown).
- **finish-line.json**: rows with id, kind (wave, package, dod), state (OPEN, DONE, PARKED, BLOCKED), evidence, owner_question, reason, archived_to.
- **owner-pack.json**: pack_id, run_id, questions (n, kind, text, options, recommendation, default, reversible). Reply grammar: tokens of the form `N answer`, `all except N N`, `N: free text`.
- **settings.json**: version, interaction, host, isolation, state, secrets (references only), handoff, review, tiers, ceilings, stop_gate, observability. Precedence: run flag, workspace, global, defaults.
- **host capabilities.json**: host, version_probed, spawn, ask, continue, wake, meter, hooks, isolation, unknown.
- **pipeline step** (YAML): id, type (persona, checkpoint, decision, code), persona, skill, tier, gate, ask, consumes_previous, loop_to, max_rounds, eval, adapter, needs, on_limit.

## 3. Interface contract
**Spine commands:** init, start, next, record, gate, answer, handoff, resume, park, status (with --json), meter, doctor (with --migrate and --install). **Exit codes:** 0 ok, 1 failed, 2 needs human, 3 blocked or usage limit.
**HostAdapter calls:** spawn(role, tier, brief) returns a result path; ask(pack); collect() returns answers; continue(handoff); wake(at, prompt); meter() returns usage or null; drivers isolation, secrets, stateStore. A missing capability triggers the documented fallback in section 6.
**StateStore:** get, put, append, list over runs/{run_id}/ paths; backends local-fs, git-branch, engine.
**deploy-it adapter:** `.deploy-it/adapter.json` plus commands speaking the LEG protocol; results DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN.

## 4. Enums and constants
Tiers T1 powerful, T2 balanced, T3 cheap. Task classes: deterministic, gather, implementation, hard. Verdicts: VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED. Run statuses: INTAKE, PLANNING, AWAIT_RATIFY, BUILDING, VERIFYING, REVIEWING, FIXING, DEPLOYING, PROVING, CONCLUDING, DONE, NEEDS_HUMAN, PARKED, BLOCKED, FAILED, PARTIAL_FAILURE, ROLLED_BACK, ESCALATED. Review exits: CONVERGED, CONVERGED_WITH_MINORS, STALLED, OVER_BUDGET. Severity: blocker, major, minor, nit. Defaults: review rounds 3, stop-gate patience 3, handoff cap 5, brief limit 8000 tokens, ceilings warn 150000 tokens or 40 percent, block 250000 tokens or 60 percent.

## 5. Repo ownership and branch conventions
Branches: `epic/{EID}-{slug}`, one worktree per squad (G-10 of plan-it: worktrees only). One writer per path.
| Lane | Squad | Owns |
|---|---|---|
| L1 | spine | core/spine/**, core/schemas/**, core/renderers/**, core/drivers/** |
| L2 | economy | core/pipelines/**, core/personas/**, core/routing/**, core/cache/** |
| L3 | hosts-a | hosts/_interface/**, hosts/claude-code/**, hosts/codex/**, hosts/opencode/** |
| L4 | engine | hosts/engine/**, core/state-stores/**, Engine-Core docs/implementation/do-it-engine-layer/** (docs only) |
| L5 | ship | README.md, assets/**, plugins/**, .claude-plugin/**, scripts/**, tests/**, core/companions.json |
core/ never names a harness (G-12). Nothing in Engine-Core outside `do-it-engine-layer/` is edited. Sibling plugin repos are not edited by this program; R3 produces a change catalog only.

## 6. Fallbacks (capability missing)
No native subagents: run the role as a separate sequential pass. No native question tool or more than 4 questions: html, then markdown. No headless start: `handoff.mode` becomes ask and prints the one-line command. No wake: park and say so. No provider usage: estimate and flag. No stop hook: conductor checklist (R5).

## 7. Definition of shipped
An epic is shipped when 100 percent of its Test Contract passes with evidence, `gate-check handoff` and `adversary` are clean, no case marked real is VERIFIED on a mock, and the epic's files live only in its lane. A real case whose target is unreachable is IMPLEMENTED-NOT-VERIFIED.

## 8. Core-logic models
Full text in docs/03 section 12; frozen here.
**M1 run lifecycle.**
INTAKE --> PLANNING --> AWAIT_RATIFY --> BUILDING --> VERIFYING --> REVIEWING --> DEPLOYING --> PROVING --> CONCLUDING --> DONE
REVIEWING --> FIXING --> VERIFYING
BUILDING --> FAILED ; FAILED --> BUILDING (retry one tier up, once) ; FAILED --> ESCALATED (second failure)
DEPLOYING --> PARTIAL_FAILURE ; PARTIAL_FAILURE --> ROLLED_BACK ; ROLLED_BACK --> DEPLOYING (re-verify after fix) ; ROLLED_BACK --> ESCALATED (rollback fails)
BUILDING --> PARKED ; PARKED --> BUILDING (resume from state)
AWAIT_RATIFY --> NEEDS_HUMAN ; NEEDS_HUMAN --> BUILDING (answered)
BUILDING --> BLOCKED ; BLOCKED --> BUILDING (unblocked)
**M2 review loop.** ROUND_RUNNING --> CONVERGED ; ROUND_RUNNING --> CONVERGED_WITH_MINORS ; ROUND_RUNNING --> STALLED ; ROUND_RUNNING --> OVER_BUDGET ; STALLED --> ESCALATED ; OVER_BUDGET --> PARKED.
**M3 conductor ceiling.** CONDUCTOR_ACTIVE --> CEILING_BLOCKED --> HANDOFF_WRITTEN --> CONDUCTOR_RESUMED ; HANDOFF_WRITTEN --> HANDOFF_FAILED ; HANDOFF_FAILED --> HANDOFF_WRITTEN (retry, cap 5) ; HANDOFF_FAILED --> ESCALATED (cap reached).
Required failure coverage: FAILED, PARTIAL_FAILURE, ROLLED_BACK, ESCALATED, STALLED, OVER_BUDGET, HANDOFF_FAILED, BLOCKED, PARKED each asserted as an outcome, and the five cascade classes covered or waived.

## 9. Governance rules
- G-1 The spine is the only writer of run state; no stage, persona or host writes state.json (test: T-S1-01).
- G-2 A row is `VERIFIED` only with evidence that resolves to a file or ID the spine can check (test: T-S3-01).
- G-3 A case marked real is never VERIFIED on a mock; unreachable target is IMPLEMENTED-NOT-VERIFIED (test: T-S3-02).
- G-4 Every spawn names a tier; T1 needs a written reason or is downgraded; conductor default is T2, never the top model (test: T-P2-01).
- G-5 At the context ceiling the spine blocks the next step until a handoff is written (test: T-S5-01).
- G-6 Models never state token usage; the meter records provider usage, an estimate flagged estimated, or unknown (test: T-P2-02).
- G-7 Credential values never appear in events, briefs, owner packs, logs or model context (test: T-S5-02).
- G-8 Build cannot start without a readiness verdict; no mid-run question except an owner gate (test: T-S2-01).
- G-9 The stop-gate refuses at most the patience count without progress, then parks and asks (test: T-S2-02).
- G-10 Review loops exit only through the four review exits; only blockers and majors loop (test: T-P4-01).
- G-11 A brief is at most 8000 tokens and every path or ID it cites is validated to exist (test: T-P2-03).
- G-12 core/ contains no harness name; harness code lives only under hosts/ (test: T-H0-01).
- G-13 conclude refuses to close with an unaccounted row, a live worker or a pending wake-up (test: T-S3-03).
- G-14 Hermes and OpenClaw have no folder, adapter or test in v1 (test: T-H0-02).
- G-15 Public README claims are limited to what a fixture measured (test: T-R1-01).
- G-16 Owner reply parsing is deterministic: the same reply yields the same answers on every host (test: T-S4-01).
- G-17 Untrusted text never selects tools, repos or hosts; only code publishes (test: T-N1-01).

## RUN-POLICY
| Role | Tier | Reason |
|---|---|---|
| conductor | T2 | thin dispatcher; never the top model |
| intake | T3 | mechanical gathering |
| planner | T1 | ambiguity resolution; written reason required |
| builder | T2 | specified implementation against a test contract |
| verifier | T2 | never the builder |
| reviewer | T2 | writes the roteiro, classifies severity |
| runner | T3 | executes a script; T2 for visual walks |
| deployer | code | deterministic LEG protocol |
| concluder | T2 | ledger and archive |
| reconciler | T2 | inventory and dispositions |
Escalation: one tier up per slice, once, logged; then the owner pack. Downgrade one tier after three first-try passes of a class. Tier changes only at a spawn or stage boundary.
Worktrees: reap-on-merge, a squad's worktree and branch are removed once its work is merged and captured on disk. Delivery: every worker writes results to disk and ends with a content-bearing final message; a worker that goes idle without files is re-dispatched (idle is not delivered).

## 11. Amendments folded from squads (v1.1)
- **A1 settings:** `host.driver` defaults to `auto` (resolved from the capability files under hosts); the settings schema never enumerates harness names. Add `review.cost_cap_tokens` (default 600000, calibrate with fixtures) and `state.engine.blobs` (rows, r2 or fs-mirror; default rows; r2 fails closed when unconfigured).
- **A2 lane paths:** the plugin manifest source is `hosts/claude-code/plugin/.claude-plugin/plugin.json` (L3); L5 mirrors it with `scripts/sync-mirror.mjs`, and mirror copies under `plugins/do-it/` count as L5 outputs. The fallback module is `hosts/_interface/lib/fallbacks.mjs`. Lane-local tests live in `hosts/*/tests`, `hosts/engine/fixtures`, `core/spine/test`, `core/state-stores/tests`, `core/state-stores/conformance`; `tests/**` is L5 cross-cutting e2e. L5 also owns root SKILL.md, LICENSE and CHANGELOG.md. The attended-gate generator lives at `core/renderers/attended-gate/**` and is owned by L2.
- **A3 G-12 scope:** the harness-name scan excludes test directories and allows provider names (anthropic, openai, deepseek) in `core/`, because drivers.json is keyed by provider. Hook executables are supplied by hosts through the env names `DO_IT_HOST_CONTINUE` and `DO_IT_HOST_WAKE`.
- **A4 state:** optional state fields `ceiling`, `park`, `handoff_state`; a `.state.sha256` sidecar detects tampering; ledger row `{row, verdict, evidence, real, updated_at}`; deploy legs `{leg, state, evidence, compensate}`; events rows may carry an optional `detail`.
- **A5 reasons and answers:** STALE_HEAD and BUDGET_DENIED are reasons (result status blocked; budget denial maps to OVER_BUDGET then PARKED), not run statuses. Owner-pack answer states add `answered` and `accepted-by-default`; first valid reply per question ID wins across channels (Engine to confirm).
- **A6 grammar and constants:** reply grammar accepts `and` and commas in `all except`; a semicolon or newline ends free text. Token estimate is characters divided by 4. Codex reasoning tokens go in an `extra` field and Codex cache_write is recorded as 0. Review-loop exit checks run in this order each round: convergence, cost cap, repeated fingerprint (raise tier once), counts not falling, round budget.
- **A7 labels:** PRD-local decision numbers are local; owner rulings are cited as `ruling Dn`.

## 12. Changelog
- v1.1 2026-10-14: ratified at G4 (draft suffix removed); no default contradicted.
- v1.1-draft 2026-10-14: squad amendments A1 to A7 folded (Fernando Ott ratifies at G4).
- v1.0-draft 2026-10-14: frozen from docs/01 to docs/06 for squads; owner rulings D1 to D21 applied; hosts reduced to four at G1 (Fernando Ott).
