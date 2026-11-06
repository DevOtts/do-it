# Prompt: status.json for plan-it and build-it

Paste everything below the line into the session that works on the plan-it and build-it plugins. Related: `CARD-A-init-it.md`, `CARD-B-status-tracking.md` in this folder.

---

## Goal

Make the harness own implementation progress. plan-it creates a machine-readable `status.json` per implementation, build-it keeps it current with evidence, and a read-only mod (`/doit-status`) turns it into a percent, a table and a session list. A model never types a percent. "Done" always needs an evidence path.

Read first: `docs/implementation/harness-status-tracking/CARD-B-status-tracking.md` (the study and rules) and `CARD-A-init-it.md` (the session registration, which writes `sessions[]`). Do not edit plugins outside plan-it and build-it in this session. review-it, conclude-it and init-it get their own changes later; build the shared writer so they can call it.

## Where the file lives

`<repo>/docs/implementations/<name>/status.json`. One file per implementation. Implementations in `0-done` and `1-backlog` are not scanned by the mod.

## Schema (schema: 1)

```json
{
  "schema": 1,
  "implementation": "harness-status-tracking",
  "title": "Harness status tracking",
  "updated_at": "2026-10-15T14:02:11Z",
  "approximate": false,
  "closed": false,
  "waves": [
    {
      "id": "W1",
      "title": "Writer and plan-it",
      "tasks": [
        {
          "id": "ST-01",
          "title": "Schema, shared writer and validator",
          "status": "verified",
          "blocked_on": null,
          "evidence": ".taskstate/results/ST-01.md",
          "owner": "build-it:sonnet",
          "updated_at": "2026-10-15T13:40:00Z",
          "note": null
        },
        {
          "id": "ST-03",
          "title": "build-it updates status at task boundaries",
          "status": "blocked",
          "blocked_on": "owner: Fernando decides where build-it hooks in",
          "evidence": null,
          "owner": "Fernando",
          "updated_at": "2026-10-15T13:55:00Z",
          "note": null
        }
      ]
    }
  ],
  "sessions": [
    {
      "session_id": "8b6a0000-0000-0000-0000-000000000000",
      "alias": "claudeanm",
      "name": "harness-status-build",
      "role": "build",
      "started_at": "2026-10-15T12:10:00Z",
      "ended_at": null
    }
  ],
  "pieces": [
    {
      "piece": "Shared writer",
      "status": "verified",
      "blocked_on": null,
      "whats_left": "Nothing"
    },
    {
      "piece": "build-it hook",
      "status": "blocked",
      "blocked_on": "owner decision on hook point",
      "whats_left": "Wire the writer at task boundaries; 4 cases"
    }
  ],
  "history": [
    {
      "at": "2026-10-15T13:40:00Z",
      "task": "ST-01",
      "from": "done",
      "to": "verified",
      "by": "review-it",
      "note": null
    }
  ]
}
```

### Field table

