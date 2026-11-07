# do-it next: trustworthy analysis (proposal)

| Field | Value |
|---|---|
| Status | **PROPOSAL 2026-11-06**, agreed in direction by the owner; not planned or built |
| Origin | session `trust-research-study` (`/read-chat "trust-research-study"`), diagnosing Engine session `grokbot-plan` |
| Evidence | Engine-Core `docs/implementation/be-grokbot-like/audit/` (claim ledger, Fable audit, Opus ombudsman) |
| Sibling program | Engine-Core `docs/implementation/docs-trust/` (doc organization; feeds the doc-it plugin, §4) |

## 1. The problem

The owner lost trust in do-it's proposals. In `grokbot-plan` an architecture analysis was corrected four times, each time only after the owner doubted it:

| Claim | Why it was wrong |
|---|---|
| "3 models", "fresh browser profile per job" | Quoted from the earlier study and old research, not from code |
| Propose `execute(spec)` as a new road | Missed be-claudecode-like, shipped days before after a week of work |
| "5 credential ways" | Lumped three different things to reach a strong number; missed secrets-highway, merged that day |
| "The Casa is the twv workspace" | New inference, never checked |

The audit that followed found 67 claims: 54 true, 10 partial, 3 unverifiable. The Opus ombudsman then corrected 7 of the Fable auditor's 10 findings. **Changing models is not the fix. Independent verification against primary sources, over a closed list of claims, is.**

## 2. Root causes

1. **No source hierarchy.** Old docs, the prior study, subagent reports and `origin/main` carried equal weight. Stale boards misled too (secrets-highway `status.json` 0 of 48 with half merged; video-kernel STATUS six weeks old).
2. **No shipped-layer check.** BCL, secrets-highway and the "do not deprecate handson" ruling (`concept-consolidation/CONTRACT.md:68`) were all on disk and unread.
3. **Undefined counts.** "5 lease copies" → "≥7" → "~6 shapes in ~12 copies". The number served the thesis.
4. **Agreeing with the owner's hypothesis.** "Smells like a highway break" was answered with "your suspicion is confirmed", and the counts were then built to fit.
5. **Verification is reactive and one claim at a time.** Each fix patched the challenged claim and left the rest. The full audit ran only on the fourth complaint, at about 200k tokens for the ombudsman alone.
6. **A do-it bug added pressure.** The stop gate refused seven stops in a session that was not a do-it run (§3.6).

## 3. Proposed changes

### 3.1 Claim ledger as a first-class artifact
Any analysis that backs a decision (study, plan-it design doc, architecture HTML) carries a claim ledger: one row per factual claim with its source tier (`live@date`, `code@repo@sha:path:line`, `generated`, `durable-doc@verified`, `program-doc`, `pointer`). The rendered HTML shows the tier on each claim. A gate refuses to publish when a claim backed only by `program-doc` or `pointer` is stated as fact.

### 3.2 Shipped-layer check in plan-it pre-grounding
Before proposing any new structure, read the session ledger, the target repo's `0-done/` from the last N weeks, and the decision registers (ADRs, CONTRACT rulings). Record what was read in the grounding file. A proposal that adds a road, layer or registry must name the shipped layer it extends or say why none applies.

### 3.3 Every headline number carries its list and its rule
A count in a summary, table header or HTML hero must link to the enumerated list and the inclusion rule. No list, no number.

### 3.4 Owner hypotheses get evidence against first
When the owner proposes a diagnosis, the response states the strongest evidence against it before it concludes. "Confirmed" is allowed only after that section.

### 3.5 Audit before publish, sized to the stakes
- **Decision-grade** (backs an owner decision or a plan freeze): the full chain. A ledger, an auditor on a different model reading primary sources only, then an ombudsman over the auditor's findings. Only SAFE-TO-PUBLISH wording ships.
- **Everything else:** the ledger with tiers, no auditor.

The chain the owner built by hand in `grokbot-plan` becomes a review-it mode, not an emergency measure.

### 3.6 Fix the stop gate (bug, small)
**Corrected twice on 2026-11-06.** The first draft read a local checkout 24 commits behind `origin/main`. The second still overstated the null-session count. The audited version is in `docs/implementation/do-it-1.1/docs/01` F1 and `02` §A. In short:

- do-it ignores `CLAUDE_CODE_SESSION_ID`, which Claude Code sets in every Bash command, so a run is owned by its folder unless the model exports the id by hand.
- `gateStop` never reads the run status: 1,997 of 2,034 parks in Engine-Core hit an already-parked run.
- One repo-wide finish line judges every run on every other run's rows.
- All 62 questions in Engine-Core's owner packs were written by the stop gate.

Fix: fall back to `CLAUDE_CODE_SESSION_ID` in `start`, gate by session only, allow PARKED/NEEDS_HUMAN/BLOCKED/AWAIT_RATIFY/terminal runs, and count only the run's own rows (epic S1).

## 4. doc-it: a new companion plugin

The owner agreed (2026-11-06) that doc organization is part of the problem. **doc-it** is its own plugin and repo, `DevOtts/doc-it`, like init-it (R4). It owns the documentation rules, and conclude-it, plan-it and review-it consume it. The pattern drafted in the pilot repo became its global standard (R5): `doc-it/docs/STANDARD.md` v0, with lessons in `doc-it/docs/LEARNINGS.md`. Early shape:

- source tiers per doc, readable by agents (feeds 3.1);
- an expiry for `status: current` (pilot: 159 of 369 "current" docs past 60 days);
- archive moves gated on a closeout (pilot: 12 archived programs still show open rows);
- status derived from evidence, or the board's age on its first line;
- a one-home map per fact kind, flagging restatements that disagree;
- the checks shipped as scripts and run at session close, because a convention with no running check rots (the pilot's July `verified:` rule did).

Plugin not designed yet. It goes to plan-it once doc-it's owner questions are answered.

## 5. Order

1. 3.6 stop-gate fix (bug, independent, small).
2. 3.2 and 3.3 in plan-it (cheap, prevent the most errors).
3. 3.1 ledger and tier gate; 3.4 in prompt-it/plan-it guidance.
4. 3.5 audit mode in review-it.
5. doc-it, after the Engine docs-trust pilot.
