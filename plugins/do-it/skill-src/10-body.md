# do-it

do-it is the conductor above the *-it family. The spine (`do-it` CLI) is the only writer of run state; every stage is a persona that returns an `it-result/1` file.

## How to run

1. Start or resume a run: `node core/spine/do-it.mjs start --request "<request>"` (or `resume`). The run is owned by the session that starts it: the host passes its session id, or give `--session <id>` (order: `--session`, then `DO_IT_SESSION_ID`, then the host's variable; `start` reports `session_conflict` when an explicit id differs from the host's). `resume` with no `--run` picks only a run this session owns. After a `/clear` the session id is new: run `resume --run <id> --take-over` to re-bind your run to it (plain `resume` refuses with `OWNED_BY_OTHER_SESSION` and names the run). Never take over a run another live session is working on.
2. Ask the spine for the next step: `do-it next`. Spawn the named persona at the named tier.
3. Record every result with `do-it record`; close each stage with `do-it gate`. A result with no slice that is `blocked` or `failed` carries a `reason`, a `needs_human` result brings at least one owner-pack question, and deploy legs are recorded only after `gate advance --to DEPLOYING`, each FAILED leg with evidence; otherwise `record` refuses it and the run keeps working.
4. Human questions go into the single owner pack; never ask mid-run. Answer with `do-it answer`.
5. At the context ceiling, write a handoff (`do-it handoff`) before the next step.
6. Close only when every finish-line row is terminal (`do-it status --json`).
7. The stop gate refuses a stop while your run has open rows, and parks the run after `stop_gate.patience` refusals without progress. A refusal marked `refusal_uncounted` could not be written (disk full, read-only folder, `STATE_TOO_LARGE`): it is not counted, so the run never parks and every stop is refused until the write error it names is fixed. Fix that error; do not wait for a park.

## Rules

- A row is VERIFIED only with evidence the spine can resolve to a file or ID.
- A real case that cannot reach its live target is IMPLEMENTED-NOT-VERIFIED, never VERIFIED on a mock.
- Every spawn names a tier (T1 powerful, T2 balanced, T3 cheap); T1 needs a written reason.
- Credential values never enter briefs, logs, packs or model context.

## Install the family

If the host did not install the companions, run `do-it doctor --install`; it reads `core/companions.json`.

Optional companions (not installed by default; `do-it doctor --install --host <host> --dry-run` lists them):
- doc-it: documentation rules and checks: source tiers, archive closeout, expiry, stale checkout.
- init-it: registers a session against an implementation.
