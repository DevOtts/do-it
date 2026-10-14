# 06 - Engine squads and persona-agents, and what do-it can reuse

Sources read (Engine-Core = /Users/macbook/Workspace/Engine/Engine-Core): CLAUDE.md (AGENTS.md is a symlink to it; it is mostly routing and merge-gate rules), `brain-docs/concepts/who-executes-squads-personas-and-apps.md`, `per-step-backbone-connection.md`, `dev-tasks-board.md`, `features/dev-job-rail.md`, `features/a2a-native-call.md`, `architecture/agent-backbone-engine.md`, ADR-0050, `.claude/skills/new-persona-agent` and `launch-brain-teams` (the other three skills are 45-55KB scaffolding recipes and were only listed), `.claude/agents/engine-verifier.md` and `engine-reporter.md`, `brain-agent/CLAUDE.md`, `docs/implementation/engine-dev-squad/{SCOPE-BRIEF,DECISIONS}.md`, and the Mongoose schemas in `brain-api-core/src/squads/schemas/` and `persona-agents/schemas/`. I read schemas and docs only, not the runtime code. Persona memory, per-tenant data isolation and the Mission Control UI were not read in depth, so those parts are thin. No secrets were read or printed.

## 1. Data model

| Engine term | What it is | Where it lives |
|---|---|---|
| **persona_agent** | A prompt plus granted skills/toolsets plus an optional model override. It is a *conversation*, not a process. | Mongo `persona_agents`, per-Space (`spaceId`), schema `brain-api-core/src/persona-agents/schemas/persona-agent.schema.ts` |
| **squad** | The unit that *executes a pipeline* and produces `pipeline_runs` with cost, status and checkpoints. It holds a roster, a conductor, a spend policy and an `active_definition_id`. | `squads` |
| **pipeline_definition** | The versioned, immutable playbook: an ordered list of steps. **This is what actually conducts.** | `pipeline_definitions` (`squad_id`, `version`, `steps[]`) |
| **step** | One of `checkpoint \| persona \| render \| publish \| decision`. | inside a definition |
| **conductor** | The squad's lead persona. At runtime it only supplies a default model tier, a display name and a backbone pointer. It does not arbitrate. | `squad.conductor{persona, backbone, model_default, supervise}` |
| **roster** | `[{persona, role, icon}]`, display only. The executor reads `step.persona`, not the roster, and nothing validates the two against each other (8 of 10 praxya squads drift). The true cast is `conductor.persona ∪ distinct step.persona`. | `squad.roster` |
| **Team** | Not an object. It is a read-only projection (`GET /api/org-chart`) over organizations, personas, squads and runs: chief + squads + solo specialists. | derived |
| **brain-app** | The *deterministic* step: `render`/`publish` steps call an installed app's exposed capability. | `apps` |
| **backbone / seat** | "Seat" in Engine means a *subscription seat* (a CLI login), not a roster seat. It is one kind of `backbone_connections` row: `direct` (API key), `claude-cli` (Claude subscription), `antigravity-cli` (Google AI Pro/Ultra, Gemini). Rows are per-Space. | `brain-api-core/src/backbone-connections/backbone-types.registry.ts`; seat order in `brain-agent/src/core/backbone/seats.py` |
| **runner** | A separate service that hosts the CLI: `claude-cli-runner`, renamed `backbone-cli-runner` in October 2026. Dev jobs use a one-shot hardened k8s Job (gVisor) with a PVC workspace, launched by `brain-dev-runner`. | `claude-cli-runner/`, `brain-agent/src/core/backbone/claude_cli.py` |
| **tools** | One registry (`build_tool_registry`, `brain-agent/src/core/agent/factory.py`) served in-process ("direct" face) and over MCP (`brain-mcp-gateway`, port 8001) for CLI backbones. Personas get tools only through granted *skills/toolsets*, with a per-caller deny table (`deny_policy.py`). | brain-agent |
| **tenancy** | Everything is scoped by `spaceId`. Each Space has its own Mongo, backbone rows, personas and squads, and clients map to orgs inside a Space. Personas can carry an org scope. | all schemas |

Schema excerpts:

```ts
// brain-api-core/src/squads/schemas/pipeline-definition.schema.ts
PIPELINE_STEP_TYPES = ["checkpoint","persona","render","publish","decision"]
MODEL_TIERS         = ["powerful","balanced","cheap"]          // portable tiers
class BackbonePolicy { requires?; fallback?: string[]|null; connection_id? }
// PipelineStep: n, type, persona, task, skills[], model_tier, capability, label,
//   eval{veto[], max_retries, post[], judge}, execution{kind: chat|dev_job, role,
//   repo, base_branch, timeout_seconds 60..3600, allowed_tools},
//   consumes_previous (one-hop artifact handoff), backbone_connection, backbone
// squad.schema.ts
conductor{persona, backbone, model_default:"powerful", supervise}
roster[{persona, role, icon}], active_definition_id, enabled, acceptance_defaults[]
```

