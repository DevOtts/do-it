# 09 - Cache management prior art for do-it (researched 2026-10-14)

Tags: [P] primary page read this session, [S] secondary, [U] unverified. Stars/pushed dates from `gh` on 2026-10-14 [P].
Caveat: WebFetch summarises through a small model; numbers were not re-checked against raw HTML. Anthropic page was read only for chars 0-100k of 160k.

## 1. Provider mechanics (primary)

### Anthropic [P] https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Two modes: top-level `cache_control:{type:ephemeral}` (automatic, breakpoint auto-moves to last cacheable block) or per-block explicit. Max 4 breakpoints; automatic uses one slot; 400 if 4 explicit + auto, or last block has a different TTL.
- Order is tools -> system -> messages; a change at a level invalidates it and everything after. Tool-definition change busts all three; `tool_choice` and image add/remove bust tools+system(+) ; web-search/citations toggle busts tools only; speed (fast) setting busts tools.
- TTL 5m default (write 1.25x), 1h via `ttl:"1h"` (write 2x). Hit refreshes TTL free. Lifetime counted from request START. 1h entries must precede 5m entries.
- Read multiplier 0.1x (Opus 5, 4.x, Sonnet 5, 4.6, Haiku 4.5); 0.05x on Opus 5.5 and Sonnet 5.5; 0.025x on Fable/Mythos 5.1; 0.1x Fable 5.
- Min prefix: 512 (Opus 5.5, Opus 5, Sonnet 5.5, Fable/Mythos 5/5.1, Haiku 5.5); 1024 (Sonnet 5, 4.6, 4.5, Opus 4.8, 4.1, 4); 2048 (Opus 4.7, Mythos Preview, Haiku 3.5); 4096 (Opus 4.6, 4.5, Haiku 4.5). Silent no-cache below minimum.
- Lookback: reads check 20 block positions back from each breakpoint. Long agent turns need a second breakpoint.
- Usage: `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens` (post-breakpoint only), plus `cache_creation.ephemeral_{5m,1h}_input_tokens`.
- Pre-warm: `max_tokens:0` with breakpoint writes cache and returns empty (not with stream, thinking, forced tool_choice, batches).
- Concurrency: entry exists only after first response begins; fan-out must wait for first request. Isolation per org / per workspace.
- Mid-conversation `{"role":"system"}` append avoids busting system+message caches (listed models only, not Sonnet 5).
- Thinking config / effort change: model-specific invalidation.

### OpenAI [P] https://developers.openai.com/api/docs/guides/prompt-caching
- GPT-5.6+: min 1024 visible tokens, read 0.1x (0.05x on GPT-6.1 Sol), write 1.25x, `prompt_cache_options.ttl` only "30m"; explicit `prompt_cache_breakpoint`; usage `cached_tokens` + `cache_write_tokens`. Earlier: automatic, no write fee, `prompt_cache_retention` in_memory (5-10m idle, <=1h) or 24h; `prompt_cache_key` = routing hint (~15 req/min/key). GPT-5.5 only 24h.
- Guidance: stable prefix, append don't rewrite (summarise/compact/truncate resets reuse), dynamic content last, don't change tools (use `tool_choice:none`/`allowed_tools`), don't change `reasoning.effort` mid-thread, don't extend an already-cached message, cached tokens still count against TPM, no manual clear.

### Gemini [P] https://ai.google.dev/gemini-api/docs/caching , /pricing
- Implicit: min 4096 (Gemini 4 Argon, 3.x Flash/Pro), 2048 (2.5 Pro/Flash per this page; OpenRouter says 1024/4096 for 2.5 Flash/Pro [S] - conflict, trust Google page). Explicit caching (generateContent `cachedContents`) only older Gemini 3/2.5; NOT on Gemini 4 or Interactions API. Implied read discount ~90% (95% Argon) (calculated from price list); explicit storage $0.50-4.50 per MTok-hour. Usage `total_cached_tokens` page-level (API field names [U] - check `cachedContentTokenCount`).

### DeepSeek [P] https://api-docs.deepseek.com/guides/kv_cache , /quick_start/pricing
- Automatic disk cache, on by default, best-effort, no min stated, prefix units at request boundaries/common prefixes/fixed intervals; unused entries cleared in hours-days. Fields `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`. Price: flash hit $0.003 vs miss $0.15 (off-peak) = 2% ; v4-pro $0.022 vs $0.66 = 3.3%; peak is 2x. Write premium none.

