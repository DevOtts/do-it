# SCOPE-BRIEF: do-it v1 planning run

Run: `do-it-v1` · mode autonomous-draft · 2026-10-14 · size **L** · shape **1 (multi-doc + delivery/)** · topology **orchestrator+squads**

## DoD for this planning run
1. `docs/01-current-state-and-findings.md`: ground truth, every claim cited to a research file or a probe.
2. `docs/02-vision-and-architecture.md`: spine, conductor, pipelines, state, owner pack, token economy, host layer.
3. `docs/03-data-model-and-contract.md`: schemas (`it-result/1`, state, settings, owner-pack, finish-line, host-capabilities, squad) and exit codes.
4. `docs/05-components.md`: spine, 4 host adapters (Claude Code, Codex, OpenCode, Engine), personas/pipelines, changes to the 7 companion plugins.
5. `docs/06-roadmap-and-open-questions.md`: releases v0.1 to v0.4, risks, what stays open.
6. `DECISIONS.md`: every call with recommendation; owner rulings from 2026-10-14 locked.
7. `delivery/CONTRACT.md` frozen (draft until G4).
8. PRDs + epics for 5 lanes, each epic ending in a Test Contract; `gate-check handoff` and `adversary` clean.
9. `README.md` + `assets/` (hero SVG, pipeline SVG) in the DevOtts plan-it/build-it pattern, ready for promotion.
10. `delivery/KICKOFF.md` + launch prompt for /build-it.

## Size / shape / topology rationale
| Choice | Why | Wrong for |
|---|---|---|
| L | spine + 6 hosts + pipelines + 7 companion changes + marketing | a single-feature plan |
| Shape 1 | disjoint lanes, parallel squads, greenfield repo with a frozen contract | single-file PRD |
| orchestrator+squads | 5 lanes with disjoint paths | solo (context too big) |

## Lanes
L1 spine and schemas · L2 pipelines, personas, routing, token economy, cache · L3 host interface + claude-code + codex + opencode · L4 engine host + state stores + Engine-layer handoff · L5 README/marketing, packaging, companion-plugin changes, tests/fixtures.

## Fences (G0, derived from the session; contradict at G4)
No edits in Engine-Core except `docs/implementation/do-it-engine-layer/`; no edits, commits or pushes in sibling plugin repos during planning; no publishing beyond the private artifact; no credentials read; live probes limited to `--help`/`--version` and read-only web research.

## G1 ruling (Fernando, 2026-10-14)
Size L confirmed. **Hermes and OpenClaw are out of scope for v1** (their research stays in `docs/research/10-hermes-openclaw.md` for a later release); **Engine stays**. Hosts in v1: Claude Code, Codex, OpenCode, Engine.
