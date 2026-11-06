<!-- generated from status.json by status-write; do not edit by hand -->

# Harness status tracking — status

Progress: 100%
Tasks: 8 · verified 8 (claims) · done 0 · in-progress 0 · blocked 0 · not-started 0
Updated: 2026-11-06T21:52:47Z
Closed: yes

## Blocked

None

## Verified claims

- ST-01 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-01-review-it.md` · at 2026-11-06T21:52:05Z · sha 313da6a35f45
- ST-06 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-06-review-it.md` · at 2026-11-06T21:52:05Z · sha 15e79018e7e4
- ST-07 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-07-review-it.md` · at 2026-11-06T21:52:06Z · sha 4f466a307fed
- ST-02 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-02-review-it.md` · at 2026-11-06T21:52:05Z · sha 4ebe6f74239e
- ST-03 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-03-review-it.md` · at 2026-11-06T21:52:05Z · sha 119fc498bb30
- ST-04 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-04-review-it.md` · at 2026-11-06T21:52:05Z · sha 5bb3c10e82f0
- ST-05 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-05-review-it.md` · at 2026-11-06T21:52:05Z · sha c5d0b8d2e4cb
- ST-08 claimed by review-it · verdict `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-08-review-it.md` · at 2026-11-06T21:52:06Z · sha f61abe23cc26

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
| ST-01 | Schema v1, shared writer and validator | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-01-review-it.md` | build-it:sonnet | 2026-11-06T21:52:05Z |
| ST-06 | Render STATUS.md from status.json | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-06-review-it.md` | build-it:haiku | 2026-11-06T21:52:05Z |
| ST-07 | Migration script, run on do-it and one ANM package | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-07-review-it.md` | build-it:sonnet | 2026-11-06T21:52:06Z |
| ST-02 | plan-it creates status.json from epics and Test Contract | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-02-review-it.md` | build-it:sonnet | 2026-11-06T21:52:05Z |

## W2 Lifecycle callers

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| ST-03 | build-it updates status and evidence at task boundaries | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-03-review-it.md` | build-it:opus | 2026-11-06T21:52:05Z |
| ST-04 | review-it path: set verified from the verdict | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-04-review-it.md` | build-it:sonnet | 2026-11-06T21:52:05Z |
| ST-05 | conclude-it path: final state, freeze, move to 0-done with the guard | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-05-review-it.md` | build-it:sonnet | 2026-11-06T21:52:05Z |

## W3 Adversarial review

| Task | Title | Status | Evidence | Owner | Updated |
| --- | --- | --- | --- | --- | --- |
| ST-08 | Adversarial review: try to get a fake 100% through every writer | verified | `docs/implementation/harness-status-tracking/evidence/b1-review-it/ST-08-review-it.md` | build-it:opus | 2026-11-06T21:52:06Z |

## Sessions

None

## History (latest 20)

- 2026-11-06T21:52:47Z *: open → closed by conclude-it
- 2026-11-06T21:52:06Z ST-08: done → verified by review-it
- 2026-11-06T21:52:06Z ST-07: done → verified by review-it
- 2026-11-06T21:52:05Z ST-06: done → verified by review-it
- 2026-11-06T21:52:05Z ST-05: done → verified by review-it
- 2026-11-06T21:52:05Z ST-04: done → verified by review-it
- 2026-11-06T21:52:05Z ST-03: done → verified by review-it
- 2026-11-06T21:52:05Z ST-02: done → verified by review-it
- 2026-11-06T21:52:05Z ST-01: done → verified by review-it
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
