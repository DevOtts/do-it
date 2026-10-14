# 11 - Host CLI probe (claude / codex / opencode)

Probed 2026-10-14 on Darwin arm64, nvm node v22.23.2. Only `--version`, `--help`, `plugin validate` on a scratch manifest, `strings` over the binaries, and listing of config dir names were used. No model calls, no login. Auth file contents were not read.

Tags: [probed] = seen in help/validator/dir listing. [inferred] = from binary strings, naming, or the user's own config. Nothing was run end to end, so output shapes are not verified.

Versions [probed]: claude 2.1.300, codex-cli 0.156.1, opencode v2.0.18.
Note: opencode here is the v2 CLI, not the 1.x `opencode run --format json` most docs describe. Its help differs from older docs.

---------------------------------------------------------------------
## 1. Headless mode

### claude [probed]
- One-shot: `claude -p "<prompt>"` (`--print`). The workspace trust dialog is skipped in this mode. Settings files that fail validation are silently ignored.
- `--output-format text|json|stream-json`. `--input-format text|stream-json` (stream-json input allows realtime multi-turn over stdin). Also `--include-partial-messages`, `--include-hook-events`, `--replay-user-messages`, `--forward-subagent-text` (all stream-json only).
- `--json-schema <schema>` for structured output validation.
- Model: `--model <alias|full>`, with aliases such as sonnet, opus, fable. Also `--fallback-model a,b`, `--effort low|medium|high|xhigh|max`.
- Permission mode: `--permission-mode acceptEdits|auto|bypassPermissions|manual|dontAsk|plan`.
  - `--dangerously-skip-permissions` and `--allow-dangerously-skip-permissions` also exist.
  - `--permission-prompts host|none` (with `none`, anything that would prompt is auto-denied).
  - `--allowedTools` / `--disallowedTools` / `--tools`.
- Working dir: there is no `--cwd` flag on claude. The process cwd is used, plus `--add-dir <dirs...>`. `--worktree` exists (referenced by `--tmux`). `claude agents --cwd <path>` is only a filter for bg sessions.
- Resume: `-c/--continue` (latest in cwd), `-r/--resume [id]`, `--session-id <uuid>` (choose the id up front), `--fork-session`, `--from-pr`. `--no-session-persistence` (print only).
- Budget: `--max-budget-usd <amount>` (print only).
- Isolation: `--bare` (skips hooks, plugins sync, CLAUDE.md discovery, keychain; auth is strictly ANTHROPIC_API_KEY or apiKeyHelper), `--safe-mode`, `--restricted`, `--settings <file|json>`, `--setting-sources`, `--system-prompt`, `--append-system-prompt`, `--mcp-config`, `--strict-mcp-config`, `--plugin-dir <path|.zip>` (repeatable, session only), `--plugin-url`.
- Background sessions: `claude --bg`, `claude agents [--json] [--all]`, `attach`, `logs`, `stop`, `rm`, `respawn`.
- Exit codes: not documented in help. `claude plugin validate` documents exit 1 for `--strict` warnings. [inferred] Non-zero on error.

### codex [probed]
- One-shot: `codex exec [OPTIONS] [PROMPT]` (alias `codex e`). The prompt can be `-` or piped on stdin. If both are given, stdin is appended as a `<stdin>` block.
- Output: `--json` (JSONL events to stdout), `--output-schema <FILE>` (JSON Schema for the final response), `-o/--output-last-message <FILE>`, `--color`.
- Model: `-m/--model`, `-p/--profile` (layers `$CODEX_HOME/<name>.config.toml`), `-c key=value` TOML overrides (e.g. `-c model="..."`, `-c model_reasoning_effort=...`), `--oss --local-provider lmstudio|ollama`.
- Permission/sandbox: `-s/--sandbox read-only|workspace-write|danger-full-access`. Also `--approve-for-me` (auto-review approvals), `--dangerously-bypass-approvals-and-sandbox`, `--dangerously-bypass-hook-trust`, `--ignore-rules`, `--ignore-user-config`, `--strict-config`.
- Working dir: `-C/--cd <DIR>`, `--add-dir`, `--worktree` (managed git worktree), `--skip-git-repo-check`.
- Resume: `codex exec resume <id>|--last`, `codex exec fork <id>`, top-level `codex resume`, `fork`, `queue` (queue a message for an existing session). `--ephemeral` skips persistence.
- Exit codes: not in help. [inferred] Non-zero on failure.

