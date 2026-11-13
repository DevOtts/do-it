# resumable-test-gates (do-it 1.2.0) — handoff after do-it 1.1.0

Read this after `delivery/KICKOFF.md`. KICKOFF and the CONTRACT are the frozen plan and stay authoritative. This note
carries what changed since planning: do-it 1.1.0 shipped on 2026-11-13 in session `do-it-1.1.0-exec`, plus what that
build learned. Where this note and KICKOFF differ on a fact about the repo today, this note is newer. Where they differ
on scope or rules, KICKOFF and the CONTRACT win.

## 1. State of the world (2026-11-13)

- **KICKOFF §1.3 precondition is met.** do-it 1.1.0 is released: tag `v1.1.0` @ 88e4152, PR #19. `main` has
  post-release docs and test fixes on top; branch from the latest `origin/main`, never from 88e4152.
- **Sibling releases 1.1.0 pins:** prompt-it 1.0.0, plan-it 5.3.0, build-it 4.2.0, review-it 2.2.0, conclude-it 2.2.0,
  reconcile-it 1.0.1, init-it 0.1.0, doc-it 0.1.0 (new public repo; the trust-standard CLI). Local sibling checkouts
  under `~/Workspace/Devotts/` are on `main` at those versions.
- **CONTRACT hash re-checked:** `delivery/CONTRACT.md` sha256 is still 584304c1…4639, matching KICKOFF §0.
- **The plan was grounded on do-it 1.0.5 (d38cedb); 1.1.0 changed 28 files in `core/spine/src/`.** The ones RTG
  touches or must coexist with:
  - `cli.mjs` (`parseArgs`, KICKOFF gotcha A7),
  - `stopgate.mjs`, `session.mjs`, `sessions.mjs`, `resume.mjs` (session-owned runs),
  - `fs-atomic.mjs` (capped, FIFO-safe IO),
  - `state.mjs`, `settings.mjs`, `verify.mjs`.

  Re-ground on current `main` before writing L1/V1. `core/gates/` does not exist yet, and neither does any
  `gate-*.mjs` the CONTRACT names, so there is no collision.
- **The package is not on `main` yet.** It lives on branch `plan/resumable-test-gates` (PR #15, worktree
  `.worktrees/plan-rtg`) and as an untracked copy in the main checkout. Both copies are identical.
- **The existing do-it run is `r-20261106-130657-7ff2`**, status BUILDING, in the main checkout's `.do-it/`. Its
  owner is an older session. Under 1.1.0 rules, see §3.4.

## 2. First thing to do: land PR #15 without turning `main` red

PR #15 merges cleanly and changes only its own folder, but `tests/catalog` neutral-names (R3/X18, added in 1.1) fails
on 9 tracked files that name the pilot consumer repos or their programs:
- `.plan-it/resumable-test-gates.state.json`
- `ENV-FACTS.md`, `ENV-PROBES.json`
- `plan/READINESS.json`
- `research/01-do-it-repo.md`, `research/02-*.md`, `research/03-*.md`
- `research/PILOT-PATHS.md`, `research/SHARED-CONTEXT.md`

The CONTRACT is clean, so its hash is unaffected. The 1.1 precedent (decision X18) is to redact names in tracked files.
The scan exempts only `docs/implementation/*/audit/**`. The cleanest fix:
1. Move pilot-specific evidence (PILOT-PATHS, the per-pilot research notes, ENV-*) under the package's `audit/`.
2. Redact the names in the few remaining files (state, READINESS).
3. Run `node --test 'tests/catalog/*.test.mjs'` **after `git add`**. The scan reads tracked files only; an untracked
   file passes and then fails on `main`, which happened in 1.1, PR #20 → #22.

Pilot paths reach tests only through env vars (`PILOT_JEST_REPO`, `PILOT_PYTEST_REPO`, `PILOT_VITEST_REPO`, KICKOFF §0),
never hardcoded. Never write a pilot's name or path in do-it code, tests or docs outside `audit/`.

## 3. Gotchas from the 1.1.0 build (each cost hours)

1. **New spine IO must use `fs-atomic.mjs`:** `readRegularFile(file, cap)`, `atomicWrite`, `atomicWriteJson`. The
   source lint `core/spine/test/s1/fs-lint.test.mjs` fails on a raw `readFileSync`, `appendFileSync`, `openSync`,
   `createReadStream` or `writeFileSync` anywhere in `src/`. Writes are capped below the read cap (`STATE_READ_CAP`
   16 MiB, with a 1 MiB headroom rule). The L1 result store will hit this on day one.
