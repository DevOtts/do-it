# ENV-FACTS — probed environment facts (never guessed)

- shape: M (9-probe set — formats.md §9)
- generated-by: `gate-check preflight` (deterministic; re-run to refresh)
- status vocabulary: PRESENT | ABSENT | TIMEOUT — ABSENT/TIMEOUT fail the preflight gate

| id | check | status | evidence | tool |
|---|---|---|---|---|
| config-reachability | `sh -c git -C /Users/macbook/Workspace/Devotts/do-it rev-parse --short origin/main && git -C /Users/macbook/Workspace/Devotts/do-it show origin/main:core/companions.json | grep -m1 '"version"'` | PRESENT | d38cedb |  |
| live-registry | `sh -c cd <pilot-repo>/a consumer service && gh pr view 727 --json state -q .state` | PRESENT | CLOSED |  |
| deployed-vs-installed | `sh -c test -f /Users/macbook/Workspace/Devotts/init-it/plugins/init-it/scripts/init-it.mjs && ! git -C /Users/macbook/Workspace/Devotts/init-it rev-parse 2>/dev/null && echo 'init-it local, not a repo'` | PRESENT | init-it local, not a repo |  |
| credential-validity | `gh auth status` | PRESENT | github.com |  |
| dependency-actual-usage | `sh -c git -C /Users/macbook/Workspace/Devotts/build-it cat-file -e origin/main:plugins/build-it/scripts/status/status-write.mjs && echo present` | PRESENT | present |  |
| code-vs-external-split | `sh -c git -C /Users/macbook/Workspace/Devotts/conclude-it show origin/main:plugins/conclude-it/skills/conclude-it/references/ship-pipeline.md | grep -c 'git mv'` | PRESENT | 2 |  |
| tool-availability | `node --version` | PRESENT | v22.23.2 |  |
| caller-consumer-surface | `sh -c git -C /Users/macbook/Workspace/Devotts/build-it grep -q init-it origin/main -- plugins && git -C /Users/macbook/Workspace/Devotts/review-it grep -q init-it origin/main -- plugins && echo build-it-and-review-it` | PRESENT | build-it-and-review-it |  |
| secret-scan-on-import | `sh -c ! grep -rIlq --exclude=ENV-PROBES.json --exclude=ENV-FACTS.md -e 'AKIA[0-9A-Z]\{16\}' -e 'BEGIN RSA PRIVATE' -e 'BEGIN OPENSSH PRIVATE' -e 'ghp_[A-Za-z0-9]\{20,\}' /Users/macbook/Workspace/Devotts/do-it/.worktrees/plan-read-origin-main/docs/implementation/do-it-1.1 && echo no-secret-patterns` | PRESENT | no-secret-patterns |  |