### opencode [probed]
- One-shot: `opencode run [flags] [message...]`.
- Output: `--format default|json`. `--thinking` shows thinking blocks.
- Model: `-m/--model provider/model#variant`. `--agent <name>`. `opencode models` lists models.
- Permission: `--auto` ("auto-approve permissions that are not explicitly denied"). Permission rules also live in config as `permissions: [{action, resource, effect}]` (from the user's opencode.jsonc [probed]).
- Working dir: no flag on `run`. The top-level form is `opencode [flags] <directory>`. [inferred] Use the process cwd for `run`.
- Resume: `-c/--continue`, `-s/--session <id>`, `--fork`. `--title`, `-f/--file` to attach.
- Server model: runs through a background service by default. `--standalone` gives a private server, `--server <url>` connects to one. Also `opencode serve`, `acp` (Agent Client Protocol server), `api`, `session list|delete|export|import`. [probed]
- Exit codes: not documented.

---------------------------------------------------------------------
## 2. Token usage / cost in machine-readable output

- claude: yes. Binary strings contain `total_cost_usd`, `modelUsage`, `cache_creation_input_tokens` [inferred from strings; the field names are the known `result` event shape: `usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`, `total_cost_usd`, `modelUsage` per model, `duration_ms`, `num_turns`, `session_id`]. A real `--output-format json` run was not done, so the exact JSON is unverified. `--max-budget-usd` gives a hard cost cap.
- codex: tokens yes, cost no. Binary strings include `cached_input_tokens`, `reasoning_output_tokens`, and events `thread.started` / `turn.completed` [inferred]. Expected `turn.completed.usage = {input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`. No cost field was seen. No cache-write field was seen.
- opencode: tokens yes, cost yes via `opencode stats --cost --json` (and `--models`, `--tools`, `--days`, `--project`) [probed]. Strings show `tokens.cache` and `cache.read` [inferred], which fits the per-message `tokens{input,output,reasoning,cache{read,write}}` and `cost` shape. Whether `run --format json` emits them was not verified. `opencode session export` gives session JSON [probed], which is likely the reliable way to get per-message tokens and cost.

---------------------------------------------------------------------
## 3. Subagent / custom agent definitions

- claude: [probed] `--agents <json-or-file>` defines agents inline (example in help: `{"reviewer":{"description":"...","prompt":"..."}}`). `--agent <name>` runs the session as an agent. `plugin validate` checks "skills, agents, and commands in a directory". [inferred, standard Claude Code] Markdown files with YAML frontmatter at `~/.claude/agents/*.md` and `.claude/agents/*.md`. Frontmatter fields name, description, tools, model (per-agent model). Plugins ship `agents/*.md`. The Agent tool's `model` override is a per-call setting (seen in this session's tool schema). Note `claude agents` is NOT about definitions. It manages background sessions.
- codex: [probed] feature flags `multi_agent` (stable, true) and `multi_agent_v2` (stable, false). `codex agents` browses agent sessions on the app-server daemon. Binary string `.codex/agents` [inferred] suggests custom agent TOML files in `.codex/agents/` or `~/.codex/agents/`. The format and per-agent model were not verified. `agent_message_board` is under development.
- opencode: [probed] `run --agent <name>`. Config key `default_agent` ("build") in opencode.jsonc. [inferred] Agents defined in config or as markdown in `.opencode/agent(s)/`. The help for `opencode agent` was not exposed (the v2 CLI printed the root help for that subcommand, so it likely does not exist). Per-agent model: unknown/unverified.

---------------------------------------------------------------------
## 4. Hooks

