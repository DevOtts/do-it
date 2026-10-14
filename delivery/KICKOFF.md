# KICKOFF: do-it v1 build

Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

## 0. Pinning (re-derive from disk first; stop and report on any mismatch)
- Repo: `/Users/macbook/Workspace/Devotts/do-it` @ no git history yet. **Step 1 of the build is `git init`, a first commit of the planning package, and recording that SHA here.**
- Run state: `/Users/macbook/Workspace/Devotts/do-it/.plan-it/do-it-v1.state.json` (state `freeze`, contract v1.1, gates G0 to G4 recorded)
- CONTRACT: `delivery/CONTRACT.md` v1.1, SHA-256 `e9a485e28a8bd16f1034c09c339f0cfb8855b5613504e7f859dafb7c42f98e5d`
- First numbered step for the builder: recompute the CONTRACT SHA-256, recount the test cases (`node gate-check.mjs handoff delivery/` must report 352 distinct IDs), and re-read `STATUS.md`. If anything differs, stop and report; do not rebuild from memory.

## 1. One line
do-it is the conductor of the DevOtts harness: one message in, a verified feature out, on Claude Code, Codex, OpenCode and Engine, token-optimized, with everything in `.do-it/` and a marketing-grade README.

## 2. What to read, in order
1. `delivery/CONTRACT.md` (the law; never edit, file amendments to the orchestrator)
2. `docs/03-data-model-and-contract.md`, `docs/02-vision-and-architecture.md`, `docs/05-components.md`
3. `delivery/00-program-plan.md`, `delivery/STATUS.md`, `delivery/DECISIONS.md`, `delivery/PLAN-REVIEW.md`
4. Your squad's PRD and epics under `delivery/prds/` and `delivery/epics/` (352 binding cases across 20 epics)
5. `delivery/README-SPEC.md` for epic R1; `docs/research/11-host-cli-probe.md` for every host fact
6. Deep background if needed: `docs/implementation/do-it-v1/` (design memo, token discipline, research 01 to 09)

## 3. Waves and first slice
W0: S1, S3, H0, R2. W1: S2, S5, P2, H1, R4 skeleton. W2: S4, P1, P4, H2, H3, N2. W3: P3, N1, N3, R3. W4: R1 (needs measured fixtures), R4 completion, release gates v0.1 to v0.4.
First vertical slice: a small feature through intake, plan, ratify via owner pack, one build slice, verification with evidence and conclude on `claude-code`, writing `it-result/1` at each stage and a token meter. That is the v0.1 done-when in `docs/06-roadmap-and-open-questions.md`.

## 4. Repo map and lanes
Lane paths are in CONTRACT section 5 and amended in section 11 (A2): L1 `core/spine`, `core/schemas`, `core/renderers`, `core/drivers`; L2 `core/pipelines|personas|routing|cache` and `core/renderers/attended-gate`; L3 `hosts/_interface`, `hosts/claude-code`, `hosts/codex`, `hosts/opencode`; L4 `hosts/engine`, `core/state-stores`; L5 `README.md`, `assets`, `plugins`, `.claude-plugin`, `scripts`, `tests`, root SKILL.md, LICENSE, CHANGELOG. One writer per path. Nothing under `core/` names a harness (G-12). Nothing in Engine-Core is edited except `docs/implementation/do-it-engine-layer/`. Sibling plugin repos are not edited by this program: R3 produces a change catalog only.

## 5. Locked decisions (do not re-ask)
D1 to D21 in `delivery/DECISIONS.md`. The ones that bite: Node single-file spine (D1); block, not warn, on ceiling, untiered spawn, fat-context wake and unaccounted close (D3); hosts are four (D6); owner pack `auto` (D7); review rounds 3 (D9); stop-gate patience 3 (D10); no warm cloud box (D15); Hermes and OpenClaw are out (D6, G-14). Defaults R1 to R8 stand. Open and not blocking: O1 reference video, O2 Engine adjustments to apply, O3 marketing channels.

## 6. Gotchas
- The plan-it write hook denies bare `claude-` words in deliverables; wrap them in backticks (`claude-code`), and never write literal model IDs: use tiers T1/T2/T3.
- Plugin `dependencies` validates, but install-time resolution is unverified: T-R2-11 records the truth and the README wording depends on it.
- Codex and OpenCode have no confirmed stop-hook equivalent: the stop-gate is a conductor checklist there (R5). Their real exit codes are undocumented.
- Token usage shapes of the three CLIs are inferred from binaries, not docs; meter cases may end IMPLEMENTED-NOT-VERIFIED.
- `deploy-it` and `reconcile-it` repos do not exist yet; keep them `planned` in `companions.json`.
- A plaintext Notion token sits in the owner's `~/.config/opencode/opencode.jsonc` (outside this repo): never read or print that file; the owner is rotating it.
- Tests for each lane live in the lane (CONTRACT section 11, A2); `tests/**` is L5 end-to-end only.

## 7. How to run it (RUN-POLICY in CONTRACT)
Orchestrator is a fresh T2 session (never the top model as a default). Squads are T2 in their own worktree after the first commit (worktrees only, reap on merge). Escalate a slice to T1 once if a lower tier fails its contract; log it. Write results to disk and finish with a content-bearing message; verify files on disk before advancing STATUS (idle is not delivered). On a usage limit: persist state to `.plan-it/` and `delivery/STATUS.md`, schedule a wake-up about every 30 minutes, and resume from the state files without waiting for the owner. Commit messages end with the attribution lines from the session; PR bodies end with the generated-with line.

## 8. Handoff state
Planning is complete and ratified: 20 epics, 352 cases, 101 marked `[REAL]`; all plan-it gates pass; STATUS shows every epic NOT-STARTED. Nothing is built.

## 9. Launch prompt (paste into the new session)
```
/build-it Build the do-it v1 plugin from the delivery package at /Users/macbook/Workspace/Devotts/do-it. First read delivery/KICKOFF.md and follow section 0 (git init, commit, record the SHA, re-derive the CONTRACT SHA-256 and the 352-case tally, stop on mismatch). The law is delivery/CONTRACT.md v1.1. Definition of Done: 100 percent of every epic's Test Contract in delivery/epics/ (S1-S5, P1-P4, H0-H3, N1-N3, R1-R4), each case VERIFIED with run output, or IMPLEMENTED-NOT-VERIFIED with the reason for the [REAL] cases whose live target is unreachable; gate-check handoff and adversary stay clean; the README (epic R1) follows delivery/README-SPEC.md and claims only what a fixture measured. Orchestrate with waves W0 to W4 from delivery/00-program-plan.md using T2 squads in worktrees, escalate hard pieces to T1 once, keep delivery/STATUS.md current, write the per-criterion report at the end, and do not stop until every STATUS row is VERIFIED, IMPLEMENTED-NOT-VERIFIED with a reason, or BLOCKED with a reason. Run unattended: on a usage limit persist state and schedule your own wake-ups every 30 minutes. Do not edit Engine-Core outside docs/implementation/do-it-engine-layer/ and do not edit sibling plugin repos.
```
