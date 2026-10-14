# Epics 3: Hosts (lane L3, squad hosts-a)

PRD: delivery/prds/prd-3-hosts.md. CONTRACT: delivery/CONTRACT.md v1.0-draft. Evidence for host facts: docs/research/11-host-cli-probe.md ("the probe"), versions probed 2026-10-14: claude 2.1.300, codex-cli 0.156.1, opencode v2.0.18. Tags: [probed], [inferred], [unknown] as in the PRD. A case that depends on a probe unknown is `[REAL]` and may end IMPLEMENTED-NOT-VERIFIED when its live target is unreachable or would need a paid model call (CONTRACT section 7, G-3).

Conventions for all cases: `{host}` is one of the three host folders; "stub spine" is `hosts/_interface/fake/spine-stub.mjs`, which records calls and answers from a fixture; "stub binary" is a script on PATH that mimics a CLI exit code. Scratch dirs are created under the OS temp dir and removed after the case.

---

## Epic H0 — HostAdapter interface, capabilities schema, conformance suite, fake adapter

Branch: `epic/H0-interface-conformance` · Wave W0 · Depends on: CONTRACT sections 2, 3, 6 only (no other epic).

### Scope
The adapter JSON schema, the capabilities schema, the shared conformance suite, the G-12 and G-14 checks, the fallback library and a fake adapter that can switch each capability off. Nothing here names a real CLI binary except the conformance runner's generic probe harness, which takes the binary name from the adapter.

### Tasks
- [ ] `hosts/_interface/host-adapter.schema.json`: calls spawn, ask, collect, continue, wake, meter; drivers isolation, secrets, stateStore; each call has input and output shapes and an outcome enum (ok, HANDOFF_FAILED, PARKED, UNTIERED_SPAWN, NOT_SUPPORTED).
- [ ] `hosts/_interface/capabilities.schema.json`: the shape in docs/03 section 8, plus `unknown[]` of strings.
- [ ] `hosts/_interface/validate.mjs`: `--kind adapter|capabilities FILE`, exit 0 valid, exit 1 invalid with `path: message` lines on stderr.
- [ ] `hosts/_interface/harness-names.json` and `hosts/_interface/checks/g12-no-harness.mjs` (`--root DIR`; exit 1 and `file:line:name` lines on a match).
- [ ] `hosts/_interface/checks/g14-no-hermes-openclaw.mjs` (`--root DIR`; checks path names and file contents for hermes and openclaw, case-insensitive).
- [ ] `hosts/_interface/lib/fallbacks.mjs`: sequential spawn, ask chain native then html then markdown, headless-less continue giving `handoff.mode` ask plus a one-line command, wake giving PARKED, attempt counter giving HANDOFF_FAILED then ESCALATED at cap 5, hook-less stop-gate giving the checklist.
- [ ] `hosts/_interface/lib/estimate.mjs`: character-based estimate (characters divided by 4, rounded up; adapter-default ratio, owner ruling D5) returning `estimated:true`, `source:estimate`; no text gives `source:unknown`.
- [ ] `hosts/_interface/conformance/run.mjs` (`--adapter PATH --json [--off LIST] [--case ID]`) and `hosts/_interface/conformance/cases/*.json`.
- [ ] `hosts/_interface/fake/adapter.mjs`, `hosts/_interface/fake/adapter.manifest.json`, `hosts/_interface/fake/capabilities.json`, `hosts/_interface/fake/spine-stub.mjs`.
- [ ] `hosts/_interface/lib/probe-compare.mjs` used by each host `probe.mjs` (compares a probed object with a capabilities file, lists mismatched fields).

