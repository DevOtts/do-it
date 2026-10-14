# Epics 5: ship (lane L5)

PRD: delivery/prds/prd-5-ship.md · CONTRACT: delivery/CONTRACT.md v1.0-draft · Lane paths: `README.md`, `assets/**`, `plugins/**`, `.claude-plugin/**`, `scripts/**`, `tests/**`, `core/companions.json`
Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn recorded default · Dn decision (PRD-local D1..D16; owner rulings written "ruling Dn") — see GLOSSARY.md
Honesty: a `[REAL]` case that needs another squad's code stays IMPLEMENTED-NOT-VERIFIED until that epic ships (CONTRACT section 7). Hosts are `claude-code`, `codex`, `opencode`, `engine` only; nothing is created for the two out-of-scope hosts (G-14).

---

## Epic R2 — Plugin shell, marketplace, companions, mirror
Branch `epic/R2-shell-shell` · Wave W0 · Depends on: S1 (`do-it doctor --install`), L2 persona and preset names (read-only), L3 hook files (mirror source)

Scope: PRD decisions D7 to D13. The Claude Code plugin shell, the `devotts` marketplace entry, the pin ledger, the generated root `SKILL.md`, mirror parity and the install fallback data.

Tasks:
- [ ] `.claude-plugin/marketplace.json`: name `devotts`, owner DevOtts, plugin `do-it` with `source: "./plugins/do-it"`, version 0.1.0 (default R4), listing each published companion with its github source and pinned version (D9).
- [ ] `plugins/do-it/.claude-plugin/plugin.json`: name, version 0.1.0, license MIT (default R2), author DevOtts, `dependencies` array naming the published required companions.
- [ ] `core/companions.json` (`do-it-companions/1`): prompt-it 0.3.0, plan-it 4.0.0, build-it 3.1.1, review-it 1.0.0, conclude-it 1.1.0 (required); parallel-lifecycle 0.1.0 (`required:false`); deploy-it and reconcile-it as `status:"planned"` (D10).
- [ ] `scripts/check-pins.mjs`: read sibling marketplace files read-only; report file, line, expected, found; exit 1 on drift, 0 on none.
- [ ] `plugins/do-it/skill-src/` fragments and `scripts/generate-skill.mjs`: deterministic root `SKILL.md` with the authorship frontmatter and footer (D11).
- [ ] `scripts/mirror-manifest.json` and `scripts/sync-mirror.mjs` with `--check` and `--write` (D12).
- [ ] `plugins/do-it/skills/do-it/SKILL.md` as the mirror of the root file.
- [ ] `tests/plugin/**`: the cases below, runnable with `node --test`.
- [ ] Record the observed dependency-resolution behavior in `tests/plugin/evidence/dependency-resolution.json` whichever way it goes (D8).

