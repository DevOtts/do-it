# PRD 5: ship (lane L5) — README, packaging, companion catalog, fixtures

Squad: ship · Lane: L5 · Epics: R1, R2, R3, R4 · CONTRACT: delivery/CONTRACT.md v1.0-draft · Run: do-it-v1 · 2026-10-14
Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn recorded default · Dn local decision of this PRD (the owner rulings in DECISIONS.md are cited as "ruling D20" and so on) — see GLOSSARY.md

## 1. Summary
L5 turns the do-it design into something a stranger can install, believe and run. It builds four things: (R1) a marketing-grade README with two SVGs in the DevOtts plan-it / build-it pattern (ruling D20); (R2) the Claude Code plugin shell, the `devotts` marketplace entry with `dependencies`, a generated root `SKILL.md` for `npx skills` hosts, mirror parity between root and plugin copies, and `core/companions.json` with pinned versions; (R3) a change catalog for the seven companion plugins plus the two new ones (deploy-it, reconcile-it), one section each with exact changes, owner repo, size and a verification case (the sibling repos are not edited by this program, CONTRACT section 5); (R4) fixtures and an end-to-end harness for the five use cases, with measured expected outcomes and a tokens-per-VERIFIED-row computation.

L5 writes no spine, host or pipeline code. It consumes the other lanes' output, so some cases are `[REAL]` and cannot be VERIFIED until that code exists. Those end IMPLEMENTED-NOT-VERIFIED, never green on a mock (G-3, CONTRACT section 7).

## 2. Problem and goals
Facts gathered by reading the real files (2026-10-14):
- plan-it's README is 369 lines, build-it's about 290; both use a centered header block, five shields.io badges, a hero SVG linked to `#how-it-works`, and end with a Platform compatibility table, License and a DevOtts footer. Their `assets/` hold a 1200x600 hero and a pipeline SVG (plan-it-hero.svg 5.4K, plan-it-pipeline.svg 9.2K). do-it's README must match that pattern and be under 450 lines (delivery/README-SPEC.md).
- Version-pin drift is real. `DevOtts/prompt-it` is at 0.3.0 (`prompt-it/.claude-plugin/marketplace.json` line 13), but three sibling marketplaces still pin prompt-it 0.2.1: `build-it/.claude-plugin/marketplace.json` line 18, `plan-it/.claude-plugin/marketplace.json` line 16, `review-it/.claude-plugin/marketplace.json` line 16. docs/05 names plan-it and build-it; review-it is a third (finding for R3 and the pin detector).
- The companion plugin versions on disk today: plan-it 4.0.0, build-it 3.1.1, review-it 1.0.0, conclude-it 1.1.0, prompt-it 0.3.0, parallel-lifecycle 0.1.0. No deploy-it or reconcile-it repo exists locally (ENV-FACTS probe `deployed-vs-installed`); reconcile-it exists today only as a user-level skill, deploy-it only as engine-deploy (Engine-Core, not edited) plus the user skill deploy-router.
- build-it still writes `.build-it-reports/` and carries a stray `.fable-it-reports/` directory beside it (build-it repo root; its SKILL.md lines 47, 61, 187 use `.build-it-reports/`), the ambiguity docs/05 asks R3 to resolve.
- Host facts (docs/research/11-host-cli-probe.md): `claude plugin validate` exists and accepts a `dependencies` array of plugin names, optionally with a version object; a non-array fails validation; install-time resolution, semver syntax and cross-marketplace behavior were NOT verified (probe plugin section and open question 4). Codex has no `codex plugin validate` and its manifest and dependency field are unknown. OpenCode plugin dependency behavior is unknown.

Goals (each is testable):
1. A README a maintainer would promote: correct section order, real install commands, resolving links, honest claims only (G-15).
2. `/plugin install do-it@devotts` is the single Claude Code step; if the host does not resolve `dependencies`, `do-it doctor --install` installs the family (fallback in the spirit of CONTRACT section 6).
3. One catalog that tells each companion repo's owner exactly what to change, so the program can hand sibling repos a work order without editing them.
4. Five fixtures that produce measured numbers, and the only source of any number the README prints.

Non-goals: no Hermes or OpenClaw anything (G-14, ruling D6); no edits in sibling repos or Engine-Core; no animated GIF in v1 (default R6); no benchmark or savings numbers until a fixture measures them (default R7).

