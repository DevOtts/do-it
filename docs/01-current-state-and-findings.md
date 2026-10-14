# 01. Current state and findings

Run `do-it-v1` · 2026-10-14 · ground truth for the plan. Every claim cites a research file (R-nn, under `docs/implementation/do-it-v1/research/` unless marked `docs/research/`) or a probe. Nothing here is guessed; where the evidence is thin it says so.

The owner's words (kept verbatim for the vision): *"the grande maestro of our development harness"*; installing do-it installs the others; from a message or a new task do-it runs the full lifecycle; LLM agnostic; token optimization is a core responsibility; everything in one `.do-it/` folder; plan once and ask once; the review loop needs an iteration limit.

## F1. Seven stage plugins exist, only one speaks machine-readable results
prompt-it, plan-it, build-it, review-it, conclude-it and parallel-lifecycle are plugins; engine-deploy, deploy-router and reconcile-it are loose skills (R-02, R-03). Only engine-deploy (LEG lines, exit 0/1/2, `run.json`) and plan-it's `gate-check` emit machine-readable results. Handoffs between stages are pasted by the human. Result vocabularies differ (PASS/FAIL/INV, GREEN/RED/UNVERIFIED, PASS/FAIL/SKIP) and four tier vocabularies are in use. Consequence: do-it cannot drive stages until each writes one `it-result/1` file.

## F2. Drift to fix before wrapping
plan-it and build-it marketplaces pin prompt-it 0.2.1 while 0.3.0 is current; root and plugin `SKILL.md` copies differ in places; build-it's "anti-context-anxiety" wording conflicts with context ceilings; it is unconfirmed whether build-it writes `.build-it-reports/` or `.fable-it-reports/` (R-02).

## F3. The reference video is the concept, not an Engine squad
`videoplayback.mp4` is IndyDevDan's talk on AI Developer Workflows: actors are human, agent or code (reliability code > engineer > agent), humans only at the ends, failure loops back to a build agent, a "factory router" picks a workflow per ticket type (R-01). It does not show Engine squads. Squad design therefore comes from Engine's own schemas (R-06). The owner has not yet confirmed that this is the intended video.

## F4. How the owner works (112 ledger cards, 2026-09-14 to 2026-10-14)
Twelve session archetypes fold into five presets: feature, investigate-fix, drain, review-loop, reconcile (R-04). Repeated complaints: "done" that is not in 0-done, token burn, the wrong top model ("only Opus 5.5 at the top"), unverified claims, deploy collisions, leftovers. He keeps for himself: plan ratification, production flag flips, credential rotation, spend, destructive deletes, client-facing actions. He answers tersely and numbered.

## F5. Four behaviors produce quality and are currently kept alive by hand
(1) Plan once, ask once, decisions carry a recommendation. (2) Run to a visible finish line: sessions stopped after a wave until asked "why not in 0-done?" (my reading, untested). (3) Reviewer writes the test script (roteiro), another agent runs it, builder fixes, repeat; it needs an exit rule. (4) One home folder for all machine state. Each is made mechanical in the architecture (docs/02).

## F6. Token economy is not hypothetical
Four levers: volume, routing, decomposition, cache (docs/implementation/do-it-v1/01-TOKEN-DISCIPLINE.md, R-07, R-09). Prior art says use provider-native caching, Claude Code's prefix discipline, LiteLLM's normalizer, OpenRouter `session_id`, ccusage, repomix; ignore GPTCache and LLMLingua (they rewrite or replace the prefix); build only what nobody covers: cross-harness cache-safe handoff, unified cache telemetry, cost-aware routing policy, fan-out warming, a prefix byte-diff detector (R-09). Figures come from fetched docs and some secondary sources; re-verify when drivers are written.

## F7. Engine fits as one host, and its dev squad is ahead of do-it in places
The Engine dev squad is a card-to-squad pipeline on Control Tower (R-08). It already has: the `[REAL]` tag rule, head-commit binding of verdicts, default-accept-by-ID owner questions, a frozen contract with an amendment log, a collision board, an untrusted-input boundary, kickoff-as-resume-prompt. Per-role Jobs run as k8s Jobs with gVisor; work survives in a git branch and the card, and the only warm box is the preview (2 h idle teardown). Review cap is 3 (PD-06). Squads cannot start squads and `spawn_agent` is off in production, so the Engine layer is a flat data pipeline with one router level; hierarchy only through dependent cards. 12 doc-only adjustments are saved in Engine-Core `docs/implementation/do-it-engine-layer/`.

## F8. Host CLI facts (probe, `docs/research/11-host-cli-probe.md`)
Installed: claude 2.1.300, codex 0.156.1, opencode 2.0.18.
- **Headless:** `claude -p --output-format json|stream-json`; `codex exec --json -C <dir>`; `opencode run --format json -m provider/model`. No documented exit-code contract on any of the three.
- **Plugin dependencies:** a Claude Code `plugin.json` can declare `dependencies` (array of names or `{name, version}`); the validator accepts it. Install-time resolution and the semver syntax are unverified. This closes the memo's open item; the `do-it doctor --install` fallback is kept for Codex and OpenCode, which have no manifest format.
- **Usage in output:** Claude exposes cost and cache tokens in JSON; Codex exposes cached-input and reasoning tokens, no cost; OpenCode exposes cost through `opencode stats`. Exact shapes are inferred from binary strings, not read from docs.
- **Hooks:** Claude about 28 events; Codex about 8 behind a feature flag; OpenCode uses JS plugin events. **Native question tool:** Claude `AskUserQuestion`; Codex `request_user_input` (flagged); OpenCode `question` (inferred). **Scheduling:** Claude has ScheduleWakeup/cron; Codex has queue; OpenCode has no scheduler.
- Unknowns that stay open: Codex and OpenCode behavior of their question tools non-interactively; real exit codes; stop-hook equivalents outside Claude.

## F9. Hermes and OpenClaw: researched, then removed from v1
The owner removed them from scope at G1 (2026-10-14). Findings are kept for a later release (`docs/research/10-hermes-openclaw.md`): both follow the SKILL.md standard (`skills` ids `hermes-agent` and `openclaw`), both can spawn subagents and run headless, neither has a documented stop-gate hook. No adapter, folder or test for them is in v1.

## F10. Security note from the probe
The probe agent printed a plaintext Notion bearer token that sits inline in `~/.config/opencode/opencode.jsonc`. It is not in any file of this repo (secret scan clean), but it is in the session transcript: rotate it and move it to an environment variable. do-it's rule: values never enter events, briefs, owner packs or model context.

## Contradictions adjudicated
| Claim | Evidence | Ruling |
|---|---|---|
| Engine review cap is 2 | PD-06 says 3; the older reviewer allowed 2 | 3 everywhere; no conflict |
| Claude plugins cannot declare dependencies (memo open item) | probe: field validated | they can; keep a doctor fallback for other hosts |
| Six hosts in v1 | owner at G1 | four: Claude Code, Codex, OpenCode, Engine |

## What was not read
plan-it's 45K-character CONTRACT.md; Engine's 146 KB CONTRACT, epics and PRDs; the per-alias ledger cards; runtime code of Engine; benchmark secondary-source claims were not re-verified.
