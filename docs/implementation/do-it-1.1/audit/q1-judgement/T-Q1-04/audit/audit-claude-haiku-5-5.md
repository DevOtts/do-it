# Audit of ../claims.md by claude-haiku-5-5

model: claude-haiku-5-5
ledger: ../claims.md
ledger_sha256: c9a768a6d39fa86b98d52459b0430cf5cfb6428e1ded6d17bf58ec665474d2c2
author model: claude-sonnet-5-5
tier check: doc-it tiers resolve

| ID | Tier | Verdict | Evidence | Round |
|---|---|---|---|---|
| P1 | code | TRUE | `git -C /Users/macbook/Workspace/Devotts/review-it show eed4dec:plugins/review-it/.claude-plugin/plugin.json` (read with `cat -n`, lines 1-8). Line 4: `"version": "2.1.1",` | recheck |
| P2 | code | TRUE | `git -C /Users/macbook/Workspace/Devotts/review-it show eed4dec:plugins/review-it/scripts/status-sync.mjs` (read with `cat -n`, lines 104-106). `const cands = [explicit, process.env.STATUS_WRITE,` then `join(homedir(), 'Workspace/Devotts/build-it/plugins/build-it/scripts/status/status-write.mjs')].filter(Boolean);`. `STATUS_WRITE` is read before the hard-coded default path. Note: the explicit argument is tried ahead of both, so the claim holds only as "before its default". | recheck |
| P3 | code | TRUE | review-it@ca86985:qa/fixtures/no-plan/qa/derived.test.mjs:6 → `import { parseRow, toRecord } from "../src/csv.mjs"` | initial |
| P4 | durable-doc | TRUE | `git show eed4dec:LICENSE` first line "MIT License" | initial |
