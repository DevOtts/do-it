# 00. Program plan: do-it v1

CONTRACT: delivery/CONTRACT.md v1.0-draft. Topology orchestrator+squads; this repo is not a git repository yet, so squads work on disjoint files and worktrees begin at the first commit (G-10 of plan-it applies once a repo exists).

## Squads and epics (22 epics, 10 or more binding cases each)
| Squad | Lane | PRD | Epics |
|---|---|---|---|
| spine | L1 | prd-1-spine | S1 state/schemas/settings/doctor · S2 router/next/finish-line/stop-gate · S3 record/gate/evidence/conclude · S4 owner pack/answer/renderers · S5 handoff/park/resume/ceilings/secrets |
| economy | L2 | prd-2-economy | P1 pipelines+personas · P2 tier policy/briefs/meter · P3 cache · P4 review-loop convergence |
| hosts-a | L3 | prd-3-hosts | H0 interface+conformance · H1 claude-code · H2 codex · H3 opencode |
| engine | L4 | prd-4-engine | N1 engine adapter · N2 StateStore + backends · N3 Engine-layer handoff and replay |
| ship | L5 | prd-5-ship | R1 README+assets · R2 plugin shell/marketplace/companions · R3 companion-change catalog · R4 fixtures and e2e |

## Waves
- W0: S1, S3, H0, R2 (contract, state, evidence, interface, plugin shell). W1: S2, S5, P2, H1, R4 skeleton. W2: S4, P1, P4, H2, H3, N2. W3: P3, N1, N3, R3. W4: R1 (needs measured fixtures), R4 completion, release v0.1 to v0.4 gates.

## Test standard
Every epic ends with a Test Contract (binding, 100 percent). Failure-state and cascade coverage per CONTRACT section 8. `[REAL]` cases name a live target (a real CLI binary, a real filesystem, a real repo); unreachable means IMPLEMENTED-NOT-VERIFIED. G-n rules are cited by cases.

## Build runbook
Launch `/build-it` with `delivery/KICKOFF.md`. Orchestrator is a fresh T2 session; squads T2; hard pieces (S2 stop-gate, P4 controller, H1 handoff) may escalate to T1 once. Verify files on disk before advancing STATUS.
