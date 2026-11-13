# build-it lessons — do-it v1 (2026-10-14)
- Agent-tool `isolation: worktree` fails when the repo was `git init`-ed in the same session; create worktrees manually (`git worktree add .worktrees/NAME -b BRANCH`) and give workers the absolute path.
- Node 22 `node --test <dir>` fails; always use a QUOTED glob.
- Built single-file bundles (core/spine/do-it.mjs) conflict on every parallel merge: resolve the sources, then rebuild with build.mjs; never hand-merge the bundle.
- Cross-lane scans (G-12/G-14 harness-name regexes) break on any later lane that mentions the words, even in docs; build the words from fragments and exempt test dirs.
- Worker-written harnesses that ignore child exit codes hide schema failures (R4 finishDrain seeded an invalid kind); assert exit codes.
- Tests that call real paid CLIs must be gated by an env flag AND documented; T-H1-11 was not, so every plain run spends subscription calls.
- Subagents may be forbidden to write report files; have them return text and write it from the coordinator.
- A wake-up prompt goes stale: always check disk state before acting on it.
- Expired claude aliases 8fai/8ftools break headless handoff tests; use `anm`.

## Session close: do-it 1.0.0 release (2026-10-18)
- A version rewrite that matches by "first occurrence" can silently do nothing: macOS `sed '0,/re/'` is not supported, so the manifests kept 0.1.0 until a node script changed the exact field.
- Rewriting JSON with JSON.stringify reflows arrays and adds churn; replace only the version string.
- Pre-merge catalog checks must replay the baseline commits, not the live sibling checkouts; otherwise merging the PR turns the check red for the right reason. Keep the baseline commit as a named constant.
- A catalog citation was written against an unpushed local branch (plan-it line 67), not the published line (63). Cite published `origin/main`.
- the pilot org a consumer service main was already red (Docker build and E2E) before the adapter PR; a red main is not a reason to merge code blindly. Hold, and report it.
- `git pull` / `git push` to DevOtts repos need `GH_TOKEN=$(gh auth token --user DevOtts)` in the same command; the default credential helper maps to another account.

## do-it 1.1.0 (2026-11-06 to 2026-11-13)
- Adversarial review (CP-03) does not converge to zero by fixing alone: each fix adds surface. Track the trend per round, and require every finding to come with a regression test that replays the attack, so earlier attacks keep holding.
- Long single reviewers stall (2–3 h, no output). Split review by area, give each a time budget, and have it write its section file incrementally.
- A `--dry-run` flag must be tested to write nothing. A reviewer's dry run overwrote a real user file before that test existed.
- A suite runner that exits 0 on skips hides unverified cases; release runs set every env var and list skips explicitly.
- Live-service probes must require a service-specific answer. "Any container named like it" plus "any HTTP status" turned an unrelated Mongo container and a 404 into "Engine reachable".
- Long CPU-bound tests time out when other sessions load the machine (load average 26). Re-run a failed case alone before calling it a regression.
- Driving a nested Claude Code TUI needs a clean env (no inherited CLAUDE_CODE_* variables) and a fixed terminal size. `--settings` that disables plugins also disables the plugin under test.
- Plugin-shipped commands must not depend on repo-only files (companions.json); test them from a plugin-cache-style copy.
- Before tagging a sibling, re-check its origin/main sha against the planned one; a local git config can display a merge commit as its parent.