| Field | Type | Required | Who writes | Meaning |
|---|---|---|---|---|
| `schema` | integer | yes | plan-it | Always `1` for this version. Readers reject unknown numbers with a clear message. |
| `implementation` | string | yes | plan-it | Folder name under `docs/implementations/`. Must equal the folder. |
| `title` | string | no | plan-it | Display name for the dropdown. Falls back to `implementation`. |
| `updated_at` | ISO 8601 UTC | yes | the writer script, automatic | Last write of any kind. |
| `approximate` | boolean | no | migration script only | True when derived from `STATUS.md`. The mod shows "approximate". |
| `closed` | boolean | no | conclude-it | True after the final close. |
| `waves[]` | array | yes | plan-it | Ordered groups of tasks. May be empty (then percent is unknown). |
| `waves[].id` | string | yes | plan-it | Stable id such as `W1`. |
| `waves[].title` | string | yes | plan-it | Short name. |
| `waves[].tasks[]` | array | yes | plan-it creates; build-it, review-it update | The unit the percent counts. |
| `tasks[].id` | string | yes | plan-it | Stable id, same as the epic checklist or card id (`ST-01`, `LDH-04`). Never renamed. |
| `tasks[].title` | string | yes | plan-it | Plain-language title. |
| `tasks[].status` | enum | yes | see rules | `not-started`, `in-progress`, `blocked`, `done`, `verified`. |
| `tasks[].blocked_on` | string or null | required when `blocked` | build-it | Who or what is blocking, in plain words. Null otherwise. |
| `tasks[].evidence` | string or null | required when `done` or `verified` | build-it (done), review-it (verified) | Repo-relative path to a file that exists and is not empty: a test output, a `.taskstate` log, or a review-it verdict. |
| `tasks[].owner` | string | no | build-it | Free text such as `build-it:sonnet`, `Fernando`. |
| `tasks[].updated_at` | ISO 8601 UTC | yes | the writer script | Last change to this task. |
| `tasks[].note` | string or null | required to lower `verified` | any writer | Why a status moved down, or a caveat. |
| `sessions[]` | array | yes (may be empty) | init-it adds, conclude-it sets `ended_at` | Sessions that worked on this implementation. |
| `sessions[].session_id` | string | yes | init-it | The host session id, or `"unknown"`. |
| `sessions[].alias` | string | yes | init-it | Subscription alias such as `claudeanm`, or `"unknown"`. |
| `sessions[].name` | string | yes | init-it | Session name. |
| `sessions[].role` | enum | yes | init-it | `plan`, `build`, `review`, `conclude`, `other`. |
| `sessions[].started_at` | ISO 8601 UTC | yes | init-it | Registration time. |
| `sessions[].ended_at` | ISO 8601 UTC or null | no | conclude-it | Set at close. |
| `pieces[]` | array | yes (may be empty) | plan-it creates; build-it refreshes `status`, `blocked_on`, `whats_left` | The table view: a coarser list than tasks, shown as Piece, Done, Blocked on, What's left. |
| `pieces[].piece` | string | yes | plan-it | Name of the piece, plain language. |
| `pieces[].status` | enum | yes | build-it | Same five values. Display only; the percent uses tasks, not pieces. |
| `pieces[].blocked_on` | string or null | no | build-it | As for tasks. |
| `pieces[].whats_left` | string | yes | build-it | One line. "Nothing" when finished. Must not be a percent. |
| `history[]` | array | yes (may be empty) | the writer script, automatic | Append-only log of status changes: `at, task, from, to, by, note`. |

### Computed section: models must NOT write it

The mod computes and shows these. They are never stored by a model.

| Computed value | Source |
|---|---|
| `percent` | Formula below, from task counts |
| `counts` | Tasks per status |
| `blocked_list` | Tasks whose status is `blocked`, with `blocked_on` |
| `stale` | Newest commit or session activity later than `updated_at` by more than the threshold |
| tokens, cost, cached tokens | Read from the harness meter files, not from `status.json` |

If a model writes `percent`, `counts`, or any `computed` key into the file, the validator fails and the mod ignores the value.

## Update rules

1. Single writer. All status edits go through one shared script, `status-write` (a Node script, zero dependencies, lives in the plugin that ships first and is called by path by the others). Models call it with arguments such as `status-write set ST-03 --status done --evidence .taskstate/results/ST-03.md`. Models do not hand-edit the JSON.
2. Who writes what:
   - plan-it: creates the file with `schema`, `implementation`, `title`, `waves`, `tasks` (all `not-started`), `pieces`, empty `sessions` and `history`. Never writes `done` or `verified`.
   - build-it: `in-progress`, `blocked` (with `blocked_on`), `done` (with evidence). Updates `owner`, `pieces`. Never writes `verified`.
   - review-it (later session): sets `verified` with the verdict path as evidence; sets back to `in-progress` with a note on a failed case.
   - conclude-it (later session): sets `closed`, session `ended_at`, and moves the folder.
   - init-it (Card A): `sessions[]` only.
3. When: build-it calls the writer at every task boundary (start, block, finish), not at the end of the run. A task finished without a write counts as not finished.
4. Atomic write: write to `status.json.tmp` in the same folder, fsync, rename over `status.json`. On a parallel write, re-read, re-apply, retry up to 3 times, then fail loudly.
5. Never write `done` or `verified` without an evidence path that exists and is non-empty. The script checks the file; if the check fails it exits non-zero and changes nothing.
6. Never lower a `verified` task without a `note`. Lowering also appends a `history` entry.
7. `updated_at` is set by the script from the clock, not passed in.
8. Task ids are stable. The script refuses to rename or delete a task that is past `not-started`.
9. Keys the script does not know are preserved on rewrite (forward compatible) except the forbidden computed keys, which are rejected.

## Percent formula (computed by the mod, shown here so the writers can be tested against it)

