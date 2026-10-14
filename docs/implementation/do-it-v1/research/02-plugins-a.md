# 02 - Integration contract of prompt-it, plan-it, build-it (for the do-it orchestrator)

Researched 2026-10-14. Roots: `/Users/macbook/Workspace/Devotts/{prompt-it,plan-it,build-it}`. Context doc: `/Users/macbook/Workspace/Devotts/do-it/docs/implementation/do-it-v1/01-TOKEN-DISCIPLINE.md` (do-it = supervisor above plan-it -> build-it -> review-it -> conclude-it; gates CB/SL/TR/IH/DL; token meter `.taskstate/token-meter.jsonl`; sec. 5.1 lists conflicts it wants resolved).

Versions at time of reading: prompt-it 0.3.0, plan-it 4.0.0, build-it 3.1.1 (plugin.json) / root SKILL.md says 3.1.0.

---------------------------------------------------------------------
## 0. Cross-cutting findings (read first)

1. No plugin has a machine-readable result today. Every output is prose/markdown for a human. Only plan-it has exit codes (gate-check.mjs), and those are per-guard, not per-run. do-it must either parse markdown tables or (preferred) we add a small `result.json` per stage (section 5).
2. The handoff chain is human-mediated, by copy-paste prompt:
   plan-it -> (KICKOFF.md + launch prompt text) -> human pastes into fresh session -> `/build-it ...`.
   build-it -> `.build-it-reports/report.md` -> human reads / review-it -> prompt-it Mode 2 -> continuation prompt -> human pastes.
   prompt-it's only output channel is the chat response (fenced block + emoji lines). There is no file output.
3. Three different "state dir" conventions: `.plan-it/` (JSON, schema-validated), `.taskstate/` (markdown, build-it), `.build-it-reports/` (markdown, build-it). prompt-it has NO state and explicitly refuses to keep any ("never maintain your own memory store").
4. Two different human-gate models. plan-it pauses at G0/G1/G4 (autonomous-draft default) or G1/G2/G3 (guided); build-it never pauses ("recommend, log, proceed"; BLOCKED is its only escape); prompt-it never pauses (emit-first; questions only appended after output).
5. Everything is Claude-Code-first. SKILL.md bodies are largely host-agnostic prose, but the hard enforcement (PreToolUse hook in plan-it, Stop/PreToolUse hooks in build-it) is Claude-Code-only and build-it's tier table names Claude models. See section 4 per plugin.
6. Naming/ownership collision risk on marketplaces: `devotts` marketplace is declared in prompt-it and plan-it repos (both with name "devotts"), while build-it self-hosts as marketplace `build-it` (install `build-it@build-it`; decision D13 in `build-it/.taskstate/decisions.md`). The plan-it and build-it marketplace.json each embed a prompt-it entry pinned to 0.2.1 (stale vs 0.3.0). do-it's own plugin.json/marketplace needs to pick one namespace and declare dependencies informally (Claude plugins have no formal dependency field that these use).

---------------------------------------------------------------------
## 1. prompt-it (v0.3.0) - harness-aware intent compiler

### 1.1 Purpose and trigger
- Turns a rough ask into ONE copyable, context-grounded prompt routed to the right *-it skill (plan-it / build-it / review-it / iterate / bare / product-LLM). Does not execute the task.
- Two modes: Mode 1 = new-session compiler; Mode 2 = post-review continuation (reads review-it/QA findings, emits "acknowledge-then-catch" prompt).
- Trigger phrases (frontmatter): "/prompt-it", "prompt it", "optimize this prompt", "write the prompt for X", "generate the continuation prompt", "write the iteration prompt"... Explicitly NOT auto-triggered on ordinary task requests. Explicitly NOT for post-planning handoff of a finished PRD (that is `/next-session-prompt`).
- Mode detection: Mode 2 if a review-it/QA report exists in conversation or is pointed at (`.review-it/`, `.build-it-reports/`, qa findings); else Mode 1.
- Files: `prompt-it/plugins/prompt-it/skills/prompt-it/SKILL.md` (21.8K, plugin copy), `prompt-it/SKILL.md` (23K root portable copy - DIFFERENT, has extra `metadata.platforms: [claude-code, cursor, openclaw, mcp, openai]` frontmatter and Install copy), `.../references/targets.md` (the per-target ownership map = design center).

### 1.2 Inputs
- Free text rough ask (chat). Optionally: review-it report / `.build-it-reports/report.md` / `.taskstate/run-memory.md` / `decisions.md` (Mode 2); `.agents/history/INDEX.md` (alias lookup); CLAUDE.md; user-named route (locked).
- Cheap lookups only (ls/grep/index). Hard cap: context package <= 7 pointers, <= 10 directives.

### 1.3 Outputs (chat only, no file)
Strict response shape (HARD OUTPUT RULES 1): first character = opening fence of the prompt block, then:
```
```<prompt block, 6-slot template: ROUTING / GROUNDING / /goal / CONTEXT PACKAGE / DoD SKETCH / SCOPE FENCES>```
🎯 Target: <skill> - <why>
💡 <one line: most important thing fixed/added>
▶ Run here | Paste into a fresh session - <reason>
(<=3 optional refinement questions, live sessions only)
```
- The `▶` delivery line (added 0.3.0) is the only machine-ish routing signal for session placement.
- Reasoning-native targets: block capped at 200 words. Never emits tiering/persistence/verification-method content for harness targets (boundary contract; see targets.md quick omission table).
- Uses `(assumed: X - flag if wrong)` and `(unvalidated - target session must confirm this path first)` inline markers.

### 1.4 State files
None. `.taskstate/` in the prompt-it repo is from build-it runs that BUILT prompt-it (decisions.md/evidence.md/run-memory.md), not prompt-it runtime state. `.gitignore` ignores `.agents/`, `.build-it-reports/`.