### Test Contract — R2 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 16 · Surfaces: CLI + filesystem · [REAL] cases: 8
Done = every case below is PASS. No [REAL] case VERIFIED on a mock; T-R2-12 stays IMPLEMENTED-NOT-VERIFIED until S1 ships.
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-R2-01 | Plugin manifest validates with the real host validator (G-15) | run `claude plugin validate plugins/do-it` | exit 0; stdout has no line containing "Unknown field" and no line reporting an error on `dependencies` | [REAL] |
| T-R2-02 | Repo-root marketplace validates (G-15) | run `claude plugin validate .` at the repo root | exit 0; the marketplace name reported is `devotts` | [REAL] |
| T-R2-03 | Marketplace entry shape | parse `.claude-plugin/marketplace.json` | `name` equals `devotts`; exactly one plugin named `do-it` with `source` equal to `./plugins/do-it` and `version` equal to `0.1.0`; every other plugin entry has a github `repo` and an exact `version` | happy |
| T-R2-04 | `dependencies` names exactly the published required companions | parse `plugin.json` and `core/companions.json` | `dependencies` is an array; set of names equals the companions with `required:true` and `status:"published"` (prompt-it, plan-it, build-it, review-it, conclude-it); parallel-lifecycle, deploy-it and reconcile-it are absent | edge |
| T-R2-05 | Pins are exact | lint `core/companions.json` | every `version` matches `^[0-9]+\.[0-9]+\.[0-9]+$`; a file edited to `^0.3.0` or `latest` makes the linter exit 1 and name the entry; a planned entry has `version` null and is not counted as pinned | edge |
| T-R2-06 | Pin-drift detector finds the 0.2.1 to 0.3.0 drift (G-15) | run `node scripts/check-pins.mjs --siblings ../` against the real sibling repos (read-only) | exit 1; output lists exactly three findings: build-it marketplace line 18, plan-it marketplace line 16, review-it marketplace line 16, each `found 0.2.1 expected 0.3.0`; no sibling file mtime changes | [REAL] |
| T-R2-07 | Generated SKILL.md is deterministic (G-12) | run `node scripts/generate-skill.mjs` twice on fixed inputs | both outputs have the same sha256; the output text contains none of the strings `claude-code`, `codex`, `opencode` outside a fenced host table; exit 0 both times | happy |
| T-R2-08 | Mirror parity detects a one-byte change | run `node scripts/sync-mirror.mjs --check`; then append one byte to `plugins/do-it/skills/do-it/SKILL.md` in a scratch copy and re-run | first run exit 0; second run exit 1 and names the pair; a manifest source that does not exist yet yields exit 3 with the missing path, never exit 0 | failure |
| T-R2-09 | Skill authorship rule | read root `SKILL.md` | frontmatter has `name: do-it`, a `description`, `author: DevOtts`, `author_url: https://github.com/DevOtts`; the last line equals `_Authored by [DevOtts](https://github.com/DevOtts)._` | happy |
| T-R2-10 | Universal installer sees the skill (G-15) | run `npx skills add ./ --list` at the repo root; also read the installer's agent list and look up `codex` and `opencode` | exit 0 and the output lists `do-it`; if either agent id is absent from the installer's list the id is recorded in `tests/install-commands.json` as `generic` and the README must use `-a {agent}`; with no network the case is IMPLEMENTED-NOT-VERIFIED naming the reason | [REAL] |
| T-R2-11 | Install-time dependency resolution observed | with an isolated config directory, run `claude plugin marketplace add ./` then `claude plugin install do-it@devotts`, then `claude plugin list` | outcome recorded in `tests/plugin/evidence/dependency-resolution.json` as `resolved` (all five required companions listed, exit 0) or `unresolved` (exact error text and exit code); the README sentence "installing do-it installs the family" exists only when the record says `resolved`; otherwise the README names `do-it doctor --install` | [REAL] |
| T-R2-12 | Codex fallback install (CONTRACT section 6) | run the real spine: `node core/spine/do-it.mjs doctor --install --host codex --dry-run` | exit 0; prints five lines in `core/companions.json` order, each of the form `npx skills add DevOtts/{name} -a codex`; prints nothing for planned or soft companions; no file outside `.do-it/` is written | [REAL] |
| T-R2-13 | OpenCode fallback install (CONTRACT section 6) | run `node core/spine/do-it.mjs doctor --install --host opencode --dry-run` | exit 0; five lines ending `-a opencode` or the generic form recorded by T-R2-10 | [REAL] |
| T-R2-14 | Install fallback ends in PARTIAL_FAILURE then recovers | run `doctor --install --host codex` with a stub installer on PATH that fails for the third companion | exit 1; run status is PARTIAL_FAILURE; the it-result lists two installed and three not; a second run with the stub fixed installs only the missing three (two skipped as already installed) and exits 0 | [REAL] |
| T-R2-15 | Version consistency | compare `plugin.json`, the marketplace entry and `core/companions.json` for do-it | all three equal `0.1.0`; changing one makes `node scripts/check-pins.mjs --self` exit 1 and name the file | edge |
| T-R2-16 | Out-of-scope hosts and secrets (G-14, G-7) | grep `plugins/`, `.claude-plugin/`, `scripts/`, `core/companions.json` for the two out-of-scope host names and for the patterns in ENV-FACTS probe `secret-scan-on-import` | zero matches for both; exit 0 | failure |

partial-failure: covered by T-R2-14 (install of companions); rollback/compensation: N/A — an install is idempotent and a failed run leaves no state to compensate, re-run is the repair (T-R2-14); failed-recovery to escalation: N/A — no escalation path exists for installs, an unresolved companion is reported as PARTIAL_FAILURE with the missing names; recovery/resume: T-R2-14; adversarial-verify: T-R2-08 (one-byte tamper between generate and check).

