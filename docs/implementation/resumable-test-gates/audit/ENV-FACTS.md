# ENV-FACTS — probed environment facts (never guessed)

- shape: M (9-probe set — formats.md §9)
- generated-by: `gate-check preflight` (deterministic; re-run to refresh)
- status vocabulary: PRESENT | ABSENT | TIMEOUT — ABSENT/TIMEOUT fail the preflight gate

| id | check | status | evidence | tool |
|---|---|---|---|---|
| config-reachability | `/usr/bin/git -C /Users/macbook/Workspace/Devotts/do-it rev-parse origin/main` | PRESENT | d38cedbee0e3e63e8c03b1e51f7ac2bbec4bfb71 |  |
| live-registry | `/usr/bin/git -C /Users/macbook/Workspace/Engine/Engine-Core/brain-api-core rev-parse origin/main` | PRESENT | 1028113e385112dced98b3f0c85893f1ba8a1f05 |  |
| deployed-vs-installed | `node -p require('/Users/macbook/Workspace/Engine/Engine-Core/brain-api-core/node_modules/jest/package.json').version` | PRESENT | 29.7.0 | `node` |
| credential-validity | `/bin/echo no credential needed: planning is read-only, no live system is called` | PRESENT | no credential needed: planning is read-only, no live system is called |  |
| dependency-actual-usage | `/usr/bin/grep -c gate_slot_acquire /Users/macbook/Workspace/Engine/Engine-Core/brain-api-core/scripts/pre-push.sh` | PRESENT | 1 |  |
| code-vs-external-split | `/usr/bin/git -C /Users/macbook/Workspace/Engine/Engine-Core/brain-docs rev-parse origin/main` | PRESENT | c68a70706028148664d2927e607a6ab5e0c84823 |  |
| tool-availability | `node --version` | PRESENT | v22.23.2 | `node` |
| caller-consumer-surface | `/usr/sbin/sysctl -n kern.memorystatus_vm_pressure_level` | PRESENT | 2 |  |
| secret-scan-on-import | `/bin/echo no repo import in this plan: nothing is copied between repos` | PRESENT | no repo import in this plan: nothing is copied between repos |  |