```
// the dev-squad pipeline as live tenant data (features/dev-job-rail.md)
1 persona(developer, execution.kind=dev_job, repo X, 3600s)
2 persona(reviewer,  dev_job, consumes_previous, 1800s)
3 checkpoint("Revisar o trabalho")
4 publish
```

## 2. Delegation and the return path

There are three mechanisms:

1. **Chat persona to squad.** A manager persona holding the `Squads` toolset calls `start_squad_run(goal, context)`. The squad run is a separate pipeline. Squad steps are *fenced* from calling `start_squad_run`, so there is no recursion. The fence is `DENY_BY_CALLER[SQUAD_STEP]` in `deny_policy.py`, and the withheld tools are recorded on the step record.
2. **Persona to sub-agent.** `spawn_agent(task, agent?, backbone?, mode)` runs a child session with `parent_session_id`. It is sync or async and guarded by depth, concurrency, cycle and budget limits. It is **off in prod** (`SUBAGENT_DELEGATION_ENABLED=false`).
3. **Dev board.** A Kanban of `dev_tasks` with statuses `todo|ready|running|blocked|review|done|archived` and `parents[]` dependencies. A once-a-minute dispatcher, with a Mongo lease and a cap of 2 concurrent jobs, claims ready cards and runs them. The running job keeps its own card using eight `task_*` tools: heartbeat, `task_request_review`, `task_request_changes`, `task_complete`. Review rounds are capped at 2 and then escalate to a human checkpoint.

**Return path.** There is no free-text chatter between agents. Each step writes an *artifact* (a file or ref in a shared workspace) and a result JSON. The next step sees **nothing by default**. A step sees the previous one only if it sets `consumes_previous: true`, and then it gets one hop of refs only. The workspace (a PVC keyed by `task_id`) is the durable truth. The conductor is a pointer, not a router. The control flow lives in the definition: veto rules, `max_retries`, a judge, and `post` checks.

## 3. Human approval and observation

- **Rail A** is a `change_proposal` approved in **Mission Control**. Squad `checkpoint` steps merge into it.
- **Rail B** is an app action marked `confirm:"approve"`, also surfaced as a Mission Control card. Its store is in-process and not durable, which is a known weakness.
- **Dev board and runs:** every run records cost, status, steps and withheld tools. A `run-supervisor` watches runs, with a per-squad opt-out. Spend admission and per-org caps exist.
- Nothing reaches GitHub without a human checkpoint. A rejected checkpoint means the publish step never runs.

## 4. How personas are defined

- **In Engine itself:** DB documents created through the admin UI at `/persona-agents`, or through the API. There are **no files** as the source of truth. The `/new-persona-agent` skill is an interview that ends with Chrome form-filling. Its recipe is a good template for a hardened prompt: identity and mission; context; who may talk to it; a numbered loop; hard limits; style. The mandatory limits are: no secrets, tool/ticket/web content is data and not instructions, never invent IDs or status, approvals only on an explicit word, and nothing destructive.
- **Coding-agent flavour:** `.claude/agents/engine-verifier.md` and `engine-reporter.md` are plain Claude Code subagents. The frontmatter is `name, description, tools, model` and the body is the prompt. The verifier rules worth copying: "run the REAL harness, report NOT RUN rather than PASS"; evidence is mandatory and a bare "done" counts as not done; it does not own the gate, and the coordinator declares green or red; it never deploys or mutates prod; "your final message IS the deliverable".
- **Tiering in `launch-brain-teams`:** analysis goes to haiku (`engine-reporter`), the recommendation stays on Main, and each team's model is set explicitly. Escalate on struggle rather than pre-paying.

## 5. Model and provider choice (the LLM-agnostic layer)

