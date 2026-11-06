# CARD A: init-it (register a session against an implementation)

Status: planning only, 2026-10-15. Nothing here is built. Companion cards: `CARD-B-status-tracking.md`, `PROMPT-plan-it-build-it-status-json.md`.
Epic sizing: one card, 8 tasks, 2 waves. Consumer: the `/doit-status` mod.

## 1. Problem

Fernando keeps asking "where are we" on an implementation. The mod `/doit-status` must show which sessions worked on it, live. Today that is impossible for two reasons.

1. The session ledger (`<repo>/.agents/history/`, cards written only by `/conclude-it` Step 2.6) shows a session only after it ends. A session that is still running, or crashed, is invisible.
2. The card header has no implementation field. Measured on the ANM ledger: 0 of 84 cards carry one. The fields today are `session, alias, session_id, project, cwd, date, status, tags`. So even a finished session cannot be joined to an implementation without reading its text.

The existing `/session-init` is a heavy context bootstrap (ledger, docs, memory, vault, boot brief). It is the wrong tool for "just tell the harness I am working on X".

## 2. Options

| | (a) light new `init-it` skill | (b) smart router inside `session-init` | (c) new `init-it` plugin wrapping `session-init` |
|---|---|---|---|
| What it does | Setup only: registers this session against the implementation, optional open ledger card, optional rename. No reading of context. | `session-init` decides by itself: setup only by default, full boot when the model or user asks. | `init-it` always runs setup, then calls `session-init` for the boot. |
| Cost per call | Near zero tokens. Deterministic script. | Low in setup mode, but the decision is an LLM judgment on every call. | Full boot cost every time, even when only registration was wanted. |
| Determinism | High. Same input, same files written. | Low. "Setup or full" is decided by a model, so the same command can behave two ways. | Medium. Setup is deterministic, boot is not. |
| Blast radius | New repo, one small script. `session-init` untouched. | Edits a user-level skill (`~/.claude/skills/session-init`) that has no repo or tests today. | New repo plus a hard dependency on a skill with no tests. |
| Failure mode | A user forgets to run it: the session is simply not listed. | The router guesses wrong and skips registration, silently. | A heavy boot runs when the user only wanted a tag, so people stop using it. |
| Fit with the *-it family | Matches: one verb, one job, own repo, own tests. | Blurs the job of `session-init`. | Duplicates `session-init` inside another name. |

### Recommendation: (a), a light `init-it`

Reasons:

1. The harness must own tracking. A registration step that a model may or may not perform (b) is the same weakness as a model-typed percent. (a) is a script with an exit code.
2. It is cheap enough to run at the top of every session, so it will be run. (c) is not.
3. `session-init` has no repo and no tests. Changing it (b) puts the crown-jewel write path on an untested file.
4. It follows the family pattern: each stage owns one verb in its own repo.

Small link, not a merge: `session-init` gets one added line in its boot brief, "Registered against: <implementation> (via init-it)" read from the status file, so the two skills agree without either calling the other. Out of scope for this card to edit `session-init`; listed as a follow-up in section 8.

## 3. How `/init-it` behaves

```
/init-it @docs/implementations/<name>          # register, write open card, no rename
/init-it <name> --role build                   # role: plan | build | review | conclude | other
/init-it <name> --rename                       # also run the session rename (host permitting)
/init-it --none                                # explicit "this session is not about an implementation"
```

Steps, all done by `init-it.mjs`, not by the model:

1. Resolve the implementation folder under `<repo>/docs/implementations/` (reject `0-done` and `1-backlog` targets unless `--allow-done`). Unknown name: exit 2 with the list of valid names.
2. Read session id and alias from the host environment (session id from the host; alias from the config dir name such as `claudeanm`). If either is missing, write the entry with `"unknown"` and say so. Never invent.
3. Append one entry to `docs/implementations/<name>/status.json` `sessions[]` (schema in the prompt file). Atomic write (temp file plus rename). Idempotent: same `session_id` twice updates `role`, never duplicates.
4. Write a stub "open" ledger card to `<repo>/.agents/history/<alias>/<date>--<name>-<role>.md` with `status: open` and the new header field `implementation: <name>`. Add one INDEX row with status `open`.
5. Optionally rename the session to `<name>-<role>` when `--rename` is given and the host supports it.
6. Print one line: `registered <session_id> as <role> on <name>; open card <path>`.

