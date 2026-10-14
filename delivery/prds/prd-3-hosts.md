# PRD-3: Hosts (lane L3, squad hosts-a)

CONTRACT: delivery/CONTRACT.md v1.0-draft. Epics: H0, H1, H2, H3. Lane paths: `hosts/_interface/**`, `hosts/claude-code/**`, `hosts/codex/**`, `hosts/opencode/**`.
Evidence base for every host fact: `docs/research/11-host-cli-probe.md` (called "the probe" below). Probed 2026-10-14: claude 2.1.300, codex-cli 0.156.1, opencode v2.0.18. Nothing was run end to end; no model call was made. Tags used here: [probed] seen in help, validator or directory listing; [inferred] from binary strings or naming; [unknown] listed in the probe's Unknowns.

Note on numbering: `D1..Dn` below are decisions local to this PRD. They are not the owner rulings D1 to D21 in DECISIONS.md; owner rulings are always written "owner ruling Dn".

## 1. Summary
do-it runs on four hosts. This lane builds the host side for three CLIs (`claude-code`, codex, opencode) and the interface they all implement. The interface is a JSON schema for the six calls (spawn, ask, collect, continue, wake, meter) and three drivers (isolation, secrets, stateStore), a `capabilities.json` schema, and one shared conformance suite. Each adapter either passes the suite or lists exactly which cases it skips and why. Where a host lacks a capability, the documented fallback of CONTRACT section 6 applies, and a fake adapter proves every fallback before any real CLI is touched.

The three CLIs differ a lot (probe capability table). `claude-code` has native subagents with a per-spawn model, a Stop hook and about 28 hook events [inferred], AskUserQuestion [inferred] and ScheduleWakeup [inferred]. codex has `exec --json`, `-C`, `exec resume`, hooks (about 8 events, [inferred]) and no cost field. opencode v2 has `run --format json`, `--auto`, provider/model routing and `stats --cost --json`, but no scheduler and no settings-style hooks. The adapters hide these differences behind one contract; the spine never learns which host it is on (G-12).

## 2. Problem and goals
Problem: a conductor that calls the spine must behave the same on every harness, yet the harnesses differ in subagents, questions, headless start, wake-up, usage reporting and hooks. Without one interface and one suite, each host drifts, claims capabilities it does not have, and fails silently at the ceiling or at a usage limit.
Goals:
1. One adapter contract with a machine-checkable schema and a conformance suite that every adapter runs (H0).
2. Every missing capability degrades through a documented fallback, proven on a fake adapter (H0).
3. `claude-code` is the reference host: Stop-gate, ceiling block, per-spawn model, headless continue under the owner's alias (H1).
4. codex and opencode work with honest fallbacks: no stop hook (checklist, default R5), no wake (park), estimated usage flagged (H2, H3).
5. Host facts are never asserted beyond the probe: unknowns are recorded in `capabilities.json.unknown`, and any case that depends on one is a [REAL] case that may end IMPLEMENTED-NOT-VERIFIED.
6. A stale `capabilities.json` is detected: re-probing the real binary reports any mismatch.

Non-goals: Hermes and OpenClaw (owner ruling D6, G-14); the Engine adapter (L4); the spine, schemas and renderers (L1); tier-to-model policy (L2, though each host ships its own `tiers.json`, default R8).

## 3. Users and jobs
| User | Job | What this lane gives them |
|---|---|---|
| Owner (Fernando) | run the same pipeline on whichever CLI has quota today, including subscription aliases | adapters that behave the same, and say plainly when a capability is missing |
| Conductor agent | call spawn, ask, continue, wake, meter without knowing the host | one call surface; fallbacks applied for it |
| Spine (L1) | enforce ceilings, stop-gate, handoff, park without naming a harness (G-12) | adapter results with a fixed outcome vocabulary (HANDOFF_FAILED, PARKED, ESCALATED) |
| Adapter author (future host) | add a host | schema, conformance suite, fake adapter as a worked example |
| Reviewer | decide if a host claim is true | `capabilities.json` re-probe, and `unknown` list instead of guesses |

