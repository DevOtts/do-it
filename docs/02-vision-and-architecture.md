# 02. Vision and architecture

## Vision in one paragraph
You send one message ("ship W0-W2", "O Secretário não recebe mensagens completas", "drain the 107 backlog cards"). do-it routes it to a preset, runs the lifecycle (prompt-it, plan-it, build-it, review-it, deploy-it, conclude-it, reconcile-it) on whatever AI coding harness you use, asks you every question once in one numbered pack, spends the cheapest model that can do each piece, and does not stop until each acceptance row is VERIFIED, PARKED with a question, or BLOCKED with a reason. Installing do-it installs the family.

## Principles (each answers a finding in docs/01)
| # | Principle | Answers |
|---|---|---|
| P1 | Code decides, models work. The spine is deterministic and is the only writer of run state | F1, F5 |
| P2 | One result envelope, `it-result/1`, written by every stage | F1 |
| P3 | Plan once, ask once: no build starts without a readiness verdict; no mid-run questions except owner gates | F5.1 |
| P4 | A visible finish line and a stop-gate; waves are scheduled by code | F5.2 |
| P5 | Review loops converge by rule, not by taste | F5.3 |
| P6 | One folder, `.do-it/`, one layout whether run standalone or under do-it | F5.4, F2 |
| P7 | Tokens are a budget: route by task class, slice only when it pays, cache on purpose, never let a model state usage numbers | F6 |
| P8 | Hosts are interchangeable behind one interface; a host that cannot do something says so and the spine routes around it | F8 |
| P9 | Honest states only: VERIFIED needs evidence; "estimated" is labelled; unknown is a value | all |

## Five layers (top to bottom)
1. **Host adapters** (`hosts/<host>/`): claude-code, codex, opencode, engine. Each implements `HostAdapter` and declares `capabilities.json`.
2. **Conductor**: a thin T2 persona with a context ceiling. It calls `do-it next`, spawns the stage persona with a brief of 8K tokens or less, and goes back to sleep. It never reads whole files or relays worker chatter. At the ceiling it hands off.
3. **Stage personas**: markdown files (`name, description, tier, tools, deny` frontmatter): conductor, intake, planner, builder, reviewer, runner, verifier, deployer, concluder, reconciler. Each wraps one stage plugin skill.
4. **Spine CLI** (`core/spine/do-it.mjs`, zero-dependency Node, single file): `init start next record gate answer handoff resume park status meter doctor`. Exit codes 0 ok · 1 failed · 2 needs human · 3 blocked or usage limit.
5. **Disk** (`.do-it/`): all machine state. Host dirs (`.claude`, `.agents`, `.opencode`) and `.secrets/` stay outside.

## Pipeline as data
A preset is a YAML file of steps in Engine's own vocabulary (`persona | checkpoint | decision | code`), so it compiles to an Engine `pipeline_definition` later. Presets: `feature`, `investigate-fix`, `drain`, `review-loop`, `reconcile`. The router is deterministic first (keyword and shape rules); one cheap model call only when ambiguous, and it logs why. Loops (`loop_to`, `max_rounds`) are data, capped by the convergence controller.

## The four behaviors, mechanical
1. **Plan once, ask once.** Planning ends only with `.do-it/plan/READINESS.json` (every decision RESOLVED or DEFAULTED; live access preflight passed; no build slice depends on an answer from the owner) and `DECISIONS.md` (options, recommendation, reason; the owner replies "approve all except 4 and 7"). Mid-run questions are decided by their recorded recommendation, logged, and shown in the owner pack at the end. Owner gates (production flag, credentials, spend, destructive, client-facing) park only their own slice.
2. **Run to the finish line.** `.do-it/finish-line.json` lists every wave, package and DoD row; terminal states are DONE (evidence recorded, package archived to 0-done), PARKED (with an owner question), BLOCKED (with a reason). The stop-gate refuses to end a turn or session while any row is non-terminal and no blocker exists, answering with the board; it refuses at most N times in a row without progress (default 3), then parks and asks. `do-it next` returns the next runnable wave; the board (about 300 tokens) is injected on every wake. Untested hypothesis: a visible end state is what keeps sessions going; the test is in the epics.
3. **Review loop convergence.** The reviewer writes the roteiro; a different agent runs it; the builder fixes. do-it owns the exit rule: frozen, fingerprinted roteiro; severity classes (blocker and major loop; minor and nit go to backlog cards); round budget default 3; blocker and major counts must fall each round; the same fingerprint twice means raise the tier once, then the owner; a round with only minors ends the loop; cost cap; separate author, runner and builder contexts. Exits: CONVERGED, CONVERGED_WITH_MINORS, STALLED (owner decides), OVER_BUDGET (parked).
4. **One home: `.do-it/`.** `config` is replaced by `settings.json`; layout in docs/03 section 7. `DO_IT_HOME` overrides; worktrees resolve the main checkout via `git rev-parse --git-common-dir`. Legacy folders migrate only through `do-it doctor --migrate` when no run is in flight; plugins read legacy paths as a resume fallback.