- claude: [probed in ~/.claude/settings.json] a top-level `hooks` key (events used by this user: Notification, SessionStart, SessionEnd, Stop, PreToolUse). Event names found in the binary [inferred, strings]:
  - Tool and permission: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied.
  - Session and prompt: SessionStart, SessionEnd, Setup, UserPromptSubmit, UserPromptExpansion, Stop, StopFailure, Notification.
  - Subagent and task: SubagentStart, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle.
  - Context and config: PreCompact, PostCompact, InstructionsLoaded, ConfigChange, CwdChanged, FileChanged.
  - Misc: Elicitation, ElicitationResult, WorktreeCreate, WorktreeRemove.
  - Config locations: `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, `--settings`, and plugin-provided hooks. `--bare` / `--safe-mode` disable hooks. `--include-hook-events` streams them.
- codex: [probed] feature `hooks` (stable, true). `plugin_hooks` is "removed". Flag `--dangerously-bypass-hook-trust`, which implies hooks need persisted trust. Binary strings [inferred]: PreToolUse, PostToolUse, PermissionRequest, SessionStart, UserPromptSubmit, Stop, SubagentStop, PreCompact, and the file name `hooks.json`. Likely `~/.codex/hooks.json` or a `[hooks]` table in config.toml. Not verified.
- opencode: [inferred] No settings-style hooks. Hooks are in-process JS plugins (strings `.opencode/plugin(s)`, `tool.execute.before`, `session.idle`). `opencode plugin list|add|check|update|remove` [probed] manages npm-style plugins in global config. A Stop equivalent is `session.idle` event [inferred].

---------------------------------------------------------------------
## 5. Skills / plugin install story

### claude [probed]
- Skills dirs: `~/.claude/skills/<name>/SKILL.md` (this machine has many; some are symlinks), project `.claude/skills/`, plugin-bundled `skills/`. `claude plugin init|new <name>` scaffolds at `~/.claude/skills/<name>/` (auto-loads as `<name>@skills-dir`).
- Plugin commands: `install|i <plugin[@marketplace]> [--config k=v] [--json] [--accept-command <sha256>]`, `enable`, `disable`, `list`, `details <name>` (component inventory plus projected token cost), `configure`, `eval`, `marketplace`, `prune|autoremove [--dry-run] [-y] [-s user|project|local]`, `tag` (creates `{name}--v{version}` git tag; checks plugin.json against the marketplace entry), `validate <path> [--json] [--strict]`.
- Plugin install locations: `~/.claude/plugins/{marketplaces,cache/<marketplace>/<plugin>/<version>}`. `enabledPlugins` and `extraKnownMarketplaces` live in settings.json.
- Manifest: `.claude-plugin/plugin.json`. Schema URL used by the user's plugins: `https://json.schemastore.org/claude-code-plugin-manifest.json`. Fields seen in local examples: name, version, description, author{name,url}, homepage, repository, license, keywords. Validator also knows `userConfig` (via `--config`) and a type-contract path field for "mods".
- **Can plugin.json declare dependencies on other plugins? YES [probed].**
  - Probe 1: manifest with `"dependencies":["other-plugin",{"name":"foo","version":"^1.0.0"}]` validated with no error and no "unknown field" warning. A control field `bogusfield` did produce "Unknown field ... ignores it at load time", so `dependencies` is a recognized field.
  - Probe 2: `"dependencies":"notarray"` failed with `path: dependencies, Invalid input: expected array, received string`. So it is an array.
  - Probe 3: `[{"name":"foo","version":"^1.0.0","marketplace":"m"}]` passed with no errors.
  - Binary strings [inferred]: "Dependency must be a plugin name, optionally qualified with @marketplace". "Dependency tags are resolved via git ls-remote" (so version ranges resolve against `{name}--v{version}` git tags created by `claude plugin tag`). The marketplace-side field `allowCrossMarketplaceDependenciesOn` exists (cross-marketplace deps are blocked unless the marketplace allows them).
  - Auto-install: "True when this plugin was pulled in as a dependency rather than installed explicitly. Auto-installed plugins are eligible for removal by the orphan sweep". `claude plugin prune` removes orphans.
  - Not verified end to end: the real install-time resolution (no installs were run) and the exact semver-range syntax. No local plugin.json in this machine's `~/.claude/plugins` or `~/Workspace/Devotts/*/plugins` currently uses `dependencies` (grep found none), so no real-world example.
- Marketplace manifest: `.claude-plugin/marketplace.json` [inferred, standard].