---

## Epic R4 — Fixtures and e2e harness
Branch `epic/R4-fixtures-e2e` · Wave W1 (skeleton), W4 (finish) · Depends on: S1 to S5, P1 to P4, H1; deploy fixtures use a scripted adapter, not a cloud target

Scope: PRD decisions D15, D16. Five fixtures, a harness that runs a preset against a fixture on a chosen host or a scripted stub host, and the measurements that the README is allowed to cite.

Tasks:
- [ ] `tests/fixtures/feature-overnight/`: tiny repo with a one-paragraph feature request and a numbered DoD of four rows.
- [ ] `tests/fixtures/investigate-fix/`: tiny repo with one seeded defect and one failing test.
- [ ] `tests/fixtures/weekly-drain/`: ten backlog cards with frontmatter (id, kind, needs_build, needs_decision, due), an archive folder, and a git repo.
- [ ] `tests/fixtures/review-loop/`: scripted reviewer finding sequences for the converge, stall and over-budget variants.
- [ ] `tests/fixtures/reconcile/`: scratch workspace builder creating 2 repos, 5 branches, 2 worktrees (landed, superseded, in-flight, dirty).
- [ ] `tests/fixtures/deploy/`: a three-leg `.deploy-it/adapter.json` with scripted commands (write file, verify digest, rollback) for the failure cascade.
- [ ] `scripts/measure-fixture.mjs`: derives `expected.json` from the fixture's own content.
- [ ] `tests/e2e/run.mjs`: harness (`--fixture`, `--host stub|claude-code|codex|opencode`), writes `tests/e2e/out/{fixture}/` with state, ledger, token meter.
- [ ] `scripts/tokens-per-row.mjs`: tokens per VERIFIED row from the meter and ledger.
- [ ] `tests/claims.json` generator: one entry per measured statement the README may cite.

