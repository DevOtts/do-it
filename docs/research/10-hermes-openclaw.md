# Research 10: Hermes Agent and OpenClaw as do-it hosts

Researched 2026-10-14. Web content treated as data. Tags: [doc-read] = official docs page read; [readme-only] = repo README / index page only; [inferred]; [unknown].
Note: WebFetch returns model-summarised pages, so "doc-read" means the official page was fetched, not read verbatim.

## Identification
- **Hermes** = Nous Research "Hermes Agent", open-source self-improving agent framework (skills, memory, subagents, messaging gateway). Not the Hermes LLM family. [readme-only] https://github.com/NousResearch/hermes-agent ; docs https://hermes-agent.nousresearch.com/docs
- **OpenClaw** = open-source personal AI assistant running on your machine, reached through chat apps. Maintained by the "OpenClaw Foundation" (501(c)(3)). Former names Clawdbot, then Moltbot: this is stated only by third-party lists, not confirmed on an official page. [readme-only] https://github.com/openclaw/openclaw ; third-party naming claim https://git.cynarski.dev/Awesome/awesome-openclaw-skills/src/branch/xcrong/main [inferred]

## 1. What / install / license / version

| | Hermes Agent | OpenClaw |
|---|---|---|
| License | MIT [readme-only] (GitHub README) | MIT [readme-only] (GitHub README) |
| Latest release seen | v0.22.0 "The Threshold Release", published 2026-10-14T03:21Z [doc-read, GitHub API https://api.github.com/repos/NousResearch/hermes-agent/releases/latest] | v2026.10.3, published 2026-10-13T13:49Z [doc-read, https://api.github.com/repos/openclaw/openclaw/releases/latest] |
| Install | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` (Linux/macOS/WSL2); PowerShell script; Termux APT repo [readme-only] | `curl -fsSL https://openclaw.ai/install.sh \| bash`, or `npm install -g openclaw@latest` (Node 24.16+ or 26.1+); then `openclaw onboard --install-daemon` [readme-only] |
| Runtime | Python (plugins are Python) [doc-read, plugins page] | Node/TypeScript pnpm workspace [readme-only] |

Both are fast-moving (daily-ish releases); pin versions in any adapter and re-verify flags.
Install scripts are curl|sh style; we did not run them. Prefer npm for OpenClaw. Hermes has no package-manager install shown in the README [unknown beyond the script].

## 2. SKILL.md / `skills` CLI

- **Hermes:** follows agentskills.io open standard; `name` + `description` frontmatter; dirs `~/.hermes/skills/`, `skills.external_dirs`, project skills; optional `references/ templates/ scripts/ assets/`. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/skills . Native install: `hermes skills install owner/repo/path`, `hermes skills tap add owner/repo` (reads `skills/` by default); security scan on install. [doc-read, same page]
  - `skills` CLI (vercel-labs/skills, MIT) agent id is **`hermes-agent`** (NOT `hermes`); project dir `.hermes/skills/`, global `~/.hermes/skills/`. [readme-only] https://github.com/vercel-labs/skills
  - So `npx skills add DevOtts/<repo> -a hermes-agent` should work. [inferred from the README table; not executed]
- **OpenClaw:** follows AgentSkills spec; frontmatter `name`, `description` + optional `metadata.openclaw` gating; skill found up to 6 levels deep. Load order: `<workspace>/skills`, `<workspace>/.agents/skills`, `~/.agents/skills`, `<state-dir>/skills`, ... [doc-read] https://docs.openclaw.ai/tools/skills . Native install: `openclaw skills install git:owner/repo@ref` (needs SKILL.md at repo root), `skills-sh:owner/repo/slug`, `@owner/slug` (ClawHub), local path; `--global` -> `~/.openclaw/skills`. [doc-read, same page]
  - `skills` CLI agent id is **`openclaw`**; project dir `skills/` (top-level, not a dot dir), global `~/.openclaw/skills/`. [readme-only] https://github.com/vercel-labs/skills
  - Caveat: legacy `metadata.clawdbot` is ignored; use `metadata.openclaw` if gating is needed. [doc-read]
  - Neither host's docs mention `npx skills`; support rides on vercel-labs README table only.

## 3. Subagents / parallel workers with chosen model

- **Hermes:** `delegate_task` tool. Each child gets fresh conversation + own terminal session; only a final summary returns. Batch via `tasks` array, default 10 concurrent (`delegation.max_concurrent_children`). Child model/provider set in `config.yaml` `delegation.model` / `delegation.provider` / `base_url`; **global only, no per-task model parameter**. `delegation.worktree_isolation: true` gives each child a git worktree. Children inherit parent toolsets; leaf children cannot use `clarify`, `memory`, `send_message`, `cronjob`. Depth via `max_spawn_depth` (default 1 = flat). Per-task `output_schema` supported. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
  - Implication: tier models per task needs a config rewrite between spawns, or separate profiles (`--profile`), or spawning separate `hermes -z -m <model>` processes. [inferred]
- **OpenClaw:** `sessions_spawn` tool with params incl. `task`, `agentId`, `model` (per-spawn override), `thinking`, `runTimeoutSeconds`, `cwd`, `sandbox`, `context` (`"fork"` copies requester transcript, else fresh), `mode`, `cleanup`, `worktree`, `worktreeName`, `worktreeBaseRef`. Default model via `agents.defaults.subagents.model`. Result is announced back to requester. Subagents get no session/message tools by default. [doc-read] https://docs.openclaw.ai/tools/subagents (index page only; numeric concurrency and depth limits NOT read [unknown])

## 4. Headless / non-interactive

- **Hermes:** `hermes -z "<prompt>"` prints only the final reply; accepts stdin; `-m`, `--provider`, `--usage-file <path>` (JSON usage report even on failure). Exit: 0 ok, 2 failed/partial/budget/bad flags, 130 interrupted, 1 no text. Also `hermes chat -q/--query[-file] ... --oneshot -Q --format stream-json` (events system/text/tool_use/tool_result/result with `exit_code`), `-s/--skills`, `-t/--toolsets`, `--max-turns`, `--yolo`, `--worktree`, `--resume/-r`, `--continue/-c`, `--in <dir>`, `--profile`. [doc-read] https://hermes-agent.nousresearch.com/docs/reference/cli-commands (first 100k chars of 143k read)
- **OpenClaw:** `openclaw agent --message/--message-file ... --json` with a required session selector (`--to`, `--session-key`, `--session-id`, or `--agent`); `--model`, `--thinking`, `--timeout` (default 600s), `--local` (embedded; refuses if a Gateway owns the state dir), `--deliver`. Exit 0 ok, 1 error/timeout/cancel. `openclaw agent exec` = CI-style embedded run, temp state dir by default, `--cwd`, `--isolated`, `--fallback`; exit 0/1/2(timeout). By default goes through the Gateway, which must be running. [doc-read] https://docs.openclaw.ai/cli/agent
- Both support a fresh conductor from a resume prompt. Hermes is simpler (no daemon needed, per docs read; not tested). OpenClaw non-`--local` needs the Gateway daemon.

## 5. Asking the human; chat surfaces

- **Hermes:** `clarify` tool exists in the agent-orchestration toolset. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/tools . Third-party source view says up to 4 predefined choices plus auto "Other"; numbered list on messaging, arrow-keys in CLI. That is ONE question per call (not multi-question) [inferred from source mirror; unverified] https://download.hermesedi.duckdns.org/.hermes/hermes-agent/tools/clarify_tool.py . Not available to leaf subagents. Surfaces: Telegram, Discord, Slack, WhatsApp, Signal, Email via one gateway (`hermes gateway setup/start`) + CLI. [readme-only]
- **OpenClaw:** `ask_user` tool: 1-3 structured questions, each with 2-4 options, `multiSelect` flag, always-on free-text "Other", timeout default 900s (clamp 30-3600s), returns `status: "no_answer"` on timeout. Native buttons only for single-question single-choice on Telegram/Discord/Slack; else degrades to text; web Control UI shows a full card. Main session only (subagents don't get it). [secondary: web search snippet of official page https://docs.openclaw.ai/tools/ask-user.md; page itself not fetched successfully] Surfaces: Discord, iMessage, Slack, Teams, Telegram, WhatsApp, Signal, Google Chat and 20+ more; sender pairing via `openclaw pairing approve <channel> <code>`. [readme-only]

## 6. Hooks / stop-gate

- **Hermes:** four systems: gateway hooks (`~/.hermes/hooks/<name>/HOOK.yaml + handler.py`, gateway only), plugin hooks (`ctx.register_hook`; `pre_tool_call`, `post_tool_call`, `pre/post_llm_call`, `on_session_start/end`, subagent, approval events), **shell hooks** (`hooks:` block in profile `config.yaml`; CLI + gateway; accept a Claude-Code-compatible `modify` response), outbound webhooks. `pre_tool_call` can `block` / `approve` / `modify`; fails closed on timeout/error. `transform_llm_output` can replace the final response. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks (100k of 134k chars read)
  - A true "stop-gate" (refuse to end turn and force continuation) is NOT documented. `on_session_end` is observer-only. [unknown whether any hook can veto finishing]. A pre_tool_call block plus a post-hoc check is the verified fallback.
- **OpenClaw:** internal hooks (`HOOK.md` + JS/TS handler, events like `command:new`, `gateway:startup`; no blocking documented) and typed plugin hooks via `api.on(...)`: `before_tool_call` (block/approval), `before_agent_run` (`{outcome:"block"}`), `before_agent_reply`, `before_agent_finalize`, `agent_end`, `session_end`, `llm_input/output`... [doc-read] https://docs.openclaw.ai/automation/hooks , https://docs.openclaw.ai/plugins/hooks . `before_agent_finalize` exists but its semantics (can it force continuation?) were NOT documented on the pages read [unknown]; reference page `/plugins/hooks/reference#hook-catalog` not read.
  - Hooks require authoring a plugin (code), not just a config entry.

## 7. Scheduling / self-wakeup

- **Hermes:** built-in cron: `hermes cron create|list|edit|pause|resume|run|remove|status|runs|tick`, `/cron` in chat, or natural language via `cronjob_manage` tool. Formats: `in 30m`, `every 2h`, `weekdays at 9am`, 5-field cron, ISO timestamp. Gateway daemon polls every 60s, starts a fresh agent session per job; jobs can attach `--skill`, `--workdir`; delivery to origin/local/telegram:<id>/all. Cron-run sessions cannot create more cron jobs. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/cron . Requires the gateway running. Because cron sessions cannot create jobs, a cron-run conductor cannot self-reschedule [doc-read; consequence inferred].
- **OpenClaw:** `openclaw automations create <schedule> --name --session main --system-event ... --wake now --delete-after-run`; `openclaw cron` is an alias; `list/get/show/runs`. Also Heartbeat (periodic main-session turns). Agent-tool creation path not read. [doc-read, index only] https://docs.openclaw.ai/automation/cron-jobs ; schedule/payload/delivery child pages NOT read [unknown details].

## 8. Model/provider routing, caching, usage

- **Hermes:** providers incl. Nous Portal, OpenRouter, OpenAI, custom endpoints, "others"; `hermes model` switch; `-m/--provider` per invocation; `providers.<id>...` config. [readme-only + doc-read CLI page] Subagent tier = global `delegation.model` (see 3). Cron has `--reasoning-effort`. Prompt caching: `api_mode: anthropic_messages` enables automatic caching per a third-party integration doc (https://docs.requesty.ai/integrations/hermes) [secondary]; official prompt-assembly doc exists (https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly) but not read [unknown]. Usage: `--usage-file` JSON (schema not seen) [doc-read]; whether cache read/write counts are included [unknown].
- **OpenClaw:** swappable provider plugins incl. Claude, Codex, local models. [readme-only] Per-run `--model` and per-spawn `model`. Prompt caching: `cacheRetention` none/short/long (global/per-model/per-agent); Anthropic 5m/1h, OpenAI automatic, Bedrock, OpenRouter (Anthropic routes), Gemini; usage normalised to `cacheRead`/`cacheWrite` in `/usage tokens`, `/status`, session summaries. [doc-read] https://docs.openclaw.ai/reference/prompt-caching . Whether `--json` output of `openclaw agent` carries token usage: [unknown].
- Also relevant: OpenClaw can use Claude Code / Gemini CLI as "CLI backends" (usage parsed, no cache markers). [doc-read, prompt-caching page]

## 9. Plugin packaging; config/state dirs

- **Hermes plugin:** directory with `plugin.yaml` + Python `register(ctx)`; install `hermes plugins install owner/repo [--ref <40-char SHA>] [--enable]`; locations `~/.hermes/plugins/`, project `.hermes/plugins/` (needs `HERMES_ENABLE_PROJECT_PLUGINS=true`), pip entry point `hermes_agent.plugins`; must be listed in `plugins.enabled`. Can register tools, hooks, slash commands, CLI subcommands, bundled skills (`register_skill`), gateway platforms. Plugin packs: `hermes-pack.yaml`. [doc-read] https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins . Config/state: `~/.hermes` (`config.yaml`, `skills/`, `plugins/`, `hooks/`); Windows `%LOCALAPPDATA%\hermes`. [readme-only]
- **OpenClaw plugin:** npm-style package with `package.json` (`openclaw.extensions`, `peerDependencies: openclaw`) + `openclaw.plugin.json` manifest (`id`, `contracts.tools`, `configSchema`, `activation`); install `openclaw plugins install clawhub:<pkg>` or bare npm spec or `npm-pack:<tgz>`; registers channels, providers, tools, hooks, media providers. [doc-read] https://docs.openclaw.ai/plugins/building-plugins . Config: `~/.openclaw/openclaw.json` (JSON5; override `OPENCLAW_CONFIG_PATH`); workspace default `~/.openclaw/workspace`; state dir is `~/.openclaw` apparently [doc-read, state dir not stated explicitly] https://docs.openclaw.ai/gateway/configuration

## 10. Isolation

- **Hermes:** terminal backends: Local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox [readme-only]; `--worktree/-w` flag for CLI session and `delegation.worktree_isolation` for children [doc-read, CLI + delegation pages]; `--checkpoints` exists (meaning unread).
- **OpenClaw:** sandboxing off by default; backends Docker (default), Podman, SSH, OpenShell, Crabbox; modes/scope e.g. `mode: "non-main"`, `scope: "session"`, `workspaceAccess`; tools run on host for main session unless configured. [doc-read, index] https://docs.openclaw.ai/gateway/sandboxing . `sessions_spawn` has `worktree*` params [doc-read], but worktree mechanics not read [unknown]. `agent exec --isolated` exists [doc-read].

## Capability table (yes / no / partial / unknown)

| Capability | Hermes Agent | OpenClaw |
|---|---|---|
| Open SKILL.md standard | yes | yes |
| `skills` CLI agent id | yes: `hermes-agent` | yes: `openclaw` |
| Fresh-context subagents | yes | yes (`context` default fresh; `fork` optional) |
| Parallel subagents | yes (default 10) | yes (limit unknown) |
| Per-task subagent model | partial (global `delegation.model`, no per-task) | yes (`model` on spawn) |
| Headless one-shot, exit codes | yes (`-z`, `chat -q`) | yes (`agent`, `agent exec`) |
| Machine-readable output | yes (`stream-json`, `--usage-file`) | yes (`--json`) |
| Native structured human questions | partial (`clarify`, one question, <=4 choices [secondary]) | yes (`ask_user`, 1-3 questions, multiSelect) |
| Human asks reachable from subagents | no (leaf blocked) | no (main session only) |
| Chat surfaces (Telegram/WhatsApp) | yes | yes |
| Pre-tool hook that can block | yes | yes (`before_tool_call`) |
| Config-only (no code) hooks | yes (shell hooks) | no (plugin or HOOK.md handler code) |
| Stop-gate (veto end of turn) | unknown | unknown (`before_agent_finalize` unexplained) |
| Scheduling / cron | yes | yes |
| Agent can self-reschedule | no from cron sessions; otherwise unknown | unknown |
| Provider routing | yes | yes |
| Prompt caching | partial/unverified (official) | yes (documented, `cacheRetention`) |
| Token/cache usage reporting | partial (`--usage-file`, contents unseen) | yes in `/usage`; in `--json` unknown |
| Plugin packaging | yes (plugin.yaml + Python) | yes (npm + openclaw.plugin.json) |
| Bundle skills inside plugin | yes (`register_skill`) | yes (plugin skills, extraDirs) |
| Git worktree isolation | yes (`--worktree`, delegation flag) | partial (spawn params exist; docs unread) |
| Sandbox/container | yes (7 backends) | yes (Docker/Podman/SSH/...) |

## UNKNOWN / must verify before building the adapters
1. Whether either host has a hook that can block turn completion and force continuation (stop-gate). OpenClaw `before_agent_finalize` and Hermes finalize-type events are unread. Read https://docs.openclaw.ai/plugins/hooks/reference and the rest of the Hermes hooks page.
2. Hermes `clarify` exact schema (multi-question? multi-select?) from official docs; only a third-party source mirror was seen.
3. Hermes official prompt caching behaviour and `--usage-file` JSON schema (cache read/write fields).
4. OpenClaw: numeric subagent concurrency/depth limits; `ask_user` official page not fetched (only search snippet); whether `--json` contains token usage; worktree mechanics; cron schedule/payload pages; whether an agent can create its own wake-up job.
5. Whether `npx skills add ... -a hermes-agent` / `-a openclaw` actually installs correctly end-to-end (only the README table was read; not executed). Version of `skills` CLI that added these ids is unknown.
6. OpenClaw old names (Clawdbot/Moltbot) confirmed only by third-party lists.
7. Hermes headless run without a gateway/daemon: appears fine from CLI docs but untested; OpenClaw non-`--local` runs need the Gateway.
8. Hermes release cadence note: sources disagreed on version (v0.18, v0.21.5, v0.22.0) because they were written at different dates; GitHub API value above is authoritative for 2026-10-14.
9. Both projects change fast; flags above reflect docs on 2026-10-14.