### codex [probed]
- `codex plugin add|list|remove|marketplace`; features `plugins`, `plugin_sharing`, `remote_plugin`, `skill_mcp_dependency_install` (stable, true), `skill_search` are on. `codex features list` shows `plugin_hooks` removed.
- Dirs: `~/.codex/skills` (contains `.system/` with imagegen, openai-docs, skill-creator, skill-installer, and also user skills like agency, build-it, parallel-lifecycle, prompt-it), `~/.codex/plugins` (cache, `.remote-plugin-install-staging`), `~/.codex/rules` (`default.rules`, execpolicy). Binary string `.agents/skills` [inferred] means the shared `~/.agents/skills` / repo `.agents/skills` is also scanned. `~/.agents/` exists here with `skills/` and `.skill-lock.json`.
- Plugin manifest format and plugin-to-plugin dependencies: unknown (not probed; no `codex plugin validate` exists). The `skill_mcp_dependency_install` flag suggests a skill can declare MCP dependencies, not plugin dependencies.

### opencode [probed/inferred]
- `opencode plugin list|add|check|update|remove` (adds to global config). Config `skills: ["<extra path>"]` adds skill sources. The user's config comment says `~/.claude/skills` and `~/.agents/skills` are auto-discovered (compat) [probed in the user's own comment, i.e. the user's claim, not verified here].
- Plugin manifest and plugin dependencies: unknown (npm-package style [inferred]).

---------------------------------------------------------------------
## 6. Native structured question tool

- claude: `AskUserQuestion` [inferred; string present in binary; also known tool]. In `-p` mode there is no human, so [inferred] the call is unavailable or auto-denied. `--permission-prompts host` routes prompts to the SDK host / `--permission-prompt-tool`. Hooks `Elicitation` / `ElicitationResult` exist for MCP elicitation.
- codex: `request_user_input` (92 string hits in the binary) [inferred]. Feature `default_mode_request_user_input` is "under development, false", so it is likely only available in Plan mode today. Behavior in `exec` unknown.
- opencode: strings show a `"question"` tool (33 hits) [inferred] and a `permissions` model. Not confirmed from help.

---------------------------------------------------------------------
## 7. Scheduling / self-wakeup

- claude: tool names `ScheduleWakeup`, `CronCreate`, `Monitor`, `SendMessage`, `TaskCreate` are in the binary [inferred]. Skills `loop` and `schedule` exist in this session (cloud routines, cron). `~/.claude/scheduled-tasks/` exists (names: ottimus-weekly-analisis, skill-inventory-weekly) [probed]. `claude --bg` plus `claude agents` give background sessions, and `respawn` restarts them. `--remote-control` and `--cloud` exist.
- codex: feature `goals` (stable, true) and `~/.codex/goals_1.sqlite` [probed] hint at persisted goals. `codex queue` queues a message for an existing session. `codex remote-control`, `app-server` daemon [probed]. No cron/wakeup tool seen. Scheduling semantics unknown.
- opencode: background `service` (always-on; `opencode service`, `reload`, `pair`) [probed], but no scheduler in help. `session.idle` event is a plugin hook point [inferred]. External cron plus `opencode run -c` would be the workaround.

---------------------------------------------------------------------
## 8. Config / state directories (names only)

- ~/.claude: backups, bridge-spawn, cache, chrome, commands, daemon, debug, downloads, feedback, file-history, hooks, ide, jobs, local-marketplaces, memory, paste-cache, plans, plugins, projects, scheduled-tasks, session-env, sessions, shell-snapshots, skills, skills-retired, state, tasks, teams, uploads; files CLAUDE.md, settings.json (+ .local, many .bak), mcp.json, history.jsonl, stats-cache.json. Also `~/.claude.json`, and sibling profile dirs `.claude-8fai`, `.claude-8ftools`, `.claude-anm`, `.claude-loudr` (multiple subscriptions). [probed]
- ~/.codex: skills, plugins, rules, sessions, cache, log, packages, shell_snapshots, tmp, app-server-daemon, app-server-control; files config.toml, auth.json (not read), history.jsonl, session_index.jsonl, models_cache.json, sqlite stores (goals, logs, memories, queue, state, thread_history). `CODEX_HOME` overrides. [probed]
- ~/.config/opencode: opencode.jsonc, AGENTS.md (symlink to ~/.claude/CLAUDE.md, so it reads the same global instructions), service.json. State in ~/.local/share/opencode: opencode.db (sqlite), log, repos, shell, snapshot, tool-output. [probed]
- ~/.agents: skills/, .skill-lock.json, skills.json (shared skills dir). [probed]
- Security note: the user's `~/.config/opencode/opencode.jsonc` embeds a plaintext Notion bearer token and other env values inline in the MCP block. I saw it by accident while sampling the file and did not copy it here. Worth moving to env vars.

