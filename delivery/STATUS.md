# STATUS: do-it v1 board

Legend: NOT-STARTED · IN-PROGRESS · IMPLEMENTED-NOT-VERIFIED · VERIFIED
Program totals: 20 epics · 16 VERIFIED · 4 IMPLEMENTED-NOT-VERIFIED · 352 cases: 347 verified, 5 not (see Residuals) · report: .build-it-reports/REPORT.md

| EID | Epic | Squad | Wave | Status | Tests (green/total) | Branch | Disposition |
|---|---|---|---|---|---|---|---|
| S1 | state, schemas, settings, doctor | spine | W0 | VERIFIED | 15/15 | epic/S1-state | run: node --test "core/spine/test/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| S2 | router, next, finish-line, stop-gate | spine | W1 | VERIFIED | 18/18 | epic/S2-router | run: node --test "core/spine/test/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| S3 | record, gate, evidence, conclude | spine | W0 | VERIFIED | 19/19 | epic/S3-evidence | run: node --test "core/spine/test/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| S4 | owner pack, answer, renderers | spine | W2 | VERIFIED | 16/16 | epic/S4-ownerpack | run: node --test "core/spine/test/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| S5 | handoff, park, resume, ceilings, secrets | spine | W1 | IMPLEMENTED-NOT-VERIFIED | 16/18 (T-S5-16,17 live aws/op not run; stub CLI contract only) | epic/S5-handoff | run: node --test "core/spine/test/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| P1 | pipelines and personas | economy | W2 | VERIFIED | 19/19 | epic/P1-pipelines | run: node --test "core/pipelines/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| P2 | tier policy, briefs, meter | economy | W1 | VERIFIED | 18/18 | epic/P2-tokens | run: node --test "core/routing/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| P3 | cache | economy | W3 | VERIFIED | 18/18 | epic/P3-cache | run: node --test "core/cache/tests/**/*.test.mjs" exit 0; log .taskstate/evidence.md |
| P4 | review-loop convergence | economy | W2 | VERIFIED | 20/20 | epic/P4-review | run: node --test "core/pipelines/review-loop/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| H0 | host interface and conformance | hosts-a | W0 | VERIFIED | 18/18 | epic/H0-interface | run: node --test "hosts/_interface/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| H1 | claude-code adapter | hosts-a | W1 | VERIFIED | 20/20 | epic/H1-claude | run: node --test "hosts/claude-code/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| H2 | codex adapter | hosts-a | W2 | VERIFIED | 17/17 | epic/H2-codex | run: node --test "hosts/codex/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| H3 | opencode adapter | hosts-a | W2 | VERIFIED | 18/18 | epic/H3-opencode | run: node --test "hosts/opencode/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| N1 | engine adapter | engine | W3 | VERIFIED | 18/18 (T-N1-16,17,18 live against a local brain-api-core PR #727 branch; PR not merged or deployed) | epic/N1-engine | run: node --test "hosts/engine/tests/*.test.mjs" exit 0; live: .taskstate/results/engine-adapter-live.md |
| N2 | StateStore and backends | engine | W2 | VERIFIED | 18/18 (T-N2-04 live: 12/12 on /api/run-rows of a local PR #727 Engine) | epic/N2-statestore | run: node --test "core/state-stores/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| N3 | Engine-layer handoff and replay | engine | W3 | IMPLEMENTED-NOT-VERIFIED | 13/14 (T-N3-14: inject + state read-back verified live; no W3 pipeline or drain installed so cards never run) | epic/N3-handoff | run: node --test "hosts/engine/tests/*.test.mjs" exit 0; log .taskstate/evidence.md |
| R1 | README and assets | ship | W4 | IMPLEMENTED-NOT-VERIFIED | 15/16 (T-R1-15 compared to stub-host report only) | epic/R1-readme | run: node --test "tests/readme/*.test.mjs" exit 0 |
| R2 | plugin shell, marketplace, companions | ship | W0 | VERIFIED | 16/16 with DO_IT_SIBLINGS set | epic/R2-shell | run: node --test "tests/plugin/*.test.mjs" exit 0; log .taskstate/evidence.md |
| R3 | companion-change catalog | ship | W3 | VERIFIED | 16/16 | epic/R3-companions | run: node --test "tests/catalog/*.test.mjs" exit 0; log .taskstate/evidence.md |
| R4 | fixtures and e2e | ship | W1 | IMPLEMENTED-NOT-VERIFIED | 19/20 (T-R4-05: Engine reachable but no W3 pipeline/drain, no sandbox is created) | epic/R4-fixtures | run: node --test "tests/e2e/r4.test.mjs" exit 0; log .taskstate/evidence.md |

## Residuals
| Item | Disposition | Reason / exit criterion | Evidence |
|---|---|---|---|
| T-S5-16, T-S5-17 | IMPLEMENTED-NOT-VERIFIED | live aws/op not run, no access; exit: owner supplies access | run: .taskstate/results/S5.md |
| T-N3-14, T-R4-05 | IMPLEMENTED-NOT-VERIFIED | Engine PR #727 (local, unmerged) gives card inject/state only; no do-it W3 pipeline or Engine drain is installed, so cards never run and no run_status/exit_code or sandbox exists to compare; exit: install the W3 pipeline on an Engine with #727 | run: .taskstate/results/engine-adapter-live.md |
| T-R1-15 | IMPLEMENTED-NOT-VERIFIED | morning report matched to stub-host run only | run: .taskstate/results/R1.md |
| T-N1-16, T-N1-17, T-N1-18, T-N2-04 | VERIFIED live | against a local brain-api-core running PR #727 (b901a9bd), scratch DB; not merged, not deployed | run: .taskstate/results/engine-adapter-live.md |
| (earlier) T-N1-16 | VERIFIED live | local brain-api-core checkpoint card | run: .taskstate/results/live-w4.log exit 0 |

## Log
- 2026-10-14: engine adapter wired to Engine PR #727 routes (ask-cards, x_do_it, internal tasks, run-rows); T-N1-17, T-N1-18, T-N2-04 VERIFIED live on a local PR branch; T-N3-14 and T-R4-05 stay IMPLEMENTED-NOT-VERIFIED (no W3 pipeline/drain).
- 2026-10-14: waves zero to two merged; suites green on main (see .taskstate/evidence.md). W3 in flight (P3,N1,N3,R3). R4 skeleton merged (15 pass, 11 deferred to W4).
- 2026-10-14: contract frozen as v1.0-draft; squads dispatched.