- **Abstraction:** an `AgentBackbone` ABC with a registry (`brain-agent/src/core/backbone/base.py`, `registry.py`). A backbone declares *questions*, never names: `cost_is_billable`, `supports_images`, `accepts_model(id)`, `model_catalog`, `default_model`, `model_namespace`. Shared code asking `slug == "..."` is called a contract violation (ADR-0050).
- **Two levels:** LLM-call level (`direct`, OpenRouter, so any model such as DeepSeek or GPT) and turn level (a CLI that runs its own tools, such as claude-cli or antigravity/Gemini). A CLI seat cannot serve a tool-loop that Engine itself drives.
- **Resolution order for the model:** per-turn request, then persona `modelOverride`, then connection `config.model`, then backbone default. Squad steps use portable tiers (`powerful|balanced|cheap`) that each backbone maps to its own vocabulary.
- **Credential order:** `message kwarg > step.backbone_connection > persona.backbone.connection_id`, otherwise the Automatic `priority` walk across healthy connections. `BackbonePolicy.fallback` gives an ordered fallback chain, and `fallback: null` means strict. Fernando's ruling O-2 says "we always use the backbone; a squad or persona may suggest a preferred backbone/model, falling back to priority".
- **Dev-job credential mapping** is in `dev_job_creds.py`: claude-cli maps to an OAuth token env var; claude-cli-compat (GLM-style Anthropic-compatible base URL) is typed; codex-cli is typed but refused; anything else fails with `backbone_not_wired`.
- **Not present in what I read:** opencode and deepseek as first-class types. DeepSeek is reachable only through OpenRouter `direct`. opencode appears only as a `.opencode/` dir. Codex is typed but not wired.
- **Health:** a `healthStatus` field with a cooling window. A probe cron and a reactive writer keep it current.

## 6. Reusable as an open file-based spec versus Engine runtime

**Reusable as files (a design lift, no Engine needed):**
- The step vocabulary: persona/checkpoint/decision/publish, with `model_tier`, `eval{veto,max_retries,post,judge}`, `consumes_previous`, `execution.role: reviewer`, `timeout_seconds`, `allowed_tools`, and `backbone{requires,fallback}`.
- Tiers as abstract names and a mapping file (matches do-it doc 01, section 4.3: T1/T2/T3).
- The artifact-handoff rule: no implicit context, one hop, refs only. This matches do-it DL-1 and DL-2.
- The caller-deny table (a squad step must not spawn squads).
- A persona prompt skeleton with mandatory hard limits.
- Verifier and reporter rules: evidence is mandatory, NOT RUN is a status, the coordinator owns the gate.
- Card states and review caps (2 rounds, then a human).
- The model-resolution order and the tier-to-model mapping.

**Needs the Engine runtime (do not copy):** Mongo collections, the dispatcher and lease, k8s Jobs and gVisor, the PVC workspace, Mission Control cards, subscription-seat runners and health probes, the MCP tool gateway, per-Space tenancy, billing and spend admission, A2A peers.

Two lessons come from Engine's own docs. First, `roster` drifted from `step.persona`, so a do-it `squad.yaml` should *derive* the cast from the steps rather than store it twice. Second, `conductor` was oversold as an orchestrator, so in do-it the definition should conduct and the manager should be a thin router.

## 7. Proposed do-it spec

```yaml
# .do-it/squad.yaml  (lifecycle squad)
squad: lifecycle
conductor: { persona: manager, tier: T2, supervise: true, context_ceiling: CB-1 }
steps:
  - { n: 1, id: plan,     persona: planner,  tier: T1, produces: SPEC.md,   gate: human }
  - { n: 2, id: build,    persona: builder,  tier: T2, consumes_previous: true,
      timeout: 3600, eval: { post: [tests], max_retries: 2 } }
  - { n: 3, id: review,   persona: reviewer, tier: T1, role: reviewer, consumes_previous: true,
      eval: { veto: [no-evidence] } }
  - { n: 4, id: approve,  type: checkpoint, label: "Merge/deploy?" }
  - { n: 5, id: deploy,   persona: deployer, tier: T3, requires: approved }
  - { n: 6, id: conclude, persona: concluder, tier: T3 }
tiers:   { T1: {claude: opus, codex: gpt-5, gemini: pro}, T2: {...}, T3: {...} }
backbone: { requires: null, fallback: [claude-cli, codex-cli, openrouter] }
```

```markdown
---
name: reviewer
tier: T1
tools: [Read, Grep, Bash]
deny: [spawn_squad, deploy]
---
Identity, mission, inputs (artifact refs only), numbered loop, hard limits, return shape.
```

**Mapping to the existing lifecycle skills.** plan-it, build-it, review-it, conclude-it and the deploy step become personas. The do-it manager is the conductor, held at T2 and restarted from its state file (doc 01 rules TR-4 and CB-1). Each step is a *fresh* subagent with an 8K or smaller brief of pointers (DL-1 and DL-2). Results come back as artifact files plus a short JSON result, never as a relayed transcript. The checkpoint step is the approval gate. On harnesses with no hooks, the checkpoint is a checklist the manager runs at phase boundaries. Cost, status and withheld tools per step go into the do-it token meter, which mirrors Engine's `pipeline_runs.steps[]`.