### Test Contract — H0 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem · [REAL] cases: 2
Done = every case below is PASS. No [REAL] case VERIFIED on a mock (see T-H0-01 and T-H0-02, which run on the real tree).
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-H0-01 | G-12 on the real tree: core/ names no harness | run `node hosts/_interface/checks/g12-no-harness.mjs --root core` in the repo root, on the real core/ directory | exit 0 and stdout `matches: 0`; the harness list includes claude, codex, opencode, hermes, openclaw (G-12) | [REAL] |
| T-H0-02 | G-14 on the real tree: no hermes or openclaw folder, adapter or test | run `node hosts/_interface/checks/g14-no-hermes-openclaw.mjs --root .` on the real repo | exit 0 and stdout `matches: 0` (G-14) | [REAL] |
| T-H0-03 | Planted G-12 violation is caught | copy core/ to a scratch dir, append the word `opencode` in a comment of one `.mjs` file, run the check on the scratch dir | exit 1; stdout contains that file path, its line number and `opencode`; running it on the untouched copy gives exit 0 (G-12) | adversarial |
| T-H0-04 | Schemas accept the fake adapter | run `validate.mjs --kind adapter` on `hosts/_interface/fake/adapter.manifest.json` and `--kind capabilities` on `hosts/_interface/fake/capabilities.json` | both exit 0; stdout `valid` | happy |
| T-H0-05 | Adapter schema rejects a manifest with no wake call | copy the fake manifest, delete the `wake` call, validate | exit 1; stderr has a line starting `calls.wake:` | failure |
| T-H0-06 | Capabilities schema rejects a wrong type | copy fake capabilities, set `ask.max_questions` to the string "4", validate | exit 1; stderr has a line starting `ask.max_questions:` and the word `integer` | failure |
| T-H0-07 | Conformance suite on the full fake adapter | run `conformance/run.mjs --adapter hosts/_interface/fake/adapter.mjs --json` | exit 0; JSON `failed` equals 0, `skipped` equals an empty array, `passed` equals `total` | happy |
| T-H0-08 | An adapter passes or lists exactly what it skips and why | run with `--off ask.native`; then with a skip entry whose reason is an empty string | first run exit 0, `skipped` has one entry `ask-native` with reason `ask.native=false`; second run exit 1, case `skip-needs-reason` FAIL; a skip with no matching false capability is also FAIL | happy |
| T-H0-09 | No subagents: roles run as sequential passes | run case `fallback-spawn` with `--off spawn.native`, spawning roles builder then verifier | outcome `mode:sequential`; the two recorded spans satisfy builder.end <= verifier.start; order is builder, verifier (CONTRACT section 6) | happy |
| T-H0-10 | More than 4 questions falls to html | run `fallback-ask` with native on, max_questions 4, a pack of 5 questions | outcome `channel:html`, one `owner-pack.html` path returned, native call count 0 (owner ruling D7 via CONTRACT section 6) | happy |
| T-H0-11 | No native questions and html unavailable falls to markdown | run `fallback-ask` with `--off ask.native,renderer.html` and 3 questions | outcome `channel:markdown`, an `owner-pack.md` path returned, with html attempted first and markdown second | failure |
| T-H0-12 | No headless start sets handoff.mode ask | run `fallback-continue` with `--off continue.headless` | outcome `handoff.mode:ask`; `command` is a single line with no newline characters; no child process spawned (CONTRACT section 6, owner ruling D13) | happy |
| T-H0-13 | Headless start fails five times: HANDOFF_FAILED then ESCALATED | fake continue configured to exit 1 each time; call the attempt counter 5 times | attempts 1 to 4 each return `HANDOFF_FAILED`; the 5th returns `ESCALATED` with `attempts:5`; a 6th call is refused with `ESCALATED` and spawns nothing (CONTRACT M3, G-5) | failure |
| T-H0-14 | No wake: park and say so | run `fallback-wake` with `--off wake.native` | outcome `PARKED`; reason string `wake.native=false`; no timer or cron artifact written; message includes the word `parked` | failure |
| T-H0-15 | No provider usage: estimate and flag | fake meter returns null; text of 400 characters | meter row has `tokens_in:100`, `estimated:true`, `source:estimate`; with empty text the row has `source:unknown` and `tokens_in:null` (G-6, owner ruling D5) | happy |
| T-H0-16 | Recovery after a host process dies mid-spawn | fake spawn writes `result.json.tmp` then is killed with SIGKILL before rename; call collect, then resume | collect returns no result for that spawn and lists the tmp file as `partial`; resume re-runs spawn once; final directory holds exactly one `result.json` and no `.tmp` file | recovery |
| T-H0-17 | Adversarial verify: a stale capabilities file is reported | a stub binary prints version 9.9.9; fake capabilities say `version_probed` 1.0.0; run `probe-compare` | exit 1; stdout names `version_probed` with both values; the capabilities file is unchanged (sha256 equal before and after) | adversarial |
| T-H0-18 | Secrets driver never leaks a value | set env var `DOIT_CANARY=zz-canary-7731`, run the conformance suite with the secrets driver reading that ref, capture all stdout, stderr and files written | zero occurrences of `zz-canary-7731` in any captured output or written file (G-7) | adversarial |

Cascade coverage for H0: recovery/resume T-H0-16; failed-recovery to escalation T-H0-13; adversarial-verify T-H0-17 and T-H0-18.
partial-failure: N/A — an adapter call is a single operation; multi-leg partial failure belongs to deploy-it (L5) and the spine.
rollback/compensation: N/A — adapters hold no state to compensate; the spine owns state.

