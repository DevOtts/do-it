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