---------------------------------------------------------------------
## Capability x host table

| Capability | claude | codex | opencode |
|---|---|---|---|
| Headless one-shot | yes (`-p`) | yes (`exec`) | yes (`run`) |
| JSON / stream output | yes (json, stream-json) | yes (`--json` JSONL) | partial (`--format json`, shape unverified) |
| Structured final output schema | yes (`--json-schema`) | yes (`--output-schema`) | unknown |
| Model flag | yes | yes | yes (provider/model#variant) |
| Permission flag | yes (`--permission-mode`) | yes (`--sandbox`, approvals flags) | partial (`--auto` plus config rules) |
| Working-dir flag | partial (`--add-dir`, `--worktree`, no cwd flag) | yes (`-C`) | partial (dir arg on root cmd only) |
| Resume session | yes | yes | yes |
| Pick own session id | yes (`--session-id`) | unknown | unknown |
| Tokens in output | yes [inferred] | yes, no cache-write [inferred] | partial (stats / export) |
| Cost in output | yes [inferred] | no | yes (`stats --cost`, per-message [inferred]) |
| Hard budget cap | yes (`--max-budget-usd`) | no | no |
| Custom subagents | yes | partial (multi_agent, `.codex/agents` [inferred]) | partial (`--agent`, config) |
| Per-agent model | yes [inferred] | unknown | unknown |
| Hooks | yes (about 28 events) | yes (about 8 events [inferred]) | partial (JS plugin events) |
| Skills dir | yes (`~/.claude/skills`) | yes (`~/.codex/skills`, `.agents/skills`) | yes (auto-reads claude and agents dirs per user config) |
| Plugin install CLI | yes | yes | yes |
| plugin.json declares plugin deps | yes [probed] | unknown | unknown |
| Native question tool | yes (AskUserQuestion) [inferred] | partial (`request_user_input`, gated) | partial (`question` [inferred]) |
| Self-wakeup / scheduler | yes (ScheduleWakeup, Cron, --bg) [inferred] | partial (goals, queue) | no (service only) |
| Reads CLAUDE.md-style instructions | yes | yes (AGENTS.md) | yes (AGENTS.md, symlinked here) |

---------------------------------------------------------------------
## Unknowns (not resolvable without model calls, login, or deeper docs)

1. Exact JSON shape of claude `--output-format json|stream-json` result and codex `--json` `turn.completed.usage`, and whether opencode `run --format json` includes tokens or cost. This needs one real paid run to verify.
2. Documented exit codes for all three CLIs.
3. Whether `AskUserQuestion` / `request_user_input` / `question` work or fail cleanly in non-interactive mode.
4. Install-time resolution of claude plugin `dependencies`: semver range syntax, behavior on a missing dependency, and cross-marketplace rules. Only schema acceptance was probed.
5. Codex custom agent file format (`.codex/agents`), per-agent model, and exact hooks config file and event list. Codex plugin manifest format and any dependency field.
6. opencode agent definition format, per-agent model, plugin manifest, and whether `opencode agent` is a real subcommand in v2 (help fell through to root).
7. Whether claude has any working-dir flag other than process cwd (none in help) and how the Agent/subagent tool inherits cwd.
8. Scheduling: whether codex `goals` can wake a session by time. Whether claude `ScheduleWakeup` works in `-p` / `--bg` sessions or only interactive ones.
9. Skill discovery precedence if the same skill name exists in `~/.claude/skills`, `~/.agents/skills`, and `~/.codex/skills`. On this machine many are symlinks to `~/.claude/skills`, so duplicates may collapse.
10. Behavior of `--bare` (no keychain/OAuth) for subscription-auth users. It requires an API key, which matters for billing.