Let `T` be the number of tasks in all waves, `V` the count with status `verified`, `D` the count with `done`, `B` the count with `blocked`.

```
percent = round( ( V * 1.0 + D * 0.6 ) / T * 100 )
```

- `verified` counts fully. `done` (built, evidence present, not yet verified) counts 0.6. The 0.6 is one named constant in the mod (`DONE_UNVERIFIED_WEIGHT`), not a per-file value.
- `in-progress` and `not-started` count 0.
- `blocked` counts 0 in the percent and is also shown separately as "N blocked" with each `blocked_on`. A blocked task is never hidden inside the percent.
- `T = 0` gives `unknown`, never 0 and never 100.
- 100% is shown only when `V = T` and `closed` is true or every task is `verified`. A file with `D > 0` can never display 100.
- If `approximate` is true, the mod appends "approximate" to the percent.
- Worked example: 10 tasks, 5 verified, 2 done, 1 blocked, 1 in-progress, 1 not-started: (5 + 1.2) / 10 = 62%, with "1 blocked".

## Migration for existing implementations

One script, run once per implementation, never automatic:

1. Read `delivery/STATUS.md` (or `.taskstate/<name>/BOARD.md` when that is where status lives). Parse the table by header names, not column positions.
2. Map statuses: `VERIFIED` to `verified`, `IMPLEMENTED-NOT-VERIFIED` to `done`, `IN-PROGRESS` to `in-progress`, `NOT-STARTED` to `not-started`.
3. Rows whose Disposition starts with "owner-gated" become `blocked` with `blocked_on` taken from the text.
4. Pull an evidence path from the row (text after `run:`, `log`, or a backticked path). If none resolves to an existing non-empty file, downgrade one step: `verified` becomes `done`, `done` becomes `in-progress`. Record each downgrade in `history` with `by: "migration"`.
5. Build `waves` from the Wave column and `pieces` from the epic names. Leave `sessions` empty.
6. Set `"approximate": true`. Print a report: tasks found, downgrades, rows that could not be parsed.
7. Never overwrite an existing `status.json`; refuse and say so.

Test the migration on `do-it/delivery/STATUS.md` (20 epics) and `ANM/docs/implementations/lens-data-honesty/delivery/STATUS.md` (21 tasks).

## Acceptance tests (all binding)

| Case | Expected |
|---|---|
| AT-01 plan-it on a fixture with 6 checklist items and 3 test-contract groups | Valid `status.json`, schema 1, 6 tasks `not-started`, `sessions` and `history` empty |
| AT-02 `STATUS.md` after plan-it | Rendered from the JSON; counts match |
| AT-03 `status-write set X --status done` with no evidence | Exit non-zero, file byte-identical |
| AT-04 `done` with a path that does not exist | Exit non-zero |
| AT-05 `done` with an empty evidence file | Exit non-zero |
| AT-06 `done` with a valid file | Accepted, `updated_at` set by script, history entry added |
| AT-07 build-it asks for `verified` | Refused (role check) |
| AT-08 review-it fixture asks for `verified` with verdict path | Accepted |
| AT-09 lower `verified` without note | Refused |
| AT-10 lower `verified` with note | Accepted, history entry |
| AT-11 `blocked` with no `blocked_on` | Refused |
| AT-12 file with `"percent": 100` | Validator error naming the key |
| AT-13 two writers at once | Valid file, both changes present |
| AT-14 kill between temp write and rename | Previous file intact |
| AT-15 unknown extra key | Preserved on rewrite |
| AT-16 rename a task already `done` | Refused |
| AT-17 percent for the worked example above | Exactly 62 |
| AT-18 zero tasks | `unknown` |
| AT-19 one task `done`, none else, `T = 1` | 60, never 100 |
| AT-20 migration on `do-it/delivery/STATUS.md` | 20 tasks, `approximate: true`, downgrades reported; running it again refuses |
| AT-21 migration on the lens-data-honesty STATUS.md | 21 tasks, owner-gated rows become `blocked` |
| AT-22 build-it run on a 3-task fixture | `status.json` updated at each boundary, not only at the end |

Deliver: the shared writer, the JSON Schema file for `schema: 1`, plan-it and build-it changes, the migration script, the tests, and a short note listing what review-it, conclude-it and init-it must call. Report each acceptance row as VERIFIED, PARKED or BLOCKED with evidence.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