### Test Contract — R4 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 20 · Surfaces: CLI + filesystem + git · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case VERIFIED on a mock; T-R4-02 stays IMPLEMENTED-NOT-VERIFIED until S and H1 ship.
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-R4-01 | Feature fixture reaches the final status on the stub host | `node tests/e2e/run.mjs --fixture feature-overnight --host stub`; then run `scripts/measure-fixture.mjs` on the fixture | harness exit 0; `state.json` status is DONE; every finish-line row is DONE; ledger shows 4 rows VERIFIED with evidence paths that exist (G-2); recomputed `expected.json` is byte-identical to the stored one | happy |
| T-R4-02 | Feature fixture on the real Claude Code host (G-3) | `node tests/e2e/run.mjs --fixture feature-overnight --host claude-code` using the installed `claude -p` | exit 0; status DONE; token meter has rows with `source` equal to `provider`; the same four DoD rows VERIFIED with evidence; an unreachable host gives IMPLEMENTED-NOT-VERIFIED, never a stub result | [REAL] |
| T-R4-03 | Investigate-fix closes red to green | run preset `investigate-fix` on the fixture with the stub host | exit 0; the failing test shows red before and green after (two recorded runs in the evidence folder); exactly 1 commit touches the seeded defect file; the regression row is VERIFIED with the green log path as evidence; measured expected equals stored | happy |
| T-R4-04 | Weekly drain ends with zero unaccounted rows | run preset `drain` on `weekly-drain` (10 cards) with the stub host | exit 0; the final table has 10 rows; counts per disposition equal `expected.json` (measured from card frontmatter by `measure-fixture.mjs`) and sum to 10; `finish-line.json` has 0 rows in OPEN; every archived card has a footer naming its disposition | happy |
| T-R4-05 | Sandboxes equal slices needing a build (D16) | same run on a scratch git repo; record `git worktree list` before, at peak and after | peak worktree count minus the baseline equals the number of cards with `needs_build: true` in `expected.json`; cards without a build create none; after the run the worktree count equals the baseline (reap-on-merge); mismatch exits 1 | [REAL] |
| T-R4-06 | Conclude refuses an unaccounted row (G-13) | drain run where one card row is left without a disposition | `conclude` exits 1 with the row id named; the run does not reach its final status; after the row gets a disposition conclude exits 0 | failure |
| T-R4-07 | Review loop converges | preset `review-loop` with the converge variant: blockers plus majors per round are 3, 1, 0 and round 3 also has 2 minors | review exit is CONVERGED_WITH_MINORS in round 3 (rounds used: 3); 2 minor cards written to the backlog; blocker and major counts strictly fall each round; a variant with 0 minors ends CONVERGED (G-10) | happy |
| T-R4-08 | Review loop stalls | stall variant: the same roteiro fingerprint and the same blocker twice | tier raised once (logged), then the exit is STALLED and the owner pack gets a question of kind `review-cap`; run status is ESCALATED when the scripted owner reply is absent; no round runs after STALLED (G-10) | failure |
| T-R4-09 | Review loop exceeds budget | over-budget variant: token ceiling set below the round-2 cost | exit is OVER_BUDGET; run status is PARKED with a state file that resumes at round 2; no further spawn is recorded in `events.jsonl` after the breach | failure |
| T-R4-10 | Reconcile refuses to delete without approval | build the reconcile fixture workspace (real git); run `scan`, `plan`, then `apply` without `--approved` | `scan` table lists all 5 branches and 2 worktrees (counts equal `expected.json`); `plan` assigns a disposition to each; `apply` exits 2 (needs human); `git branch --list` and `git worktree list` are unchanged; `.do-it/reconcile/state.json` exists with `phase` equal to `plan` | [REAL] |
| T-R4-11 | Reconcile re-verifies at execution time | after `plan`, move one landed branch forward with a new commit, then run `apply --approved` | exit 0 with one row reported SKIPPED_CHANGED_SINCE_PLAN naming that branch; every other landed branch is deleted; the moved branch still exists; the dirty worktree is not removed and its WIP is rescued to a named branch | [REAL] |
| T-R4-12 | Tokens per VERIFIED row | run `node scripts/tokens-per-row.mjs` on a meter fixture with 6 rows (4 provider, 2 estimated) and a ledger with 3 VERIFIED rows | output `tokens_per_verified_row` equals sum(tokens_in + tokens_out) divided by 3 for the fixture and `estimated: true` because two rows are estimated (G-6); with zero VERIFIED rows the value is the string `n/a`, exit 0, no division error | edge |
| T-R4-13 | Deploy partial failure then rollback | deploy fixture with legs write, verify-digest, publish where leg 3 fails | run status passes through PARTIAL_FAILURE and ends ROLLED_BACK; the rollback commands of legs 1 and 2 run in reverse order (events order checked); the target file is back to its pre-deploy sha256; the it-result lists leg states DEPLOYED_VERIFIED, DEPLOYED_VERIFIED, FAILED | failure |
| T-R4-14 | Rollback fails and the run escalates | same fixture with the rollback command of leg 1 forced to exit 1 | run status ends ESCALATED; the owner pack has a question naming leg 1 and the digest mismatch; exit code 2; no further deploy command runs afterwards | failure |
| T-R4-15 | Recovery by re-verify | from ROLLED_BACK, fix the failing command and resume | status goes ROLLED_BACK to DEPLOYING; all three legs are re-verified (three verify executions recorded, none reused); final leg states are DEPLOYED_VERIFIED three times; the run reaches its final status | happy |
| T-R4-16 | Adversarial verify: tamper between write and verify | scripted step overwrites the deployed file after leg 2 claims success and before the independent re-read | the re-read digest differs from the claimed digest; leg 2 is FAILED, never DEPLOYED_VERIFIED; the row backed by it is IMPLEMENTED-NOT-VERIFIED or BLOCKED; run status is PARTIAL_FAILURE | failure |
| T-R4-17 | Usage limit parks and resume skips finished slices | stub host returns status `usage_limit` during slice 2 of 3 | exit 3; run status PARKED; a wake-up request is recorded or the park says it could not schedule one; resume runs slices 2 and 3 only; slice 1 `attempts` stays 1 | recovery |
| T-R4-18 | Failed slice retries one tier up then escalates | stub builder fails its contract twice | the first retry is logged one tier up (T3 to T2 or T2 to T1) with a reason; the second failure sets the run to ESCALATED with an owner-pack question; slice attempts equals 2 (G-4); the first failure is recorded as FAILED | failure |
| T-R4-19 | Owner gate blocks only its slice | one slice requires a production flag (kind `owner-gate`) | that slice is BLOCKED with a reason; other slices finish; run verdict is DONE_WITH_RESIDUALS, not DONE_ALL_VERIFIED; the owner pack has exactly one question for it | failure |
| T-R4-20 | Handoff failure retries then escalates (G-5) | context ceiling reached and the handoff writer fails every attempt | HANDOFF_FAILED is recorded on each failure; attempts stop at 5; run status is ESCALATED; the next step stays blocked until a handoff file exists | failure |

