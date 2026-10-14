# STATUS: do-it v1 board

Legend: NOT-STARTED · IN-PROGRESS · IMPLEMENTED-NOT-VERIFIED · VERIFIED
Program totals: 22 epics · 0 shipped (cases computed after squads finish)

| EID | Epic | Squad | Wave | Status | Tests (green/total) | Branch | Disposition |
|---|---|---|---|---|---|---|---|
| S1 | state, schemas, settings, doctor | spine | W0 | MERGED-VERIFIED | 15/15 | epic/S1-state | |
| S2 | router, next, finish-line, stop-gate | spine | W1 | MERGED-VERIFIED | 18/18 | epic/S2-router | |
| S3 | record, gate, evidence, conclude | spine | W0 | MERGED-VERIFIED | 19/19 | epic/S3-evidence | |
| S4 | owner pack, answer, renderers | spine | W2 | MERGED-VERIFIED | 16/16 | epic/S4-ownerpack | |
| S5 | handoff, park, resume, ceilings, secrets | spine | W1 | MERGED-VERIFIED | 17/18 (T-S5-18 verified after S4; S5-16/17 live aws/op unverified) | epic/S5-handoff | |
| P1 | pipelines and personas | economy | W2 | MERGED-VERIFIED | 19/19 | epic/P1-pipelines | |
| P2 | tier policy, briefs, meter | economy | W1 | MERGED-VERIFIED | 18/18 | epic/P2-tokens | |
| P3 | cache | economy | W3 | NOT-STARTED | 0/0 | epic/P3-cache | |
| P4 | review-loop convergence | economy | W2 | MERGED-VERIFIED | 20/20 | epic/P4-review | |
| H0 | host interface and conformance | hosts-a | W0 | MERGED-VERIFIED | 18/18 | epic/H0-interface | |
| H1 | claude-code adapter | hosts-a | W1 | MERGED-VERIFIED | 20/20 | epic/H1-claude | |
| H2 | codex adapter | hosts-a | W2 | MERGED-VERIFIED | 17/17 | epic/H2-codex | |
| H3 | opencode adapter | hosts-a | W2 | MERGED-VERIFIED | 18/18 | epic/H3-opencode | |
| N1 | engine adapter | engine | W3 | NOT-STARTED | 0/0 | epic/N1-engine | |
| N2 | StateStore and backends | engine | W2 | MERGED-VERIFIED | 17/18 (T-N2-04 live Engine unreachable) | epic/N2-statestore | |
| N3 | Engine-layer handoff and replay | engine | W3 | NOT-STARTED | 0/0 | epic/N3-handoff | |
| R1 | README and assets | ship | W4 | NOT-STARTED | 0/0 | epic/R1-readme | |
| R2 | plugin shell, marketplace, companions | ship | W0 | MERGED-VERIFIED | 15/16 (1 skip) | epic/R2-shell | |
| R3 | companion-change catalog | ship | W3 | NOT-STARTED | 0/0 | epic/R3-companions | |
| R4 | fixtures and e2e | ship | W1 | NOT-STARTED | 0/0 | epic/R4-fixtures | |

## Residuals
| Item | Disposition | Reason / exit criterion | Evidence |
|---|---|---|---|

## Log
- 2026-10-14: W0-W2 merged; suites green on main (see .taskstate/evidence.md). W3 in flight (P3,N1,N3,R3). R4 skeleton merged (15 pass, 11 deferred to W4).
- 2026-10-14: contract frozen as v1.0-draft; squads dispatched.
