# do-it next — Kickoff Note

Orientation for a FRESH session continuing **do-it** after the 1.0.0 release. Read this first. No spec exists yet for the next enhancements: the first step is to agree the scope with the owner, then plan it (see the prompt).

## What you're continuing (one line)
do-it v1.0.0 is built, merged and private. The next work is enhancements on top of 1.0.0, and it is not yet scoped.

## Where things stand
- Repo: `DevOtts/do-it` (private), local `/Users/macbook/Workspace/Devotts/do-it`, `main` at `c6718de` (release commit `57ab470`, ledger card and lessons on top).
- Version stays **1.0.0** until the owner says otherwise.
- Verified: 347 of 352 contract cases VERIFIED. 5 are IMPLEMENTED-NOT-VERIFIED (see below). Report: `.build-it-reports/REPORT.md`. Lessons: `.build-it-reports/lessons.md`. Ledger card: `.agents/history/claudinho/2026-10-18--do-it-v1-exec.md`.
- Companions merged to `main` at these versions: prompt-it 1.0.0, build-it 4.0.0, plan-it 5.0.0, review-it 2.0.0, conclude-it 2.0.0, parallel-lifecycle 1.0.0. Pins are in `core/companions.json`.
- deploy-it 1.0.0 and reconcile-it 1.0.0 are released (tags `v1.0.0`), private.

## Open items (the candidate scope for enhancements)
1. **Engine-HQ `brain-api-core` PR #727 is held.** It adds the four Engine hooks the do-it adapter needs. Its CI fails and `main` is red on the same commit (Docker build and E2E), so nothing was merged into Engine. Decide whether to fix the Engine CI first, or merge with a known-red check.
2. **T-N3-14 is IMPLEMENTED-NOT-VERIFIED** because no do-it W3 pipeline runs on the Engine (no run status or exit code to compare).
3. **T-R4-05 is IMPLEMENTED-NOT-VERIFIED** because the Engine has no drain driver.
4. **T-S5-16 and T-S5-17** need live `aws` / `op` access, which has not been given.
5. **T-R1-15** is matched only against a stub-host run; needs a real-host run with a non-clean state.
6. **WhatsApp and chat transports are not built.** Only the Control Tower card works as a reply channel.
7. **Docs gap:** brain-docs `squads.md` and `tasks.md` do not mention the new Engine fields yet.
8. **reconcile-it 1.0.1:** remove the duplicate `scripts/reconcile-it.mjs` at the repo root. Identical to the plugin copy; removing it needs a new tag.
9. **Visibility:** `DevOtts/do-it` stays private until the owner reviews and says public. The README install commands need public access.
10. **Companion pins for deploy-it and reconcile-it** are set in `core/companions.json` as `published`; confirm they match the marketplace once they go public.

## How to run + test (this session's setup)
- Test suites, from the repo root, with the siblings path set:
  ```
  export DO_IT_SIBLINGS=/Users/macbook/Workspace/Devotts
  node --test "core/spine/test/**/*.test.mjs"        # 89
  node --test "core/routing/tests/*.test.mjs"        # 24
  node --test "core/cache/tests/**/*.test.mjs"       # 18
  node --test "core/pipelines/tests/*.test.mjs"      # 11
  node --test "core/pipelines/review-loop/tests/*.test.mjs"  # 23
  node --test "core/personas/tests/*.test.mjs"       # 7
  node --test "core/state-stores/tests/*.test.mjs"   # 21
  node --test "hosts/_interface/tests/*.test.mjs"    # 18
  node --test "hosts/codex/tests/*.test.mjs"         # 17
  node --test "hosts/opencode/tests/*.test.mjs"      # 18
  node --test "hosts/engine/tests/*.test.mjs"        # 35
  node --test "tests/plugin/*.test.mjs"              # 16
  node --test "tests/catalog/*.test.mjs"             # 16
  node --test "tests/readme/*.test.mjs"              # 22
  node --test tests/e2e/r4.test.mjs                  # 25 pass, 2 paid-gated skips
  ```
- After touching `core/spine/src/`: `node core/spine/build.mjs` (rebuilds `core/spine/do-it.mjs`).
- After touching mirrored files: `node scripts/sync-mirror.mjs --write`. Check: `--check`.
- Claims: `node scripts/gen-claims.mjs --write` (check with `--check`).
- Gate-check (plan-it's script): `node /Users/macbook/Workspace/Devotts/plan-it/scripts/gate-check.mjs handoff delivery/` and `... adversary delivery/`. Both PASS on 1.0.0.
- Pushes and pulls to DevOtts repos need the token in the same command: `GH_TOKEN=$(gh auth token --user DevOtts) git push ...`. Never print the token.
- Engine local stack (only if re-running live cases): Docker dev stack, brain-api-core on `:3001`, flags `HOST_ADAPTER_API_ENABLED=true` and `CT_TASKS_ENABLED`. Use a scratch database and drop it afterwards.

## Gotchas to carry forward (bit us this session)
- **macOS `sed '0,/re/'` silently does nothing.** It is not supported on macOS. Use a node script to change an exact field.
- **`JSON.stringify` rewrap churn.** Rewriting a manifest reflows arrays and adds noise. Replace only the version string.
- **Pre-merge catalog checks replay baselines.** `tests/lib/pre-merge-siblings.mjs` replays each sibling at its pre-PR commit and the pins from `2aff89a`. Do not point them at live checkouts after the PRs merge.
- **Citations must cite published `origin/main`.** A catalog citation once pointed at an unpushed local `plan-it` branch (line 67 vs 63).
- **Local sibling checkouts may be on the wrong branch.** `plan-it` is on `variables-contract-item` with an unpushed commit from another session. Do not switch or reset it.
- **Test scratch folders** `dit-*`, `doit-*`, `pre-merge-*`, `r3-apply-*` are created under `$TMPDIR` by the suites and may hold fixture `.secrets`. Clean them after runs.
- **The `rtk` wrapper rewrites compound `find`.** Use globs with a timestamp marker instead.
- **Engine-HQ `main` is red.** Do not treat a red PR check as caused by the PR without checking `main` first.
- **Untracked folder from another session:** `docs/implementation/harness-status-tracking/` is not part of do-it 1.0.0. Leave it out of commits.
- **Vault mirror is not pushed.** `~/Workspace/Vault/OttVault` has a broken remote and 57 unrelated dirty files. The ledger card is mirrored locally only.

## Handoff state
- Done and pushed: do-it 1.0.0 on `main`; six companion PRs merged; Engine docs PRs (brain-docs #220, engine-workspace #227) merged; deploy-it and reconcile-it released; ledger card committed.
- Open and owed back to the owner: items 1, 9 and 4 above. Scope for the enhancements is not decided.
- This note itself is **uncommitted** in do-it. Commit it when the owner agrees to the scope.