partial-failure: T-R4-13; rollback/compensation: T-R4-13; failed-recovery to escalation: T-R4-14 and T-R4-18; recovery/resume: T-R4-15 and T-R4-17; adversarial-verify: T-R4-16 and T-R4-11. Failure outcomes asserted by token: FAILED (T-R4-18), PARTIAL_FAILURE (T-R4-13, T-R4-16), ROLLED_BACK (T-R4-13), ESCALATED (T-R4-14), STALLED (T-R4-08), OVER_BUDGET (T-R4-09), HANDOFF_FAILED (T-R4-20), BLOCKED (T-R4-19), PARKED (T-R4-09, T-R4-17).

---

## Epic R3 — Companion-plugin change catalog
Branch `epic/R3-companion-catalog` · Wave W3 · Depends on: R2 (pins), P4 (review ownership names), S3 (verdict vocabulary)

Scope: PRD decision D14 and PRD section 5. A catalog only: sibling repos are never edited. Output `plugins/do-it/catalog/companion-changes.md` and `companion-changes.json`, linted by `scripts/lint-catalog.mjs`.

Tasks:
- [ ] One section per plugin: all companions, prompt-it, plan-it, build-it, review-it, conclude-it, parallel-lifecycle, deploy-it, reconcile-it. Fields: Owner repo, Current state (path and line read from the sibling), Exact changes, Size, Verification case.
- [ ] "all companions" section: `it-result/1` field list, exit-code mirror, `DO_IT_HOME` rule, tier vocabulary table with Engine aliases, result vocabulary.
- [ ] deploy-it section: `adapter.json` schema, LEG protocol, five result states, M1 failure cascade, re-read after the claim.
- [ ] reconcile-it section: `scan`, `plan`, `apply --approved`, state file schema.
- [ ] plan-it section: `READINESS.json` fields and the `Verify` column grammar.
- [ ] review-it section: artifact ownership matrix with one writer per path.
- [ ] Ready-to-apply diffs for the pin bumps (three marketplaces) and the report-directory change.
- [ ] `scripts/lint-catalog.mjs` and `tests/catalog/**`, including a small reference LEG checker `tests/catalog/leg-reference.mjs`.

