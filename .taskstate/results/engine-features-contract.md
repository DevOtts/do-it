# do-it Engine hooks: API contract

Status: implemented, NOT merged, NOT deployed (2026-10-14). PR: https://github.com/Engine-HQ/brain-api-core/pull/727 (+ docs https://github.com/Engine-HQ/brain-docs/pull/220). Local live probe 25/25 PASS. Channel mapping for the do-it adapter: controlTower->control_tower, chatP2p->chat_p2p, whatsapp->whatsapp. Origin: the do-it live probe of 2026-10-14
(`DevOtts/do-it` `.taskstate/results/live-w4.md`), which found four gaps behind do-it cases T-N1-17, T-N1-18,
T-N3-14 and T-N2-04. Spec: Engine-Core `docs/implementation/do-it-engine-layer/02-ENGINE-LAYER-SPEC.md`
(points 2, 6 and 9, section F).

Auth on every route: the existing service key header `x-service-api-key` (no JWT, no app token).

| # | Feature | Where | Flag |
|---|---|---|---|
| 1 | Owner ask packs | `/api/ask-cards` (new `HostAdapterModule`) | `HOST_ADAPTER_API_ENABLED=true` (404 `not_enabled` otherwise); `task_id` packs also need `CT_TASKS_ENABLED` |
| 2 | `x_do_it` on pipeline definitions | `POST /api/squads/:id/definitions` (SquadsModule) | none (data field); squads routes still need `SQUADS_ENABLED` |
| 3 | Card inject + state | `/api/internal/tasks` (TaskModule) | `CT_TASKS_ENABLED` (404 `not_enabled` otherwise) |
| 4 | Run-scoped row store | `/api/run-rows` (new `HostAdapterModule`) | `HOST_ADAPTER_API_ENABLED=true` |

Space scoping (1 and 4): rows are filed under the caller's Space (`resolveSpaceId`). A service key defaults to its
`DEFAULT_ORGANIZATION_ID`; pass `space_id` (body or query) to target another Space. Use the same value on every call.

Errors are JSON `{code, reason}` (feature 3 uses the Control Tower shape `{code, reason_pt}`); DTO failures are the
standard Nest 400 `{message: [...]}`.

## 1. Owner ask packs: `/api/ask-cards`

A pack is numbered questions for one owner. Any channel may answer; the FIRST valid answer per question id wins,
later answers to that id are recorded as `ignored`. The pack row is the arbiter (one compare-and-set per reply),
so a race between channels yields exactly one answer. The reply grammar is do-it's G-16 parser, ported and checked
case by case against a recording of do-it's own `parseReply` (`1 yes 2 no`, `3: free text`, `all`, `all except 2, 3`).

With `task_id`, each question is ALSO a Control Tower ask (`kind: owner_decision`, option effect `none`) on that card,
targeted at `target` (looked up by email or id) or else the card's human owner. An answer the owner picks on the card
is read back from the card's `ask_resolved` activity (channel `control_tower`) before every read and write. An answer
posted to `/replies` withdraws the CT ask it answered. Closing the pack withdraws the rest.

### `POST /api/ask-cards` (201 created, 200 identical replay)

```jsonc
{
  "pack_id": "pk-3q-0001",              // [A-Za-z0-9._:-], <=128, unique per Space
  "run_id": "r-n1",                      // optional
  "org_slug": "acme",                    // optional, informational
  "task_id": "<interactions _id>",       // optional: ask on this CT card
  "target": {"type": "human", "email": "owner@x"},   // optional (or "id"); default: card's human owner
  "opened_by": {"type": "squad", "id": "do-it-lifecycle"},  // optional, system|persona|squad
  "questions": [                          // 1..30
    {"n": 1, "kind": "default", "text": "Ship?", "options": ["yes","no"],
     "recommendation": "yes", "default": "yes", "reversible": true}
  ]
}
```

`recommendation` and `default`, when set on a question with options, must be one of the options. Response:
`{pack: PackView, created, replay}`. Errors: 400 `bad_pack`, 409 `pack_conflict` (same id, other content),
409 `ct_tasks_disabled`, 409 `task_closed`, 404 `task_not_found`, 422 `owner_unresolved`.

