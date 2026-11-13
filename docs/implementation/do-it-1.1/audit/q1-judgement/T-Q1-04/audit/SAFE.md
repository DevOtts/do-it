# SAFE — ../claims.md

Chain: author claude-sonnet-5-5 → auditor claude-haiku-5-5 → ombudsman opus. Ledger sha256 c9a768a6d39fa86b98d52459b0430cf5cfb6428e1ded6d17bf58ec665474d2c2.
Tier check: every row resolved by doc-it.

## SAFE (3)

- P1 — review-it's plugin manifest says version 2.1.1
- P2 — status-sync reads the writer path from `STATUS_WRITE` before its default
- P4 — The repository is MIT licensed

## DO-NOT-PUBLISH (1)

- P3 (FALSE) — The no-plan fixture ships a derived test, `qa/fixtures/no-plan/qa/derived.test.mjs`, that imports `parseRow` from `src/csv.mjs` — The auditor's evidence is from `ca86985`, not the claimed `eed4dec`. `git cat-file -e eed4dec:qa/fixtures/no-plan/qa/derived.test.mjs` → `fatal: path 'qa/fixtures/no-plan/qa/derived.test.mjs' does not exist in 'eed4dec'`. `git ls-tree -r --name-only eed4dec | grep no-plan` → only `qa/fixtures/no-plan/src/csv.mjs`. `git log --diff-filter=D -1 eed4dec -- <path>` → `b8b4a3c test: keep ladder fixtures pristine — archive sim-persisted derived contracts out of fixture dirs`. The file existed at the ancestor `ca86985` (line 6 `import { parseRow, toRecord } from "../src/csv.mjs"`), but it is not shipped at release 2.1.1.

## Tokens per role

| Role | Model | Dispatches | Tokens |
|---|---|---|---|
| auditor | claude-haiku-5-5 | 2 | 55938 |
| ombudsman | opus | 2 | 79852 |