### OpenRouter [P] https://openrouter.ai/docs/guides/best-practices/prompt-caching
- Anthropic passthrough (auto + explicit, 4 bp, 1.25x/2x write, 0.1x read); OpenAI auto, 0.25-0.5x read; DeepSeek 0.1x read; Gemini implicit + explicit `cache_control` (only LAST breakpoint used), 0.25x read; Grok 0.25x, free write.
- Sticky routing: `session_id`/`x-session-id` (<=256 chars) keeps follow-ups on same provider, expires after 10m idle; falls back to `prompt_cache_key`; disabled if `provider.order` set. Usage: `cached_tokens`, `cache_write_tokens`, `cache_discount`.

### LiteLLM [P] https://docs.litellm.ai/docs/completion/prompt_caching
- OpenAI-format `cache_control` passthrough (Anthropic, Bedrock -> cachePoint, Gemini/Vertex -> cachedContents; ignored elsewhere). `cache_control_injection_points` auto-inserts markers. Normalises usage to `prompt_tokens_details.cached_tokens` (+ Anthropic `cache_creation_input_tokens`). `supports_prompt_caching()` and `completion_cost()` cache-aware.

## 2. Coding agents

| Agent | What it does re cache | Source |
|---|---|---|
| Claude Code | Order: static system+tools (global) -> CLAUDE.md -> session ctx -> messages. Updates via `<system-reminder>` in messages, never system edits. No mid-session model switch (use subagent + handoff). Never add/remove tools: plan mode = tools stay, state via message; MCP via `defer_loading` stubs. Compaction forks parent prefix, appends compaction prompt as new user msg. Alerts/SEVs on hit-rate. Past bugs: timestamp in system prompt, nondeterministic tool order, Agent tool param change. | [P] https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/ (Thariq Shihipar, 2026-04-30) |
| Claude Code bugs | `--resume` scatters attachment blocks, fingerprint instability, tool order; proxy fix measured 95.5% vs 82.3% first warm turn; 94.66% vs 92.44% over 7d/37 sessions (self-reported). 440 stars, pushed 2026-09-05, license NOASSERTION. | [P-self-reported] https://github.com/cnighswonger/claude-code-cache-fix |
| Aider | `--cache-prompts`; `--cache-keepalive-pings N` pings every 5m N times. Layout: system, read-only files, repo map, editable files. Anthropic Sonnet/Haiku + DeepSeek only. Stats unavailable when streaming. 49.5k stars, Apache-2.0, last push 2026-05-22 (slowing). | [P] https://aider.chat/docs/usage/caching.html |
| opencode | Session ID as `prompt_cache_key` (OpenAI / `setCacheKey`); Anthropic-style markers on first 2 system + last 2 non-system msgs (4 bp). 213k stars, MIT, active. | [S/U] forum mirror; verify `packages/opencode/src/provider/transform.ts` |
| Codex CLI | Linear append-only agent loop; fix PR #2611 sorted MCP tools by name (HashMap order broke cache). 129k stars, Apache-2.0. | [S] codex.danielvaughan.com blogs; forge mirror |
| Cline / Roo | 70k / 24k stars, Apache-2.0; Roo last push 2026-05-15 (stale). Cache mechanics not read. | [U] |
| Published hit rates | Claude Code 92%, OpenCode 89% (requesty dataset, Apr 2026) | [S] requesty.ai/data/coding-agent-cache-hit-rate-apr-2026/data.json |

## 3. Projects (stars / last push / license, all [P] via gh)

