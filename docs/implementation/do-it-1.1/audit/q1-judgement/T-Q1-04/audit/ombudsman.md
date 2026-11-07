# Ombudsman rulings on ../claims.md

model: opus
auditor: claude-haiku-5-5

| ID | Tier | Auditor | Ruling | Final | Reason |
|---|---|---|---|---|---|
| P1 | code | TRUE | UPHELD | TRUE | Ran `git -C /Users/macbook/Workspace/Devotts/review-it show eed4dec:plugins/review-it/.claude-plugin/plugin.json \| cat -n`. Line 4: `"version": "2.1.1",`. The claim is right and so is the auditor's TRUE. |
| P2 | code | TRUE | UPHELD | TRUE | Ran `git -C /Users/macbook/Workspace/Devotts/review-it show eed4dec:plugins/review-it/scripts/status-sync.mjs \| cat -n`, lines 104-107: `function findWriter(explicit) { const cands = [explicit, process.env.STATUS_WRITE, join(homedir(), 'Workspace/Devotts/build-it/plugins/build-it/scripts/status/status-write.mjs')].filter(Boolean); return cands.find((p) => existsSync(p)); }`. `STATUS_WRITE` comes before the default path, so TRUE holds. The auditor's caveat also holds: the `explicit` argument is tried first, and a candidate is used only if `existsSync` finds it. |
| P3 | code | TRUE | FALSE | FALSE | The auditor's evidence is from `ca86985`, not the claimed `eed4dec`. `git cat-file -e eed4dec:qa/fixtures/no-plan/qa/derived.test.mjs` → `fatal: path 'qa/fixtures/no-plan/qa/derived.test.mjs' does not exist in 'eed4dec'`. `git ls-tree -r --name-only eed4dec \| grep no-plan` → only `qa/fixtures/no-plan/src/csv.mjs`. `git log --diff-filter=D -1 eed4dec -- <path>` → `b8b4a3c test: keep ladder fixtures pristine — archive sim-persisted derived contracts out of fixture dirs`. The file existed at the ancestor `ca86985` (line 6 `import { parseRow, toRecord } from "../src/csv.mjs"`), but it is not shipped at release 2.1.1. |
| P4 | durable-doc | TRUE | UPHELD | TRUE | `git show eed4dec:LICENSE \| head -1` → `MIT License`. TRUE stands. |

Re-audited classes (PARTIAL_TRUST): code
