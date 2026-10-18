# Major bump digest (2026-10-14), branch feat/do-it-integration, not merged/tagged/released

| Repo | Old -> New | PR | Commit | Tests |
|---|---|---|---|---|
| prompt-it | 0.3.1 -> 1.0.0 (carries 0.3.0 + 0.3.1; CHANGELOG lists all three) | https://github.com/DevOtts/prompt-it/pull/2 | 04158b3 | claude plugin validate (marketplace + plugin) pass; no suite besides eval samples (not re-run) |
| build-it | 3.2.0 -> 4.0.0 | https://github.com/DevOtts/build-it/pull/15 | 290b799 | tests/lints/run-all.sh ALL GREEN (incl. t20-release); plugin validate pass |
| plan-it | 4.1.0 -> 5.0.0 | https://github.com/DevOtts/plan-it/pull/3 | cc2a65b | run-contract 58/58; mirror-check 11/11; version-triple-match, changelog-shape, machine-additive, pluginlint pass; plugin validate pass (plugin dir: with warnings, pre-existing) |
| review-it | 1.1.0 -> 2.0.0 | https://github.com/DevOtts/review-it/pull/3 | 5eddca6 | plugin validate pass (no suite) |
| conclude-it | 1.2.0 -> 2.0.0 | https://github.com/DevOtts/conclude-it/pull/1 | 14ff2ac | plugin validate pass (no suite) |
| parallel-lifecycle | 0.2.0 -> 1.0.0 | https://github.com/DevOtts/parallel-lifecycle/pull/1 | 541289c | plugin validate pass; isolation.sh bash -n ok; CHANGELOG.md created (none existed) |

## Pins changed
- prompt-it pin 0.3.0 -> 1.0.0 in marketplace.json of build-it, plan-it, review-it. conclude-it and parallel-lifecycle have no pins.
- No other cross-plugin pins existed.

## Notes
- plan-it version-pinned tests (run-contract T-E5-01, version-triple-match, machine-additive, changelog-shape) and both machine.json copies moved to 5.0.0; CLAUDE.md "Current" line updated.
- review-it sub-skills (deploy-verify, pr-review, side-effects) keep their own 1.0.0 frontmatter (independent of plugin version); conclude-it session-debrief and parallel-lifecycle plugin SKILL.md carry no version line.
- Work done in temp worktrees (scratchpad) so the sibling agents' main checkouts were untouched. PR titles/bodies edited: new version at top, body ends with the Generated-with line and the session URL. Old body text (e.g. "Proposed version: 4.1.0") is retained below the new Version section as history.
- SKILL.md authored-by rules verified intact (author lines + footer) in all six repos.