### Test Contract — R3 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 16 · Surfaces: CLI + filesystem + git · [REAL] cases: 5
Done = every case below is PASS. No [REAL] case VERIFIED on a mock; T-R3-05 stays IMPLEMENTED-NOT-VERIFIED if a sibling file is unreadable.
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-R3-01 | Catalog structure lints clean (G-14) | `node scripts/lint-catalog.mjs plugins/do-it/catalog/companion-changes.md` | exit 0; exactly 9 sections named all companions, prompt-it, plan-it, build-it, review-it, conclude-it, parallel-lifecycle, deploy-it, reconcile-it; each has Owner repo, Current state, Exact changes, Size, Verification case; sizes equal docs/05 (all M, prompt-it S, plan-it M, build-it S, review-it M, conclude-it S, parallel-lifecycle S, deploy-it L, reconcile-it M); every cited T-id exists in some file under `delivery/epics/`; zero matches for the two out-of-scope host names | happy |
| T-R3-02 | Lint rejects a malformed catalog | delete the Size line of the deploy-it section in a scratch copy, then add a verification case id that does not exist | exit 1; messages name `deploy-it: missing Size` and the unknown id | failure |
| T-R3-03 | `it-result/1` section matches the CONTRACT (G-1) | parse the field list in the catalog and in CONTRACT section 2 | the two field sets are equal (schema, stage, run_id, slice_id, version, head_sha, status, exit_code, verdicts, run_verdict, next, pending_human, artifacts, resume, tokens); exit-code mapping is ok 0, failed 1, needs_human 2, blocked or usage_limit or context_reset 3 | happy |
| T-R3-04 | `DO_IT_HOME` resolution on a real git worktree | create a scratch git repo and a linked worktree; run the catalog's reference resolver in the worktree with and without `DO_IT_HOME` | with the variable set the result equals its value; unset in the worktree the result equals `{main checkout}/.do-it` obtained from `git rev-parse --git-common-dir`; unset in the main checkout equals `{repo}/.do-it` | [REAL] |
| T-R3-05 | Tier vocabulary current state is true | for plan-it, build-it, review-it, conclude-it, prompt-it read the real sibling SKILL.md files (read-only) and search for tier words | each section's "Current state" cell lists the tier words actually found with file and line (or "none found"); the tier table maps T1 powerful, T2 balanced, T3 cheap plus Engine aliases; a stated line that does not exist in the file fails the case | [REAL] |
| T-R3-06 | Pin-drift finding is accurate (G-15) | read the three sibling `marketplace.json` files and prompt-it's own | catalog lists build-it line 18, plan-it line 16, review-it line 16 at 0.2.1 and prompt-it at 0.3.0, each matching the real file text; the catalog states the fix as 0.3.0 | [REAL] |
| T-R3-07 | deploy-it `adapter.json` schema | validate the catalog's example adapter against the schema in the section | the valid example passes; the schema requires `legs[]` with name, command, verify, rollback, risk; removing `legs` or giving a leg no `name` fails with the field named; the result states are exactly DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN | happy |
| T-R3-08 | LEG protocol state mapping | run `tests/catalog/leg-reference.mjs` on five scripted legs: verify passes, no verify command, lock held, command fails, credential missing | states are DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN in that order; exit codes 0, 0, 3, 1, 2 | edge |
| T-R3-09 | Failure cascade text equals CONTRACT M1 | extract transitions from the deploy-it section and from CONTRACT section 8 | the deploy transitions are the same set: DEPLOYING to PARTIAL_FAILURE, PARTIAL_FAILURE to ROLLED_BACK, ROLLED_BACK to DEPLOYING, ROLLED_BACK to ESCALATED; no extra or renamed state | failure |
| T-R3-10 | Adversarial verify is specified and works | run the reference LEG checker: a leg writes a file and claims digest A; a script changes the file; verify re-reads | verify re-reads in a new process and reports FAILED with `expected A found B`; the same run without tampering reports DEPLOYED_VERIFIED; the catalog deploy-it section says "re-read after the claim" | failure |
| T-R3-11 | One-line fixes apply cleanly to the real files | copy the real build-it, plan-it, review-it marketplace files and build-it SKILL.md into a scratch git repo; run `git apply --check` for each catalog diff, then `git apply` | all four checks exit 0; after applying, the prompt-it version in each marketplace copy is 0.3.0 and `check-pins.mjs` on the scratch copies exits 0; the real sibling files are unchanged (checksums equal) | [REAL] |
| T-R3-12 | plan-it readiness and `Verify` column | validate the catalog's READINESS.json example and its Test Contract sample row | READINESS.json requires decisions each RESOLVED or DEFAULTED, `preflight` passed, `owner_dependent_slices` equal to 0; the `Verify` column accepts only auto, attended, judgement and the lint exits 1 on any other value (G-8) | happy |
| T-R3-13 | review-it owns ATTENDED-GATE.html | parse the ownership matrix | path `.do-it/review/ATTENDED-GATE.html` has exactly one writer, review-it, re-cut each round; do-it, build-it and conclude-it are readers only; two writers for any path make the lint exit 1; severity classes are blocker, major, minor, nit | edge |
| T-R3-14 | conclude-it, build-it and parallel-lifecycle sections | parse the three sections | conclude-it refuses close with an unaccounted row (G-13) and reads `finish-line.json`; build-it picks `.build-it-reports/` and treats `.fable-it-reports/` as legacy read-only; parallel-lifecycle stays separate with an `isolation` contract of create, remove and path (ruling D14) | happy |
| T-R3-15 | reconcile-it contract | parse the reconcile-it section and run its state-file schema check | commands are scan, plan, apply with `--approved`; `apply` without it exits 2 and deletes nothing; the state file `.do-it/reconcile/state.json` requires `phase`, `inventory`, `dispositions`, `approved_at`; a state with `approved_at` null cannot reach phase apply | failure |
| T-R3-16 | Sibling repos stay untouched (fence) | record `git status --porcelain` and the newest mtime of each sibling repo before and after running the whole R3 suite | outputs are identical before and after for prompt-it, plan-it, build-it, review-it, conclude-it and parallel-lifecycle; any difference fails the epic | [REAL] |

