# KICKOFF — do-it 1.1 (build session)

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Dn ruling — see GLOSSARY.md

## 0. Pinning

- Plan package: `docs/implementation/do-it-1.1/` on branch `plan/do-it-1.1`, worktree `/Users/macbook/Workspace/Devotts/do-it/.worktrees/plan-read-origin-main` (from DevOtts/do-it `origin/main` d38cedb, do-it 1.0.5).
- Run state: `.plan-it/do-it-1.1.state.json` (state `done` once handed off).
- CONTRACT: `delivery/CONTRACT.md` v1.0 (final, ratified at G4 by Fernando Ott on 2026-11-06), sha256 `5ba3c1561c26d8739c1a679c4ea031b7849dd5ff287e473ee355d7ae842f3abf`.
- Decisions: `plan/DECISIONS.md` (D1–D14 resolved; R1–R5 owner rulings). Readiness: `plan/READINESS.json` (11 slices, 4 review checkpoints).
- Release: do-it 1.1.0. resumable-test-gates (RTG) builds after this as do-it 1.2.0 (D7).

## 1. First steps for the builder (in order)

1. Re-derive the tally from disk: `node {plan-it}/scripts/gate-check.mjs handoff docs/implementation/do-it-1.1/delivery` and count the cases per epic. Expect 11 epics, 55 tasks, 55 cases (S1 11, A1 5, B1 2, I1 2, K1 8, K2 4, E1 5, H1 4, L1 5, V1 3, Q1 6). On a mismatch, stop and report.
2. Check the CONTRACT hash above. If it differs, the contract changed after G4: stop.
3. Create one worktree per epic branch from the main session (CONTRACT §5). Subagents cannot run git in sibling repos.
4. Run the waves in order. Tier each worker by CONTRACT RUN-POLICY; escalate to opus when a case fails twice.

## 2. Waves

| Wave | Epics | Notes |
|---|---|---|
| W0 | K1 first, then S1, B1, I1, E1, H1, and A1 after K1 | K1 creates the public repo `DevOtts/doc-it` and tags 0.1.0 (K1-08, D1/D11). A1 calls `doc-it check archive`. |
| W1 | L1, V1 | both read doc-it (`doc-it tiers --json`, `doc-it check checkout`) |
| W2 | Q1, then K2 | K2 edits Q1's audit mode after it lands |
| W3 | integration and release | siblings tag first, then do-it 1.1.0 pins them; `check-pins --marketplace` must pass |

Review checkpoints (READINESS.json): CP-01 after W0, CP-02 after W1, CP-03 adversarial on S1, A1, Q1 (opus, fresh eyes), CP-04 pre-release.

## 3. Definition of Done

Every epic's Test Contract passes 100% on its repo's `origin/main`, each sibling is tagged and released, do-it pins the tags, and each checkpoint's verdict file says PASS (CONTRACT §6). [REAL] cases: T-S1-06, T-S1-09, T-I1-01, T-K1-02, T-K1-08, T-Q1-01. A [REAL] case whose target is unreachable is IMPLEMENTED-NOT-VERIFIED, never VERIFIED.

## 4. Gotchas

- Core names no host (R3, G-9): host code lives only under `hosts/<name>/`. E1 adds `engine` to the G-12 word list in `core/spine/test/s1/s1.test.mjs`.
- Documentation rules live in doc-it (G-10). A consumer that finds doc-it missing prints `[skip] doc-it not installed: <check>` (D14), never PASS and never fail.
- T-S1-06 replays on the pilot consumer repo named in this KICKOFF's operator notes; do-it's docs name no project (R3).
- Commit, push, tag and repo creation follow the owner's release process (memory `do-it-release-process`: siblings first).
- Out of scope: D15 (session receipts for conclude-it cleanup), deferred to the next version.

## 5. Launch prompt

```
/build-it docs/implementation/do-it-1.1 — build do-it 1.1.0 from the frozen package.
Read delivery/KICKOFF.md first and follow its §1 in order. Goal: CONTRACT v1.0 shipped (§6).
DoD: all 55 cases pass on origin/main of each repo, siblings tagged, do-it 1.1.0 pins them,
CP-01..CP-04 PASS. Work in worktree /Users/macbook/Workspace/Devotts/do-it/.worktrees/plan-read-origin-main
(branch plan/do-it-1.1). Run every wave to the end; route around blocks; report per criterion.
```
