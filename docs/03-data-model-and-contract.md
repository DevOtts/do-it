# 03. Data model and contract

Canonical shapes the spine, the stage plugins and the host adapters agree on. The frozen copy is `delivery/CONTRACT.md`; this document explains it.

## 1. Vocabulary
**Run**: one execution of a preset for one request. **Slice**: a unit of build work with one writer. **Stage**: one of prompt-it, plan-it, build-it, review-it, deploy-it, conclude-it, reconcile-it. **Spine**: the `do-it` CLI. **Conductor**: the thin session that calls the spine. **Host**: the AI coding harness (claude-code, codex, opencode, engine). **Owner pack**: the single set of questions for the human. **Finish line**: the board of rows that must all become terminal. **Tier**: T1 powerful, T2 balanced, T3 cheap (aliases to model names per host).

## 2. `it-result/1` (written by every stage as its last act; atomic write)
```json
{ "schema": "it-result/1",
  "stage": "prompt-it|plan-it|build-it|review-it|deploy-it|conclude-it|reconcile-it",
  "run_id": "", "slice_id": null, "version": "", "head_sha": null,
  "status": "ok|needs_human|blocked|failed|context_reset|usage_limit",
  "exit_code": 0,
  "verdicts": [ { "row": "DOD-3", "verdict": "VERIFIED|IMPLEMENTED-NOT-VERIFIED|BLOCKED", "evidence": "path-or-id", "real": true } ],
  "run_verdict": "DONE_ALL_VERIFIED|DONE_WITH_RESIDUALS|BLOCKED|NEEDS_RESET|USAGE_LIMIT|null",
  "next": { "stage": "", "input": "", "launch_prompt": "" },
  "pending_human": { "gate": "", "questions_path": "", "twin_html": "" },
  "artifacts": [ { "path": "", "kind": "", "sha256": "" } ],
  "resume": { "state_files": [""], "next_action": "one line" },
  "tokens": { "meter": ".do-it/runs/<id>/token-meter.jsonl", "peak_ctx": 0, "tier_mix": { "T1": 0, "T2": 0, "T3": 0 }, "estimated": false } }
```
Rules: `exit_code` mirrors `status` (ok 0, failed 1, needs_human 2, blocked/usage_limit/context_reset 3). A verdict of VERIFIED requires a non-empty `evidence` that resolves to a file or ID the spine can check; `real:true` rows can never be VERIFIED on a mock (unreachable target = IMPLEMENTED-NOT-VERIFIED). deploy-it extends with `legs[]` and its own result states.

## 3. Run state (`runs/<id>/state.json`, written only by the spine)
`{schema:"do-it-state/1", run_id, preset, request, status, size, host, stage, slices:[{id,lane,tier,status,attempts,escalations}], gates:{G:{approved,owner,date}}, handoffs:n, stop_refusals:n, review:{round,exit}, created_at, updated_at}`.

**Run statuses**: INTAKE, PLANNING, AWAIT_RATIFY, BUILDING, VERIFYING, REVIEWING, FIXING, DEPLOYING, PROVING, CONCLUDING, DONE, plus NEEDS_HUMAN, PARKED, BLOCKED, and failure statuses FAILED, PARTIAL_FAILURE, ROLLED_BACK, ESCALATED.

## 4. Events and token meter (trace fields frozen for v2 exporters)
`events.jsonl` row: `{ts, run_id, slice_id, stage, persona, tier, model, host, event, parent_id, verdict}`. `token-meter.jsonl` row adds `tokens_in, tokens_out, cache_read, cache_write, estimated, source` where `source` is `provider|estimate|unknown`. Models never write these fields.

## 5. Finish line, owner pack, ledger
- `finish-line.json`: `{rows:[{id,kind:"wave|package|dod",state:"OPEN|DONE|PARKED|BLOCKED",evidence,owner_question,reason,archived_to}]}`. The run may close only when every row is DONE, PARKED with a question, or BLOCKED with a reason.
- `owner-pack.json`: `{pack_id, run_id, questions:[{n,kind:"ratify|owner-gate|attended|review-cap|default",text,options,recommendation,default,reversible}], created_at}`. Reply grammar: `<n> <answer>` tokens, `all except 4 7`, `n: free text`.
- `ledger.json`: DoD rows with their latest verdict and evidence; conclude refuses to close with an unaccounted row, a live worker or a pending wake-up.

