# ENV-FACTS — probed environment facts (never guessed)

- shape: L (9-probe set — formats.md §9)
- generated-by: `gate-check preflight` (deterministic; re-run to refresh)
- status vocabulary: PRESENT | ABSENT | TIMEOUT — ABSENT/TIMEOUT fail the preflight gate

| id | check | status | evidence | tool |
|---|---|---|---|---|
| config-reachability | `node --version` | PRESENT | v22.23.2 |  |
| live-registry | `sh -c command -v claude && command -v codex && command -v opencode` | PRESENT | /Users/macbook/.nvm/versions/node/v22.23.2/bin/claude |  |
| deployed-vs-installed | `sh -c ls -d ../prompt-it ../plan-it ../build-it ../review-it ../conclude-it ../parallel-lifecycle | tr '\n' ' '` | PRESENT | ../build-it ../conclude-it ../parallel-lifecycle ../plan-it ../prompt-it ../review-it |  |
| credential-validity | `gh auth status` | PRESENT | github.com |  |
| dependency-actual-usage | `node ../plan-it/plugins/plan-it/skills/plan-it/scripts/gate-check.mjs state .plan-it/do-it-v1.state.json` | PRESENT | state: preflight — Preflight (env facts) |  |
| code-vs-external-split | `sh -c command -v git && command -v python3` | PRESENT | /opt/homebrew/bin/git |  |
| tool-availability | `claude plugin validate --help` | PRESENT | Usage: claude plugin validate [options] <path> |  |
| caller-consumer-surface | `sh -c ls ~/.claude/skills ~/.claude-loudr/skills 2>/dev/null | grep -E '^(build-it|review-it|conclude-it|prompt-it|plan-it)$' | sort -u | tr '\n' ' '` | PRESENT | build-it conclude-it plan-it prompt-it review-it |  |
| secret-scan-on-import | `sh -c if grep -rIl -E 'sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|PRIVATE)|ntn_[A-Za-z0-9]{20,}' docs delivery 2>/dev/null; then exit 1; else echo 'no secret patterns'; fi` | PRESENT | no secret patterns |  |