| Project | What / mechanism | Maturity | License | Verdict for do-it |
|---|---|---|---|---|
| LiteLLM 61k / 2026-10-14 | Unified gateway, `cache_control` passthrough + injection points, cache-aware cost | High | NOASSERTION (MIT core + enterprise dir) | ADOPT as optional normaliser (usage + cost); do not hard-depend |
| OpenRouter (hosted) | Sticky routing + normalised cache fields | High | service | ADOPT as a driver kind; send session_id |
| ccusage 19k / 2026-10-14 | Parses local Claude/Codex logs for tokens/cache/cost | High | NOASSERTION | ADOPT for observed spend/hit-rate of Claude Code + Codex harnesses (read-only) |
| Langfuse 35.8k / 10-14 | Tracing + cost incl. cache token types | High | NOASSERTION (MIT + ee) | ADAPT: export usage events (OTel) if user wants analytics |
| Helicone 6.2k / 10-10 | Gateway/observability, cache analytics | Med | Apache-2.0 | IGNORE (Langfuse/LiteLLM cover it) |
| GPTCache 8.2k / 09-22 | Semantic response cache (whole answers) | Med, different problem | MIT | IGNORE: response caching is not prefix caching; wrong for tool-using code agents |
| vLLM 93.8k / SGLang 37k | Server-side APC / RadixAttention for self-hosted | Very high | Apache-2.0 | ADOPT-by-reference only if a local-model driver is added; just enable flags (Manus advice) |
| LMCache 12k / 10-14 | KV cache offload/share across vLLM/SGLang | High | Apache-2.0 | IGNORE until self-hosting exists |
| LLMLingua 6.8k / 09-10 | Prompt compression | Med | MIT | IGNORE: compression rewrites prefix -> busts cache; lossy |
| claude-mem 100k / 10-13 | Cross-session memory for Claude Code (hooks, SQLite) | High | Apache-2.0 | ADAPT ideas: inject memory at tail/new message, not prefix. Do not build own |
| context-mode 28.9k / 10-14 | Context savings for coding agents (sandboxing tool output) | Med-high | NOASSERTION | ADAPT: tool-output truncation pattern [U on internals] |
| repomix 28.8k / 10-11 | Pack repo into one prompt | High | MIT | ADOPT for stable, deterministic repo digest as a cacheable block |
| Letta 25k / 09-10, mem0 67k / 10-14, Zep 5k / 10-14 | Agent memory services | High | Apache-2.0 | IGNORE for cache; memory is a separate concern; retrieved memory must go at tail |
| Aider repo-map | Ranked repo map as cached layer | High | Apache-2.0 | ADAPT: layering order system > read-only > map > editable |

## 4. Ranked "use these, don't build"
1. Provider-native caching (Anthropic auto `cache_control`, OpenAI/DeepSeek/Gemini implicit) - never build a local cache.
2. Claude Code's own prefix discipline - delegate to the harness; do-it must not touch its prefix.
3. LiteLLM usage/cost normalisation (or copy its field map) instead of per-provider parsers.
4. OpenRouter `session_id` sticky routing for non-native routes.
5. ccusage for harness-side observed hit rate (Claude Code, Codex).
6. Anthropic `max_tokens:0` pre-warm and 1h TTL instead of Aider-style pings.
7. repomix for deterministic repo digests.
8. claude-mem pattern for memory (tail injection).
9. claude-code-cache-fix as a diagnosis reference for resume bugs, not a dependency.