### 1.5 Gates / exit codes / statechart
- No statechart, no scripts, no exit codes. Gates are prose self-checks: clarity gate (skip full pipeline if ask already clear -> "minimal tighten"), route lock, question gate (emit-first), 3-pass self-check (rubric, contradiction diff, load-bearing audit), mechanical pre-emit diff for already-well-formed input.
- Eval: 20-case binding suite `prompt-it/eval/{sample-prompts.md,expected-prompts.md,scripts/run-eval.sh}`; 0.3.0 certified 19/20 (`eval/runs/v0.3.0-final/CERTIFICATION.md`). S18 failure = 💡 line narrating the 200-word cap.

### 1.6 Human-decision points
None blocking. Optional appended questions (live sessions) with >=2 concrete candidate answers. Route the user names is locked (disagreement goes in 💡).

### 1.7 Subagents / model tiering
Spawns none. Pure single-context skill. Deliberately forbids emitting tiering/economics notes ("Routing to build-it IS the tiering decision"). Eval harness used Fable-tier judges (not part of runtime).

### 1.8 Packaging / host portability
- `plugins/prompt-it/.claude-plugin/plugin.json` (name prompt-it, v0.3.0) + `.claude-plugin/marketplace.json` (marketplace name `devotts`, source `./plugins/prompt-it`). Install: `/plugin marketplace add DevOtts/prompt-it` then `/plugin install prompt-it@devotts`.
- Portable path: `npx skills add DevOtts/prompt-it -a cursor|codex|copilot|...`; `gh skill install`; manual copy of SKILL.md + references/targets.md.
- Claude-specific: slash trigger + marketplace; references to `/read-chat`, `.agents/history/INDEX.md` (Fernando's ledger), `/next-session-prompt`, `*-it` skill names. Host-agnostic: the whole procedure; no tool calls beyond ls/grep.
- Staleness: plan-it's and build-it's marketplace.json pin prompt-it 0.2.1; root SKILL.md and plugin SKILL.md have diverged.

### 1.9 What handoff exists / what is missing
Exists: it is itself the handoff compiler (plan-it/build-it/review-it route lines; Mode 2 continuation). It already encodes "what each target parses" (targets.md) - this is the closest thing to an interface spec for the other two plugins and should be the schema do-it's prompts follow.
Missing for do-it:
- No file/JSON output: do-it would have to scrape the fenced block out of chat.
- No non-interactive/"headless" flag (it infers live vs not from session signals).
- Mode 2 reads reports as prose; no structured findings input.
- The `▶ Run here / fresh session` decision overlaps with do-it's SL-1 "close on handoff" and DL-1 "fresh over fork" - do-it would own that decision, so prompt-it's delivery line becomes redundant/conflicting when called by do-it.
- Output hygiene rule forbids any narration, so a wrapper cannot get "status"; success/failure is implicit.

### 1.10 Changes needed so do-it can call it headlessly
1. Add an input switch (e.g. `--emit=file` / "output to `.do-it/prompts/<stage>.md`") that writes ONLY the prompt block to a file and a sidecar `prompt-result.json`: `{mode, route, target, prompt_path, delivery:"fresh|here", assumptions:[...], unvalidated_pointers:[...], questions:[...], words, directives}`.
2. A `--non-interactive` mode: never append questions; convert all to assumptions; always `fresh`.
3. Mode 2 should accept a structured findings file (`.build-it-reports/result.json` or review-it equivalent) in addition to prose.
4. A declared stable tool contract: Task/Agent subagent invocation by do-it should be possible as a one-shot (fresh T3/T2 context) - the skill is small (~22K chars; do-it IH-7 lazy-load applies) and needs no tools beyond Read/Glob/Grep/Bash(ls).
5. Sync root and plugin SKILL.md and bump marketplace pins.

---------------------------------------------------------------------
## 2. plan-it (v4.0.0) - discovery -> spec -> agile delivery package

### 2.1 Purpose and trigger
- Fuzzy idea/brain-dump -> complete spec set + `delivery/` package whose epics each end in a BINDING Test Contract (up to ~20 cases, 100% pass = DoD). "plan-it plans it, build-it builds it."
- Triggers: "/plan-it", "plan this", "spec this out", "create the PRDs/epics", "scope this project/feature", or a pasted vision. Description <= 1,024 chars with triggers in first 250 (rule G-15).
- Files: `plan-it/plugins/plan-it/skills/plan-it/{SKILL.md (37K), machine.json, scripts/{gate-check.mjs (124K), build-report.mjs, report-template.html}, references/{machine.md,templates.md,formats.md,playbooks.md,report-family.md}}`; root mirrors of all of these (11 mirror pairs, `gate-check mirror-check` exit 2 on drift - G-14).

### 2.2 Inputs
- Raw vision (chat), pointers (`/read-chat "<name>"` sessions, repo paths, doc folders), target project cwd. Optional: existing `.plan-it/state.json` or `.plan-it/<slug>.state.json` (resume).
- Anamnesis G0 answers (human, one batched questionnaire): access & credentials, fences, naming, topology (`solo | orchestrator+squads | headless`), live-probe authorization, decisions already known. Mode: autonomous-draft (default) or guided.
- Host assumptions: Node >= 20 for gate-check (degrades to manual checks recorded in state file); `/read-chat`, `/sync-obsidian`, `/session-debrief`, `/next-session-prompt` optional.

### 2.3 Outputs / artifacts (exact paths, in the TARGET project)
Package root `delivery/` (or `delivery/<name>/` for named runs; recorded in `state.run.deliveryRoot`; every gate-check verb resolves the dir from it, longest-prefix match). Observed full set in `plan-it/delivery/v4/`:
- `CONTRACT.md` (frozen law; header `vN.N`; draft = `vN.N-draft`), `00-program-plan.md`, `STATUS.md` (live board, has Disposition column), `KICKOFF.md` (opens with "0. Pinning" block: repo @ full SHA, state-file path, CONTRACT SHA-256; step 1 = re-derive tally from disk, stop-and-report on mismatch), `README.md`, `DECISIONS.md`, `GATE.md` (answered decision/authorization log), `GLOSSARY.md` (first-use rule G-8; unknown ID fails `handoff`), `SESSIONS.md` (topology orchestrator+squads: one fenced launch prompt per session, exact `/rename` names), `PLAN-REVIEW.md`, `QA-REPORT.md`, `MORNING-REPORT.md`, `TEST-CONTRACT-REVIEW.md`, `prds/prd-*.md`, `epics/epics-*.md`, `manifests/`, `resources/`, `conclude-report.manifest.json`.
- Every canonical .md has a local `.html` twin (never published as claude.ai artifact, G-7; `--open` only at human gates, suppressed headless).
- Spec docs in `docs/` (`01-current-state-and-findings.md`, `02-vision...`, `03-data-model...`, `06-roadmap...`), research under `_research/` or `research/stream-*.md`, `research/SHARED-CONTEXT.md`.
- `ENV-FACTS.md` + `ENV-PROBES.json` (preflight, probes PRESENT/ABSENT/TIMEOUT; S shape 6 probes, M/L 9 probes).
- Project `CLAUDE.md` gets test-convention block `<!-- plan-it:test-conventions -->` (FD-1 `testconv`).
- Test Contract id grammar: `T-<EID>-NN` epic cases; `C-E<n>-NN` CONTRACT cases; `[REAL]` tag = needs live target. Epic heading grammar `## Epic <ID> - <title>` (ID regex `[A-Z]{1,3}\d+[A-Z]?\d*`).
- Launch prompt: NOT a separate file by default. The "exact copy-paste launch prompt" is inside `KICKOFF.md` (single fenced block) and, for multi-session, `SESSIONS.md` (one block per session). `plan-it/NEXT-SESSION-PROMPT.md` is a one-off kickoff for building plan-it v3 itself, not a generated artifact (gitignored).
- Final chat report: per-doc + per-epic status, total test count, locked decisions, launch prompt.

### 2.4 State files and schemas
`<target>/.plan-it/state.json` (or `.plan-it/<slug>.state.json` for named concurrent runs; archived to `.plan-it/done/<slug>.state.json` by `gate-check archive`). Schema (references/machine.md sec. 2/2b):
```json
{ "schemaVersion":1, "machineVersion":"4.0.0",
  "run":{"name","goal","startedAt","mode":"guided|autonomous-draft","topology","deliveryRoot","anamnesis":{...}},
  "state":"<machine state>", "size":"S|M|L", "shape":1-5,
  "triage":{"verdict","measuredAt","measurements":[],"memo"},
  "gates":{"G0":{},"G1":{"approved","owner","date","decisions"},"G2":{"approved","owner","date","defaults":[{id,question,default,rationale,source:"recommended",contradicted}],"pendingReview"},"G3":{},"G4":{"approved","owner","date","contradictions":[]}},
  "contract":{"version":"v1.0-draft|v1.0","path","frozenAt","draft":bool},
  "artifacts":[{"path","phase","verifiedAt"}],
  "render":{"manifest","outputs":[{"md","html","sha256"}]},
  "history":[{"state","event","at"}], "archive":{"archivedAt","from"} }
```
Required: schemaVersion, machineVersion, run, state, gates, history. `gate-check state` tolerates extra keys. Seen in `plan-it/.plan-it/done/v4.state.json` (13K).
Other: `ENV-FACTS.md`, `delivery/STATUS.md` (board), `.taskstate/` + `.fable-it-reports/` used by the build-it runs that built plan-it (gitignored).

### 2.5 Statechart, gates, exit codes
`machine.json` (XState v5 JSON subset, 25 states). Path:
```
intake -> triage -> anamnesis[G0,human] -> dodLock -> scopeBrief -> scopeGate[G1,human]
 -> preGround -> discovery -> preflight -> synthesis -> specAuthoring
   guided:     -> decisionGate[G2,human] -> coherencePass -> freezeGate[G3,human] -> backboneFreeze
   autonomous: -> defaultsApplied -> coherencePass -> backboneFreeze (draft freeze)
 -> parallelPlanning (AMENDMENT self-loop) -> verify -> adversaryGate
   guided: render -> handoff -> done ; autonomous: render -> planReview[G4,human] -> freeze -> handoff -> done
 (freeze -> parallelPlanning on REVIEW_CONTRADICTED) ; triage -> CLOSED_WITHOUT_PLAN (needs memo on disk)
```
Guards -> gate-check subcommands: artifactsOnDisk=`verify`, contractFrozen=`freeze`, handoffLintClean=`handoff`, gateRecorded=`state`, adversarialDepth=`adversary`, plus triageRecorded, defaultsRecorded, planReviewed.
`node gate-check.mjs <verb>`: `verify, freeze [--draft], handoff, state, contract, testconv (exit 2 = needs registration), reconcile, preflight <S|M|L>, machine-diff, adversary, pluginlint, mirror-check (exit 2 drift), archive (1 = refused), runs [--json], mirror (0 fresh/2 stale/1 unstamped), glossary`. Exit 0 pass; 1 fail with `  x reason` lines on stderr and `PASS - label`/`FAIL - label` header; 2 = special (needs-registration / drift / stale). Common flags: `--dir <repo-root>`, `--run <slug>`, positional paths. `gate-check runs --dir . --json` is the only JSON output: `{runs:[{slug,state,mode,contract,lastTransition,deliveryRoot,archived}],counts:{live,archived}}`.
Caveat observed: `gate-check state` on the archived v4 state returned FAIL (`C-E7-03: gates.G4.approved true but PLAN-REVIEW.md not on disk`) because I ran it from the plugin repo root - the check is cwd/root sensitive; do-it must always pass `--dir`/`--run`.
Hard hook: `plugins/plan-it/hooks/hooks.json` PreToolUse(Write|Edit|MultiEdit|NotebookEdit) -> `node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/planit-guard.mjs` denies PRD/epic writes while `contract.version == null` (fail-open). Claude Code only. NOTE: `hooks.json` references `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/planit-guard.mjs`, but the plugin dir listing shows `plugins/plan-it/scripts/hooks/planit-guard.mjs` (outside `skills/plan-it/`) - verify it resolves on install.
Invariants G-1..G-15 (CONTRACT.md in `delivery/v4/`); key ones for do-it: G-9 (binding case never moves to backlog; stays IMPLEMENTED-NOT-VERIFIED), G-10 (worktrees-only for every squad), G-11 (poll, never "wait for" a notification), G-13 (draft contract never hands off).

### 2.6 Human-decision points (where it pauses)
- Autonomous-draft (v4 default): G0 anamnesis (at intake) -> G1 scope/size/shape/topology + numbered DoD -> G4 PLAN-REVIEW (single review-and-contradict round; records G2+G3 as defaults `[default - contradict if wrong]`).
- Guided: G0?/G1 -> G2 decisionGate (batched numbered decisions each with a recommendation, locked with owner+date) -> G3 freezeGate ("proceed to PRDs/epics?").
- Also FD-2: proposed Test Contract cases surfaced for human edit before freeze (`casesReviewed` check in `freeze --dir`, skipped under `--draft`). FD-1: testconv discovery asks the user if conventions are unknown (exit 2).
- `headless` topology = "No human present": decisions default-applied and reviewed at G4 afterwards - but G0 and G1 are still chat questions; there is no documented way to pre-supply their answers non-interactively beyond `run.anamnesis` in a pre-seeded state file.
- A second contradiction of the same default => open decision card for owner, never re-defaulted.

### 2.7 Subagent spawning and tiering
- Discovery (Phase 4): `Agent` tool (Explore/general-purpose) or build-it team machinery; modes: solo read, parallel research streams (one concern each, each writes `research/stream-<X>.md`), team-of-N codebase slices, verify-then-extend. Must write to disk; verify with `gate-check verify` ("idle != delivered"; `SendMessage` silent agents; re-dispatch 0-work teams).
- Parallel planning (Phase 9): one squad per repo lane, disjoint files; squad session names recorded in SESSIONS.md; batch generator `features.json` for many PRDs.
- Tiering: SKILL.md says "parallel Claude teams at xhigh" and "/effort xhigh" (user must set). Tiering policy is NOT in SKILL.md; it is carried as a frozen "RUN-POLICY" block inside CONTRACT.md (checked by `freeze --dir`) and G1 decisions (e.g. v4: coordinator top; design-bearing streams top; mapping streams mid; PRD/epic authoring + spec'd impl mid; mechanical low; escalate-on-struggle). G-4: no hardcoded model IDs in the package.
- Synthesis stays single-threaded in the main thread.

### 2.8 Packaging / host portability
- `plugins/plan-it/.claude-plugin/plugin.json` v4.0.0; `.claude-plugin/marketplace.json` name `devotts`, plugins: prompt-it (github DevOtts/prompt-it, 0.2.1 - stale) and plan-it (`./plugins/plan-it`, 4.0.0). SKILL frontmatter `metadata.platforms: [claude-code, cursor, codex, copilot]`.
- Claude-specific: PreToolUse hook, `/effort`, slash/marketplace install, `Agent`/`SendMessage` tool names, `/read-chat`, `/session-debrief`, `/sync-obsidian`, `/next-session-prompt`. Host-agnostic: machine.json + state.json + gate-check (plain Node ESM, zero deps) + templates/formats. "Degrade, never break" rule (references/machine.md sec. 4) lets non-Node hosts do the checks manually.
- Multi-run: named runs allow several plans per repo; `gate-check runs` lists portfolio.
- Release invariants: version triple match, mirror-check 11/11, machine-diff additive vs byte-pinned baselines (`tests/fixtures/v3/machine.v3.7fcff27.json`), `tests/run-contract.mjs` (zero deps, exit 0 only at 100%).

### 2.9 Handoff to NEXT stage today / what is missing
Exists:
- Terminal phase of the machine = `handoff` -> `done`; produces KICKOFF.md (with pinning block + launch prompt), SESSIONS.md launch prompts, STATUS.md board, README index. The build "runs in a fresh session" (SKILL.md Phase 10). Optional `/next-session-prompt` and `/session-debrief` at handoff. Launch prompts open with `/build-it <squad-id> of <program>. Your package: <prd> + <epics>...` and the orchestrator prompt with `/session-init then act as the ORCHESTRATOR...`.
- Contract bridge: "build-it's Definition of Done = this contract" (Test Contract 100%).
Missing:
- No machine-readable "plan result" (e.g. `delivery/PLAN-RESULT.json`): counts of epics/cases/[REAL], contract path+sha, topology, waves, launch-prompt path, residual list, all must be scraped from KICKOFF.md/STATUS.md/state.json. State.json has most pieces (contract path/version, deliveryRoot, gates, artifacts) but not tallies or waves.
- Launch prompt is embedded markdown, not a standalone file or a structured DoD list for build-it. build-it has no importer for `epics/*.md` Test Contract tables.
- STATUS.md is hand-updated by orchestrator sessions; no schema, no verb to read board state (`gate-check runs` only reports plan-it's own state, not build progress).
- No explicit "plan -> build" gate verb in gate-check (e.g. `gate-check ready-for-build`) that also asserts G4/draft-stripped/`contract.draft=false`/mirror/hardcoded SHA.
- The conclude-report manifest (`delivery/v4/conclude-report.manifest.json`) hints at a conclude-it feed but its schema is undocumented in SKILL.md.
- No resume-after-handoff cross-check between plan state and build state (KICKOFF step 1 "re-derive tally from disk" is a prompt instruction, not a script).

### 2.10 Changes needed so do-it can call it headlessly
1. `gate-check status --dir <root> [--run slug] --json` returning `{state, mode, topology, gates:{G0..G4:{approved,owner,date}}, pendingHuman:{gate,questions_path}, contract:{version,draft,path,sha256}, tallies:{epics,cases,real}, deliveryRoot, nextEvents:[...]}` and a consistent exit code table (0 ok, 1 fail, 2 needs-human, 3 drift) across ALL verbs.
2. A pre-seeded non-interactive input: `plan-it.input.json` (goal, pointers, anamnesis answers, G1 approvals, mode, topology) so G0/G1 can be satisfied by do-it's own human gate, and "pause at human gate" becomes: write `.plan-it/PENDING-HUMAN.json` (gate, question list, recommendations, path to HTML/MD twin) and exit with code 2; do-it presents it once (batched with its own gates) then resumes.
3. Emit `delivery/PLAN-RESULT.json` at `handoff` (see 5.2), plus a standalone `delivery/LAUNCH-PROMPT.md` (single-session) so do-it need not parse KICKOFF.md.
4. Tiering parameterization: let do-it pass tier map (T1/T2/T3 -> host models) rather than G1 prose + RUN-POLICY block; today plan-it hardcodes the concept "top/mid/low" in prose and CONTRACT only.
5. Make hooks.json path resolution explicit and add an opencode/Codex-friendly "no-hook" mode flag (state file `run.enforcement:"hook|script|manual"`).
6. Declare headless guarantee: `headless` must never open HTML (`--open` suppressed already) and must never use "wait for"; add a test.
7. Add `ctx_budget` hints: plan-it's SKILL.md is 37K chars and references 4 docs; with do-it IH-7 (lazy load) split SKILL.md per-phase or provide a `plan-it --phase <state>` loader. Planner session lingering after handoff is explicitly the do-it SL-1 concern: plan-it should end its terminal phase with "close this session" semantics and write a resume pointer.

---------------------------------------------------------------------
## 3. build-it (v3.1.x) - autonomous goal-to-DoD delivery (formerly fable-it)

### 3.1 Purpose and trigger
- Goal + numbered DoD -> runs to completion unattended; honest per-criterion report; conductor over bundled skills `launch`, `iterate`, `full-qa`, `chrome-cdp-control`.
- Triggers: "/build-it", "build it", "/fable-it", "fable it" (legacy name still routes), "ship this", "run to DoD", "work autonomously until done", "I'm going to bed, finish this", "green light, take decisions", or a pasted goal + numbered criteria. `fable-it` skill is a deprecated pointer to build-it.
- Files: plugin `build-it/plugins/build-it/skills/{build-it,launch,iterate,full-qa,chrome-cdp-control}/SKILL.md`, `skills/references/{model-tiers.md,parallel-safety.md,cdp-core.md}`, `hooks/{turn-end-gate.py,evidence-lint.py,README.md,tests/run-tests.sh}`. Root `build-it/SKILL.md` = portable single-file version (12.7K; differs from the plugin's 24K SKILL.md; root version frontmatter 3.1.0, has `metadata.platforms`; plugin SKILL.md has no version field).

### 3.2 Inputs (Input contract)
- Required: `goal` + `DoD` (numbered, individually testable). Prose DoD is restructured and shown, not silently reinterpreted.
- Optional (default+state assumption): `paths`, `credentials` (reads `.full.credentials`, then `.env`), `scope fence` (also lifted from goal text), `report location` (default `.build-it-reports/`), `parallelization`.
- Reads `.build-it-reports/lessons.md` (and legacy `.fable-it-reports/lessons.md`) at Step 0. Declares model and applies posture row (Sonnet 5 / Opus 4.8 / Fable 5) from `references/model-tiers.md` sec. 1.
- From plan-it: today only via the pasted prompt text. It does not read `delivery/CONTRACT.md`, `epics/*.md`, `.plan-it/state.json` or `STATUS.md` automatically (grep for "plan-it"/"KICKOFF"/"STATUS" in the SKILL.md finds none). Squad prompts tell it which PRD/epics files to read.

### 3.3 Outputs
- `.build-it-reports/report.md` - the single verdict source. Format: header `# Build-it Report - <goal>` + `Run window | Model | Approach`; `## DoD status` table `| # | Criterion | Status | Evidence |` with status in {VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED}; `## Could not be verified (and why)`; `## No silent caps`; `## Delegation & cost` table (packet, tier, why, escalated?); What changed; Decisions made; Surprises/risks; Recommended next actions.
- Credentials artifact: separate file when any credential created (path not fixed; "tell the user the exact paths"). Default name referenced in repo gitignore: `*.credentials`, `.full.credentials`.
- `.build-it-reports/lessons.md` cross-run lessons (legacy `.fable-it-reports/`). Other human-style reports exist per release (`report-v3.1.0-rename.md`).
- Ends the turn on outcome with paths; no "want me to continue?".

### 3.4 State files and schemas (all markdown, no JSON)
`.taskstate/` at workspace root (never `.claude/`):
- `grounding.md` - data model, location, per-DoD-item verification target + reachability.
- `decisions.md` - shared decision contract (Guardrail 1); decision lines `- D<n> (who, date): ...`.
- `evidence.md` - ledger: entry header `### <DoD-id/Test id> (<desc>) - <date> - \`<command>\` -> PASS|FAIL`, then `> quoted output`. VERIFIED is a lookup into this file for the same session (claim gate).
- `run-memory.md` - failed approaches, env quirks, delegation tier log, escalation log.
- `breakdown-<version>.md` - epics->stories->tasks, DoD-to-task mapping.
- `RUNLOCK` (JSON) - `{owner, host, pid, startedAt, heartbeat}`; exclusive-create; heartbeat every 2-3 min; stale >= 10 min and owner not provably alive -> reclaim with run-memory note (references/parallel-safety.md). `.build-it/wt/<lane>` worktrees on `agent/<lane>` branches.
- `dod.md` (hardened mode only): checkbox list `- [x] 1. ...`/`- [ ] 2. ...`, read by the Stop hook.
- `features-<ver>.json` (launch). `hooks.log` (hook firings).
- Project board (build-it's own repo): `delivery/STATUS.md` markdown table (Epic | Branch | Wave | Status | Test contract | PR).

### 3.5 Gates / statechart / exit codes
No statechart or scripts; gates are prose self-audits with trigger/test/action: turn-end, claim, state-change, phase-boundary, delegation, + safe-parallel trio (interlock, worktree, integration). Steps 0-8: read input & detect model -> autonomous posture -> pre-grounding -> approach via /launch (unattended) -> guardrails -> cycles (delegate by DoD shape: /full-qa for UI test env, /iterate for non-UI, /chrome-cdp-control for authenticated real Chrome) -> draft report -> fresh-eyes verifier -> deliver artifacts.
- Terminal states are per-criterion only (VERIFIED/IMPLEMENTED-NOT-VERIFIED/BLOCKED); there is no run-level status or exit code. BLOCKED reports also valid at turn end.
- Optional Claude-only hooks (opt-in, copy settings JSON; NOT auto-registered - there is no hooks.json in the plugin): `turn-end-gate.py` (Stop) and `evidence-lint.py` (PreToolUse Write|Edit on `.build-it-reports/report.md`). Fail-open, disable with `BUILD_IT_HOOKS_DISABLED=1`. Tests: `plugins/build-it/hooks/tests/run-tests.sh`, lints `tests/lints/run-all.sh` (t2,t8,t11,t16,t17,t20,t24,consistency-7-2).

### 3.6 Human-decision points
- None by design (Step 1: "the user cannot answer mid-task"). Reversible -> proceed; irreversible (drop tables, force-push, delete branches/volumes, destructive migrations) -> never without prior explicit authorization, scoped per target; otherwise BLOCKED. `/launch` in unattended mode converts every approval gate to recommend-log-proceed (writes to `decisions.md`). Authenticated real-Chrome writes go through `/chrome-cdp-control` per-write gates (these can ask).
- Practical pause points = BLOCKED rows, missing credentials, and the "RUNLOCK held live by another run" case (BLOCKED or wait).
- Overnight: user global CLAUDE.md requires self-scheduled wake-ups every ~30 min (usage-limit resilience); do-it doc sec. 5.1 says these must wake a FRESH context reading `.taskstate/`.

### 3.7 Subagent spawning and tiering
- Decomposes itself (epics->stories->tasks); `/launch` recommends single vs subagents vs team. Coherence rule: decision-coupled work in one thread or bound by `decisions.md`. Safe-parallel rule: each mutating worker in its own `git worktree` on `agent/<lane>`; coordinator alone merges sequentially; integration gate (build + lockfile + declared tests) after each merge. Read-only fan-out can share the tree.
- Tiering canonical in `skills/references/model-tiers.md`: Cheap (Haiku 4.5): sweeps, grep, run suites, formatting, extraction, screenshot loops. Mid (Sonnet 5): spec'd implementation, /full-qa execution, research streams, doc drafting. Top (= session model): architecture/decomposition, root-cause, fresh-context verifier, skeptic subagents, decisions.md writers, final reconciliation. Gates: default inherit when unsure; never downgrade verifier/decisions.md writers/interface-locking packets; escalate on struggle after one corrected re-dispatch (log in run-memory); lower effort for mechanical stages; log every choice; disclose per-agent cost table. Posture table per conductor model (Sonnet 5 = re-ground every ~10 tool calls; Opus 4.8 = full over-engineering suppressors; Fable 5 optional verifier).
- Fresh-context verifier subagent (Step 7): reads ONLY DoD + draft report + `.taskstate/evidence.md`, one line per DoD row CONFIRM|CHALLENGE + reason; every CHALLENGE must be resolved (real check -> ledger entry, or demote to IMPLEMENTED-NOT-VERIFIED). Degraded hosts: same audit as separate pass "setting aside the implementation context".
- No token meter, no context-size gate, no handling of its own conductor context growth (that is exactly the do-it CB-* gap).

### 3.8 Packaging / host portability
- `plugins/build-it/.claude-plugin/plugin.json` v3.1.1; `.claude-plugin/marketplace.json` name `build-it` (self-hosted; install `build-it@build-it`) listing prompt-it (0.2.1 stale) and build-it. README documents `npx skills add DevOtts/build-it -a codex|cursor|openclaw|github-copilot|...` and "Copilot CLI"; non-Claude hosts get only the single-file root SKILL.md and run launch/iterate/QA phases inline ("degrade, never break"). Only Claude Code gets the bundle (conductor + launch/iterate/full-qa/chrome-cdp-control) and optional hooks.
- Claude-specific: slash-skill invocation of siblings, `Agent`/subagent model selection, Haiku/Sonnet/Opus naming, hooks (Python), `claude -p` headless snippet inside launch/SKILL.md (lines ~481, ~699), `/chrome-cdp-control`. Host-agnostic: gates catalog, run-state contract, claim/ledger discipline, report format, parallel-safety protocol (explicit "mechanics region" lint t20 forbids Claude-Code terms in the portable file).

### 3.9 Handoff to NEXT stage today / what is missing
Exists: `.build-it-reports/report.md` (human); review-it consumes "report/branch/deploy under review + contract"; prompt-it Mode 2 reads `.build-it-reports/` + run-memory + decisions; conclude-it takes over session close (user global CLAUDE.md: reap subagents, session-history card).
Missing:
- No run-level machine-readable result or exit status; DoD table must be parsed from markdown (`| # | Criterion | Status | Evidence |`).
- No ingest of the plan-it package: DoD from CONTRACT/epics `Test Contract` cases is hand-copied via a prompt; no `T-<EID>-NN` -> DoD mapping, no write-back to plan-it's `STATUS.md` Disposition column (G-9 vocabulary) except by orchestrator-prompt convention.
- Status vocabularies differ: plan-it/closed vocabulary includes `IMPLEMENTED-NOT-VERIFIED` and `backlog-with-reason`/`owner-gated` (dispositions); build-it uses VERIFIED/IMPLEMENTED-NOT-VERIFIED/BLOCKED. Mapping is implicit.
- No clean "stop reason" (done / blocked / usage-limit / context-cap) and no resumability pointer beyond reading `.taskstate/`; no `token-meter.jsonl`.
- Hooks not auto-installed (no hooks.json); `dod.md` is hardened-mode-only, so Stop hook silently fails open on normal runs.
- Wake-up scheduling is not part of the plugin (lives in user's global CLAUDE.md).

### 3.10 Changes needed so do-it can call it headlessly
1. Write `.build-it-reports/result.json` (see 5.3) alongside report.md; make `dod.md` always-on (not hardened-only) as the canonical machine DoD state, with `status` per row.
2. Accept an explicit input file: `.taskstate/input.json` or `--dod-from delivery/<x>/epics/*.md` (importer reading Test Contract `T-<EID>-NN` rows + `[REAL]` flags + CONTRACT path + sha) so do-it passes a pointer, not a pasted DoD.
3. Define run-level states and exit semantics: `DONE_ALL_VERIFIED | DONE_WITH_RESIDUALS | BLOCKED | NEEDS_RESET (context cap) | USAGE_LIMIT | ABORTED`, exit code mapping (0/10/20/30...), written in result.json.
4. Add context/token self-metering: append `.taskstate/token-meter.jsonl` rows as in do-it sec. 6 and a CB-1/CB-2 self-checkpoint rule; change Step 1 "Anti-context-anxiety" per do-it sec. 5.1 (keep "don't stop", add "reset proactively at CB-2"). Reword "Save context window is a weak reason to parallelize".
5. Tier map as input: let do-it pass `tiers: {T1,T2,T3}` mapping to host models and a conductor tier; keep model-tiers.md as default. Enforce do-it TR-1 (explicit tier on every spawn) inside the delegation log.
6. Provide a hooks.json (opt-in via flag) so Stop/evidence hooks can be loaded by plugin enablement instead of manual settings edit; document RUNLOCK owner = do-it run id so do-it, not build-it, owns "one conductor per run" (SL-4).
7. Wake-up contract: document `resume.md` (exact next action + state files) written at every phase boundary so a fresh context resumes cheaply; build-it Step 0 should detect `.taskstate/` mid-run and resume instead of restarting.
8. Sync root and plugin SKILL.md (plugin one lacks `version`; root says 3.1.0 while plugin.json says 3.1.1).

---------------------------------------------------------------------
## 4. Claude-specific vs host-agnostic (summary table)

| Aspect | prompt-it | plan-it | build-it |
|---|---|---|---|
| Manifest | `.claude-plugin/plugin.json` + marketplace `devotts` | same + marketplace `devotts` | plugin.json + marketplace `build-it` |
| Portable SKILL.md | root SKILL.md (diverged from plugin copy) | root SKILL.md == plugin copy + mirror-check | root SKILL.md (condensed, differs from plugin) |
| Other hosts claimed | cursor, codex, copilot, opencode, windsurf, zed, gemini-cli, cline, amp, warp via `npx skills add` | frontmatter: claude-code, cursor, codex, copilot | cursor, openclaw, mcp, openai; README: codex, cursor, copilot, others |
| Hard enforcement | none | PreToolUse hook (CC only) + gate-check (Node, any host) | opt-in Stop/PreToolUse Python hooks (CC only) |
| Claude-only dependencies | slash trigger, /read-chat, ledger | Agent/SendMessage, /effort, /read-chat, handoff trio | Agent subagent+model choice, Haiku/Sonnet/Opus tiers, sibling skills, claude -p |
| Degrade path | n/a (no tools needed) | manual checks recorded in state.json | inline phases, separate-pass verifier |
| opencode specifically | listed in README only | not mentioned in SKILL | not mentioned beyond "others" |

For do-it host-agnosticism: plan-it's state/gate-check are the most portable (JSON + Node); build-it's contract is portable but file-format-weak (markdown); prompt-it is portable but outputs only in chat. None expose a tool-call API; the lowest-common-denominator integration is "spawn a fresh agent session with a prompt + read files it writes".

---------------------------------------------------------------------
## 5. Proposed machine-readable results (additive, for do-it to consume)

Common envelope (each stage writes `<stage-dir>/result.json`, atomically, last):
```json
{ "schema":"it-result/1", "stage":"prompt-it|plan-it|build-it", "run_id":"", "version":"",
  "status":"ok|needs_human|blocked|failed|context_reset|usage_limit",
  "exit_code":0, "started_at":"", "ended_at":"",
  "next":{"stage":"build-it","input":"relative/path","launch_prompt":"relative/path"},
  "pending_human":{"gate":"G1","questions_path":"","twin_html":""},
  "artifacts":[{"path":"","kind":"","sha256":""}],
  "resume":{"state_files":[""],"next_action":"one line"},
  "tokens":{"meter":".taskstate/token-meter.jsonl","peak_ctx":0,"tier_mix":{"T1":0,"T2":0,"T3":0}} }
```
### 5.1 prompt-it
`.do-it/prompts/<n>.result.json`: `{mode, route, prompt_path, delivery, assumptions[], unvalidated_pointers[], word_count}` (envelope + these).
### 5.2 plan-it (`delivery/PLAN-RESULT.json`, at handoff)
`{state, mode, topology, size, shape, deliveryRoot, contract:{path,version,draft,sha256}, tallies:{epics,cases,real}, gates:{G0..G4}, waves:[{id,epics:[]}], sessions:[{name,role,prompt_path}], launch_prompt_path, residuals:[{case,disposition}], dod:[{id,criterion,verification_target,source:"CONTRACT|epic"}]}`.
### 5.3 build-it (`.build-it-reports/result.json`)
`{goal, model, posture, approach, dod:[{n,criterion,status:"VERIFIED|IMPLEMENTED-NOT-VERIFIED|BLOCKED",evidence_ref:".taskstate/evidence.md#<anchor>",blocker}], verifier:{challenges:n,resolved:n}, delegation:[{packet,tier,why,escalated}], escalations:n, report_path, credentials_path, lock:{released:true}, verdict:"DONE_ALL_VERIFIED|DONE_WITH_RESIDUALS|BLOCKED|NEEDS_RESET|USAGE_LIMIT"}`.

---------------------------------------------------------------------
## 6. Overlaps / conflicts between the three (and with do-it)

1. Tiering: prompt-it forbids tiering content; build-it owns tiering (model-tiers.md, 3 tiers = cheap/mid/top, Claude model names); plan-it defines tiering per-run in CONTRACT RUN-POLICY and G1 prose and says "no hardcoded model IDs" (G-4). do-it's abstract T1/T2/T3 (TR-1..TR-6) is a fourth vocabulary. Needs one canonical map (do-it) that the others import.
2. Coordinator tier: plan-it/build-it default "top tier = session model" (and plan-it says "coordinator on strongest available model"); do-it TR-4 says conductor = T2, T1 consulted short-lived; user global CLAUDE.md says coordinator is Opus 5.5, never Fable. Direct conflict with build-it's "default = inherit session model" and "Top = session model".
3. Context hygiene: build-it "Anti-context-anxiety" + "Save context window is a weak reason to parallelize" conflict with do-it CB/DL gates (do-it sec. 5.1 already notes). plan-it keeps "all synthesis single-threaded in the main thread" - a context-growth risk (do-it sec. 5 plan-it row).
4. Session lifecycle: plan-it says "the build runs in a fresh session" but never says "close this one" (do-it SL-1). build-it wake-up chain (global CLAUDE.md) versus do-it SL-2/SL-3 (wake fresh).
5. Statuses/vocab: build-it {VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED}; plan-it closed vocabulary + dispositions {backlog-with-reason, owner-gated, IMPLEMENTED-NOT-VERIFIED} (G-9); review-it (not read here) has its own report status vocabulary. Needs one enum.
6. Human gates: plan-it pauses 3-4 times; do-it wants ONE batched owner decision gate per run (cf. user's backlog-drain-it pattern). Gates G0/G1/G4 would need to be hoisted/merged by do-it.
7. Handoff duplication: plan-it's launch prompt vs `/next-session-prompt` vs prompt-it. plan-it SKILL says `/next-session-prompt` (or author directly) produces the launch prompt; prompt-it targets.md says prompt-it must not take over `/next-session-prompt`; prompt-it never reads plan-it's package. Three owners of "the next prompt".
8. State locations: `.plan-it/` vs `.taskstate/` vs `.build-it-reports/` vs `.do-it/`(proposed) - and root `.agents/history/` ledger shared with conclude-it. `.taskstate/` is also gitignored in plan-it, so a plan-it run in a repo that is later built by build-it shares `.taskstate/` namespace but not content.
9. Resume anchors: plan-it KICKOFF pinning block (repo@SHA, state path, CONTRACT sha) vs build-it RUNLOCK/`.taskstate`. Neither knows the other.
10. Worktrees: plan-it G-10 "worktrees-only" for squads vs build-it worktree gate for mutating parallel agents (`.build-it/wt/<lane>`, `agent/<lane>`) and plan-it's `.claude/worktrees/v4*` (seen in repo) - equivalent in intent, different paths/names.
11. Packaging drift: stale prompt-it 0.2.1 pins in two marketplaces; root vs plugin SKILL.md divergences in prompt-it and build-it; devotts vs build-it marketplace names.
12. Failure modes of the hooks: plan-it hook only guards contract-unfrozen writes; build-it hooks are off by default; do-it cannot rely on either for enforcement and should enforce at its own layer.

---------------------------------------------------------------------
## 7. How do-it should call each (recommended minimal protocol, given today's code)

Today (no changes): do-it spawns a FRESH agent session per stage, with a short pointer-only brief (DL-1, DL-2):
- prompt-it: T2/T3 fresh agent, input = rough ask + route; parse the fenced block; treat `▶` as advisory. (T3 plausible; skill is small. Eval was run at the session-default tier, so avoid T3 until re-evaluated.)
- plan-it: T1/T2 fresh session at project root, `/plan-it` + `.plan-it/state.json` resume. Human gates surface as chat questions; do-it must interpret them (there is no gate file). Poll via `node gate-check.mjs state --dir <root> [--run slug]` and `runs --json`. Completion = state `done` AND `gate-check handoff --dir` exit 0 AND `contract.draft` false. Then read `delivery/KICKOFF.md` pinning block and launch prompt. Close the planner (SL-1).
- build-it: T2 conductor fresh session, input = KICKOFF launch prompt (or goal + DoD). Poll `.taskstate/evidence.md`, `.taskstate/RUNLOCK` heartbeat, `.build-it-reports/report.md` existence. Completion = report.md exists and verifier section resolved; parse DoD table. Reset/resume policy: if conductor context >= CB-2, do-it kills it and starts a fresh one with "resume from `.taskstate/`" (works because build-it already externalizes state; RUNLOCK must be reclaimed - stale reclaim needs heartbeat to age 10 min OR same-host pid dead, so do-it should delete/transfer RUNLOCK deliberately and log it).

Single highest-leverage change set (small, additive): (a) result.json envelope in all three; (b) plan-it `status --json` + PENDING-HUMAN.json + exit code 2; (c) build-it DoD importer from plan-it epics + always-on dod.md + token-meter.jsonl + run-level verdict; (d) prompt-it file output + non-interactive flag; (e) one tier vocabulary (do-it T1/T2/T3) imported by all.

---------------------------------------------------------------------
## 8. Open items I could not verify (honest gaps)
- review-it and conclude-it are out of scope here (not read); interfaces to them are only inferred from prompt-it targets.md and do-it doc.
- plan-it's `hooks.json` command path vs actual install layout (`plugins/plan-it/scripts/hooks/planit-guard.mjs` vs skill-local scripts) not verified by installing.
- Whether `gate-check state` without `--dir` from a target project root behaves identically to the --dir form; the one test I ran (archived v4 state, run from the plugin repo) returned FAIL for a root-resolution reason.
- build-it's root-vs-plugin SKILL.md differences were diffed only at a structural level (root is the condensed portable copy).
- I did not read the 170K+ of v4 CONTRACT.md in full; invariants G-1..G-15 and verbs come from CHANGELOG, SKILL.md and machine.md.

Key paths:
- /Users/macbook/Workspace/Devotts/prompt-it/plugins/prompt-it/skills/prompt-it/SKILL.md ; .../references/targets.md ; /Users/macbook/Workspace/Devotts/prompt-it/CHANGELOG.md
- /Users/macbook/Workspace/Devotts/plan-it/plugins/plan-it/skills/plan-it/{SKILL.md,machine.json,scripts/gate-check.mjs,references/machine.md,references/templates.md}
- /Users/macbook/Workspace/Devotts/plan-it/plugins/plan-it/hooks/hooks.json ; /Users/macbook/Workspace/Devotts/plan-it/delivery/v4/{KICKOFF.md,SESSIONS.md,CONTRACT.md,STATUS.md} ; /Users/macbook/Workspace/Devotts/plan-it/.plan-it/done/v4.state.json
- /Users/macbook/Workspace/Devotts/build-it/plugins/build-it/skills/build-it/SKILL.md ; .../skills/references/{model-tiers.md,parallel-safety.md} ; .../hooks/README.md ; /Users/macbook/Workspace/Devotts/build-it/.claude-plugin/marketplace.json