## 6. Settings (`.do-it/settings.json`; global `~/.do-it/settings.json`)
```json
{ "version": 1,
  "interaction": { "owner_pack": "auto", "fallback": ["native","html","markdown"] },
  "host": { "driver": "auto", "alias": null },
  "isolation": { "driver": "worktree" },
  "state": { "backend": "local" },
  "secrets": { "provider": "file", "ref": ".secrets/" },
  "handoff": { "mode": "auto", "max_per_run": 5 },
  "review": { "max_rounds": 3 },
  "tiers": { "T1": "", "T2": "", "T3": "" },
  "ceilings": { "warn_tokens": 150000, "warn_pct": 40, "block_tokens": 250000, "block_pct": 60 },
  "stop_gate": { "patience": 3 },
  "observability": { "provider": "none" } }
```
Precedence: run flag, workspace, global, defaults. Secrets hold references only. Ceilings: whichever of absolute or window-percent fires first.

## 7. `.do-it/` layout
```
.do-it/ settings.json  .env.example  finish-line.json
  runs/<run-id>/ state.json events.jsonl ledger.json token-meter.jsonl briefs/ results/ owner-pack.{json,html,md} handoff.md
  plan/ (READINESS.json DECISIONS.md)  build/  review/ (roteiro, ATTENDED-GATE.html)  deploy/  conclude/  reconcile/  digests/
```
Outside: `.claude/ .agents/ .opencode/ .secrets/` and project deliverables in `docs/implementation/<x>/`. Git ignores `.do-it/runs/`; `settings.json` and `.env.example` may be committed (no secrets).

## 8. Host adapter contract (`hosts/_interface/host-adapter.schema.json`)
Calls: `spawn(role,tier,brief) -> result_path`, `ask(pack)`, `collect() -> answers`, `continue(handoff)`, `wake(at,prompt)`, `meter() -> usage|null`, plus drivers `isolation`, `secrets`, `stateStore`. `capabilities.json`: `{host, version_probed, spawn:{native:bool, per_spawn_model:bool, max_parallel}, ask:{native:bool, max_questions}, continue:{headless:bool}, wake:{native:bool}, meter:{provider_usage:bool, cache_fields:bool}, hooks:{stop_gate:bool}, isolation:[...], unknown:[...]}`. A missing capability triggers the documented fallback; an adapter that fails the shared conformance suite lists exactly what it skips and why.

## 9. Pipeline step (YAML)
`{id, type: persona|checkpoint|decision|code, persona?, skill?, tier?, gate?, ask?, consumes_previous?, loop_to?, max_rounds?, eval?:{veto,max_retries}, adapter?, needs?[], on_limit?}`.

## 10. StateStore interface
`get(path) put(path, bytes) append(path, line) list(prefix)` over `runs/<id>/...`. Backends: `local-fs`, `git-branch` (core); `engine` (rows or interactions for state, object store for blobs addressed by sha256; Engine decides).

## 11. Exit codes (spine)
0 ok · 1 failed (a guard or contract failed) · 2 needs human (owner pack waiting) · 3 blocked or usage limit (parked; a wake is scheduled when the host can).

## 12. Core-logic models (failure half included)
**M1 run lifecycle.**
INTAKE --> PLANNING --> AWAIT_RATIFY --> BUILDING --> VERIFYING --> REVIEWING --> DEPLOYING --> PROVING --> CONCLUDING --> DONE
REVIEWING --> FIXING --> VERIFYING
BUILDING --> FAILED ; FAILED --> BUILDING (retry one tier up, once) ; FAILED --> ESCALATED (second failure)
DEPLOYING --> PARTIAL_FAILURE (some legs or targets passed) ; PARTIAL_FAILURE --> ROLLED_BACK (compensation) ; ROLLED_BACK --> DEPLOYING (re-verify after fix) ; ROLLED_BACK --> ESCALATED (rollback fails)
BUILDING --> PARKED (usage limit) ; PARKED --> BUILDING (resume from state)
AWAIT_RATIFY --> NEEDS_HUMAN ; NEEDS_HUMAN --> BUILDING (answered)
BUILDING --> BLOCKED (owner gate) ; BLOCKED --> BUILDING (unblocked)
**M2 review loop.** ROUND_RUNNING --> CONVERGED ; ROUND_RUNNING --> CONVERGED_WITH_MINORS ; ROUND_RUNNING --> STALLED ; ROUND_RUNNING --> OVER_BUDGET ; STALLED --> ESCALATED (owner decides) ; OVER_BUDGET --> PARKED.
**M3 conductor ceiling.** CONDUCTOR_ACTIVE --> CEILING_BLOCKED --> HANDOFF_WRITTEN --> CONDUCTOR_RESUMED ; HANDOFF_WRITTEN --> HANDOFF_FAILED ; HANDOFF_FAILED --> HANDOFF_WRITTEN (retry, cap 5) ; HANDOFF_FAILED --> ESCALATED (cap reached).
Failure tests must assert each of FAILED, PARTIAL_FAILURE, ROLLED_BACK, ESCALATED, STALLED, OVER_BUDGET, HANDOFF_FAILED, BLOCKED, PARKED as outcomes, plus the five cascade classes (partial-failure, rollback/compensation, failed-recovery to escalation, recovery/resume, adversarial-verify).