## 3. Users and jobs
| User | Job | What L5 gives |
|---|---|---|
| A developer who finds the repo | decide in 60 seconds if do-it is worth installing, then install on their host | README header, bottleneck story, per-host commands |
| The owner (Fernando) | promote the plugin without being caught overclaiming | claims ledger tied to fixtures; degrade and status honesty |
| A host user (Claude Code, Codex, OpenCode) | get the whole family with the least steps | marketplace `dependencies`; `npx skills`; `doctor --install` |
| An owner of a sibling plugin repo | know precisely what to change and how to check it | R3 catalog section with a verification case |
| The next build squad and CI | know the product works end to end | R4 fixtures, harness, tokens-per-VERIFIED-row |

## 4. Solution design (decisions D1..D16)
- **D1. README follows README-SPEC section order exactly.** Fifteen sections in the mandatory order; a script extracts headings and compares. Source: delivery/README-SPEC.md, plan-it README, build-it README. Why: the family reads as a family.
- **D2. Claims come from a ledger.** `tests/claims.json` lists every number or measured statement the README makes, each with the fixture id and run artifact that produced it. A README figure with no ledger entry fails R1. Source: G-15, default R7. When R4 has produced nothing, the README prints no figures.
- **D3. Install commands come from one source of truth.** `tests/install-commands.json` holds host, command and how it was validated; the README block and the tests read the same file. Commands: Claude Code `/plugin marketplace add DevOtts/do-it` then `/plugin install do-it@devotts` (default R3: marketplace `devotts`); universal `npx skills add DevOtts/do-it -a {agent}` and `gh skill install DevOtts/do-it` as in the sibling READMEs; Codex and OpenCode via `npx skills add ... -a codex` and `-a opencode`, with `do-it doctor --install` as the fallback. Whether `-a opencode` is a valid agent id is unverified; the R1 real case checks the id against the installer's own agent list and, if it cannot, the README uses the generic `-a {agent}` form for OpenCode rather than guessing.
- **D4. Engine install section links inside this repo.** Engine-Core is a separate repo, so the README links `hosts/engine/README.md` (lane L4) which points to the Engine layer spec (ruling D18). Dependency on epic N3. If that file is absent when R1 finishes, the link check fails and R1 is blocked, never faked.
- **D5. Hosts named are `claude-code`, `codex`, `opencode`, `engine`.** The Platform compatibility table uses Native / Supported / Fallback with a Legend line; Claude Code is Native; Codex and OpenCode are Supported (sequential degrade for missing subagents, CONTRACT section 6); Engine is Supported via the adapter. A test greps the L5 files for the two out-of-scope host names and requires zero hits (G-14).
- **D6. Two SVGs, hand-authored, validated.** `assets/do-it-hero.svg` 1200x600 and `assets/do-it-pipeline.svg`, palette from README-SPEC (`#0b1220` to `#0d1a2b`, border `#1e2d44`, title 46px `#e8eefc`, subtitle `#7dd3fc`, mono `#5b6b85`). Each has `<title>`, `<desc>`, `role="img"`, `aria-labelledby`, a `viewBox`, and parses as XML. The README `alt` repeats the meaning, not just the name. Source: plan-it assets read for structure.
- **D7. Plugin shell layout mirrors plan-it.** `.claude-plugin/marketplace.json` (name `devotts`, plugin `do-it` with `source: "./plugins/do-it"`) and `plugins/do-it/.claude-plugin/plugin.json` with `dependencies`. Source: plan-it layout read above; default R3; default R4 version 0.1.0.
- **D8. `dependencies` is declared and also backed by a fallback.** The field is validated by the host (probe), but resolution is unverified, so the claim "installing do-it installs the family" is made only after an R2 real case observes it. Until then the README says to run `do-it doctor --install` when the family is missing. Source: research 11 plugin-dependency section, open question 4.
- **D9. Cross-marketplace caution.** Companions live in other repos whose marketplaces share the name `devotts` (plan-it, build-it, review-it, conclude-it, prompt-it) while parallel-lifecycle's marketplace is named `parallel-lifecycle`. The host has an `allowCrossMarketplaceDependenciesOn` marketplace field (research 11, inferred from binary strings). The do-it marketplace entry therefore lists the companions itself (github sources, pinned versions) and sets that field if the validator accepts it. R2 records what the host does as evidence, either way.
- **D10. `core/companions.json` is the pin ledger.** Schema `do-it-companions/1`: `marketplace`, `companions[]` with `name`, `repo`, `version` (exact semver, no range), `required` (true or false), `status` (`published` or `planned`), `skill_dir`. Planned plugins (deploy-it, reconcile-it) are not placed in `dependencies` until published. parallel-lifecycle is `required:false` (soft dependency, ruling D14). Source: ruling D14, docs/05. A drift detector `scripts/check-pins.mjs` reads the sibling marketplace files read-only and reports each mismatch with file and line; it must report the three 0.2.1 pins today.
- **D11. Root SKILL.md is generated, never hand-edited.** `scripts/generate-skill.mjs` builds `SKILL.md` from fragments in `plugins/do-it/skill-src/` plus the preset and persona names read from `core/pipelines` and `core/personas` (read-only inputs from L2). Output is deterministic (same inputs, same sha256). Frontmatter carries `name`, `description`, `author: DevOtts`, `author_url: https://github.com/DevOtts`, and the last line is `_Authored by [DevOtts](https://github.com/DevOtts)._` (user rule for authored skills).
- **D12. Mirror parity is enforced by manifest.** `scripts/mirror-manifest.json` lists pairs: root `SKILL.md` and `plugins/do-it/skills/do-it/SKILL.md`; `core/spine/do-it.mjs` and `plugins/do-it/scripts/do-it.mjs` (default R1); `core/personas/*` and `plugins/do-it/personas/*`; `core/pipelines/*` and `plugins/do-it/pipelines/*`; `hosts/claude-code/hooks/*` and `plugins/do-it/hooks/*`. `scripts/sync-mirror.mjs --check` exits 0 when byte-identical, 1 on a difference, 3 when a source is missing because another lane has not shipped. core/ never names a harness (G-12), so host-specific copies come only from `hosts/`.
- **D13. `do-it doctor --install` is the fallback for Codex and OpenCode.** It lives in the spine (S1); L5 supplies the data it reads (`core/companions.json`) and tests it. It runs one `npx skills add DevOtts/{name} -a {host}` per required companion in order, supports `--dry-run`, is idempotent, and records per-companion outcomes. A mid-list failure is PARTIAL_FAILURE with the finished and missing companions named; a re-run installs only the missing ones. Source: CONTRACT section 3 (doctor --install), section 6, default R5.
- **D14. R3 is a catalog, not a patch.** Location `plugins/do-it/catalog/companion-changes.md` plus machine-readable `companion-changes.json`, linted by `scripts/lint-catalog.mjs`. Every section has: owner repo, current state (with `path:line` read from the sibling), exact changes, size, verification case (an existing T-id from any epics file). Where a change is a one-line edit (pin bumps, report directory), the section carries a diff and a case proves `git apply --check` succeeds on a scratch copy of the real file. The sibling repos are never written (CONTRACT section 5).
- **D15. The fixtures measure, not assume.** Each fixture under `tests/fixtures/{name}/` holds inputs plus `expected.json` produced by `scripts/measure-fixture.mjs` (counting from the fixture's own content), not typed by hand; the harness recomputes and compares. Five fixtures: `feature-overnight`, `investigate-fix`, `weekly-drain` (10 cards), `review-loop`, `reconcile`. Source: docs/02 presets, docs/06 releases (v0.2 "drain fixture closes with zero unaccounted rows"; v0.3 "five fixtures pass on three hosts or list exact skips").
- **D16. Drain isolation is asserted, not hoped.** The drain fixture asserts sandboxes (git worktrees) created equals the number of slices that need a build; slices that only need a note edit or a decision create none. The count comes from `git worktree list` before, during and after, on a real scratch git repo. Source: docs/02 decomposition rule.

## 5. The R3 catalog: contents the build must produce
Sizes follow docs/05. "Verify" names the planned case; the catalog section embeds its T-id.

| Section | Owner repo | Exact changes (summary) | Size | Verify |
|---|---|---|---|---|
| all companions | each plugin repo | write `it-result/1` atomically as the last act (fields per CONTRACT section 2, exit_code mirrors status); one tier vocabulary T1/T2/T3 with Engine aliases; one result vocabulary (VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED); resolve root from `DO_IT_HOME`, default `{repo}/.do-it`, worktrees resolve the main checkout via `git rev-parse --git-common-dir`; read legacy paths as resume fallback | M each | T-R3-03, T-R3-04, T-R3-05 |
| prompt-it | DevOtts/prompt-it | emit a brief with a validated pointer list (every path or id exists, 8000 token cap, G-11); drift fix: bump the prompt-it pin from 0.2.1 to 0.3.0 in plan-it, build-it and review-it marketplaces | S | T-R3-06, T-R3-11 |
| plan-it | DevOtts/plan-it | readiness verdict `READINESS.json` plus DECISIONS.md at G4 (G-8); add a `Verify` column (`auto`, `attended`, `judgement`) to the Test Contract grammar | M | T-R3-12 |
| build-it | DevOtts/build-it | resolve `.build-it-reports` against `.fable-it-reports` (keep `.build-it-reports/`, read the old one as legacy, stop creating it); wording compatible with the conductor ceiling | S | T-R3-11, T-R3-14 |
| review-it | DevOtts/review-it | owns and re-cuts `ATTENDED-GATE.html` every round at `.do-it/review/`; frozen roteiro fingerprint; severity classes blocker, major, minor, nit (ruling D2) | M | T-R3-13 |
| conclude-it | DevOtts/conclude-it | refuse close on an unaccounted row, a live worker or a pending wake-up (G-13); read `finish-line.json` | S | T-R3-14 |
| parallel-lifecycle | DevOtts/parallel-lifecycle | stays separate (ruling D14); expose the `isolation` driver contract (worktree create, remove, path) | S | T-R3-14 |
| deploy-it (new, from engine-deploy and deploy-router) | proposed new repo DevOtts/deploy-it | `.deploy-it/adapter.json`; LEG protocol; result states DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN; router lock first, canary on the lowest-risk target, every declared leg required; Engine specifics move into an adapter; PARTIAL_FAILURE then ROLLED_BACK then ESCALATED when rollback fails; recovery by re-verify; a leg is re-read after the claim (adversarial verify) | L | T-R3-07, T-R3-08, T-R3-09, T-R3-10 |
| reconcile-it (new plugin) | proposed new repo DevOtts/reconcile-it | `scan`, `plan`, `apply --approved`; persisted state file `.do-it/reconcile/state.json`; apply without approval exits 2 and deletes nothing; execution-time re-verification | M | T-R3-15, T-R4-10, T-R4-11 |

LEG protocol (catalog text the build must write, derived from docs/03 and CONTRACT section 3): a deploy is an ordered list of legs declared in `.deploy-it/adapter.json` (`legs[]` with `name`, `command`, `verify`, `rollback`, `risk`). Each leg returns one JSON line: `{leg, state, evidence, sha256}`. A leg with a passing verify is DEPLOYED_VERIFIED; with no verify command, DEPLOYED_UNVERIFIED; a leg held by the router lock, HELD; a failing command or verify, FAILED; a leg needing a credential or a production flag, NEEDS_HUMAN. After a leg claims success the verify step re-reads the target from scratch (new process, no cached handle) and compares the digest to the claim; a mismatch turns the leg FAILED, never VERIFIED. If some legs pass and some fail the run is PARTIAL_FAILURE, compensation runs the passed legs' `rollback` in reverse order and the run becomes ROLLED_BACK; if a rollback fails the run becomes ESCALATED; after a fix, ROLLED_BACK goes back to DEPLOYING and each leg is re-verified (recovery). These transitions are the CONTRACT M1 lines and R3 must not change them.

## 6. Epics
| EID | Title | Wave | Depends on | Test cases | [REAL] |
|---|---|---|---|---|---|
| R2 | Plugin shell, marketplace, companions, mirror | W0 | S1 (doctor), L2 names | 16 | 8 |
| R4 | Fixtures and e2e harness | W1 skeleton, W4 finish | S1 to S5, P1 to P4, H1 | 20 | 4 |
| R3 | Companion change catalog | W3 | R2 (pins), P4 (review ownership), S3 | 16 | 5 |
| R1 | README and assets | W4 | R2, R4 (measured claims), N3 (Engine link) | 16 | 4 |

Total 68 cases, 21 `[REAL]`. Build order inside L5: R2, then the R4 skeleton, R3, the rest of R4, and R1 last, because the README may only claim what the fixtures measured.

## 7. Acceptance criteria
1. `claude plugin validate` exits 0 on the repo root marketplace and on `plugins/do-it`.
2. `npx skills add ./ --list` (and the GitHub form once published) lists the `do-it` skill.
3. The README passes the README-SPEC acceptance: section order, real commands, resolving links, parsing SVGs, claims traced to the ledger, footer and license, under 450 lines.
4. `scripts/check-pins.mjs` reports zero drift for do-it's own pins and exactly the three known 0.2.1 pins in the siblings until the owners apply the catalog.
5. Mirror check exits 0 on shipped pairs; any byte difference exits 1.
6. The catalog lints clean; every verification case it cites exists in an epics file.
7. All five fixtures have a measured `expected.json`; the harness reports tokens per VERIFIED row with the estimated flag preserved.
8. The nine failure outcomes (FAILED, PARTIAL_FAILURE, ROLLED_BACK, ESCALATED, STALLED, OVER_BUDGET, HANDOFF_FAILED, BLOCKED, PARKED) are each asserted by a named case in R4, with the five cascade classes below.
9. No file outside the L5 lane is written (see amendments), and no sibling repo changes.

Cascade class coverage for this lane:
| Class | Where asserted |
|---|---|
| partial-failure | T-R4-13 (deploy legs), T-R2-14 (install companions) |
| rollback/compensation | T-R4-13, T-R3-09 |
| failed-recovery to escalation | T-R4-14, T-R4-18 |
| recovery/resume | T-R4-15, T-R4-17, T-R2-14 |
| adversarial-verify | T-R4-16, T-R4-11, T-R3-10 |
R1 is documentation only: partial-failure, rollback, escalation, recovery and adversarial classes are N/A for it (stated in epics-5-ship.md).

## 8. Risks
| Risk | P/I | Mitigation |
|---|---|---|
| Plugin `dependencies` resolve nothing at install time (unverified) | M/H | R2 real case observes it; README claim gated on it; `doctor --install` fallback is its own tested path |
| Cross-marketplace dependency blocked | M/M | list companions in the do-it marketplace with github sources; record observed behavior |
| README overclaims before fixtures exist | H/H | claims ledger; R1 built last; no numbers until measured (G-15, default R7) |
| Real cases need other lanes' code | H/M | stated [REAL]; IMPLEMENTED-NOT-VERIFIED until that epic ships; harness lists exact skips per host |
| `npx skills` agent id for OpenCode is wrong | M/L | check against installer list; else generic `-a {agent}` form |
| Mirror drift between root and plugin copies | M/M | `sync-mirror.mjs --check` in the test suite |
| Sibling repo owners do not apply the catalog | M/M | the pin detector keeps reporting the drift; do-it pins its own versions in companions.json |
| `npx` or network unreachable in CI | M/L | affected [REAL] cases end IMPLEMENTED-NOT-VERIFIED with the reason, not skipped silently |

## 9. Repo and branch plan
Lane L5 paths (CONTRACT section 5): `README.md`, `assets/**`, `plugins/**`, `.claude-plugin/**`, `scripts/**`, `tests/**`, `core/companions.json`.
| Epic | Branch | Writes only |
|---|---|---|
| R1 | `epic/R1-readme-assets` | `README.md`, `assets/do-it-hero.svg`, `assets/do-it-pipeline.svg`, `tests/readme/**`, `tests/claims.json`, `tests/install-commands.json`, `scripts/check-readme.mjs` |
| R2 | `epic/R2-shell-shell` | `.claude-plugin/marketplace.json`, `plugins/do-it/**` (except `catalog/`), `core/companions.json`, `SKILL.md` (generated), `scripts/generate-skill.mjs`, `scripts/sync-mirror.mjs`, `scripts/mirror-manifest.json`, `scripts/check-pins.mjs`, `tests/plugin/**` |
| R3 | `epic/R3-companion-catalog` | `plugins/do-it/catalog/**`, `scripts/lint-catalog.mjs`, `tests/catalog/**` |
| R4 | `epic/R4-fixtures-e2e` | `tests/fixtures/**`, `tests/e2e/**`, `scripts/measure-fixture.mjs`, `scripts/tokens-per-row.mjs` |
One worktree per epic once the repo has its first commit; reap-on-merge (RUN-POLICY).

## 10. Proposed amendments to the CONTRACT
1. Add `SKILL.md` (root, generated), `LICENSE` and `CHANGELOG.md` to lane L5. The README nav links Changelog and License, and `npx skills` needs a root `SKILL.md`; none is named in the section 5 table.
2. The local decision label "D1..Dn" in squad PRDs collides with owner rulings D1 to D21 in DECISIONS.md. Suggest squads label local decisions `PD-n`. (This PRD uses D1..D16 as the brief specifies and cites rulings as "ruling Dn".)
3. State that mirror copies under `plugins/do-it/` of files owned by other lanes are produced by `scripts/sync-mirror.mjs` and count as L5 outputs, not as writes into those lanes.
4. Record the third drift pin (review-it, 0.2.1) next to the two named in docs/05.
