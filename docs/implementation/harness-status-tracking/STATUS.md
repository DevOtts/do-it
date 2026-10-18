<!-- generated from status.json by status-write; do not edit by hand -->

# Harness status tracking — status

Progress: 60%
Tasks: 8 · verified 0 · done 8 · in-progress 0 · blocked 0 · not-started 0
Updated: 2026-10-18T14:47:48Z

## Blocked

None

## Pieces

| Piece | Status | Blocked on | What's left |
| --- | --- | --- | --- |
| Shared writer | done | — | Verification by review-it |
| plan-it creation | done | — | Verification by review-it |
| build-it boundaries | done | — | Verification by review-it |
| review-it and conclude-it paths | done | — | Wire review-it and conclude-it plugins to call the writer (follow-up) |
| STATUS.md render | done | — | Verification by review-it |
| Migration | done | — | Verification by review-it |
| Adversarial review | done | — | Residual risks listed in the run report |

## W1 Writer, render, migration, plan-it

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| ST-01 | Schema v1, shared writer and validator | done | `docs/implementation/harness-status-tracking/evidence/ST-01.md` | build-it:sonnet | 2026-10-18T14:24:33Z |
| ST-06 | Render STATUS.md from status.json | done | `docs/implementation/harness-status-tracking/evidence/ST-06.md` | build-it:haiku | 2026-10-18T14:24:33Z |
| ST-07 | Migration script, run on do-it and one ANM package | done | `docs/implementation/harness-status-tracking/evidence/ST-07.md` | build-it:sonnet | 2026-10-18T14:24:33Z |
| ST-02 | plan-it creates status.json from epics and Test Contract | done | `docs/implementation/harness-status-tracking/evidence/ST-02.md` | build-it:sonnet | 2026-10-18T14:24:33Z |

## W2 Lifecycle callers

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| ST-03 | build-it updates status and evidence at task boundaries | done | `docs/implementation/harness-status-tracking/evidence/ST-03.md` | build-it:opus | 2026-10-18T14:30:38Z |
| ST-04 | review-it path: set verified from the verdict | done | `docs/implementation/harness-status-tracking/evidence/ST-04.md` | build-it:sonnet | 2026-10-18T14:30:38Z |
| ST-05 | conclude-it path: final state, freeze, move to 0-done with the guard | done | `docs/implementation/harness-status-tracking/evidence/ST-05.md` | build-it:sonnet | 2026-10-18T14:30:38Z |

## W3 Adversarial review

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| ST-08 | Adversarial review: try to get a fake 100% through every writer | done | `docs/implementation/harness-status-tracking/evidence/ST-08.md` | build-it:opus | 2026-10-18T14:47:48Z |

## Sessions

None

## History (latest 20)

- 2026-10-18T14:47:48Z ST-08: in-progress → done by build-it
- 2026-10-18T14:30:38Z ST-08: not-started → in-progress by build-it
- 2026-10-18T14:30:38Z ST-05: in-progress → done by build-it
- 2026-10-18T14:30:38Z ST-04: in-progress → done by build-it
- 2026-10-18T14:30:38Z ST-03: in-progress → done by build-it
- 2026-10-18T14:24:33Z ST-05: not-started → in-progress by build-it
- 2026-10-18T14:24:33Z ST-04: not-started → in-progress by build-it
- 2026-10-18T14:24:33Z ST-03: not-started → in-progress by build-it
- 2026-10-18T14:24:33Z ST-02: in-progress → done by build-it
- 2026-10-18T14:24:33Z ST-07: in-progress → done by build-it
- 2026-10-18T14:24:33Z ST-06: in-progress → done by build-it
- 2026-10-18T14:24:33Z ST-01: in-progress → done by build-it
- 2026-10-18T14:24:33Z ST-02: not-started → in-progress by build-it — bootstrap: task started before the board existed (D-16)
- 2026-10-18T14:24:33Z ST-07: not-started → in-progress by build-it — bootstrap: task started before the board existed (D-16)
- 2026-10-18T14:24:33Z ST-06: not-started → in-progress by build-it — bootstrap: task started before the board existed (D-16)
- 2026-10-18T14:24:33Z ST-01: not-started → in-progress by build-it — bootstrap: task started before the board existed (D-16)