## 4. New card header field and INDEX change

Header gains one field. It is a list so a session that touches two implementations can name both.

```yaml
---
session: harness-status-build
alias: claudeanm
session_id: 8b6a...
project: ANM
cwd: /Users/macbook/Workspace/ANM
date: 2026-10-15
status: open            # open | concluded | shipped | unknown (existing values stay valid)
implementation: [harness-status-tracking]   # NEW. Folder name(s) under docs/implementations. Empty list or absent = unknown.
tags: [...]
---
```

Rules:
- Old cards stay valid. A missing `implementation` means "unknown", never an error.
- `status: open` is new. Readers that do not know it must treat it as "not concluded".
- INDEX.md gets a new column `Impl` between `Project` and `Session`. Older rows leave it blank. The INDEX writer must keep its row format backward compatible: one pipe added, blank for old rows.
- An `open` card older than 24 hours with no matching conclude is shown by the mod as "stale open" (a crashed or abandoned session), not as active.

## 5. How `/conclude-it` upgrades the open card

In Step 2.6 (ledger card write):

1. Look for an existing card with the same `session_id`. If found and `status: open`, rewrite it in place into the final card (same file, same INDEX row, `status` moves to `concluded` or `shipped`, `implementation` preserved and extended with anything the session touched). Do not create a second card.
2. If no open card exists (the session never ran `/init-it`), write the card as today and add `implementation:` when the session's `.taskstate` or branch names one; otherwise leave it out.
3. Update the implementation's `status.json` `sessions[]` entry with `ended_at`.
4. If the session moved the implementation to `0-done`, the final card links the moved path.

## 6. What each plugin changes

| Plugin (repo under /Users/macbook/Workspace/Devotts) | Change | Size |
|---|---|---|
| `init-it` (NEW repo, SKILL.md plus `scripts/init-it.mjs`) | The register, stub card, INDEX row, rename. Zero dependencies. | S |
| `conclude-it` | Step 2.6 upgrades the open card in place; writes `implementation:`; sets `ended_at`. | S |
| `plan-it` | Creates `status.json` (see Card B). Calls nothing in init-it. Prints "run /init-it <name>" in its closing hand-off. | S |
| `build-it` | Run-start hook calls the same register routine when the goal names an implementation (so a build session is registered even if the user forgot). | S |
| `review-it` | Same register call with role `review`. | XS |
| `session-init` (user-level, not in a repo) | None in this card. Follow-up: show "Registered against" line. | n/a |

The register routine is one function exported by `init-it.mjs`. The other plugins call it through the script path, not by copying code, so there is one writer.

## 7. Tasks, model tier and order

| ID | Task | Wave | Tier | Why this tier |
|---|---|---|---|---|
| INIT-01 | `init-it.mjs`: parse args, resolve folder, atomic append to `sessions[]`, idempotency | W1 | sonnet | Spec'd against the test contract below |
| INIT-02 | Stub open card writer and INDEX row (new `Impl` column, backward compatible) | W1 | sonnet | Spec'd, but touches a format other tools read |
| INIT-03 | `SKILL.md` for init-it with author block (DevOtts) and footer | W1 | haiku | Mechanical |
| INIT-04 | conclude-it Step 2.6 in-place upgrade | W2 | opus | Cross-cutting: must not break the existing card path or double-write |
| INIT-05 | build-it run-start and review-it register calls | W2 | sonnet | Small, contract-driven |
| INIT-06 | plan-it hand-off line | W2 | haiku | Mechanical |
| INIT-07 | Fixture ledger with 3 old cards, 1 open, 1 stale open; run all tests | W2 | haiku | Deterministic |
| INIT-08 | Adversarial review of INIT-01, 02, 04 (concurrent writers, crash mid-write) | W2 | opus | Hard reasoning, fresh eyes |