partial-failure: T-R3-09 (specified in the deploy-it section); rollback/compensation: T-R3-09; failed-recovery to escalation: T-R3-09 (rollback fails to ESCALATED); recovery/resume: T-R3-15 (persisted state) and T-R3-09 (re-verify); adversarial-verify: T-R3-10.

---

## Epic R1 — README and assets
Branch `epic/R1-readme-assets` · Wave W4 · Depends on: R2 (commands), R4 (measured claims and a real morning-report output), N3 and the L4 `hosts/engine/README.md` link target

Scope: PRD decisions D1 to D6, delivery/README-SPEC.md. A marketing README the owner will promote, plus `assets/do-it-hero.svg` and `assets/do-it-pipeline.svg`.

Tasks:
- [ ] `README.md` with the 15 sections in README-SPEC order; centered header, badges (Quick Start, MIT, Native Claude Code, portable SKILL.md, author DevOtts; a version badge only when a release exists), nav row, NOTE and IMPORTANT callouts, closing footer line.
- [ ] Installation: TIP block with `npx skills add DevOtts/do-it -a {agent}` and `gh skill install DevOtts/do-it`; one H3 each for Claude Code (native), Codex, OpenCode, Engine, Others; degrade note.
- [ ] "Five things you can say", "What the morning report looks like" using real fixture output, "Token economy" with figures only from `tests/claims.json`.
- [ ] `assets/do-it-hero.svg` (1200x600) and `assets/do-it-pipeline.svg` per README-SPEC, with a title element, a desc element and alt text in the README.
- [ ] `tests/install-commands.json`, `tests/claims.json` consumption, `scripts/check-readme.mjs`, `tests/readme/**`.
- [ ] LICENSE (MIT, default R2) and CHANGELOG.md exist at the root (proposed lane amendment).

