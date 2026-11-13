# SHARED-CONTEXT — resumable-test-gates discovery (read before working)

Run: plan-it `resumable-test-gates` inside do-it run r-20261106-130657-7ff2. Planning only. Owner away.

## What is being planned
`/Users/macbook/Workspace/Devotts/do-it/docs/implementation/resumable-test-gates/README.md` (read it fully first).
A per-test-file result ledger keyed by a dependency-closure fingerprint, so a gate that was killed or failed on one
file resumes and reuses every still-valid PASS; a composed verdict that says it is composed; T3 clean nightly as the
safety net; a deterministic per-machine gate queue with memory-budget admission. Generic primitives live in the do-it
repo (P1–P6); Engine-Core adopts them first (P7). Owner rulings in README §5.1 and §6.1 are LOCKED.

## Hard rules for every research agent
1. READ ONLY. Write NO code, edit nothing outside your one output file. No PRs, no pushes, no commits.
2. Do NOT run any test suite, jest, pytest, vitest, npm test, pre-push hook, or gate. The Mac has one shared heavy-gate
   slot and swap pressure was measured today. Reading files, `git`, `ls`, `node -e "require('…/package.json').version"`
   and read-only `ps`/`sysctl`/`vm_stat` are fine.
3. Never print or grep credentials: no `cat` of `.env*`, `.secrets/`, `tenants.json`, kube configs. Key NAMES only.
4. Use `/usr/bin/grep`, `/usr/bin/git`, `/usr/bin/diff` for anything you parse (an rtk wrapper rewrites shell output).
5. Engine repos under `/Users/macbook/Workspace/Engine/Engine-Core/` (`brain-api-core/`, `brain-agent/`, …) are real
   checkouts shared with other sessions: NEVER `git checkout`/`switch`/`stash` there. Prefer
   `/usr/bin/git -C <repo> show origin/main:<path>` for the merged truth and note when the working tree differs.
6. Every factual claim carries `path:line` (or `origin/main:path:line`) or a live reading. Mark each number MEASURED
   (you read/counted it) or ESTIMATED. Say UNKNOWN when unknown; never guess.
7. Skeptic posture: be criterious; where the README claims something, confirm or refute it with evidence.
8. You MUST run the tools and return findings; do not stop early. Write your report to the exact output path you were
   given, then end with a content-bearing final message (path, bytes, top findings). Idle without the file = not done.

## Report skeleton (use these headings)
1. Scope (what you read)
2. Findings (numbered, each with citation + MEASURED/ESTIMATED)
3. Contradictions with the README (if any)
4. Risks / failure modes the plan must model
5. Open questions only the owner can answer (with your recommendation)
