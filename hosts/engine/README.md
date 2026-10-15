# do-it on Engine

The `engine` host adapter lets an Engine org run a do-it squad. Engine holds the state, asks the questions through the org's channels, and runs each role as a job. The adapter compiles a `squad.yaml` into an Engine squad definition and reads it back to prove nothing was lost.

Status: only 1 of 5 live cases is verified against a real Engine (the checkpoint card). Offline cases pass: 32 of 32 tests. See [Status](#status).

## What it does

- **Compile.** `compile/squad-to-definition.mjs` maps each squad step to an Engine step (`n`, `type`, `persona`, `model_tier`, `question`, `label`). Tiers map to Engine tiers: T1 to `powerful`, T2 to `balanced`, T3 to `cheap`.
- **Decompile.** `compile/definition-to-squad.mjs` is the inverse, with canonical key order, so a round trip compares byte equal (T-N1-01).
- **Roster.** Derived from the conductor plus step personas, never stored separately. A stored roster that drifts is rejected with `ROSTER_DRIFT`.
- **Guards.** Nested squads, a router inside a router, unknown step types and persona-side publish are rejected at compile time.
- **Ask channels.** `ask/channels.mjs` fans one question pack out to `controlTower`, `chatP2p` and `whatsapp`. `ask/collect.mjs` parses replies with the spine parser: the first valid reply per question ID wins, and later replies to the same ID are ignored. If zero channels are reached, `ask/pack-fallback.mjs` writes the owner pack to disk and the run ends BLOCKED.
- **Review cap and drain.** `review/cap.mjs` stops review at 3 rounds (ESCALATED). `drain/drain.mjs` makes one parent card with build children and disposition rows for the rest.

## State

The adapter's state backend id is `engine`. It is one of three `StateStore` backends (`local-fs`, `git-branch`, `engine`) in `core/state-stores/`. The Engine backend's row driver is not built yet: Engine has no generic keyed row store, so `engine` has no live path today.

## Config

Secrets are read from the environment only. Nothing is stored in the repo.

| Variable | Used by |
|---|---|
| `DO_IT_ENGINE_URL` | Base URL of a reachable Engine. Unset means live cases stay IMPLEMENTED-NOT-VERIFIED. |
| `DO_IT_ENGINE_TOKEN` | Service key sent with each request. |
| `DO_IT_ENGINE_CORE` | Optional path to a local Engine-Core checkout, used by the probe. |

Tier names are `T1`, `T2` and `T3`. Their model bindings are chosen at init; `tiers.json` still has `asked_at_init` set to false.

## Run the tests

```sh
node --test "hosts/engine/tests/*.test.mjs"
```

The suite runs offline against fixtures and stubs. The `[REAL]` cases (T-N1-16/17/18, T-N3-14) run their live bodies in `live/live-cases.mjs` only when `DO_IT_ENGINE_URL` points at a reachable Engine. Otherwise they record the probe error and stay unverified. A stub result is never counted as a live pass.

## Status

Verified live on 2026-10-14 against a local `brain-api-core` running Engine PR #727 (not merged, not deployed; needs `HOST_ADAPTER_API_ENABLED=true` and `CT_TASKS_ENABLED=true`). Evidence: `.taskstate/results/engine-adapter-live.md`.

| Case | Verdict | Finding |
|---|---|---|
| T-N1-16 checkpoint card | VERIFIED | Pending `change_proposal` card returned by Mission Control |
| T-N1-17 ask reply by ID | VERIFIED | `/api/ask-cards`: first valid answer per id wins, later channel's answer is ignored, same `reply_id` replays |
| T-N1-18 definition read-back | VERIFIED | Step props id/needs/deny/surface/eval ride in `x_do_it`; read-back equals the source squad by canonical hash |
| T-N2-04 `engine` store | VERIFIED | Shared conformance 12/12 over `/api/run-rows` (3 MiB write cap; larger blobs use r2 or fs-mirror) |
| T-N3-14 live replay | not verified | Card inject and state read-back work (5 cards, idempotent), but no do-it W3 pipeline is installed, so cards never run |

Still open: install the W3 pipeline (and an Engine drain, for T-R4-05) on an Engine that carries PR #727. Configure the adapter with `DO_IT_ENGINE_URL`, `DO_IT_ENGINE_TOKEN` (service key, read from the environment) and `DO_IT_ENGINE_ORG_SLUG`.
