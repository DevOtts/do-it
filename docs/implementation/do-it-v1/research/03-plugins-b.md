# 03 - Back-half lifecycle: integration contract for `do-it`

Scope: review-it, conclude-it, parallel-lifecycle, master-loop (overview), engine-deploy, deploy-router, reconcile-it.
Read 2026-10-14. All paths absolute. "Headless" = invoked by do-it with no human in the loop and a parseable result.

Roots:
- RI  = /Users/macbook/Workspace/Devotts/review-it
- CI  = /Users/macbook/Workspace/Devotts/conclude-it
- PL  = /Users/macbook/Workspace/Devotts/parallel-lifecycle
- ML  = /Users/macbook/Workspace/Devotts/master-loop
- ED  = /Users/macbook/Workspace/Engine/Engine-Core/.claude/skills/engine-deploy  (script: /Users/macbook/Workspace/Engine/Engine-Core/scripts/engine-deploy.sh + scripts/engine-deploy/*)
- DR  = /Users/macbook/.claude/skills/deploy-router
- RC  = /Users/macbook/.claude/skills/reconcile-it

## 0. Cross-cutting observations (read first)

1. **Nothing in the back half emits a machine-readable result today**, except `engine-deploy.sh` (LEG lines + `RESULT` + exit code + `run.json`) and `lock.sh`/`detect.sh` (JSON + exit codes). review-it, conclude-it, reconcile-it, deploy-router's SKILL are all prose protocols whose "output" is markdown/HTML written for a human. do-it must add a thin result envelope (section 9).
2. **Only 3 of 7 are plugins** (review-it, conclude-it, parallel-lifecycle). Each uses the same layout: repo root has `.claude-plugin/marketplace.json` (marketplace name `devotts`, `source: ./plugins/<name>`), `plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/skills/<skill>/SKILL.md`. A second root-level `SKILL.md` exists in review-it/conclude-it/parallel-lifecycle for `npx skills add` (non-Claude hosts). engine-deploy, deploy-router, reconcile-it are loose skills (engine-deploy is project-scoped in Engine-Core; the other two are in `~/.claude/skills`).
3. **Host-agnostic vs Claude-specific split is consistent**: the *protocol* (gates, vocabularies, report schema) is host-agnostic prose; the Claude-specific parts are: subagent spawning + model names (haiku/sonnet/opus), `/rename`, `ListAgents`/`SendMessage` (deploy-router), `${CLAUDE_PLUGIN_ROOT}` hooks (parallel-lifecycle), `$CLAUDE_CODE_SESSION_ID`, `.claude/review-config.md`, `build-it:*` namespaced routing names.
4. **Namespacing hazard**: review-it routes to `build-it:full-qa`, `build-it:iterate`, `build-it:chrome-cdp-control` (plugin-qualified) while conclude-it/reconcile-it say `/full-qa`, `/iterate` (unqualified, user-level skills). do-it must resolve which exists.
5. **Handoff is by convention + files, not by contract**: build-it writes `.taskstate/evidence.md` (ledger) and `.build-it-reports/`; review-it reads DoD/Test Contract and writes `.review-it/` OR appends into build-it's `.taskstate/evidence.md`; conclude-it reads "gate results + evidence" from the session itself (conversation memory), not from a file. That last link is the weakest.
6. **Human gates inventory** (all must become either auto-policy or a structured `needs_human` result in do-it):
   review-it: DERIVED-case confirm (Step 3c), credential ops, human-reserved prod actions (R4 BLOCK).
   conclude-it: first-run 5-question setup interview, ambiguous ship intent ("conclude or just close?"), epic ambiguity (S0), archive-convention ask (S4), irreversible prod steps.
   deploy-router: dispute/tie on urgency goes to Fernando; 5-min peer wait.
   engine-deploy: none inside the script except hard FAILs; the human rules are in SKILL.md (never push main, `0 to destroy`).
   reconcile-it: Phase 3 fail-closed approval (the whole point).
   master-loop: Slack escalation on HARD_GATE/novel.

---

## 1. review-it  (plugin, v1.0.0, MIT, DevOtts)

**Purpose/trigger.** Verification leg of plan -> build -> review. Four modes: contract-qa (PRIMARY), side-effects, deploy-verify, pr-review. Triggers: "/review-it", "verify the build", "run the test contract", "review this PR", "verify this deploy", or "when build-it reaches its QA phase" (front-door SKILL.md frontmatter). Files: `RI/plugins/review-it/skills/review-it/SKILL.md` (front door), sibling skills `skills/{deploy-verify,pr-review,side-effects}/SKILL.md`, `skills/references/{gate-catalog,report-format,vocabularies,authoring-standards,ci-gate-guidance}.md`.

**Inputs.** One `<target>` string; mode is inferred (Step 1 table): contract path / feature dir / PR ref / "staging"|"prod". Implicit inputs it hunts for (Step 3a ladder, priority order): plan-it Test Contract (`qa/test-plan*.md`) > plan-it DoDs+goals > build-it DoD/evidence ledger > PRD/epic acceptance criteria > PR/issue/commit text. pr-review additionally reads `.claude/review-config.md` in the consumer repo. Worktrees: reads `.env.worktree` (parallel-lifecycle contract).

**Outputs/paths.**
- Report in the schema of `RI/plugins/review-it/skills/references/report-format.md`, written to `<consumer repo>/.review-it/` (standalone) or appended as ledger rows to `.taskstate/evidence.md` (+ `.build-it-reports/`) when conducted by build-it. NOTE: the exact report filename is NOT specified anywhere (only the directory). Gap.
- `qa/test-plan-derived.md` persisted in consumer repo when oracle was DERIVED (Step 3e).
- Evidence ledger row schema: `| ts | criterion/case | command | quoted output | verdict |`.
- Deploy-verify adds `READY / NOT-READY`; pr-review adds `APPROVE (advisories attached)` / `REQUEST-CHANGES` with BLOCKER/MAJOR/MINOR/NIT findings.

**State files.** None of its own besides `.review-it/` reports. Relies on build-it `.taskstate/`. No resumability file - a run is one pass.

**Gates / exit codes.** 11-rule gate catalog R1-R11 (`references/gate-catalog.md`), plus closed status vocab (`vocabularies.md`): PASS / FAIL / IMPLEMENTED-NOT-VERIFIED(+blocker temporary|structural) / SKIP-no-script / SKIP-out-of-scope / BLOCK / INV-in-UI. Oracle tags AUTHORED / DERIVED / DERIVED-UNCONFIRMED. Tier model: Tier0 may block PRs, Tier1 report-only, Tier2 [REAL] never blocks. **No exit code, no machine verdict** - the verdict is whatever is in the markdown. DoD = "100% PASS or honest INV".

**Human decision points.** (a) Step 3c "present derived cases for quick human ack" - skipped under autonomy by stamping `DERIVED-UNCONFIRMED`. (b) Credential operations always human-gated. (c) R4 human-reserved live actions emit BLOCK. (d) Deploy-verify: Tier-2 INVs "force an honest row and a human decision".

**Subagents / model tiering.** Does not hard-code models. Routes by *row shape* to named skills (`build-it:full-qa` UI, `build-it:iterate` fix loops, `build-it:chrome-cdp-control`, `make-eval` LLM evals, `parallel-lifecycle` isolation). Fresh-context verifier (R7) is a subagent with NO run conversation, given only DoD + draft report + ledger + screenshot dir; prompt text is in `report-format.md` section 4. Hosts without subagents: same checklist as a separate pass. No tier table, so do-it must impose one (suggest: sonnet executor rows, opus or sonnet verifier; haiku only with quirk-sheets per R6).

**Packaging.** `RI/.claude-plugin/marketplace.json` (name `devotts`, also lists `prompt-it` from github `DevOtts/prompt-it`), `RI/plugins/review-it/.claude-plugin/plugin.json` (v1.0.0, name review-it, author DevOtts). Root `RI/SKILL.md` for npx skills. Metadata claims platforms `[claude-code, cursor, openclaw, mcp, openai]`. Claude-specific: `build-it:` namespaced routing, subagent verifier, Skill-tool invocation. Host-agnostic: gates, vocab, report schema, no-contract ladder.

**Engine-specific / to abstract.** Mostly clean. Residue: R1 examples are Airtable-specific (fine as examples); `.claude/review-config.md` "first instance: Engine-Core's absorbed review-pr checklist" (`/Users/macbook/Workspace/Engine/Engine-Core/.claude/review-config.md` exists, 3.3K); deploy-verify checklist items (rollback/monitoring/flags/migrations/credentials) are generic but have no target-resolution - it has no idea how to curl "prod" for a given project. **deploy-verify needs the deploy adapter's `verify_targets` (route/marker/digest) to run the ladder** - this is the main seam to deploy-it.

**Handoff in/out.** In: build-it (DoD + `.taskstate/evidence.md`) and plan-it (`qa/test-plan*.md` Test Contract, `delivery/TEST-CONTRACT-REVIEW.md` exists in repo as example). Out: prompt-it Mode 2 reads review-it findings to generate continuation prompt; conclude-it S1 re-runs its own local gate (duplicates review-it contract-qa; no explicit "review-it passed" token consumed). Gap: conclude-it never reads `.review-it/` report.

**Gaps.** (1) No stable report filename / no JSON. (2) No exit code. (3) Verdict statuses not mapped to a single gate boolean. (4) DERIVED-confirm is interactive with no headless policy other than the stamp. (5) "Declared vs counted" tally has no parseable form. (6) Skill names `build-it:*` hard-coded.

**Changes for headless do-it.** Add `--json` / always write `.review-it/result.json`:
```
{ "schema":"review-it/1", "mode":"contract-qa|deploy-verify|pr-review|side-effects|sequence",
  "target":"...", "preflight":{"repo","branch","sha","dirty","app_identity"},
  "oracle":"AUTHORED|DERIVED|DERIVED-UNCONFIRMED", "contract":{"path","declared":N,"counted":N},
  "rows":[{"id","oracle","status","evidence_ref","blocker":{"name","kind":"temporary|structural"}|null}],
  "totals":{"PASS":n,"FAIL":n,"INV":n,"SKIP":n,"BLOCK":n},
  "verdict":"GREEN|RED|INV-ONLY|BLOCKED",           // GREEN = no FAIL, no DERIVED-as-verified, challenges resolved
  "release_verdict":"READY|NOT-READY"|null,         // deploy-verify
  "pr_verdict":"APPROVE|REQUEST-CHANGES"|null,
  "challenges":[...], "accepted_gaps":[...], "report_path":"...", "needs_human":[{"kind","question"}] }
```
Exit: 0 GREEN, 1 FAIL/RED, 2 could-not-run, 3 needs_human (BLOCK/DERIVED-unconfirmed under a strict policy). Add an input param `--unattended` that pre-decides Step 3c = proceed + stamp, and `--verify-targets <json>` (from deploy adapter) so deploy-verify needs no inference.

---

## 2. conclude-it  (plugin, v1.1.0, MIT)

**Purpose/trigger.** Single front door for every session close; if the session is ship-shaped it runs the ship pipeline first. Triggers: "conclude", "/conclude-it", "exit", "wrap up", "ship it and close", "is it safe to exit". Files: `CI/plugins/conclude-it/skills/conclude-it/SKILL.md` (23K), `references/ship-pipeline.md` (S0-S7), `build-report.py`, `report-template.html`; bundled `skills/session-debrief/SKILL.md`.

**Inputs.** Session context (conversation + git state). Per-repo config block `## conclude-it — project setup` read from `CLAUDE.md` > `AGENTS.md` > `.conclude-it/config.md`, keys: `docs_home, second_brain, second_brain_scope, second_brain_notes, deploy_skill, debrief_skill, configured`. **`deploy_skill` is the seam where do-it/deploy-it plugs in**: ship-pipeline S2 "Deploy via the `deploy_skill` named in the setup block". Env: `$CLAUDE_CONFIG_DIR` (alias), `$CLAUDE_CODE_SESSION_ID` (ledger card).

**Outputs/paths.**
- Ledger card: `<repo>/.agents/history/<alias>/YYYY-MM-DD--<session-name>.md` (<=40 lines, frontmatter session/alias/session_id/project/cwd/date/status/tags) + one row in `<repo>/.agents/history/INDEX.md`; optional mirror to global vault `~/Workspace/Vault/OttVault/history_sessions/` (per user CLAUDE.md).
- `CONCLUDE_REPORT.html` (ship path only) at `<docs>/implementation/0-done/<epic>/` post-archive; rendered by `python3 build-report.py <manifest.json> --open` from a JSON manifest (shape in script docstring).
- Archive move: `docs/implementation/<epic>/` -> `docs/implementation/0-done/<epic>/` via `git mv`.
- Backlog notes in `docs/implementation/*backlog*` (each naming originating `done-<name>` session).
- Debrief pages in docs_home / vault.
- Final verdict text block ("Conclude-it Report" with Gates table GREEN/RED/UNVERIFIED).

**State files.** Setup block in CLAUDE.md; ledger INDEX. No run-state/resume file for the ship pipeline (gap: a crash mid-S2 has no checkpoint).

**Gates / exit codes.** Fail-closed ship gates: S1 local tests+e2e GREEN (or explicit "no local suite - unverified"), S3 prod gate GREEN (or "prod unverified - why", closes as deployed-but-unverified, not done). Gate vocabulary: GREEN / RED / UNVERIFIED (different from review-it's vocab - mismatch). Verdict: "Safe to exit" vs "Not yet" / "Not fully concluded". No exit codes.

**Human decision points.** First-run 5-question interview (once per repo). Step 0 ambiguity question. S0 which epic. S4 archive ask. Step 3: if anything mid-flight -> STOP and let user decide. Irreversible prod actions need explicit yes. Step 6: "Then STOP. Do not run the quit command".

**Subagents / tiering.** Explicit table: Main = triage/intent/verdict/deploy decision/gate declarations; mid-tier verifier for S1/S3; small-model for archive, backlog filing, PM flip, ledger-card mechanics, sweeps, manifest authoring; Step 4 reaping is Main-only (TaskStop). Rule: coordinator reads evidence, never accepts subagent "done". Generic ("small-model"/"mid-tier"/"top tier") not literal names - good, host-portable.

**Packaging.** `CI/.claude-plugin/marketplace.json` (name devotts) + `CI/plugins/conclude-it/.claude-plugin/plugin.json` v1.1.0. Root `CI/SKILL.md` for npx. Claude-specific: `/rename done-*`, TaskStop reaping, `$CLAUDE_CODE_SESSION_ID`, ListAgents for controlled-sessions check. Host-agnostic: ship pipeline logic, ledger card format, footprint-sweep rules, report builder (pure python).

**Engine-specific.** Plugin itself is clean (deploy skill is a config pointer; deploy-router/engine-deploy not named). Residue: the user's global CLAUDE.md ledger layout is Fernando-specific (`~/Workspace/Vault/OttVault/history_sessions/`) but read from config. Footprint sweep's "files on remote hosts / pods" is generic.

**Handoff in/out.** In: build-it DoD met (signal 3) or review-it done (implicit). Out: terminal stage. Calls `/full-qa`, `/iterate`, `<deploy_skill>`, `<debrief_skill>`. Overlap/seam to resolve for do-it: **S1 local gate duplicates review-it contract-qa; S2-S3 duplicate deploy-it + review-it deploy-verify; S4-S7 + Step 2-6 are the unique "close" value.** Recommendation: do-it calls review-it and deploy-it itself, then calls conclude-it in a **"close-only" mode that takes the gate results as input** instead of re-running S1-S3.

**Gaps.** (1) No input channel for pre-computed gate evidence (reads session memory). (2) No close-only flag (Step 0 is mechanical triage from session signals; headless do-it would need to assert ship-shaped=false or pass evidence). (3) Setup interview blocks headless first run - needs `--config` or pre-seeded block. (4) Gate vocab GREEN/RED/UNVERIFIED vs review-it PASS/FAIL/INV. (5) No machine-readable verdict; HTML manifest is the only structured artifact and it is render-input, not a result. (6) Does not assert it is not run inside a subagent (Step 4 TaskStop is coordinator-only).

**Changes for headless.** Add mode contract: `conclude-it --headless --config <json> --evidence <json>`: (a) skip interview if block present else fail with `needs_human`; (b) accept `{gates:[{id,result,evidence}], shipped:{deploy,merged}, epic, repos}` and skip S1-S3 when provided; (c) emit `.conclude-it/result.json`: `{schema:"conclude-it/1", ship_path:bool, verdict:"SAFE_TO_EXIT|NOT_YET|NOT_FULLY_CONCLUDED", ledger_card:path, index_row:bool, archived:[paths], backlog_notes:[paths], report_html:path|null, debrief:{pages, contradictions_swept:N}, footprint:{removed,left:[{item,why}],secrets_at_rest_verified:bool}, mid_flight:[...], needs_human:[...]}`; exit 0/1/3 as above. The manifest for build-report.py can be generated directly from this JSON.

---

## 3. parallel-lifecycle  (plugin, v0.1.0)

**Purpose/trigger.** Per-git-worktree isolated env (app port, ephemeral headless Chrome/CDP, optional DB) behind one `.env.worktree` contract so N parallel sessions don't collide. Skill triggers: "test this feature", "run the e2e", "test this worktree". Files: `PL/plugins/parallel-lifecycle/skills/parallel-lifecycle/SKILL.md`, `scripts/connect.py`, `hooks/{hooks.json,worktree-bootstrap.sh,worktree-teardown.sh}`, `PL/docs/architecture.md`, `PL/references/SESSION-CONTEXT.md`.

**Inputs.** cwd being a *linked* worktree (git-dir != git-common-dir). Env: `WT_CHROME`, `WT_HEADED`.

**Outputs/paths.** `<worktree>/.env.worktree` (APP_PORT, PORT, CDP_PORT, CDP_URL, DB_PORT, DATABASE_URL, WT_NAME) = the contract; `<worktree>/.wt/state` (CDP_PID etc.), `.wt/chrome/` profile. Neither is to be committed.

**State.** `.wt/state` (teardown + idempotency).

**Gates.** None / hard rules only (never hit :9222, never hardcode ports, never share DB). Hook exit 0 always (no-ops outside worktrees).

**Human points.** None (authenticated flows use a pre-exported storageState at `~/.config/wt-auth/app.json`, one-time human export).

**Subagents.** None; mechanical = hooks (deterministic, zero model discretion). Skill is workflow only.

**Packaging.** `PL/.claude-plugin/marketplace.json` (name parallel-lifecycle, standalone) + `plugin.json` v0.1.0; hooks via `${CLAUDE_PLUGIN_ROOT}` (SessionStart `startup|resume`, SessionEnd). **Heavily Claude-specific for provisioning** (hook events); contract file + connect.py are host-agnostic. macOS Chrome path hard-coded default.

**Engine-specific.** None. Assumption: Node (free_port uses `node -e`), Playwright, Postgres-shaped DATABASE_URL (DB provisioning is commented-out / "planned").

**Handoff.** Layer under review-it (R9 preflight reads `.env.worktree`) and build-it parallel squads. Downstream of nothing; do-it should invoke it at *worktree creation* time (front of the pipeline), not the back half. Teardown on SessionEnd kills Chrome; **DB is on the branch clock and is NOT dropped** (cleanup gap: nothing drops it on worktree remove; reconcile-it prunes worktrees but does not call a teardown).

**Gaps.** (1) SessionStart hook only fires for the session *started in* the worktree - a do-it orchestrator creating worktrees for subagents must run `worktree-bootstrap.sh` explicitly (cwd = worktree) - that works since the script keys off cwd but is undocumented for that use. (2) DB isolation unimplemented. (3) No "status --json" command. (4) teardown not wired to `WorktreeRemove`. (5) SKILL tells model to read `.env.worktree` by hand; a one-line `wt-env --json` would help.

**Changes for do-it.** Document/ship `scripts/wt-ensure.sh <worktree-path>` (= run bootstrap with cwd) printing the `.env.worktree` as JSON; add `wt-status`; wire teardown into worktree removal and into reconcile-it Phase 4 step 3.

---

## 4. master-loop  (overview only; private TS app, v0.1.0, not a plugin)

**What it is.** `ML/README.md`, `ML/CLAUDE.md`, `ML/docs/SPEC.md`. "The Conductor": Node>=20/pnpm TypeScript app on the Claude Agent SDK, authed with `CLAUDE_CODE_OAUTH_TOKEN` (never `--bare`/metered). It ticks (`pnpm conductor tick [--execute] [--sdk] [--no-slack] [--repos=a,b]`, `status`), drives worker loops as resumable sessions, intercepts `canUseTool`, predicts Fernando's decision (logged first), auto-allows learned-safe, escalates novel/hard-gate to Slack and blocks on reply (timeout -> parked). Only worker today: `src/workers/worktree-janitor.ts` (classify worktree: shipped-clean/dirty/unmerged-clean/novel). pr-babysitter and deploy-gate are v1 roadmap. Worker model default `claude-haiku-4-5` (`src/config.ts` `WORKER_MODEL`).

**State/paths.** `ML/data/{manifest.json (the bus: items with four-color state QUIET/HUMAN/BLOCKED/CHANGE), sessions.json, ledger.db (SQLite predicted-vs-actual), profile.json}`, `ML/memory/{Decision Profile.md, Ally Journal.md}` (MEMORY_DIR to be redirected to vault `wiki/entities/projects/conductor/`). Types in `ML/src/types.ts` (State, Manifest, PolicyOutcome, SessionRecord).

**Relation to do-it.** master-loop is the *attention/escalation layer* that overlaps do-it's orchestration role but at portfolio scale (many repos/sessions). It is NOT a stage. Useful reusable contract: the four-state enum, `manifest.json` item shape, `HARD_GATE` domains list ("multi-tenant migrations, secret rotation, auth/banking/customer data, deploy-on-red-CI never graduate to AUTO") = a ready-made **human-gate policy table** do-it can adopt for `needs_human`. Hard-gate "deploy-on-red-CI" aligns with engine-deploy fail-closed.

**Engine/Fernando-specific.** Slack, Decision Profile of Fernando, bot git author, vault paths in CLAUDE.md. Cannot be a generic plugin as-is. Gaps: v1 `deploy-gate` and `pr-babysitter` not built; no plugin packaging; no headless result contract for external callers (CLI prints human logs; `status` prints JSON stats only).

**Recommendation.** do-it should treat master-loop as an optional *escalation sink*: do-it's `needs_human[]` records can be posted into master-loop's manifest (`PendingDecision`) instead of building a second Slack path. Keep out of v1.

---

## 5. engine-deploy  (project skill + 73K bash script; Engine-Core only)

**Purpose/trigger.** Ship a feature in any Engine-Core service repo: branch -> PR -> squash-merge -> local image build+push to ghcr -> mandatory boot smoke -> digest-pin in box `tenants.json` + targeted terraform apply per tenant -> verify legs a-e -> merge audit -> report. Triggers: "/engine-deploy", "ship this", "deploy this", "push to prod", after finishing a feature in brain-admin-ui / brain-api-core / brain-connectors / brain-agent / processor / brain-browser-agent. Files: `ED/SKILL.md` (20K, lean runbook), `ED/references/steps.md` (86K, procedure), `ED/references/gotchas.md` (122K, indexed by step), `ED/references/lossless-check.py`; script `/Users/macbook/Workspace/Engine/Engine-Core/scripts/engine-deploy.sh` + `scripts/engine-deploy/{fleet.sh,mutex.sh,plan_gate.py,registry.py,remote-build.sh,remote-tf.sh,box-ssh.sh,runlog.py,gateway-schema-check.py,required-variants.json}`; agents `/Users/macbook/Workspace/Engine/Engine-Core/.claude/agents/{engine-reporter(haiku),engine-verifier(sonnet)}.md`.

**Inputs (script).** Subcommands `verify|plan|build|deploy|fleet|rollback`. Flags: `--repo`, `--sha`, `--tenants a,b` (default = key set of BOX tenants.json), `--owner "<router title>"` (lane + lock owner), `--no-router`, `--gate-evidence "<text>"`, `--dry-run`, `--allow-live-runs`, `--digest sha256:`, `--no-reuse`, `--no-push`, `--build-arg`/`--tag-suffix` (variants), `--keep-image` + `--allow-env-add|change|remove NAME`, `--allow-restarted-at`, `--allow-env-reorder`, fleet: `--services repo@sha,... --canary --order 'x<y' --soak --build-concurrency --requeue-max-min --session`; rollback: `--run <id|dir> --tenant --force`. Env: `ENGINE_BOX_SSH_KEY`, `EDS_TEST_*` (test hooks), `ENGINE_DEPLOY_{BUILD_TIMEOUT,TF_TIMEOUT,POLL_S}`, `DEPLOY_ROUTER_LOCK_SH`, `CLAUDE_SESSION_ID`. Creds read at runtime from `/Users/macbook/Workspace/Engine/Engine-Core/.secrets/.full.credentials`.

**Outputs.** stdout: one line per leg `LEG <id> <tenant|-> <PASS|FAIL|SKIP> <detail>` (fleet adds `svc=<repo>` first in detail), then `RESULT <PASS|FAIL>` (`deploy --dry-run` prints `RESULT PASS (dry-run)`). **Exit: 0 PASS, 1 FAIL, 2 usage/could-not-run.** A SKIP of a required leg counts against RESULT. Run log: `/Users/macbook/Workspace/Engine/Engine-Core/.taskstate/<lane>/deploy/<run-id>/{summary.log, run.json}` - run.json schema 1 (`run_id, lane, owner, cmd, repo, services[], tenants[], sha, started, ended, result, exit, image{name,tag,digest,source}, prev_pins{}, legs[{id,tenant,verdict,phase,start,end,detail,svc?}]`, atomic via flock; plus `fleet` block). Legs: gate, main, reuse, latest, build, smoke, spec-parity, pin, plan, apply, a (pod imageID == digest), b (spec parity), c (re-plan "No changes"), d (live-runs/drain), e (gateway-contract-probe, mandatory for brain-agent/gateway). Rollback line printed per passed tenant. Also PR links, merge audit (manual in SKILL step 8-9, not in script).

**State.** run.json (audit); box `tenants.json` (truth); ghcr image labels (`org.opencontainers.image.revision`, `io.engine.deploy.builder`, `io.engine.deploy.variant`); box tf flock `$TF_DIR/.engine-deploy.tf.flock`; deploy-router locks + apply-mutex (script claims/refreshes/releases apply-mutex itself, owner by session id).

**Gates.** Fail-closed list: (1.7) pre-deploy test gate (brain-agent `scripts/gate/run.sh --commit <sha> --require T1`, stamp-reused; others: repo `scripts/pre-push.sh` + operator evidence via `--gate-evidence`); sha must == origin/main (hard FAIL, no override); required variants (`required-variants.json`, fernando-ott/her0 admin-ui = p2plive; `--allow-variant-drop` escape); boot smoke (`scripts/boot-smoke.sh`); spec-parity (box module md5 == merged main); plan gate `0 to destroy` + image-only (`plan_gate.py`); verify a-e; router lock presence (refuses without lock unless `--no-router`). Hard rules in SKILL: never push main, never whole-tenant apply, secrets never echoed/staged, brain-agent = 3 deployments, GitHub Actions billing-blocked (local gate IS merge gate).

**Human decision points.** In the script: none interactive (explicit flags; `--dry-run` first recommended). In SKILL: canary order, whether to ship foreign "riding along" commits, `-p2plive` variant choice, sha != origin/main resolution (rebuild or wait), destructive prod steps. Tenant-set drift handled by deploy-router (stopped-tenant-set-drift).

**Subagents/tiering.** Explicit table in `ED/SKILL.md`: engine-reporter (haiku) = read-only gather (preflight, digests, tenant map, merge audit); engine-verifier (sonnet) = runs REAL suites + boot smoke + verify smoke, returns counts; Main (top model) owns every outward action (merge, push, apply) and *declares* gates. Subagents: "may NOT deploy/merge/push/apply". Script runs with `run_in_background`; poll via completion notification/Monitor.

**Packaging.** Project-local skill (`Engine-Core/.claude/skills/engine-deploy/`), no plugin.json, no marketplace. Pure Claude-skill + a repo-relative script; the script has hard-coded `WS=/Users/macbook/Workspace/Engine/Engine-Core`.

**ENGINE-SPECIFIC (must move behind the deploy adapter).** Enumerated with the source of each:
- Hosts: tenants box `167.86.98.85` (`TENANTS_BOX`), build/apps box `75.119.153.239` (`BUILD_BOX`), old frozen `87.99.131.192` (SKILL frontmatter).
- Paths: workspace `/Users/macbook/Workspace/Engine/Engine-Core`, `TF_DIR=/opt/processor/infrastructure/terraform`, `MODULE_TF=infrastructure/terraform/modules/tenant-stack/main.tf`, box `tenants.json`, `.secrets/.full.credentials` (key names like `new_contabo_vps_tenants`).
- Registry: `ghcr.io/engine-hq/<image>`, GHCR_TOKEN.
- Repo map (SKILL step 1 + script "repo map"): brain-agent(+brain-mcp-gateway+brain-runner), brain-api-core, brain-admin-ui, brain-connectors(+connectors-worker), brain-handson-agent, brain-browser-agent, claude-cli-runner; processor.
- Tenants: praxya, fernando-ott, her0 (canary fernando-ott -> praxya); `required-variants.json` per-tenant build variants; master-admin excluded (apps-box compose plane).
- Mechanisms: Kubernetes (k3s) deployments, terraform tenant-stack module with digest pin in tenants.json, `0 to destroy` plan gate, on-box nohup build, boot-smoke.sh, gateway-contract-probe.py (leg e, brain-agent seam), live-squad-run check (mongo `pipeline_runs`), `scripts/gate/run.sh` tiered stamp gate, `scripts/pre-push.sh`.
- Process: GitHub Actions billing-blocked, local gate is merge gate; squash-merge with branch deletion; `gh` auth; ssh key-only since 2026-10-01.
- Coordination: deploy-router dependency (step 0, lock.sh path, apply-mutex).
- Report: LEG lines pasted into report.

**GENERIC (keep in deploy-it core).** The step skeleton (preflight -> target -> test gate -> branch/PR/merge -> build -> boot-smoke -> pin+apply -> verify -> merge audit -> report), fail-closed + "reader can tell without re-running" report rule, LEG/RESULT output contract + exit codes 0/1/2, run.json schema 1, canary->fleet with failure policy, rollback from recorded prev pins, dry-run, tiering (gather=cheap, mutate=Main), background + wait pattern, variant/required-variant concept, plan-gate-must-be-image-only concept, reuse-by-label concept, "sha must equal main".

**Handoff.** In: deploy-router context block (locks, holds, tenant set), merged-or-ready feature branch, passing pre-deploy gate. Out: LEG lines + run.json + report -> conclude-it S2/S3 (conclude-it calls deploy skill then runs prod gate itself) and review-it deploy-verify (which re-proves liveness via ladder - note engine-deploy already has legs a/c/e; deploy-verify's ladder is the generic version of leg a).

**Gaps.** (1) Orchestration steps 2-4, 8, 9 (branch/PR/merge/audit/report) are prose in SKILL, only 5-7 are scripted. (2) Script hard-coded to one workspace path/boxes. (3) Test-gate leg only meaningful for brain-agent. (4) No generic "adapter" boundary - hosts/paths inline in a 73K file. (5) JSON is only in the run dir, stdout is not JSON. (6) SKILL says deploy-router "Run first" as prose; script enforces lock presence but cannot claim `deploy:<repo>`/`tenants-json:<t>` for you.

**Changes for headless do-it.** Already close: run `engine-deploy.sh deploy|fleet ... --owner <lane>` in background, parse `RESULT` line + exit code, then read `run.json` (path printed? - NOT printed on stdout today; add `RUN_DIR <path>` line). Add `--json-stdout` or at least a final `RUN_JSON <abs-path>` line. do-it must also own: branch/PR/merge (steps 2-4), merge audit (8), and report (9) - move into a `deploy-it` orchestrator skill that calls the adapter.

---

## 6. deploy-router  (loose user skill, `~/.claude/skills/deploy-router/`)

**Purpose/trigger.** Pre-deploy coordination gate for parallel Claude Code sessions; run BEFORE /engine-deploy, /deploy-brain-app, or ANY shared-deploy-infra mutation. Triggers: "/deploy-router", "route the deploy", "who else is deploying", step 0 of any "ship it" when >1 session may be active. Never deploys. Born from 2026-08-23 aivivum decommission incident + terraform-apply collision. Files: `DR/SKILL.md` (21.5K), `scripts/{detect.sh,lock.sh,deploy-router-guard.mjs,install-hook.sh,check-live-squad-runs.sh}`, `tests/{test_liveness,test_blocking,test_guard,test_guard_gaps}.sh`, `build_fixtures.py`. Contract of record: `Engine-Core/docs/implementation/deploy-router/` (CONTRACT v1.0, D1-D7 locked) / `.../0-done/deploy-router`.

**Inputs.** Session identity (REQUIRED, resolved: `$CLAUDE_CODE_SESSION_ID` > `$CODEX_COMPANION_SESSION_ID` > `$CLAUDE_SESSION_ID` > newest-transcript guess). Coordination root auto-resolved (outermost `.deploy-router-root` marker / `.taskstate/deploy-router` / git toplevel). Resource keys: `git-main:<repo>`, `deploy:<repo>`, `tenants-json:<tenant>`, `ghcr:<img>`, `apply-mutex`. Lane owner (`--owner`, `DEPLOY_ROUTER_OWNER`).

**Outputs/paths.** Locks + journal in `<root>/.taskstate/deploy-router/{locks,journal}/` (one append-only journal file per session per day; archives in `locks/archive/`). Final report states (closed set): `clear-passthrough | negotiated-proceed | holding(<for-whom>,<until>) | taken-over-stale-lock | proceeding-despite-silence(<peer>) | stopped-tenant-set-drift`. Plus a **coordination-context text block** (locks held, holds, ordering, tenant set + ts, peers, release duty) handed to the deploy skill. Scripts output JSON (`detect.sh d0|enumerate` -> `verdict: clear|peers`, `scanned` line; `lock.sh blocking` -> JSON; `check-live-squad-runs.sh` -> NDJSON per tenant).

**State.** Lock files (RUNLOCK-v2: FREE/LIVE/EXPIRED states, atomic link-publish claim, heartbeat/TTL default 1800, max-hold 14400, takeover only if holder transcript idle >= 15 min measured from holder's own turns), journal, PreToolUse guard hook auto-refreshing own locks.

**Gates / exit codes.** `lock.sh`: 0 acquired/ok, 1 held-by-other (holder JSON), 2 usage/error; `blocking`: 0 none / 1 blocking. `detect.sh`: always 0 (errors inside JSON). `check-live-squad-runs.sh`: 0 all clear / 1 LIVE-SQUAD-RUN. Phase 3 pre-flight: stale-tree eviction (built commit == current origin/main), live-squad-run check (brain-api-core/brain-agent only), +F tenant-set freshness (read box tenants.json over SSH, diff vs targets -> stopped-tenant-set-drift).

**Human decision points.** Only urgency disputes/ties ("disputes go to Fernando, nothing else does"); a hold or a stop is a gate success. Peer negotiation via SendMessage with a 5-minute bounded wait then `proceeding-despite-silence`.

**Subagents/tiering.** Hard constraint: **main loop only** (subagents can't call `ListAgents`/`notify_when_idle`); delegate only pure file/process scans. D2 classifier reads transcript tails (<=50KB) and classifies peers DEPLOYING-NOW / ABOUT-TO-DEPLOY / PROD-DATA-WRITER / UNRELATED / UNKNOWN / LIVE-SQUAD-RUN. Cheap-path: reuse a peer's classification if transcript mtime unchanged.

**Packaging.** Loose skill + shell/python/node scripts under `~/.claude/skills`; `install-hook.sh` edits `settings.json` of 5 config dirs (`~/.claude, ~/.claude-8ftools, -8fai, -anm, -loudr`) append-only/idempotent, backs up first. Claude-specific: transcript JSONL liveness, ListAgents, SendMessage, PreToolUse guard, multi-config-dir enumeration. Host-agnostic: lock protocol (atomic claim, TTL, journal), resource-key scheme.

**ENGINE-SPECIFIC.** Shared hosts `75.119.153.239` and `167.86.98.85` hard-coded as "never UNRELATED" fingerprint; tenant-set read from `/opt/processor/infrastructure/terraform/tenants.json` via SSH with cred `new_contabo_vps_tenants`; `check-live-squad-runs.sh` queries mongo `pipeline_runs` (status running) on tenants box; repo gating on brain-api-core/brain-agent; fingerprint classifier keys (terraform apply, docker push, tenants.json writes, kubectl, compose); resource-key vocabulary (`tenants-json`, `ghcr`). The lock engine (`lock.sh`) and enumerator (`detect.sh`) and guard are the *generic* part; the fingerprints/hosts/live-run check/+F are adapter-supplied.

**Handoff.** Immediately before deploy skill (engine-deploy step 0; `engine-deploy.sh` resolves `lock.sh` path itself and refuses to deploy without a lock). Release after verify. Context block is plain text.

**Gaps.** (1) Context block is prose, not JSON, so do-it cannot pass it structurally. (2) Not usable by subagents (main-loop only) - do-it must run it in the orchestrator thread. (3) Protocol assumes peers are other Claude sessions on the same machine; do-it's own parallel lanes share one session uuid (the `--owner` fix 01-13 exists for that). (4) Fingerprint list is Engine infra only. (5) No uninstall for hook.

**Changes for do-it.** Provide `deploy-router route --json` returning `{state, scanned, peers[], locks_claimed[], holds[], tenant_set:{keys, read_at}, release:[cmds]}` and take an adapter-supplied `fingerprints.json`, `shared_hosts[]`, `tenant_set_cmd`, `pre_rollout_checks[]`. Treat `holding(...)` and `stopped-tenant-set-drift` as `needs_human`/`retry_after`, not failure.

---

## 7. reconcile-it  (loose user skill, `~/.claude/skills/reconcile-it/SKILL.md`, 13.9K, single file)

**Purpose/trigger.** Take stock of a drifted multi-repo workspace and reconcile it: inventory every local/remote branch + worktree -> classify disposition -> STOP for approval -> execute with re-verification (rescue dangling commits/WIP, delete landed, prune worktrees, return repos to main==origin/main, archive finished epics) -> plan the tail as parallel WAVES with kickoff prompts. Triggers: "/reconcile-it", "reconcile the repos", "table of all branches and worktrees", "which branches can I delete", "clean up stray branches/worktrees". "The inverse of /build-it". Author-credited DevOtts in frontmatter.

**Inputs.** Workspace root (dir with nested `.git` repos), discovered conventions (default branch, backlog location, done-archive convention `0-done/`). Optional approval edits at Phase 3.

**Outputs/paths.** Phase-1 table (stdout/temp file; no fixed path), Phase 3 disposition table (human), final "Reconcile-it Report" markdown (Cleaned / Kept / Wave plan / Verdict), wave README + one kickoff note per session + copy-paste launch prompt per session + project memory (delegated to `/next-session-prompt`). **No fixed output paths** for the wave artifacts (gap). Rescue branches `rescue/<slug>` pushed to origin.

**State.** None persisted (no `.taskstate`); entire state in conversation. Gap for resumability, esp. because Phase 3 is a stop.

**Gates / exit codes.** Phase 3 fail-closed approval; execution-time re-verify before each delete; Laws: no force-push, no history rewrite, no `git clean` with quarantined WIP, never touch a live session's branch/worktree/WIP, never delete a branch whose only backup is that ref. Classification vocab: DELETE-landed / DELETE-superseded / KEEP-in-flight / RESCUE / KEEP-deferred / REVIEW. Final verdict one line "Workspace reconciled". No exit codes.

**Human decision points.** Phase 0 layout confirmation when non-obvious; **Phase 3 mandatory approval**; "user's pruning scope" for remote deletes; Phase 5 wave sizing review.

**Subagents/tiering.** None specified (single-thread conductor); leans on `/plan-it`, `/next-session-prompt`, `/conclude-it`, project deploy skill by name, degrade inline. Natural tiering for plugin: inventory = haiku (mechanical), classify = sonnet, content-probe of ambiguous squash-merge = sonnet/opus, wave planning = opus; deletes = Main only.

**Packaging.** Not a plugin. Single SKILL.md, no scripts (the `inv()` bash function is inline in the skill text), no references, no tests. Host-agnostic except slash-skill names. Contains env quirk notes for harness-wrapped `git` ("hide merge commits", "mangle git diff"; use `/usr/bin/git diff`) - these are Fernando-harness-specific (likely from an rtk-like wrapper).

**Engine-specific.** Essentially none in text (generic `docs/implementation/1-backlog/`, `0-done/` conventions are Fernando's but marked optional). Fully portable.

**Handoff.** In: arrives after a burst of build-it/parallel work, or after conclude-it left debris (conclude-it Step 4.5 sweeps only its own footprint; reconcile-it handles the *rest*). Out: wave plan -> plan-it/build-it kickoff prompts (feeds the NEXT iteration of the lifecycle: it is the loop-closer). Also invokes conclude-it for archiving.

**Gaps.** (1) No scripts: `inv()` bash is embedded in prose; no tested script. (2) No machine-readable inventory/dispositions. (3) No persisted state so Phase 3 pause cannot be resumed headlessly. (4) Does not know about parallel-lifecycle `.env.worktree`/`.wt` teardown or deploy-router locks (could check that a branch has no live lock/`git-main:*` claim). (5) "Live session" detection is not specified (should reuse deploy-router `detect.sh enumerate`). (6) Wave planner hard to run unattended.

**Changes for headless.** Split into `reconcile-it scan` (read-only, safe unattended: emits `inventory.json` + `dispositions.json` with evidence) / `reconcile-it apply --approved <dispositions.json>` (execution) / `reconcile-it plan` (waves). do-it runs `scan` unattended, converts Phase 3 into a `needs_human{kind:"approve-dispositions", artifact}` result, resumes with `apply`. Auto-approvable policy subset (only `DELETE-landed` with cherry=0 AND content-probe hit AND remote backup exists) can be opt-in `--auto-approve-class landed-with-remote-backup`. Persist to `.reconcile-it/<ts>/`.

---

## 8. Proposal A: generic `deploy-it` plugin and its adapter contract

**Shape.** One plugin `deploy-it` (marketplace `devotts`), skills: `deploy-it` (orchestrator, = generic engine-deploy steps 0-9), `deploy-it-adapter-guide` (how to write an adapter) and an optional bundled `deploy-router` (lock/coordination, section 6) as `deploy-it:coordinate`. Adapters live in the consumer repo (`.deploy-it/adapter/`) or in separate plugins (`deploy-it-engine`, `deploy-it-vercel`, `deploy-it-compose`). `engine-deploy` becomes `deploy-it-engine` (an adapter + its gotchas).

**Orchestrator pipeline (host-agnostic).**
0 resolve adapter + config -> 1 coordinate (router, claim locks) -> 2 targets -> 3 pre-deploy gate -> 4 branch/PR/merge (git-provider adapter or skipped when CD handles) -> 5 build -> 6 smoke -> 7 release (pin+apply, canary->fleet) -> 8 verify -> 9 audit -> 10 report -> release locks. do-it receives one result envelope.

**Adapter contract.** Executable-first (so any host can drive it): `.deploy-it/adapter.json` manifest + commands that speak the already-proven LEG protocol. Manifest:
```
{ "schema":"deploy-it-adapter/1", "name":"engine",
  "services":[{"id":"brain-agent","repo":"brain-agent","deployments":["brain-agent","brain-mcp-gateway","brain-runner"],"image":"ghcr.io/engine-hq/brain-agent","coupled":true}],
  "targets":{"kind":"tenants|envs|projects","list_cmd":"<prints JSON array>","default":"live-set","canary":["fernando-ott"],"order_default":[...]},
  "variants":{"required":"scripts/engine-deploy/required-variants.json"},
  "coordination":{"enabled":true,"shared_hosts":[...],"resource_keys":["deploy:{service}","tenants-json:{target}","ghcr:{image}","apply-mutex"],"fingerprints":"fingerprints.json","target_set_cmd":"...","pre_rollout_checks":["check-live-squad-runs.sh {targets}"]},
  "commands":{ "preflight":"", "test_gate":"", "build":"", "smoke":"", "plan":"", "release":"", "verify":"", "rollback":"", "status":"" },
  "verify_targets":[{"service","ladder":[{"type":"route","url","expect":[200,401]},{"type":"marker","url","grep"},{"type":"digest","cmd"}]}],
  "policies":{"merge_gate":"local|ci","sha_must_equal":"origin/main","plan_gate":"no-destroy,image-only","auto_rollback":false,"destructive_requires_human":true},
  "secrets":{"source":"file|env|keychain","ref":"...","never_echo":true},
  "report_extras":["gateway-contract-probe"] }
```
**Command protocol (every command):** args as `--key value`; stdout lines `LEG <id> <target|-> <PASS|FAIL|SKIP> <detail>` then `RESULT <PASS|FAIL>`; exit `0 PASS / 1 FAIL / 2 could-not-run / 3 needs-human`; plus final `RUN_JSON <abs-path>` pointing at a run.json using engine-deploy's schema 1 (`run_id, lane, owner, cmd, services, targets(rename of tenants), sha, started/ended, result, exit, image{name,tag,digest,source}, prev_pins, legs[]`). Commands must be idempotent, support `--dry-run` (mutate nothing, resolve build-vs-reuse and print waves), never print secrets, and do their own long-wait inside (nohup + poll) so the host just backgrounds them. `verify` must be read-only and safe any time. `rollback --run <id> --target <t>` uses recorded prev pins.

**Required legs (adapter must emit or explicitly SKIP with reason; a required SKIP counts as FAIL):** `gate`, `main` (sha provenance), `build|reuse`, `smoke`, `release/apply`, `verify-live` (proof of what is running == what was built: digest/imageID/served marker; maps to review-it R8 ladder), `verify-idempotent` (re-plan no-diff or equivalent), optional adapter-specific. Fixed leg ids so do-it/review-it/conclude-it can aggregate across adapters.

**Result envelope (what deploy-it returns to do-it):**
```
{ "schema":"deploy-it/1","adapter":"engine","state":"DEPLOYED_VERIFIED|DEPLOYED_UNVERIFIED|FAILED|HELD|NEEDS_HUMAN|DRY_RUN_OK",
  "coordination":{"router_state":"clear-passthrough|negotiated-proceed|holding|...","scanned":"...","locks":[...]},
  "services":[{"id","sha","image":{"digest","tag"},"source":"built|reused"}],
  "targets":[{"id","result":"PASS|FAIL|SKIPPED","pin_prev","pin_new","rollback_cmd"}],
  "legs":[{...}], "run_json":"...", "pr_links":[...], "merge_audit":{"clean":true,"leftovers":[]},
  "blast_radius":{"commit_range":"a..b","foreign_commits":[...]},
  "verify_targets":[...],            // passed straight to review-it deploy-verify
  "needs_human":[{"kind","question","options"}],"report_md":"...", "exit":0 }
```
`state` mapping: all required legs PASS -> DEPLOYED_VERIFIED; deploy ok but verify leg SKIP/no target -> DEPLOYED_UNVERIFIED (conclude-it: "closes as deployed-but-unverified, not done"); router hold/tenant-drift -> HELD.

**Responsibilities split inside deploy-it:** generic core owns steps order, PR/merge via `gh` (or a git-provider adapter), coordination invocation, background/wait pattern, tiering (gather=haiku, test-run=sonnet, mutate=Main), report assembly, merge audit, run.json aggregation. Adapter owns everything that names a host, registry, cluster, IaC tool, credential location, test-gate command, smoke, variants.

**Mapping of current Engine pieces:** `scripts/engine-deploy.sh` -> adapter commands (`build|plan|deploy|fleet|verify|rollback`), `required-variants.json` -> `variants`, `deploy-router` host list/fingerprints/+F/live-squad-run -> `coordination`, `scripts/gate/run.sh` / `pre-push.sh` -> `commands.test_gate`, `boot-smoke.sh` -> `commands.smoke`, `gateway-contract-probe.py` -> `report_extras`/leg e, steps.md/gotchas.md -> adapter docs (progressive disclosure; keep indexed by step like today).

**Other candidate adapters** to prove the contract is generic: Vercel (`vercel --prod`, leg: curl alias + deployment id), docker-compose-on-box (Fernando's apps-box / `deploy-brain-app`, her0-vercel-deploy, obraninja-cicd-deploy, profits-deploy, cicd-deploy are existing sibling loose skills found by `ls`), GitHub-Actions-CD.

---

## 9. Proposal B: `reconcile-it` plugin packaging

Layout (matches the DevOtts convention):
```
reconcile-it/
  .claude-plugin/marketplace.json              # name "devotts", source ./plugins/reconcile-it
  plugins/reconcile-it/.claude-plugin/plugin.json   # name reconcile-it, v0.1.0, author DevOtts (+author_url), MIT
  plugins/reconcile-it/skills/reconcile-it/SKILL.md # trimmed protocol (phases 0-5), frontmatter author/author_url, footer "_Authored by [DevOtts]_" (per user CLAUDE.md)
  plugins/reconcile-it/skills/reconcile-it/scripts/{inventory.sh,classify.py,apply.sh,verify-end-state.sh}
  plugins/reconcile-it/skills/reconcile-it/references/{dispositions.md,laws.md,git-quirks.md,wave-planning.md}
  plugins/reconcile-it/skills/reconcile-it/templates/{wave-readme.md,kickoff.md,launch-prompt.md}
  SKILL.md (root, for npx skills add) ; README.md ; docs/{usage,installation}.md ; qa/ fixtures (a sandbox git repo like master-loop/scripts/make-fixture.ts) ; LICENSE ; CHANGELOG.md
```
Contract (headless): `scan` -> `.reconcile-it/<ts>/{inventory.json,dispositions.json}` (rows: `repo,kind,name,new_patches,has_remote,checked_out,worktree,dirty,disposition,evidence`), `apply --approved <file>` -> `applied.json` with before/after refs and rescue branches, `plan` -> `waves.json` + markdown artifacts. Result envelope `{schema:"reconcile-it/1", state:"CLEAN|NEEDS_APPROVAL|APPLIED|PARTIAL", counts, needs_human:[{kind:"approve-dispositions",artifact}], rescue:[...], kept:[{ref,why}], waves:[...]}`; exit 0/1/2/3.
Dependencies to declare (soft): plan-it, build-it, conclude-it, next-session-prompt, parallel-lifecycle (teardown), deploy-it (via deploy-router `detect.sh enumerate` for live-session guard). Add tests proving each Law can fail (CB-7 style): fixture with squash-merged branch, dangling commit, dirty worktree, live-owned branch.
Also fix: move the `inv()` function to a tested script; add `--dry-run` default; add "agent session lock" check (skip anything with a live deploy-router lock or a `.wt/state` CDP_PID alive).

---

## 10. Handoff chain for do-it (back half) and what each link needs

```
build-it (DoD met, .taskstate/evidence.md)
   -> [parallel-lifecycle: already provisioned at worktree creation]
   -> review-it contract-qa   (in: Test Contract + DoD; out: result.json GREEN|RED)       <-- proposed JSON
   -> pr-review (optional)    (in: PR ref; out: APPROVE|REQUEST-CHANGES)
   -> deploy-it               (in: merged-ready sha, targets, adapter; out: deploy-it/1 envelope)
         \- internal: deploy-router coordinate -> adapter test_gate/build/smoke/release/verify
   -> review-it deploy-verify (in: deploy-it.verify_targets + [REAL] rows; out: READY|NOT-READY)
   -> conclude-it close-only  (in: gates+evidence from above; out: conclude-it/1)
   -> reconcile-it (periodic, or after N epics; scan unattended, apply on approval) -> next plan-it wave
```
Proposed `do-it` run-state: `.do-it/state.json` stage cursor + each stage's result.json path; stage fails closed (RED/FAILED/HELD stops the chain, writes `needs_human` entry, schedules resume per the user's global overnight-resilience rule).

Model tiering recommendation for do-it (per user's rule: coordinator Opus, never Fable; set explicit):
- haiku: reconcile inventory, engine-reporter-style gathers, merge audit, ledger-card mechanics, archive `git mv`, backlog filing.
- sonnet: test-gate runners (engine-verifier pattern), review-it row executors, pr-review executor, boot-smoke runs, manifest authoring.
- opus: coordinator, deploy decisions/gate declarations, fresh-context verifier (R7), ambiguous reconcile REVIEW rows, wave planning.
- Escalate on struggle (conclude-it/engine-deploy phrasing).

## 11. Prioritized change list (what to build/patch)

P0 (blocks headless do-it):
1. review-it: `result.json` + exit code + `--unattended` + accept `--verify-targets`.
2. conclude-it: `--headless --evidence --config`, close-only mode, `result.json`.
3. deploy-it: define adapter schema; wrap engine-deploy.sh as `deploy-it-engine` (add `RUN_JSON` line, parameterize `WS/TENANTS_BOX/BUILD_BOX`); orchestrator owns PR/merge/audit/report.
4. deploy-router: `route --json`, adapter-supplied fingerprints/hosts/checks; document "main-loop only".
P1:
5. reconcile-it plugin with scan/apply/plan split + state dir.
6. parallel-lifecycle: `wt-ensure`/`wt-status --json`, teardown on worktree remove, DB isolation.
7. Unify vocab: map conclude-it GREEN/RED/UNVERIFIED <-> review-it PASS/FAIL/INV <-> engine-deploy PASS/FAIL/SKIP; define single `gate` object `{id, result, evidence_ref}`.
8. Resolve skill-name namespacing (`build-it:full-qa` vs `/full-qa`) via do-it dependency manifest.
P2:
9. master-loop as optional escalation sink for `needs_human`; adopt its HARD_GATE domain list as do-it's human-gate policy.
10. Stable review-it report filename; persisted run-state for conclude-it ship pipeline and reconcile-it.

## 12. Caveats on what I read
- Read fully: review-it front door + deploy-verify + report-format + vocabularies + gate-catalog R1-R11 + pr-review/side-effects (partial: Steps 1-5 only); conclude-it SKILL + ship-pipeline + build-report.py header; parallel-lifecycle SKILL + hooks + architecture (first 80 lines); engine-deploy SKILL + script header (~120 lines) + runlog.py + registry.py header + agents; deploy-router SKILL + lock.sh/detect.sh headers; reconcile-it SKILL.
- Skimmed only: master-loop (README, CLAUDE.md, types.ts, cli.ts, SPEC.md head) as requested; engine-deploy `references/steps.md` and `gotchas.md` (headings only - 86K/122K); fleet.sh internals; side-effects steps 2+; docs/ of review-it and parallel-lifecycle.
- Did not confirm whether `build-it` writes `.build-it-reports/` vs `.fable-it-reports/` (review-it repo contains `.fable-it-reports/`, the pre-rename dir) - verify against build-it before wiring do-it.
