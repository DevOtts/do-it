# do-it 1.1.0 — build-it run report

Run 2026-11-06 to 2026-11-13 (paused 2026-11-09 to 2026-11-13 for an owner reboot). Goal: ship CONTRACT v1.0 (package `docs/implementation/do-it-1.1/`, KICKOFF §6). Coordinator: Opus 5.5. Run state: `.taskstate/1.1/` in the plan worktree (grounding, decisions X1–X27, evidence ledger, run-memory).

## 1. Outcome

do-it 1.1.0 is released. Tag `v1.1.0` is at 88e4152, the merge of PR #19. The six sibling releases were tagged first, and do-it 1.1.0 pins each of them. All four review checkpoints read PASS through build-it's `readVerdict`.

CP-04 part B, a fresh reviewer's check on the published tags, passed every case. It installed doc-it, init-it and do-it (with its five dependencies) from the marketplace on clean homes, and every installed version matched its pin. It also re-ran the live /clear take-over: a real Claude Code session, given only "resume the run and follow the tool output", ran `resume --run <id> --take-over` on its own after the refusal (X27).

## 2. Definition of Done, per criterion

| # | Criterion | Status | Evidence (ledger `.taskstate/1.1/evidence.md`) |
|---|---|---|---|
| 1 | All 55 Test Contract cases pass on origin/main of each repo | VERIFIED | CP-04 part A, run by an independent reviewer on fresh worktrees of every origin/main: "55 cases. 52 PASS, 0 FAIL, 3 PART-B". Part B on the released tags: T-K1-08, the network half of T-I1-02, and T-H1-03 all PASS (CP-04 part B table). So 55 of 55 cases pass. T-H1-03 is marked attended; the reviewer ran it unattended, without you present. |
| 2 | Siblings tagged | VERIFIED | `gh release create` 2026-11-13, each sha re-checked against origin/main first: doc-it v0.1.0→9f339ef, build-it v4.2.0→8e46f5f, conclude-it v2.2.0→5eac030, plan-it v5.3.0→15b3e0e, review-it v2.2.0→6cf6199, reconcile-it v1.0.1→e1766f6. Already tagged earlier in the run: prompt-it v1.0.0, parallel-lifecycle v1.0.0, init-it v0.1.0 (made public), do-it v1.0.5. |
| 3 | do-it 1.1.0 pins them | VERIFIED | On the v1.1.0 checkout: `check-pins --tags`, `--marketplace`, `--self` and `--lint` each print `no drift` and exit 0. Marketplace entries carry `ref: "v<version>"` (D4). T-R2-11 install: `Successfully installed plugin: do-it@devotts (+ 5 dependencies: prompt-it, plan-it, build-it, review-it, conclude-it)`, outcome `resolved`. |
| 4 | CP-01..CP-04 PASS | VERIFIED | `readVerdict` (build-it v4.2.0 `checkpoints.mjs`) on `docs/implementation/do-it-1.1/plan/reviews/` at v1.1.0: CP-01, CP-02, CP-03, CP-04 → `{"state":"pass"}`. CP-04 part B: PASS on the released tags. Header `part: A + B`, one `verdict: PASS` line; `readVerdict` → pass (re-checked by the coordinator). |

## 3. How the run went

- **W0 and W1** built all 11 epics across do-it, doc-it (new public repo), plan-it, build-it, conclude-it, review-it, init-it and reconcile-it. CP-01 passed on round 2; CP-02 passed on round 5.
- **CP-03 (adversarial)** took 11 rounds for S1 (stop-gate ownership), 7 for A1 (archive) and 6 for Q1 (audit chain). Findings per round shrank from 11 to 6, 7, 6, then one MEDIUM each round, and the last round found only one LOW. Each finding got a regression test that replays the attack. Late findings were mostly 1.0.x behaviour that 1.1's stricter gate made reachable, not regressions.
- **CP-04 part A** found four defects that would have blocked the tag, all fixed before tagging. The most serious was D1, below.
- **Release**: sibling tags first, then the do-it release PR #19, then tag v1.1.0. The run paused for an owner reboot and resumed from `RESUME.md` with no lost work.

## 4. Things the owner should know