Escalate a sonnet task to opus if its test contract fails twice.

## 8. Acceptance criteria

1. `/init-it <name>` run on a fixture implementation adds exactly one entry to `status.json` `sessions[]` and exactly one `open` card and one INDEX row. Run twice, still one of each.
2. The open card header contains `implementation: [<name>]` and `status: open`.
3. `/conclude-it` on that session rewrites the same card file to `concluded` or `shipped`, keeps the same INDEX row count, and fills `ended_at`.
4. A pre-existing card without `implementation:` is still read without error by `init-it`, `conclude-it` and the mod.
5. An unknown implementation name exits 2 and lists valid names. A `0-done` target is refused without `--allow-done`.
6. Missing session id or alias writes `"unknown"` and prints a warning line. It never fabricates a value.
7. A kill between temp write and rename leaves the old `status.json` intact and valid JSON.
8. No plugin other than the listed ones is edited. `session-init` is untouched.
9. `init-it` makes zero network calls and zero model calls.

Follow-ups (not blocking): show "Registered against" in `session-init`; backfill `implementation:` into old cards using a one-time, marked-approximate script.

## 9. Test contract (binding, 100% before done)

Type: CRUD-like file writes, so use-cases plus crash and concurrency stress. All run with `node --test` on a temp copy of a fixture repo.

| Case | Setup | Expected |
|---|---|---|
| T-A-01 | Fixture impl `alpha` with a valid `status.json`, no sessions | After `init-it alpha --role build`: 1 session entry with role build, started_at set |
| T-A-02 | Run T-A-01 twice | Still 1 entry, 1 open card, 1 INDEX row |
| T-A-03 | Same `session_id`, second run with `--role review` | Entry role becomes review, no duplicate |
| T-A-04 | Name not present | Exit 2, stderr lists the valid names |
| T-A-05 | Target in `0-done/` | Exit 2 unless `--allow-done` |
| T-A-06 | Session id env missing | Entry has `"unknown"`, warning printed, exit 0 |
| T-A-07 | `status.json` missing in the impl folder | Created minimal valid file (schema 1, no waves), flagged `"created_by":"init-it"`, exit 0 |
| T-A-08 | `status.json` is invalid JSON | Exit 3, file untouched, message names the file |
| T-A-09 | Kill the process after the temp write, before rename (fault injection hook) | Original file byte-identical |
| T-A-10 | Two `init-it` calls in parallel, different session ids | Both entries present, file valid (lock or retry works) |
| T-A-11 | Open card header | Has `implementation: [alpha]`, `status: open`, all legacy fields |
| T-A-12 | INDEX with 3 legacy rows | New row has the `Impl` column; legacy rows unchanged byte for byte |
| T-A-13 | Legacy card without `implementation` | Reader returns `unknown`, no throw |
| T-A-14 | conclude-it on an open card | Same filename, `status: concluded`, one INDEX row, `ended_at` set |
| T-A-15 | conclude-it on a session with no open card | Card written as before; `implementation:` only if derivable |
| T-A-16 | Open card 30h old, no conclude | Mod fixture reports "stale open" |
| T-A-17 | `--none` | No `status.json` write; card has `implementation: []` |
| T-A-18 | `--rename` on a host without rename support | Exit 0, one line "rename skipped: host", nothing else fails |
| T-A-19 | Grep the init-it repo for network or model calls | None found |
| T-A-20 | Diff of session-init, plan-it internals | No change outside the listed files |

Failure and cascade notes:
- partial failure: card written but `status.json` write failed. The script writes `status.json` first, the card second; a failed card leaves a valid session list and a printed warning (T-A-09).
- rollback: none needed, every write is a whole-file atomic replace.
- concurrency: T-A-10.
- resume: re-running the command is the recovery (T-A-02).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