---

## Epic H1 — `claude-code` adapter and plugin manifest

Branch: `epic/H1-claude-code` · Wave W1 · Depends on: H0 (schemas, fallbacks, conformance, fake spine stub). Spine commands `gate`, `park`, `handoff` are called through the stub spine in tests; the real spine (S2, S5) is exercised by L5 e2e.

### Scope
Reference host. Facts used: Agent tool per-call `model` [probed in the session tool schema]; `claude -p`, `--output-format json`, `--session-id`, `-r`, `--add-dir`, `--max-budget-usd` [probed]; plugin `dependencies` array accepted by `claude plugin validate`, a non-array rejected [probed]; hook events Stop and PreToolUse [probed in the owner's settings, event list inferred]; AskUserQuestion, ScheduleWakeup [inferred]; usage fields in the result event [inferred]. Unknowns carried in `capabilities.json.unknown`: install-time dependency resolution, hook block semantics, AskUserQuestion in `-p`, ScheduleWakeup in `-p` or `--bg`, exact result JSON, the env var that selects a profile dir.

### Tasks
- [ ] `hosts/claude-code/plugin/.claude-plugin/plugin.json`: name, version 0.1.0, description, author, license MIT, `dependencies` array built from companions pins (L5 `core/companions.json` is read at build time by a script; the file committed here lists plan-it, build-it, review-it, conclude-it as names with optional version and marketplace).
- [ ] `hosts/claude-code/hooks/hooks.json`: Stop runs `hooks/stop-gate.mjs`; PreToolUse runs `hooks/pretooluse-ceiling.mjs`.
- [ ] `hosts/claude-code/hooks/stop-gate.mjs`: reads the hook JSON from stdin, calls the spine `gate` command (stop mode), exits 2 with a reason on stderr to refuse a stop, exits 0 to allow, and calls spine `park` after the patience count (default 3, G-9).
- [ ] `hosts/claude-code/hooks/pretooluse-ceiling.mjs`: when the spine reports the ceiling blocked, denies the spawn tool (Agent) with a message naming the handoff; always allows file writes needed to write `handoff.md` (G-5).
- [ ] `hosts/claude-code/lib/spawn.mjs`: builds an Agent tool request with `model` from `tiers.json`; refuses an untiered spawn; downgrades T1 without a reason to T2 (G-4).
- [ ] `hosts/claude-code/lib/continue.mjs`: builds and runs `claude -p --output-format json --session-id ID` (or `-r ID`) with the owner alias environment, process cwd set, optional `--max-budget-usd`; never `--bare` for subscription aliases; maps failure to HANDOFF_FAILED.
- [ ] `hosts/claude-code/lib/ask-map.mjs`: pack to AskUserQuestion payload (at most 4 questions, 2 to 4 options each), else fallback chain via `hosts/_interface/lib/fallbacks.mjs`.
- [ ] `hosts/claude-code/lib/wake.mjs`: ScheduleWakeup request in an interactive conductor; otherwise PARKED.
- [ ] `hosts/claude-code/lib/meter.mjs`: parse the json result into a token-meter row.
- [ ] `hosts/claude-code/adapter.mjs`, `capabilities.json`, `tiers.json` (aliases only, asked once at init, default R8), `probe.mjs` (`--version`, `--help`, `plugin validate --help`; compares with `capabilities.json`).
- [ ] `hosts/claude-code/tests/` with a stub `claude` script and JSON fixtures labelled `shape-unverified`.

### Test Contract — H1 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 20 · Surfaces: CLI + filesystem + real claude binary · [REAL] cases: 7
Done = every case below is PASS. No [REAL] case VERIFIED on a mock (see T-H1-01, T-H1-02, T-H1-20, which run the real binary).
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-H1-01 | Plugin manifest validates with the real validator | run the real `claude plugin validate hosts/claude-code/plugin --json` | exit 0; JSON has no entry for `dependencies`; the file's `dependencies` is a non-empty array whose entries are strings or objects with a `name` | [REAL] |
| T-H1-02 | A non-array dependencies field is rejected | copy the plugin to scratch, set `"dependencies":"notarray"`, run the real `claude plugin validate` on it | exit 1; output contains `path: dependencies` and `expected array, received string` | [REAL] |
| T-H1-03 | Install-time dependency resolution is observed, not assumed | with `CLAUDE_CONFIG_DIR` pointing to an empty scratch dir, run the real `claude plugin install` for the local plugin whose dependency is absent; write the observed exit code and message to `hosts/claude-code/PROBE-NOTES.json` | the notes file exists with keys `exit_code` and `message`; capabilities `unknown[]` contains `plugin-dependency-resolution` until a successful resolve is recorded; if the marketplace is unreachable the case ends IMPLEMENTED-NOT-VERIFIED | [REAL] |
| T-H1-04 | hooks.json registers the stop-gate and the ceiling block | parse `hosts/claude-code/hooks/hooks.json` | event `Stop` maps to `stop-gate.mjs` and event `PreToolUse` maps to `pretooluse-ceiling.mjs`; both commands resolve to existing files | happy |
| T-H1-05 | Stop-gate refuses three times then parks | stub spine answers "unfinished" with no progress; invoke `stop-gate.mjs` four times | calls 1 to 3 exit 2 with a non-empty stderr reason; call 4 exits 0 and the stub spine received exactly one `park` call; refusal counter shows 3 (G-9, owner ruling D10) | failure |
| T-H1-06 | Stop-gate allows a finished run | stub spine answers "finished" | exit 0, stderr empty, zero refusals recorded, zero `park` calls (G-9) | happy |
| T-H1-07 | Ceiling blocks a spawn but not the handoff write | stub spine reports `ceiling:blocked`; send PreToolUse payloads for the Agent tool and for a Write to `runs/{run_id}/handoff.md` | the Agent payload is denied with a message containing `handoff`; the Write payload is allowed (G-5, owner ruling D3) | happy |
| T-H1-08 | Spawn sets a per-spawn model from the tier map; untiered is refused | `tiers.json` maps T3 to alias haiku; call spawn(role intake, tier T3) and spawn(role intake, no tier) | first returns a request with `model:"haiku"` and tier T3; second exits 1 with outcome `UNTIERED_SPAWN` and builds nothing (G-4) | happy |
| T-H1-09 | T1 without a written reason is downgraded | call spawn(role planner, tier T1, reason empty), then with reason text | first request uses the T2 model and the event records `downgraded_from:T1`; second uses the T1 model (G-4) | failure |
| T-H1-10 | Continue builds the exact headless command | run continue in `--dry-run` with alias `8fai`, session id `11111111-2222-3333-4444-555555555555`, cwd a scratch repo | printed argv equals `claude -p --output-format json --session-id 11111111-2222-3333-4444-555555555555`; the argv does not contain `--bare`; the env map names the alias profile dir; process cwd equals the scratch repo; no secret value is printed (G-7) | happy |
| T-H1-11 | Headless start under a real subscription alias | run the real continue for the owner's alias with a one-line handoff prompt ("reply with the word ok") | exit 0, stdout parses as JSON with a `session_id`; if the alias cannot start headless the case ends IMPLEMENTED-NOT-VERIFIED and the failure is recorded (owner ruling D13: this start is untested) | [REAL] |
| T-H1-12 | Headless start fails: HANDOFF_FAILED | run continue against the real `claude` binary with the profile dir set to `/nonexistent/alias` and a 30 second timeout | adapter outcome is `HANDOFF_FAILED` (non-zero exit or timeout), `attempts:1`, no state file written by the adapter (CONTRACT M3, G-1) | [REAL] |
| T-H1-13 | Cap reached: ESCALATED | put a stub `claude` on PATH that always exits 1; run continue until the cap | attempts 1 to 4 return `HANDOFF_FAILED`, attempt 5 returns `ESCALATED` with `attempts:5` and no sixth process is started (CONTRACT M3, cap 5) | failure |
| T-H1-14 | Three questions map to one native call | pack with 3 questions of 2, 3 and 4 options | ask-map returns one AskUserQuestion payload with `questions.length` 3 and option counts 2, 3, 4; channel `native` | happy |
| T-H1-15 | Over the cap falls back | pack A has 5 questions; pack B has 4 questions of which one has 1 option; pack C has one question with 5 options | each returns channel `html` (none native); pack C's reason says `options>4` (CONTRACT section 6, owner ruling D7) | failure |
| T-H1-16 | Meter parses usage from the json result | fixture result with `total_cost_usd 0.12`, `usage.input_tokens 1000`, `output_tokens 200`, `cache_read_input_tokens 5000`, `cache_creation_input_tokens 300`; a second fixture with no `usage` | first row: `tokens_in:1000, tokens_out:200, cache_read:5000, cache_write:300, estimated:false, source:provider`; second row: `source:unknown` and no invented numbers (G-6) | happy |
| T-H1-17 | Meter against a real json result | run one real `claude -p "reply ok" --output-format json` through the adapter | the parsed row has numeric `tokens_in`, `tokens_out`, `source:provider`; field names compared to the fixture; mismatch is written to `PROBE-NOTES.json`; if no paid call is possible the case ends IMPLEMENTED-NOT-VERIFIED (probe unknown 1) | [REAL] |
| T-H1-18 | Wake uses ScheduleWakeup interactively and parks otherwise | call wake(at, prompt) with context `interactive`, then with context `headless` | interactive returns a ScheduleWakeup request carrying `at` and `prompt`; headless returns `PARKED` with reason `wake unavailable outside interactive` (probe unknown 8, CONTRACT section 6) | failure |
| T-H1-19 | Recovery after the claude child dies mid-spawn | stub `claude` writes half a JSON line then is killed with SIGKILL; call collect, then resume with the same `--session-id` | collect ignores the partial output and reports `partial`; resume issues one command with `-r` and the same id; exactly one final result file exists | recovery |
| T-H1-20 | Adversarial verify: capabilities.json is re-probed against the real binary | copy `capabilities.json` to scratch, set `version_probed` to `0.0.0`, run `node hosts/claude-code/probe.mjs --check --caps SCRATCHFILE` against the real `claude --version` | exit 1; stdout names `version_probed` with `0.0.0` and the real version; on the committed file the result is exit 0 when versions match, else exit 1 listing every mismatch; the committed file is never rewritten | [REAL] |

Cascade coverage for H1: recovery/resume T-H1-19; failed-recovery to escalation T-H1-13; adversarial-verify T-H1-20.
partial-failure: N/A — each adapter call is one operation; multi-leg partial failure belongs to deploy-it and the spine.
rollback/compensation: N/A — the adapter keeps no state to compensate; the spine owns run state (G-1).

---

## Epic H2 — codex adapter

Branch: `epic/H2-codex` · Wave W2 · Depends on: H0.

### Scope
Facts used: `codex exec` with `--json`, `-C`, `-m`, `-s`, `-o`, `--output-schema`; `codex exec resume ID` or `--last`; `codex features list` [probed]. Inferred: `thread.started` and `turn.completed` events and the usage fields `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`; no cost field; no cache-write field; about 8 hook events. Unknown: custom agent file format, per-agent model, hooks config file, `request_user_input` behaviour in `exec`, any wake. Consequences: spawn is a separate `codex exec` run (sequential by default); ask is markdown unless the flag is on; stop-gate is a conductor checklist (default R5); cost is estimated and flagged; wake parks.

### Tasks
- [ ] `hosts/codex/lib/spawn.mjs`: argv `codex exec --json -C DIR -m MODEL -s SANDBOX -`, brief on stdin; writers `workspace-write`, verifier and reviewer `read-only`; never the bypass flags.
- [ ] `hosts/codex/lib/continue.mjs`: `codex exec resume SESSION` (or `--last` only when no id is known); session id read from the `thread.started` event; failure maps to HANDOFF_FAILED.
- [ ] `hosts/codex/lib/ask.mjs`: parses `codex features list`; native only if `default_mode_request_user_input` is enabled, else markdown through `hosts/_interface/lib/fallbacks.mjs`.
- [ ] `hosts/codex/lib/meter.mjs`: JSONL to token-meter row; optional `hosts/codex/prices.json` (owner supplied, absent by default).
- [ ] `hosts/codex/checklist/stop-gate.md`: the conductor checklist (default R5): five numbered checks, each naming the spine command to run.
- [ ] `hosts/codex/adapter.mjs`, `capabilities.json` (`hooks.stop_gate:false`, `wake.native:false`), `tiers.json`, `probe.mjs`.
- [ ] `hosts/codex/tests/` with a stub `codex` script and JSONL fixtures labelled `shape-unverified`.

### Test Contract — H2 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 17 · Surfaces: CLI + filesystem + real codex binary · [REAL] cases: 6
Done = every case below is PASS. No [REAL] case VERIFIED on a mock (see T-H2-01, T-H2-02, T-H2-03, which run the real binary).
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-H2-01 | capabilities.json is re-probed against the real binary | copy `hosts/codex/capabilities.json` to scratch, set `version_probed` to `0.0.0`, run `node hosts/codex/probe.mjs --check --caps SCRATCHFILE` with the real `codex --version` | exit 1; stdout names `version_probed` with `0.0.0` and the real version; committed file unchanged (sha256 equal) | [REAL] |
| T-H2-02 | The flags the adapter uses exist in the real help | run the real `codex exec --help` and `codex exec resume --help` through `probe.mjs --flags` | exit 0 when `-C`, `--json`, `-m`, `-s`, and subcommand `resume` are all present; otherwise exit 1 naming each missing flag | [REAL] |
| T-H2-03 | The question feature flag is read from the real binary | run the real `codex features list` through `ask.mjs --detect` | output `request_user_input:false` while `default_mode_request_user_input` is false (probed state); the parse of an all-enabled fixture gives `true` | [REAL] |
| T-H2-04 | Spawn builds the exact codex command | spawn dry-run: role builder, tier T2 mapped to model M-test, dir a scratch repo | argv equals `codex exec --json -C SCRATCH -m M-test -s workspace-write -`; brief goes on stdin; argv contains no `--dangerously-bypass-approvals-and-sandbox` (G-4, G-7) | happy |
| T-H2-05 | Read-only roles get a read-only sandbox | spawn dry-run for roles verifier and reviewer | both argv contain `-s read-only`; neither contains `workspace-write` | happy |
| T-H2-06 | Continue builds resume with the captured session id | fixture JSONL has `thread.started` with id `thr-42`; continue dry-run | argv equals `codex exec resume thr-42 --json`; with no id known and `--last` allowed, argv ends `resume --last`; with no id and not allowed, outcome `HANDOFF_FAILED` reason `no session id` | happy |
| T-H2-07 | Ask is markdown unless the flag is on | features fixture A has the flag false, fixture B true; pack of 2 questions | A gives channel `markdown`; B gives channel `native`; a pack of 5 questions gives `html` in both (CONTRACT section 6, owner ruling D7) | failure |
| T-H2-08 | Stop-gate is a conductor checklist | read `capabilities.json` and `checklist/stop-gate.md`; run conformance | `hooks.stop_gate` is false; the checklist has 5 numbered items; conformance lists skip `stop-hook` with reason `hooks.stop_gate=false`; exit 0 (default R5, G-9) | happy |
| T-H2-09 | Meter parses codex usage | fixture `turn.completed.usage` with `input_tokens 800`, `cached_input_tokens 600`, `output_tokens 150`, `reasoning_output_tokens 90` | row: `tokens_in:800, tokens_out:150, cache_read:600, cache_write:0, estimated:true, source:provider`; `reasoning_output_tokens:90` kept in `extra`; `unknown[]` holds `reasoning-included-in-output` (G-6) | happy |
| T-H2-10 | Cost is estimated and flagged, never invented | run meter with no price table, then with `prices.json` giving 2 USD per million input tokens | no table: `cost_usd:null`, cost source `unknown`; with table: `cost_usd:0.0016`, `estimated:true`; no run ever prints a cost with `estimated:false` (G-6, owner ruling D5) | failure |
| T-H2-11 | No wake: park | call wake(at, prompt) | outcome `PARKED`, reason `wake.native=false`, no file under `.codex` written (CONTRACT section 6) | failure |
| T-H2-12 | Headless start fails on the real binary: HANDOFF_FAILED | run the real `codex exec -C /nonexistent/dir --json -` through continue with a 30 second timeout | adapter outcome `HANDOFF_FAILED` (non-zero exit or timeout), `attempts:1` (CONTRACT M3) | [REAL] |
| T-H2-13 | Real spawn of a trivial prompt | run the real adapter spawn with the prompt "reply ok" in a scratch git repo, tier T3 | exit 0, a JSONL file is captured with a `thread.started` and a `turn.completed` event, and the parsed row has numeric `tokens_in`; without login or a paid call the case ends IMPLEMENTED-NOT-VERIFIED (probe unknown 1) | [REAL] |
| T-H2-14 | Real resume of the T-H2-13 session | run continue with the id captured in T-H2-13 | exit 0 and the same session id appears in the new JSONL; if T-H2-13 was IMPLEMENTED-NOT-VERIFIED this case is too | [REAL] |
| T-H2-15 | Recovery after the codex child dies mid-spawn | stub `codex` prints half a JSONL line then is killed with SIGKILL; collect, then resume | collect reports `partial` and ignores the truncated line; resume issues one `exec resume` for the captured id; one final result file exists | recovery |
| T-H2-16 | Cap reached: ESCALATED | stub `codex` always exits 1; continue 5 times | attempts 1 to 4 `HANDOFF_FAILED`, attempt 5 `ESCALATED` with `attempts:5`; no sixth process (CONTRACT M3) | failure |
| T-H2-17 | Conformance suite on the codex adapter | `conformance/run.mjs --adapter hosts/codex/adapter.mjs --json` | exit 0; `failed` 0; every entry in `skipped` has a reason matching a false capability (`wake.native=false`, `hooks.stop_gate=false`, and others as present) | happy |

Cascade coverage for H2: recovery/resume T-H2-15; failed-recovery to escalation T-H2-16; adversarial-verify T-H2-01.
partial-failure: N/A — one adapter call is one operation; multi-leg failure belongs to deploy-it and the spine.
rollback/compensation: N/A — no adapter state to compensate.

---

## Epic H3 — opencode adapter

Branch: `epic/H3-opencode` · Wave W2 · Depends on: H0.

### Scope
Facts used (all against the v2 CLI): `opencode run [flags] [message...]`, `--format default|json`, `-m provider/model#variant`, `--auto`, `-c`, `-s ID`, `--standalone`, `opencode models`, `opencode stats --cost --json`, `opencode session export` [probed]; plugin events `tool.execute.before`, `session.idle`, `.opencode/plugin(s)` [inferred]; `question` tool [inferred]. Unknown: whether `run --format json` carries tokens or cost, agent definition format, per-agent model, whether a plugin can block a tool, exit codes. Consequences: no cwd flag so process cwd is set; markdown for ask; park for wake; stop-gate and ceiling are the conductor checklist (default R5); DeepSeek is routed only when `opencode models` lists it.

### Tasks
- [ ] `hosts/opencode/lib/spawn.mjs`: argv `opencode run --format json -m PROVIDER/MODEL --auto --standalone MESSAGE`, process cwd set to the slice dir.
- [ ] `hosts/opencode/lib/continue.mjs`: `opencode run -s SESSION ...`; failure maps to HANDOFF_FAILED; a hang is cut by a timeout.
- [ ] `hosts/opencode/lib/meter.mjs`: cost from `opencode stats --cost --json`; tokens from `opencode session export` when present; otherwise unknown.
- [ ] `hosts/opencode/lib/tiers.mjs`: generates `tiers.json` from `opencode models`.
- [ ] `hosts/opencode/lib/preflight.mjs`: scans an opencode config for inline tokens and reports key paths only (G-7).
- [ ] `hosts/opencode/plugin/do-it-events.js`: JS plugin appending event rows on `tool.execute.before` and `session.idle`; never throws (blocking semantics unknown).
- [ ] `hosts/opencode/checklist/stop-gate.md`: conductor checklist (default R5).
- [ ] `hosts/opencode/adapter.mjs`, `capabilities.json` (`wake.native:false`, `hooks.stop_gate:false`, `ask.native:false`), `tiers.json` (generated, never hard-coded), `probe.mjs`.
- [ ] `hosts/opencode/tests/` with a stub `opencode` script and fixtures labelled `shape-unverified`.

### Test Contract — H3 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem + real opencode binary · [REAL] cases: 6
Done = every case below is PASS. No [REAL] case VERIFIED on a mock (see T-H3-01, T-H3-02, T-H3-03, which run the real binary).
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-H3-01 | capabilities.json is re-probed against the real binary | copy `hosts/opencode/capabilities.json` to scratch, set `version_probed` to `0.0.0`, run `node hosts/opencode/probe.mjs --check --caps SCRATCHFILE` with the real `opencode --version` | exit 1; stdout names `version_probed` with `0.0.0` and the real version; committed file unchanged (sha256 equal) | [REAL] |
| T-H3-02 | The v2 flags the adapter uses exist in the real help | run the real `opencode run --help` through `probe.mjs --flags` | exit 0 when `--format`, `-m`, `--auto`, `--standalone`, `-s` are all present; otherwise exit 1 naming each missing flag | [REAL] |
| T-H3-03 | Real cost listing parses | run the real `opencode stats --cost --json` through `meter.mjs --stats` | exit 0; stdout is valid JSON; the adapter returns an object with a numeric `cost_usd` (0 allowed on an empty database); no model call is made | [REAL] |
| T-H3-04 | Tier routing is built from the real model list | run the real `opencode models` through `tiers.mjs --generate` into a scratch file | every mapped value matches `provider/model`; every value appears in the real listing; a `deepseek/` model is mapped only if the listing contains one, else `unknown[]` holds `deepseek-not-listed` and the tier is left unmapped | [REAL] |
| T-H3-05 | Spawn builds the exact opencode command | spawn dry-run: tier T3 mapped to `testprov/testmodel`, slice dir a scratch repo | argv equals `opencode run --format json -m testprov/testmodel --auto --standalone` followed by the message; process cwd equals the scratch repo; no `--cwd` style flag appears | happy |
| T-H3-06 | DeepSeek routes when listed, fails clearly when not | fixture model list A contains `deepseek/deepseek-chat`, list B does not; spawn tier T3 configured to provider deepseek | A: argv has `-m deepseek/deepseek-chat`; B: exit 1, outcome `TIER_UNROUTED`, nothing spawned | failure |
| T-H3-07 | JS plugin records events and never blocks | load `plugin/do-it-events.js` with a fake host object; fire `tool.execute.before` and `session.idle` | one event row appended per call to the scratch `events.jsonl`; neither handler throws or returns a deny value; plugin file has no credential value (G-7) | happy |
| T-H3-08 | Stop-gate is a conductor checklist | read `capabilities.json` and `checklist/stop-gate.md`; run conformance | `hooks.stop_gate` is false; checklist has 5 numbered items; conformance skip `stop-hook` carries reason `hooks.stop_gate=false` (default R5, G-9) | happy |
| T-H3-09 | Ask is markdown | call ask(pack of 2 questions), then a pack of 5 | channel `markdown` for 2 (native not available), `html` for 5; capabilities `unknown[]` holds `question-tool-unconfirmed` (CONTRACT section 6, owner ruling D7) | failure |
| T-H3-10 | No scheduler: park | call wake(at, prompt) | outcome `PARKED`, reason `wake.native=false`, no cron entry or file written outside the run dir | failure |
| T-H3-11 | Meter combines stats cost and exported tokens | fixture stats JSON with cost 0.05 and fixture export with `tokens.input 700, output 120, reasoning 40, cache.read 500, cache.write 60` | row: `tokens_in:700, tokens_out:120, cache_read:500, cache_write:60, source:provider, estimated:false`; cost 0.05 recorded (G-6) | happy |
| T-H3-12 | Missing usage is unknown, never zero | fixture export with no tokens block and no stats | row has `source:unknown`, `tokens_in:null`; with message text supplied the estimate path gives `estimated:true, source:estimate` (G-6, owner ruling D5) | failure |
| T-H3-13 | Config preflight reports key paths, not values | scratch `opencode.jsonc` with an MCP block holding `"Authorization":"Bearer zz-canary-5521"` | preflight exit 1 with output containing the key path `mcp.notion.headers.Authorization` and the word `inline`; output and all files written contain zero occurrences of `zz-canary-5521` (G-7) | adversarial |
| T-H3-14 | Headless start fails on the real binary: HANDOFF_FAILED | run the real `opencode run -m nonexistent/none --standalone "x"` through continue with a 30 second timeout | adapter outcome `HANDOFF_FAILED` (non-zero exit or timeout), `attempts:1`; no process left running afterwards (CONTRACT M3) | [REAL] |
| T-H3-15 | Real spawn of a trivial prompt | run the real adapter spawn with "reply ok" using a model from T-H3-04, in a scratch repo | exit 0 and captured JSON output; whether it carries tokens or cost is written to `PROBE-NOTES.json` (probe unknown 1); without a configured provider or a paid call the case ends IMPLEMENTED-NOT-VERIFIED | [REAL] |
| T-H3-16 | Recovery after the opencode child dies mid-spawn | stub `opencode` prints half a JSON line then is killed with SIGKILL; collect, then resume | collect reports `partial`; resume issues one `opencode run -s SESSION` for the captured id; one final result file exists | recovery |
| T-H3-17 | Cap reached: ESCALATED | stub `opencode` always exits 1; continue 5 times | attempts 1 to 4 `HANDOFF_FAILED`, attempt 5 `ESCALATED` with `attempts:5`; no sixth process (CONTRACT M3) | failure |
| T-H3-18 | Conformance suite on the opencode adapter | `conformance/run.mjs --adapter hosts/opencode/adapter.mjs --json` | exit 0; `failed` 0; every `skipped` entry has a reason matching a false capability (`wake.native=false`, `hooks.stop_gate=false`, `ask.native=false`) | happy |

Cascade coverage for H3: recovery/resume T-H3-16; failed-recovery to escalation T-H3-17; adversarial-verify T-H3-01 and T-H3-13.
partial-failure: N/A — one adapter call is one operation; multi-leg failure belongs to deploy-it and the spine.
rollback/compensation: N/A — no adapter state to compensate.