### `GET /api/ask-cards?pack_id=&run_id=&status=open|closed` -> `{packs: PackView[]}` (newest first, max 50)
### `GET /api/ask-cards/:pack_id` -> `PackView` (404 `pack_not_found`)

```jsonc
{
  "pack_id": "pk-3q-0001", "run_id": "r-n1", "org_slug": null, "task_id": null, "status": "open",
  "questions": [ ... as stored ... ],
  "answers": {"1": "yes", "2": "no"},
  "state": {"1": "answered", "2": "answered", "3": "pending"},   // or "accepted-by-default"
  "answer_rows": [{"n": 1, "answer": "yes", "source": "reply", "channel": "chat_p2p", "reply_id": "m-1", "free_text": false, "at": "..."}],
  "pending": [3],
  "outcome": {"status": "needs_human", "exit": 2, "reason": "PENDING: 3", "pending": [3]},
  "ct_asks": [{"n": 1, "ask_id": "akp-..."}],
  "message_text": "Pack pk-3q-0001\n1. Ship? (yes / no) [recommended: yes]\n...",
  "reply_count": 2, "created_at": "...", "closed_at": null
}
```

`source` is `reply`, `recommendation` (from `all` / `all except`) or `accepted-by-default` (at close).
`outcome` is live while open and frozen at close: `ok`/0, `needs_human`/2, `blocked`/3 (an irreversible question
left pending; it is never default-accepted).

### `POST /api/ask-cards/:pack_id/replies`

```jsonc
{"channel": "control_tower" | "chat_p2p" | "whatsapp" | "api", "text": "1 yes 2 no", "reply_id": "wa-msg-123", "from": "+5511..."}
```

`text` <= 4000 chars. `reply_id` (the channel's message id) makes the call idempotent: the same id twice is recorded
once and the second call answers `replay: true`. `from` is recorded, never used to authorize.
Response (201): `{applied: [n], ignored: [n], errors: [{kind: unparseable|unknown_question|bad_option, ...}], replay, pack: PackView}`.
409 `pack_closed` after close.

### `GET /api/ask-cards/:pack_id/replies?channel=` -> `{pack_id, replies: [{reply_id, channel, text, from, at, applied, ignored, parse_errors}]}`

### `POST /api/ask-cards/:pack_id/close` -> `PackView` (idempotent)

Accepts, by id, every unanswered question that is reversible, not `kind: owner-gate` and has a `default`; freezes the
outcome; withdraws the open CT asks.

## 2. `x_do_it` on pipeline definitions

`POST /api/squads/:id/definitions` now accepts an opaque `x_do_it` object on the definition AND on each step; it is
stored verbatim (Mongoose `Mixed`) and returned verbatim by `GET /api/squads/:id/definitions`. Nothing in Engine reads
it (executor, validators, persona runner). Bounds: a JSON object, <= 16 KiB serialised, <= 16 levels deep, no key
starting with `$` or containing `.` (400 naming the key). A definition without it has no key.

Every OTHER unknown step property (`id`, `needs`, `deny`, `surface`, `router`, `schema`, ...) is still refused with
400 `property X should not exist`: the adapter must move them into `x_do_it` and send only Engine step fields
(`n`, `type`, `question`, `task`, `persona`, `label`, `model_tier`, `consumes_previous`, `eval`, ...).

## 3. Card inject + state: `/api/internal/tasks`

### `POST /api/internal/tasks` (201 created, 200 idempotent replay)

```jsonc
{
  "org_slug": "acme",                         // or "organization_id": "<ObjectId>" (both: must agree)
  "title": "Update the pricing page",
  "content": "card body; stored as data, never interpreted",
  "status": "todo" | "triage",                // default todo
  "actor": {"type": "squad", "id": "do-it-lifecycle", "label_pt": "..."},   // system|persona|squad, never a person
  "owner": {"type": "human", "email": "owner@x"},   // optional, looked up by email or id
  "executor": {"type": "squad", "id": "..."},       // optional
  "idempotency_key": "do-it:card-inject-1",          // required, 8..128 chars
  "external_ref": {"system": "do-it", "id": "card-inject-1"},   // optional
  "parent_task_id": "<card id>", "deadline_at": "ISO-8601"     // optional
}
```

Written by `TaskService.create` (the single writer): `origin.channel: "api"`, `title_source: "connector"`. The same
key with a different body is 409 `idempotency_key_conflict`. Unknown fields are refused (put fixture data such as
`work_type_scores` in `content` or in a run row). Response: `{task: TaskState, created, idempotent_replay}`.

### `GET /api/internal/tasks/:id/state` -> `TaskState` (404 `task_not_found`)

```jsonc
{
  "id": "...", "short_id": "T-3FA9C", "interaction_id": "engine-task-...",
  "organization": {"id": "...", "slug": "acme"}, "title": "...",
  "status": "triage|todo|doing|needs_human|review|done|discarded|merged|archived", "version": 0, "status_since": "...",
  "owner": {...}, "executor": {...}, "holder": {...}, "waiting": null,
  "pending_asks": [{"ask_id": "...", "kind": "owner_decision", "question_pt": "...", "target": {...}, "options": [{"key": "yes", "label_pt": "yes"}], "opened_at": "..."}],
  "links": [{"kind": "pipeline_run", "id": "..."}],
  "flags": {"execution_failed": null, "stuck": null},
  "parent_task_id": null, "children_open": 0,
  "external_ref": {"system": "do-it", "id": "card-inject-1"}, "closed_at": null, "updated_at": "..."
}
```

This is card state, not a do-it `it-result`: mapping to do-it run status / exit code is the adapter's job (store the
it-result in a run row, feature 4).