2. **The bundle is generated.** Edit `core/spine/src/*`, then run `node core/spine/build.mjs` and
   `node scripts/sync-mirror.mjs --write`. Never hand-merge `core/spine/do-it.mjs` (KICKOFF §1.3 says the same).
3. **`node --test` takes a quoted glob**, never a bare directory, on Node 22.
4. **Stop gate under 1.1.0:** a run is owned by the session that started it. After `/clear` or in a new session,
   plain `resume` refuses with `OWNED_BY_OTHER_SESSION` and names the run. Re-bind with
   `do-it resume --run <id> --take-over`, and only when the old owner session has ended. Make sure the installed
   plugin is 1.1.0 (`claude plugin marketplace update devotts && claude plugin update do-it@devotts`). 1.0.5 still
   has the old stop-gate bug.
5. **Suite runner honesty:** a runner that loops `node --test` globs exits 0 when cases skip. A skip is
   IMPLEMENTED-NOT-VERIFIED, never PASS. Release runs set every env var and list skips by name.
6. **Machine load fakes failures.** With other sessions running jest (load average 26), a CPU-heavy 120 s test timed
   out, and passed alone. Re-run a failed case alone before calling it a regression. This is exactly the problem
   RTG's Q1 admission solves: dogfood `do-it gate queue` as soon as Q1 lands (KICKOFF §1.5).
7. **Environment-detected "live" targets lie.** The live-Engine host probe counted a Mongo container and an
   unrelated 404 on :3001 as a live target. Any `[REAL]` detector you write must require a target-specific answer.
   Unreachable means IMPLEMENTED-NOT-VERIFIED, never a mock pass.
8. **Tests must not read live sibling checkouts' current branch.** The catalog test T-R3-05 went red when a sibling
   checkout moved branches (fixed in #26 by reading the pinned replay). Pin what a test reads.
9. **Sibling status writer:** tests that write status boards need `DOIT_STATUS_WRITE` pointing at build-it ≥ 4.2.0
   `plugins/build-it/scripts/status/status-write.mjs`. A stale local build-it made plan-it tests fail.
10. **GitHub as DevOtts:** `GH_TOKEN=$(gh auth token --user DevOtts)` on every `git push` and `gh` call; the default
    credential maps to another account.
11. **Cross-repo git from subagents is blocked** for worktree-isolated agents. The coordinator creates the worktrees
    and gives workers absolute paths. Workers commit and never push.
12. **Adversarial review does not converge by fixing alone.** CP-03 for 1.1 took 11 rounds on the stop gate. What
    worked:
    - split reviewers by area, give each a time budget, and have it write its section file incrementally (single
      reviewers stalled for 2–3 h without output);
    - add a regression test that replays every finding;
    - track findings per round, and present the owner a carry-or-hold choice when only pre-existing,
      exotic-artefact MEDIUMs remain.
13. **Release order:** siblings first, then do-it. On the tagged tree, `check-pins --tags`, `--marketplace`, `--self`
    and `--lint` must each say `no drift`.
    - `tests/plugin` T-R2-11 rewrites `tests/plugin/evidence/dependency-resolution.json` as unresolved until tags
      exist: restore it before tagging, then regenerate and commit after.
    - Run `tests/readme` on a real checkout after tagging; the badge count changes.
    - A `--dry-run` must be tested to write nothing (1.1 D1).

## 4. Run-state convention

Keep this build's run state in `.taskstate/1.2/` (1.1 used `.taskstate/1.1/`, because `.taskstate/` root holds the
tracked 1.0.0 state), with results in `.taskstate/1.2/results/`. `.taskstate/1.1/` in the main checkout has 1.1's
decisions (X1–X27), evidence ledger, run-memory and worker brief. Reuse its `WORKER-BRIEF.md` and `run-suites.sh`
patterns.

## 5. Not RTG's job (open from 1.1, owner's call)

These items are listed so the build does not pick them up silently:
- F1: the plugin does not ship `companions.json`, so `doctor --install --host` fails from the marketplace copy.
- F2: reconcile-it is private but pinned as published.
- Amendments A3–A8 and A13–A16.
- The pilot legacy-board archive choice.

They are 1.1.1 or owner items, in `.build-it-reports/REPORT-1.1.0.md`.