## 5. Minimum cache rules for do-it (cited)
R1. Stable prefix: static instructions/tools first, volatile last; no timestamps/IDs/git-status in system or early blocks. [Manus P; Anthropic P; OpenAI P]
R2. Append-only history; never edit/reorder/summarise earlier messages in place; compaction only as a fork that reuses the parent prefix and appends the request. [Manus; claude.dev P; OpenAI P]
R3. Deterministic serialisation: sort tools by name, stable JSON key order, stable MCP order. [Manus; Codex PR #2611 S; claude.dev P]
R4. Never add/remove tools mid-session; mask via `tool_choice`/`allowed_tools`/state messages; use deferred stubs. [claude.dev; OpenAI; Manus]
R5. Never switch model mid-session; hand off through a fresh subagent with a written brief. [claude.dev P]
R6. Updates (time, changed files, orchestrator state) go in the next user message / tool result as `<system-reminder>`-style, not the system prompt. [claude.dev P]
R7. Don't change thinking/effort/tool_choice/images/speed mid-thread (Anthropic invalidation table; OpenAI effort rule). [P]
R8. Place breakpoints on the last byte-identical block; add a second one if >20 blocks of new content per turn. [Anthropic P]
R9. Fan-out: issue one warming request, wait for first response, then parallelise sibling workers on the same prefix. [Anthropic P]
R10. TTL policy: choose 1h when expected inter-request gap >5m (2x write pays back after 2 reads at 0.1x); respect that lifetime counts from request start. [Anthropic P; arithmetic mine]
R11. Prefer fewer, larger prefix-sharing workers; sub-minimum prefixes (512-4096) won't cache: don't pay write premiums below threshold. [P]
R12. Measure always: log read/write/uncached per call, hit rate = read/(read+write+uncached); alert on drop; ignore sessions <~20 requests. [claude.dev P; cache-fix P]
R13. Session affinity key on every API route (`prompt_cache_key`, OpenRouter `session_id`). [OpenAI P; OpenRouter P]

## 6. driver.json cache matrix (cells verified against pages above)

| kind | ttl | min prefix | read | write premium | controls | usage fields |
|---|---|---|---|---|---|---|
| anthropic (explicit/auto) | 5m default, 1h opt [P] | 512 / 1024 / 2048 / 4096 per model [P] | 0.1x (0.05x Opus 5.5, Sonnet 5.5; 0.025x Fable 5.1) [P] | 1.25x (5m), 2x (1h) [P] | `cache_control`, top-level auto, 4 bp, `ttl`, `max_tokens:0` prewarm [P] | cache_read/creation_input_tokens, ephemeral_5m/1h [P] |
| openai (GPT-5.6+) | 30m min [P] | 1024 [P] | 0.1x (0.05x Sol) [P] | 1.25x [P] | `prompt_cache_breakpoint`, `prompt_cache_options{ttl,mode}`, `prompt_cache_key` [P] | `cached_tokens`, `cache_write_tokens` [P] |
| openai (older) | in_memory 5-10m(<=1h) or 24h [P] | ~1024, request-dependent [P] | model-dependent (0.25-0.5x per OpenRouter) [S] | none [P] | `prompt_cache_key`, `prompt_cache_retention` [P] | `cached_tokens` [P] |
| gemini implicit | not guaranteed [U] | 2048-4096 [P] | ~0.1x (0.05x Argon) calc from prices [P-derived] | none [S] | none; Argon+ implicit only [P] | `total_cached_tokens` [P] |
| gemini explicit | user TTL [U] | n/a [U] | ~0.1x + storage $0.5-4.5/MTok-h [P] | storage [P] | `cachedContents`; not on Gemini 4 [P] | cached-content tokens [U] |
| deepseek | hours-days, best-effort [P] | none stated [P] | 0.02-0.033x [P] | none (miss price) [P] | automatic only [P] | `prompt_cache_hit/miss_tokens` [P] |
| openrouter | 5m/1h Anthropic; sticky 10m idle [P] | provider's [P] | per provider (0.1-0.5x) [P] | per provider [P] | `session_id`, `cache_control`, `prompt_cache_key` [P] | `cached_tokens`, `cache_write_tokens`, `cache_discount` [P] |
| grok/xai | [U] | [U] | 0.25x [S via OR] | free [S] | automatic | [U] |
| claude-code / codex / opencode (harness) | harness-owned [P/S] | n/a | observed only | n/a | none from outside; read ccusage / logs [S] | via logs |
| local (vLLM/SGLang) | until evicted [S] | block-size granularity [U] | compute-only | none | server flag, session routing (Manus) [P] | server metrics [U] |

## 7. Genuinely unsolved (build only these)
1. Cross-harness orchestration without busting each harness's cache: when do-it delegates to Claude Code/Codex/opencode it cannot inject into their prefix; needs handoff-brief protocol (new subagent, fresh prefix, stable shared preamble). No prior art found for multi-harness.
2. Normalised cache telemetry across harnesses: ccusage covers Claude Code/Codex logs; nothing unifies hit rate + cost across opencode/DeepSeek/Engine + API drivers. LiteLLM only covers API-level.
3. Cost-aware routing policy: when to pay 2x for 1h TTL, when to keep a worker warm vs. restart, when a model switch (cache loss) beats staying - decision rule using min-prefix, read/write ratios and gap forecasts. Not found in any project [U: absence of evidence].
4. Fan-out cache choreography across heterogeneous drivers (warm-then-parallel per provider; sticky affinity keys).
5. Cache-safe compaction for non-Claude drivers (fork pattern is Claude Code-specific; OpenAI says summarisation resets reuse).
6. Regression detector: byte-diff of consecutive request prefixes to name the busting block. Anthropic mentions "cache diagnostics" feature [P, not read in detail] - check before building.
7. Validating public hit-rate claims: only self-reported (cache-fix) and requesty dataset [S]; do-it should measure its own baseline.

## Conflicts / open checks
- Gemini 2.5 min tokens: Google page (2048 both) vs OpenRouter (1024 Flash / 4096 Pro).
- opencode cache logic is [U] until transform.ts read from repo.
- Cline/Roo not examined.
- Model names (Fable 5.x, Opus 5.5, GPT-5.6/6.1, Gemini 4 Argon) taken as-is from fetched pages.
