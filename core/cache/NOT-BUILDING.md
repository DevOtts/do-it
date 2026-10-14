# NOT building (cache lane)

Source for every entry: `docs/implementation/do-it-v1/research/09-cache-prior-art.md`. Built: only unsolved items 1 to 4 and 6 of research/09 section 7, scoped to v1. `ALLOWLIST.json` plus `lint-drivers.mjs --allowlist` keep this honest.

1. Local or response cache. GPTCache is a different problem (whole answers, not prefixes); wrong for tool-using code agents. Source: research/09 section 3 (GPTCache) and section 4 item 1.
2. Prompt compression. It rewrites the prefix and busts the cache; lossy. Source: research/09 section 3 (LLMLingua).
3. Memory service. Memory is a separate concern; retrieved memory is injected at the tail. Source: research/09 section 3 (claude-mem, Letta, mem0, Zep) and R6.
4. Keep-alive pings. Use the 1 hour TTL or a pre-warm instead. Source: research/09 section 4 item 6 (Aider pings) and R10.
5. Our own gateway or normaliser. Copy the field map (`core/routing/usage-shapes.json`); LiteLLM and OpenRouter are adopt-optional. Source: research/09 section 4 items 3 and 4.
6. Harness prefix manipulation. When a harness owns the cache, do-it cannot touch the prefix; it controls only brief layout, spawn grouping, model change timing and telemetry. Source: research/09 section 4 item 2 and section 7 item 1.
7. Self-hosted inference caching (vLLM, SGLang, LMCache). Only by reference if a local-model driver is ever added. Source: research/09 section 3 (vLLM, LMCache).
