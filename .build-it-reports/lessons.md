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