## 4. Run-scoped row store: `/api/run-rows`

Keys are `runs/<run_id>/<name>[/<name>...]`: run id `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`, segments
`[A-Za-z0-9._@=+-]+`, no empty / `.` / `..` segment, <= 512 chars (400 `bad_key`). Bytes are opaque; JSON transport
is base64. One write is at most 3 MiB (413 `write_too_large`, because `main.ts` caps JSON bodies at 5 MB); one row
is at most 8 MiB (413 `row_too_large`). Bigger blobs belong in an object-store driver.

| Call | Body / query | Response |
|---|---|---|
| `GET /api/run-rows?key=K` | | `{key, size, sha256, content_b64, updated_at}`; 404 `row_not_found` |
| `PUT /api/run-rows?key=K` | `{content_b64}` or `{content_text}`, optional `if_absent: true` | `{key, size, sha256, created, written}` (`if_absent` on an existing row: `written:false`, existing size/sha) |
| `POST /api/run-rows/append?key=K` | `{content_b64}` or `{content_text}` (>= 1 byte) | `{key, size, appended}`; creates the row; atomic (concurrent appends lose nothing) |
| `GET /api/run-rows/keys?prefix=runs/[...]&after=&limit=` | prefix must start `runs/`; limit 1..5000 | `{prefix, keys: [sorted], next}`; page with `after=next` |
| `DELETE /api/run-rows?key=K` | | `{key, deleted}` |

do-it `EngineStore` transport mapping: `rowGet(k)` = GET (404 -> `null`, decode base64); `rowPut(k, b)` = PUT
`{content_b64}`; `rowAppend(k, b)` = POST append; `rowKeys(prefix)` = GET keys, following `next`; `rowDelete(k)` =
DELETE. Set the rows blob driver cap to 3 MiB (`RUN_ROW_MAX_WRITE_BYTES`) for this backend.

## Not done here

- No outbound delivery of a pack to WhatsApp or chat: `message_text` is what a channel sender posts, and the inbound
  side of those channels is not yet wired to `POST /replies` (whatever relays the channel's message must call it).
- No do-it W3 pipeline is installed, so a live replay (T-N3-14) can inject and read cards but not run them.
- Not deployed to any tenant; the flags are off by default.