## 4. Solution design (decisions)
D1. The adapter contract is `hosts/_interface/host-adapter.schema.json`: calls spawn(role, tier, brief) returning a result path, ask(pack), collect() returning answers, continue(handoff), wake(at, prompt), meter() returning usage or null, and drivers isolation, secrets, stateStore. Source: CONTRACT section 3, docs/03 section 8.
D2. `capabilities.json` follows docs/03 section 8 (`host, version_probed, spawn{native, per_spawn_model, max_parallel}, ask{native, max_questions}, continue{headless}, wake{native}, meter{provider_usage, cache_fields}, hooks{stop_gate}, isolation[], unknown[]`), validated by `hosts/_interface/capabilities.schema.json`. Each field that rests on an inferred or unknown fact carries its name in `unknown[]`. Source: CONTRACT section 2, probe Unknowns.
D3. One conformance suite (`hosts/_interface/conformance/`) runs against any adapter path. Output: per case PASS, SKIP with a reason string, or FAIL. An adapter passes when there is no FAIL and every SKIP has a non-empty reason that matches a `false` or unknown capability in its own `capabilities.json`. A skip not justified by a capability is a FAIL. Source: docs/03 section 8.
D4. Fallbacks (CONTRACT section 6) live in `hosts/_interface/lib/fallbacks.mjs`, not in the spine, because the spine may not name harnesses and the capability checks are adapter data. Mapping: spawn.native false means sequential passes; ask.native false or more than 4 questions means html, then markdown; continue.headless false means `handoff.mode` ask plus a one-line command; wake.native false means PARKED and a stated reason; meter.provider_usage false means an estimate with `estimated:true` (owner ruling D5); hooks.stop_gate false means the conductor checklist (default R5). The spine calls the fallback module through the adapter. See proposed amendment A2.
D5. A fake adapter (`hosts/_interface/fake/`) can switch each capability off by flag. It is the only way the fallbacks are tested without a paid model call. Its results are never used to mark a [REAL] case VERIFIED (G-3).
D6. G-12 is enforced by `hosts/_interface/checks/g12-no-harness.mjs`, a grep of `core/**` for a harness-name list (`harness-names.json`). G-14 by `g14-no-hermes-openclaw.mjs`, a check that no path or file under the repo contains a hermes or openclaw folder, adapter or test. Both run on the real filesystem. Source: CONTRACT section 9.
D7. `claude-code` adapter (H1). Spawn through the Agent tool with a per-call `model` (probe section 3: per-call setting seen in the tool schema; per-agent frontmatter model is [inferred]). Continue by headless `claude -p --output-format json` run with the owner's alias (profile dirs `.claude-8fai`, `.claude-anm` and others exist [probed]; the env var that selects a profile dir is [inferred, not in the probe] and goes in `unknown[]`). No `--cwd` flag exists [probed], so the adapter sets the process cwd. Never passes `--bare` when the alias uses subscription auth (probe unknown 10). Source: probe sections 1 and 3, owner ruling D13.
D8. `claude-code` hooks: plugin-provided hooks (probe section 4) register Stop (stop-gate calling the spine `gate` command) and PreToolUse (block spawn on the ceiling, G-5). The hook exit-code semantics for "block" are [inferred]; they are asserted in a [REAL] case and recorded in `unknown[]` until observed. Source: probe section 4, owner ruling D3.
D9. `claude-code` plugin manifest: `.claude-plugin/plugin.json` with a `dependencies` array. `dependencies` is a recognised field and must be an array [probed: three validator probes]. Install-time resolution, semver range syntax and behaviour on a missing dependency are [unknown] (probe unknown 4), so install resolution is a [REAL] case that may end IMPLEMENTED-NOT-VERIFIED. The manifest source lives at `hosts/claude-code/plugin/.claude-plugin/plugin.json`; L5 (plugins/**, `.claude-plugin/**`) packages it. See proposed amendment A1.
D10. `claude-code` AskUserQuestion mapping: an owner pack of at most 4 questions with 2 to 4 options each maps to one native call; anything else falls back (html, then markdown) per owner ruling D7. The 4 and 2-to-4 limits come from the brief; the tool exists [inferred] and its behaviour with no human in `-p` mode is [unknown] (probe unknown 3).
D11. `claude-code` wake: ScheduleWakeup [inferred]. Whether it works in `-p` or `--bg` sessions is [unknown] (probe unknown 8), so the adapter uses it only in an interactive conductor and parks otherwise.
D12. `claude-code` usage: from the `--output-format json` result event: `total_cost_usd`, `usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`, `modelUsage` [inferred; exact JSON unverified, probe unknown 1]. `--max-budget-usd` is available as a hard cap [probed].
D13. codex adapter (H2). Spawn and continue through `codex exec --json -C DIR -m MODEL -s SANDBOX` and `codex exec resume ID|--last` [probed]. Sandbox maps from role: writers `workspace-write`, verifier and reviewer `read-only`. Never `--dangerously-bypass-approvals-and-sandbox`. Spawn is not in-session subagent (multi_agent flag exists but format is [unknown], probe unknown 5); each spawn is a separate `codex exec` run, sequential by default.
D14. codex ask: `request_user_input` only when the feature `default_mode_request_user_input` reads enabled in `codex features list` (it is "under development, false" [probed]); otherwise markdown. Its behaviour in `exec` is [unknown] (probe unknown 3). Source: probe section 6.
D15. codex hooks: about 8 events behind the `hooks` feature and persisted trust [inferred]; the config file and event list are [unknown] (probe unknown 5). v1 therefore ships the stop-gate as a conductor checklist (default R5) and does not rely on hooks.
D16. codex usage: JSONL `turn.completed.usage` with `cached_input_tokens` and `reasoning_output_tokens`, no cost, no cache-write field [inferred]. Cost is computed from an adapter price table only when the owner supplies one, and is always flagged `estimated:true`; without a table cost is unknown. Cache-write is recorded 0 with `estimated:true`. codex wake: none seen (goals and queue semantics unknown, probe unknown 8), so park.
D17. opencode adapter (H3). `opencode run --format json -m provider/model --auto` [probed]; the v2 CLI differs from 1.x docs, so every flag is checked against `opencode run --help` at probe time. No working-dir flag on `run`, so process cwd is used (probe section 1). Use `--standalone` so a spawn does not share the always-on background service state [probed existence; effect inferred].
D18. opencode provider routing: tier to `provider/model#variant` from `hosts/opencode/tiers.json`, filled from `opencode models` at init (default R8). DeepSeek is an example provider: routing is accepted only when `opencode models` lists it. Nothing is assumed about which providers the owner has configured.
D19. opencode events and gate: hooks are in-process JS plugins (`tool.execute.before`, `session.idle`) [inferred]; whether a thrown error blocks a tool is [unknown]. v1 uses the plugin only to append events and to remind; the stop-gate and ceiling are the conductor checklist (default R5). No scheduler: park (probe section 7).
D20. opencode usage: cost via `opencode stats --cost --json` [probed], per-message tokens via `opencode session export` [probed command; shape inferred]. Whether `run --format json` emits tokens or cost is [unknown] (probe unknown 1).
D21. opencode ask: a `question` tool exists in strings [inferred], unconfirmed from help, so v1 uses markdown for ask on opencode.
D22. Secrets: adapters never put a credential value in argv, env logs, briefs or events (G-7). The opencode adapter preflight scans `opencode.jsonc` for inline tokens and reports the key path only, because the probe found a plaintext bearer token in the owner's config (probe section 8).
D23. Failure vocabulary the adapters return and the fallback module maps: HANDOFF_FAILED (headless start failed; retry up to cap 5, then ESCALATED, CONTRACT M3), PARKED (no wake), and a host process killed mid-spawn is recovered by resume from disk (partial result files are never read). Source: CONTRACT section 8.
D24. Re-probe: each host has `probe.mjs` that runs only `--version`, `--help` and similar no-model commands, compares the result with `capabilities.json`, and exits 1 listing every mismatched field. Mismatch is reported, never auto-fixed. Source: probe method, honesty rules.
D25. The settings default `host.driver` is `auto` (accepted amendment A3): the active host is resolved by detecting `hosts/*/capabilities.json`, and the allowed values are read from `hosts/` at runtime, so `core/` holds no harness literal.

## 5. Epics
| EID | Title | Branch | Wave | Depends on | Cases |
|---|---|---|---|---|---|
| H0 | HostAdapter interface, capabilities schema, conformance suite, fake adapter | `epic/H0-interface-conformance` | W0 | CONTRACT only | 18 |
| H1 | `claude-code` adapter and plugin manifest | `epic/H1-claude-code` | W1 | H0 | 20 |
| H2 | codex adapter | `epic/H2-codex` | W2 | H0 | 17 |
| H3 | opencode adapter | `epic/H3-opencode` | W2 | H0 | 18 |

Spine-side behaviour (counting handoffs, writing state, stop refusal counter) belongs to L1 (S2, S5). This lane tests only what the adapters and `hosts/_interface/lib` do, using a stub spine.

## 6. Acceptance criteria
1. `host-adapter.schema.json` and `capabilities.schema.json` validate the fake adapter and reject malformed manifests with the failing path (H0).
2. The conformance suite runs against fake, `claude-code`, codex and opencode adapters; each passes or lists its skips with reasons (H0 to H3).
3. G-12 and G-14 checks exit 0 on the real tree and exit 1 on a planted violation (H0).
4. Each fallback in CONTRACT section 6 is asserted as an outcome on the fake adapter (H0).
5. HANDOFF_FAILED, ESCALATED, PARKED outcomes are asserted; HANDOFF_FAILED on a real failing headless start for each host (H0 to H3).
6. Each host's `probe.mjs` exits 1 and names the field when `capabilities.json` disagrees with the real binary (H1 to H3).
7. Every case depending on a probe-unknown is [REAL]; no [REAL] case is VERIFIED on a mock (G-3).
8. All files of the lane live under the four lane paths (CONTRACT section 7).

## 7. Risks
| Risk | Effect | Handling |
|---|---|---|
| opencode v2 flags differ from 1.x documentation | adapter built on stale flags | flags checked against `opencode run --help` in probe.mjs; mismatch reported |
| Output JSON shapes unverified (probe unknown 1) | meter parse wrong | parsers tolerate missing fields and set source unknown; [REAL] cases may end IMPLEMENTED-NOT-VERIFIED |
| Headless start under subscription aliases untested (owner ruling D13) | auto handoff fails | HANDOFF_FAILED path with cap 5, then ESCALATED; fallback `handoff.mode` ask |
| `--bare` needs an API key (probe unknown 10) | billing surprise | adapter never passes `--bare` for subscription aliases |
| Hook block semantics unverified | ceiling or stop-gate does not block | [REAL] case; until observed, ceiling is also enforced by the spine on `next` (G-5) |
| Plugin dependency resolution unverified (probe unknown 4) | companions not installed | [REAL] install case in a scratch config dir; `doctor --install` (L1) is the backstop |
| A `host.driver` default naming a harness in core/ | G-12 fails | default `auto` (D25) |
| Plaintext token in the owner's opencode config | leak | preflight reports key path only (D22) |

## 8. Repo and branch plan
Branches `epic/H0-interface-conformance`, `epic/H1-claude-code`, `epic/H2-codex`, `epic/H3-opencode`; one worktree per squad; reap on merge (CONTRACT RUN-POLICY). One writer per path.
```
hosts/_interface/  host-adapter.schema.json  capabilities.schema.json  harness-names.json
                   validate.mjs  lib/fallbacks.mjs  lib/estimate.mjs
                   checks/g12-no-harness.mjs  checks/g14-no-hermes-openclaw.mjs
                   conformance/run.mjs  conformance/cases/*.json
                   fake/adapter.mjs  fake/capabilities.json
hosts/claude-code/ adapter.mjs  capabilities.json  tiers.json  probe.mjs
                   plugin/.claude-plugin/plugin.json  hooks/hooks.json  hooks/stop-gate.mjs  hooks/pretooluse-ceiling.mjs
                   lib/{spawn,continue,ask-map,wake,meter}.mjs  tests/
hosts/codex/       adapter.mjs  capabilities.json  tiers.json  probe.mjs  lib/{spawn,continue,ask,meter}.mjs  checklist/stop-gate.md  tests/
hosts/opencode/    adapter.mjs  capabilities.json  tiers.json  probe.mjs  lib/{spawn,continue,meter,preflight}.mjs  plugin/do-it-events.js  checklist/stop-gate.md  tests/
```

## 9. Proposed CONTRACT amendments (accepted by the coordinator for v1.1)
- A1. Plugin manifest location: the manifest source is `hosts/claude-code/plugin/.claude-plugin/plugin.json`; L5 copies or references it.
- A2. Fallback module location: `hosts/_interface/lib/fallbacks.mjs`, called by the spine through the adapter, so core/ stays harness-free.
- A3. docs/03 section 6 default `host.driver` becomes `auto`.
- A4. Host unit tests live under `hosts/*/tests/` (lane L3) although `tests/**` is L5.