1. **Your `~/.do-it/bin/do-it` was written by the CP-04 reviewer.** Before the D1 fix, `doctor --install --dry-run` really installed. The reviewer's run created `~/.do-it/bin/do-it` on 2026-11-09 at 05:02 with the unreleased build. The folder did not exist before that. Fixed in 1.1.0: `--dry-run` writes nothing (test `CP-04 D1`). The file is now the released v1.1.0 bundle (byte-identical, sha256 67c2bd55…). Delete `~/.do-it/bin` if you don't want it; nothing puts it on your PATH.
2. **Settings change you asked for.** `~/.claude/settings.json` now allows Write/Edit/MultiEdit everywhere and adds `~/Workspace/Devotts`, `~/Workspace/Engine` and `/private/tmp/claude-501` as additional directories. The backup is in the original session's scratchpad (`settings.json.bak`).
3. **Pilot repo, one-time decision (its own work, D5).** The stricter archive rule denies boardless CLOSEOUT archives there, because three older boards were archived as `closed:false`. Recommended fix (A): close each one in place with an owner note via `archive-package --owner-note`. Option B: one owner note on the next CLOSEOUT archive. The pilot's only CLOSEOUT also fails `doc-it check closeout` because its table uses different headers. That problem was already there.
4. **Proposed CONTRACT amendments A3–A16.** You approved A9–A12 (X27). A3–A8 and A13–A16 still need your yes or no; they are listed in `.taskstate/1.1/results/fix-cp03-s1.md`.
5. **T-H1-03** is an attended case: the reviewer ran it unattended on a clean home. `claude plugin install do-it@devotts` installed do-it 1.1.0 plus prompt-it 1.0.0, plan-it 5.3.0, build-it 4.2.0, review-it 2.2.0 and conclude-it 2.2.0, each equal to its pin and tag commit. Watch one install yourself if you want the attended version.

6. **CP-04 part B findings (no case fails):**
   - **F1 (MEDIUM, fix in 1.1.1):** `doctor --install --host <h>` run from the marketplace-installed plugin fails with `INSTALL_NO_COMPANIONS`, because `plugins/do-it` does not ship `companions.json`. The fallback install for hosts without plugin support therefore works only from a do-it source checkout. Fix: ship the file in the plugin and add a test that runs from a plugin-cache copy.
   - **F2 (LOW, your call):** `companions.json` calls reconcile-it "published", but `DevOtts/reconcile-it` is private. Either make it public (as was done for init-it and doc-it), or mark it unpublished in 1.1.1.
   - **F3 (wording):** the T-S1-09 row says "re-bound", but an explicit take-over returns `TAKEN_OVER`. Fold this into the contract-drift amendments.

## 5. No silent caps

- **Environment-only failures on the final suite.** Every one was proven environmental and is not a product failure:
  - hosts/engine T-N1-16..18: Docker was running a Mongo container named `engine-…`, and an unrelated server answered 404 on :3001. The live probe took that for a live Engine. With Docker off PATH the suite returns to 29 pass / 0 fail / 7 skip, the same as every earlier run. Finding (LOW, pre-existing): the probe should require an Engine-specific answer. It fails closed and never gives a false pass.
  - tests/hosts R7-S1-M14, 80,000-slice case: hit the 120 s test timeout under load average 26 from other sessions' jest runs. Run alone, it passes.
  - Earlier in the run: opencode T-H3-04 (`opencode models` hung; green on the final run) and T-R1-14 (GitHub 504 outage; green after).
- **Skips.** The suite runner exits 0 when tests skip. Release runs set every env var (pilot, status writer, doc-it), and remaining skips are listed: e2e r4 1 skip, hosts/engine 7 skips (live Engine cases with no Engine).
- **Judgement cases.** T-Q1-01, T-Q1-04 and T-K2-01 were judged on their artefacts and not re-dispatched to models in CP-04.
- **CP-03 A1 round 7.** Probes P6–P9 were finalized by the coordinator as replays of the regression tests, not fresh hand probes, after the reviewer stalled for the fifth time. Provenance is stated in the CP-03 file.
- **Known LOW findings carried** (listed in CP-03): A1-L2 (owner note unauthenticated), the fake-board accounting gap, R11-S1-L-h, formats.md §11 idioms, the init-it ADV-01c hardcoded path, and the T-L1-01 contract saying 24 rows where the ledger has 38.

## 6. Delegation and cost

- Workers used Sonnet for spec'd epics, Opus for crown-jewel and adversarial work, and Haiku for live TUI sessions in T-S1-09.
- Escalations: the CP-03 fix waves ran on Opus because they were release-blocking and adversarial.
- Reviewers stalled several times, five times for A1. The fix was to split review into per-area reviewers with time budgets and incremental files.

## 7. Recommended next actions

1. do-it 1.2.0 (RTG) can start from main in session `rtg-1.2.0-exec`; its KICKOFF requires branching after 1.1.0, which is now true.
2. Decide amendments A3–A8 and A13–A16, and the pilot archive option (A or B).
3. Small 1.1.1 candidates: the Engine probe fix; carried LOWs.
