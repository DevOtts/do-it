---
name: do-it
description: >-
  One conductor for the whole *-it lifecycle. Hand it a request and it picks a
  preset, then runs prompt-it, plan-it, build-it, review-it, deploy-it and
  conclude-it as stages of one run, with a thin spine that owns run state, one
  owner pack for every human question, tiered models and a token meter. Use when
  the user says "/do-it", "do it", "run the whole lifecycle", "take this from
  idea to shipped", or "drain the backlog".
author: DevOtts
author_url: https://github.com/DevOtts
---

# do-it

do-it is the conductor above the *-it family. The spine (`do-it` CLI) is the only writer of run state; every stage is a persona that returns an `it-result/1` file.

## How to run

1. Start or resume a run: `node core/spine/do-it.mjs start "<request>"` (or `resume`).
2. Ask the spine for the next step: `do-it next`. Spawn the named persona at the named tier.
3. Record every result with `do-it record`; close each stage with `do-it gate`.
4. Human questions go into the single owner pack; never ask mid-run. Answer with `do-it answer`.
5. At the context ceiling, write a handoff (`do-it handoff`) before the next step.
6. Close only when every finish-line row is terminal (`do-it status --json`).

## Rules

- A row is VERIFIED only with evidence the spine can resolve to a file or ID.
- A real case that cannot reach its live target is IMPLEMENTED-NOT-VERIFIED, never VERIFIED on a mock.
- Every spawn names a tier (T1 powerful, T2 balanced, T3 cheap); T1 needs a written reason.
- Credential values never enter briefs, logs, packs or model context.

## Install the family

If the host did not install the companions, run `do-it doctor --install`; it reads `core/companions.json`.

## Hosts

```
| Host        | Level     |
|-------------|-----------|
| claude-code | Native    |
| codex       | Supported |
| opencode    | Supported |
| engine      | Supported |
```

---
_Authored by [DevOtts](https://github.com/DevOtts)._