### Test Contract — R1 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 16 · Surfaces: filesystem + CLI + network · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case VERIFIED on a mock; T-R1-15 stays IMPLEMENTED-NOT-VERIFIED until R4 produces a report.
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-R1-01 | Section order and claims ledger (G-15) | `node scripts/check-readme.mjs --order --claims` | exit 0; the 15 sections appear in README-SPEC order (header block, opening prose, The bottleneck it kills, Installation, How it works, The spine, Token economy, Five things you can say, What the morning report looks like, What's inside, do-it x the family, Status, Security considerations, Platform compatibility, License); every digit-bearing claim sentence in Token economy and Status matches an entry in `tests/claims.json` with a fixture id; a README with a number and no entry exits 1 naming the line | happy |
| T-R1-02 | Length cap | `wc -l README.md` through the checker | fewer than 450 lines gives exit 0; 450 or more exits 1 | edge |
| T-R1-03 | Hero SVG is well formed | parse `assets/do-it-hero.svg` with an XML parser (`xmllint --noout`) and inspect | exit 0; viewBox is `0 0 1200 600`; a title element and a desc element exist and are non-empty; `role="img"` is present; contains the four host chip labels Claude Code, Codex, OpenCode, Engine; background stops are `#0b1220` and `#0d1a2b` | happy |
| T-R1-04 | Pipeline SVG is well formed | parse `assets/do-it-pipeline.svg` | exit 0; title and desc exist and are non-empty; at least one element with `stroke-dasharray` (the failure loops); text nodes include the labels spine, owner pack and finish line; no external href | happy |
| T-R1-05 | Every internal link and anchor resolves | `node scripts/check-readme.mjs --links` | exit 0; each `#anchor` matches a heading slug in the README (nav entries Install, Why, How it works, What's inside, Platforms, Changelog all resolve); each relative file link (assets, LICENSE, CHANGELOG.md, `hosts/engine/README.md`, docs) exists on disk; one broken link in a scratch copy exits 1 and names it | failure |
| T-R1-06 | Claude Code commands are valid (G-15) | run `claude plugin validate .` and `claude plugin validate plugins/do-it`; compare the README Claude Code block with `tests/install-commands.json` | both validations exit 0; the README block contains exactly `/plugin marketplace add DevOtts/do-it` and `/plugin install do-it@devotts`; marketplace name `devotts` matches `.claude-plugin/marketplace.json` | [REAL] |
| T-R1-07 | Universal installer commands are valid (G-15) | run `npx skills add ./ --list`; check the agent ids used in the README against the installer's list | exit 0; output lists `do-it`; each `-a` id in the README exists in the installer's list, otherwise the README shows `-a {agent}` for that host; `gh skill install DevOtts/do-it` is present verbatim; no network gives IMPLEMENTED-NOT-VERIFIED with the reason | [REAL] |
| T-R1-08 | Out-of-scope hosts are absent (G-14) | grep README.md, both SVGs and `tests/install-commands.json` for the two out-of-scope host names (case-insensitive) | zero matches; exit 0 | failure |
| T-R1-09 | Header block structure | `node scripts/check-readme.mjs --header` | the first line is the centered div opening; an h1 `do-it`, an h3 with a strong tagline, an em positioning line, the hero image inside a link to `#how-it-works` with `width="100%"` and alt text of at least 60 characters, 5 badges (no version badge when `git tag` lists no release), one nav row separated by `&nbsp;·&nbsp;`, one or two callouts, and the closing div | happy |
| T-R1-10 | Badges point at real targets | extract every badge URL | each uses `style=for-the-badge`; the five labels are Quick Start, License MIT, Native Claude Code, portable SKILL.md, author DevOtts; a version badge exists only if a release tag exists | edge |
| T-R1-11 | Installation section covers the four hosts | parse Installation | has a TIP block plus H3s Claude Code, Codex, OpenCode, Engine, Others in that order; the Engine H3 links `hosts/engine/README.md`; the section ends with the degrade note stating that hosts without subagents run the same pipeline sequentially (CONTRACT section 6) | happy |
| T-R1-12 | Dependency claim is gated on evidence (D8) | read `tests/plugin/evidence/dependency-resolution.json` and the README | the sentence "installs the family" appears only when the evidence says `resolved`; when it says `unresolved` or the file is missing the README shows the `do-it doctor --install` instruction and not that sentence | edge |
| T-R1-13 | Footer and license | tail of README and LICENSE | the last line equals `_Built by [DevOtts](https://github.com/DevOtts)._`; the License section links LICENSE and names MIT; `LICENSE` starts with `MIT License` | happy |
| T-R1-14 | External links resolve | HTTP HEAD every external URL in the README (shields.io badges, github.com/DevOtts sibling repos, opensource.org) | each returns status 200 or 301 or 302; any 404 fails the case; no network gives IMPLEMENTED-NOT-VERIFIED naming the reason; the do-it repo URL itself may be 404 before first publish and is then listed in the evidence as `unpublished` | [REAL] |
| T-R1-15 | Morning report is real output | compare the "What the morning report looks like" code block with the rendered report of the `feature-overnight` run from T-R4-01 or T-R4-02 | the block is byte-identical to the harness output (a rendered table of rows with VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED or PARKED); it shows at least one honest non-clean state | [REAL] |
| T-R1-16 | Tone and placeholders | scan README.md | no dated promise (no phrase matching "coming soon", "next month", or a future year-month), no unfinished-work markers, no angle-bracket placeholders outside code; the Status section lists what is in v0.1 and what is not without naming the two out-of-scope hosts, and includes a short "honest claim" paragraph | failure |

partial-failure: N/A — documentation only, no multi-step state; rollback/compensation: N/A — nothing is mutated; failed-recovery to escalation: N/A — no run state; recovery/resume: N/A — rerunning the checker is the recovery; adversarial-verify: N/A — T-R1-15 compares to a fixture output but the README makes no deploy claim.
