# do-it v2: context handed over from v1 planning

Status: context only, 2026-10-14. Nothing here is built. v1 scope is in `../do-it-v1/02-RESEARCH-AND-DESIGN.html`.

## 1. Observability: Langfuse and LangSmith (owner request, 2026-10-14)

Request: give do-it native access to LangSmith and/or Langfuse. In `.do-it/` a `.env.example` where the user sets
`LANGFUSE_ENABLE=true` and an API key, and do-it is already connected. If this adds much size or weight, defer to v2.

Decision (recommendation): **v2, with one v1 obligation.**

- Why v2: an exporter needs a client or an OTel/HTTP path per vendor, retry and offline buffering, redaction of prompts, and tests against a
  live account. That is a feature, not a flag. The spine is meant to stay a single zero-dependency file in v1.
- The v1 obligation that makes v2 thin: `events.jsonl` and `token-meter.jsonl` already carry what a trace needs. Fields to freeze in v1:
  `run_id`, `slice_id`, `stage`, `persona`, `tier`, `model`, `host`, `start`, `end`, `tokens_in`, `tokens_out`, `cache_read`, `cache_write`,
  `estimated` (true when the host gave no usage), `verdict`, `parent_id`. Then a v2 exporter is a reader of those files, not a change to the spine.
- Shape in v2: `.do-it/.env.example` committed with **names only**; values come from the configured secrets provider (see §2), never from a committed file.

```
# .do-it/.env.example  (names only, no values)
DO_IT_OBS_PROVIDER=none          # none | langfuse | langsmith
LANGFUSE_ENABLE=false
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
```

- Privacy default: export metadata and token counts; prompt/response bodies only when `DO_IT_OBS_BODIES=true`, with redaction on.
- Not verified: current Langfuse and LangSmith ingestion APIs, field names, and free-tier limits. Check at implementation time.

## 2. Credentials (this one is a v1 setup item, repeated here because observability depends on it)

Owner habit: credentials in a gitignored `.secrets/` folder. On first run `do-it init` asks where credentials come from, once, and stores a
**reference**, never a value, in `.do-it/settings.json` (workspace) or `~/.do-it/settings.json` (global).

| provider | reference stored | resolution |
|---|---|---|
| `file` | path under `.secrets/` (e.g. `.secrets/engine.env`) | read at use, injected into the child process env only |
| `env` | variable name | read from the current environment |
| `aws-secrets-manager` | secret id + region | AWS CLI/SDK call at use (needs the user's own AWS auth) |
| `1password` | `op://vault/item/field` | `op read` at use (needs the user's own `op` session) |

Rules: values never go to `events.jsonl`, briefs, owner packs, or the model context; the spine passes them to the subprocess that needs them;
a missing credential is a READINESS blocker found at plan time (live preflight), not a mid-run question. Hosts without a shell (cloud harness)
resolve through their own secret store, and the adapter declares which providers it supports.

## 3. Other things parked for v2

- Engine compile target (`squad.yaml` → `pipeline_definition`): spec in `../do-it-v1/03-ENGINE-LAYER-SPEC.md`.
- Cross-harness cache-safe handoff, unified cache telemetry, prefix byte-diff detector: see v1 doc, Tokens section.