## Token economy (a core responsibility)
- **Volume:** briefs 8K or less, pointers not content, digests by content hash, tool output truncated at the spine, no replay of finished history.
- **Routing:** four task classes: `deterministic` (code, zero tokens), `gather` (T3), `spec'd implementation` (T2), `hard` (T1 with a written reason, else downgraded). Failed contract re-runs one tier up once, logged; then the owner pack. Three first-try passes in a row downgrade a class one tier. Tier changes only at a spawn or stage boundary, never mid-session (cache).
- **Decomposition:** split only when the saving exceeds the spawn cost; a one-file change runs inline; single writer per file lane.
- **Cache:** provider-native caching; stable prefix, append-only history, deterministic serialization, no tool or model change mid-session, updates in messages not the system prompt; warm the prefix once before fanning out; TTL chosen by the gap between calls; a per-provider `drivers.json` matrix; cache read and write recorded in the meter.
- **Honest usage:** models never state token numbers; the meter records provider usage or `estimated:true` or "unknown"; the brief builder validates every path and ID a brief cites. KPI: tokens per VERIFIED DoD row.

## Owner pack and settings
One canonical `owner-pack.json` (numbered questions, recommendation, options, default). Renderers: `native` (host question tool when 4 questions or fewer), `html`, `markdown`; Engine adds channel delivery. The reply is terse (`1 yes 2 no 3: B`) and parsed by `do-it answer`. Settings precedence: run flag, workspace `.do-it/settings.json`, global `~/.do-it/settings.json`, defaults; `do-it doctor` prints each value and its source. Credentials: `do-it init` asks once where they come from (file under `.secrets/`, env, AWS Secrets Manager, 1Password) and stores a reference only.

## Hosts
| Host | Native strengths | Fallback when missing |
|---|---|---|
| claude-code | subagents with per-spawn model, Stop and PreToolUse hooks, `AskUserQuestion` (4 questions, 2-4 options), ScheduleWakeup, plugin `dependencies` | n/a |
| codex | `codex exec --json`, `exec resume`, `request_user_input` (flagged), hooks (about 8, flagged) | separate sequential passes; markdown pack; park instead of wake |
| opencode | `run --format json`, provider routing (DeepSeek and others), JS plugin events | same as codex |
| engine | per-role k8s Jobs, Control Tower asks on CT/chat/WhatsApp, DB/R2 state | compile `squad.yaml` to a `pipeline_definition` |
Hermes and OpenClaw are out of v1 (docs/01 F9).

## Isolation and deploy
Isolation is a driver: `worktree` (parallel-lifecycle, a separate plugin and a soft dependency), `job` (Engine), `none`. deploy-it becomes an adapter contract: `.deploy-it/adapter.json` plus commands speaking the LEG protocol; result states DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN; the deploy stage takes the router lock first, canaries on the lowest-risk target, requires every declared leg. reconcile-it gets `scan` / `plan` / `apply --approved` with a persisted state file.

## Failure and recovery (modelled in the CONTRACT)
A run can land in FAILED, PARTIAL_FAILURE (some deploy legs or targets passed, some failed), ROLLED_BACK, or ESCALATED (rollback also failed, or the escalation cap is hit). PARKED resumes from state after a usage limit. A ceiling hit writes a handoff; a failed handoff retries up to the cap, then escalates.

## Non-goals
Not a new model harness; not a replacement for the stage plugins; no Engine runtime code (the Engine layer is a spec handed to Engine); no Hermes or OpenClaw in v1; no Langfuse/LangSmith exporter in v1 (v2, with the trace fields frozen now).

## Positioning (feeds the README)
plan-it plans it, build-it builds it, review-it verifies it, do-it runs the whole thing and spends your tokens like they are yours. One message in, a verified feature out; sleep through usage limits; works on Claude Code, Codex, OpenCode and Engine.
