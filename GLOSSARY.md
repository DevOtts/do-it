# GLOSSARY

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

| ID | Meaning | Defined in |
|---|---|---|
| ADW | AI Developer Workflow: a repeatable agent pipeline with humans only at the ends | CONTRACT.md / DECISIONS.md |
| ATTENDED-GATE | HTML checklist a human ticks for checks that cannot be automated | CONTRACT.md / DECISIONS.md |
| Ceiling | context-size limit at which the conductor hands off | CONTRACT.md / DECISIONS.md |
| CDP | Chrome DevTools Protocol, used to drive a real browser in review | CONTRACT.md / DECISIONS.md |
| Conductor | thin session that calls the spine and spawns stage personas | CONTRACT.md / DECISIONS.md |
| DoD | Definition of Done: numbered, individually verifiable rows | CONTRACT.md / DECISIONS.md |
| EID | epic ID prefix used in case IDs (S1, P2, H1, N1, R1 ...) | CONTRACT.md / DECISIONS.md |
| Finish line | board of waves, packages and DoD rows that must all become terminal | CONTRACT.md / DECISIONS.md |
| Handoff | resume prompt and state written so a fresh conductor can continue | CONTRACT.md / DECISIONS.md |
| Host | the AI coding harness running do-it (claude-code, codex, opencode, engine) | CONTRACT.md / DECISIONS.md |
| it-result/1 | the atomic result file every stage writes | CONTRACT.md / DECISIONS.md |
| LEG | one named step of a deploy (the LEG protocol of engine-deploy) | CONTRACT.md / DECISIONS.md |
| Owner pack | the single numbered question set for the human | CONTRACT.md / DECISIONS.md |
| [REAL] | a test case that needs a live target; never VERIFIED on a mock | CONTRACT.md / DECISIONS.md |
| Roteiro | the test script a reviewer writes and another agent runs | CONTRACT.md / DECISIONS.md |
| Spine | the `do-it` CLI, sole writer of run state | CONTRACT.md / DECISIONS.md |
| StateStore | interface for reading and writing run files on any backend | CONTRACT.md / DECISIONS.md |
| T1 T2 T3 | tiers: powerful, balanced, cheap | CONTRACT.md / DECISIONS.md |
| VERIFIED | row with resolvable evidence; otherwise IMPLEMENTED-NOT-VERIFIED | CONTRACT.md / DECISIONS.md |
| Wn | wave number in the build plan | CONTRACT.md / DECISIONS.md |
| G-n | governance rule number in delivery/CONTRACT.md | CONTRACT.md / DECISIONS.md |
| Rn | recorded default number in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| Dn | owner ruling number in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| T-<EID>-NN | test case ID, e.g. T-S1-01 | CONTRACT.md / DECISIONS.md |
| S1 | epic S1: state, schemas, settings, doctor | CONTRACT.md / DECISIONS.md |
| S2 | epic S2: router, next, finish-line, stop-gate | CONTRACT.md / DECISIONS.md |
| S3 | epic S3: record, gate, evidence, conclude | CONTRACT.md / DECISIONS.md |
| S4 | epic S4: owner pack, answer, renderers | CONTRACT.md / DECISIONS.md |
| S5 | epic S5: handoff, park, resume, ceilings, secrets | CONTRACT.md / DECISIONS.md |
| P1 | epic P1: pipelines and personas | CONTRACT.md / DECISIONS.md |
| P2 | epic P2: tier policy, briefs, meter | CONTRACT.md / DECISIONS.md |
| P3 | epic P3: cache | CONTRACT.md / DECISIONS.md |
| P4 | epic P4: review-loop convergence | CONTRACT.md / DECISIONS.md |
| H0 | epic H0: host interface and conformance | CONTRACT.md / DECISIONS.md |
| H1 | epic H1: claude-code adapter | CONTRACT.md / DECISIONS.md |
| H2 | epic H2: codex adapter | CONTRACT.md / DECISIONS.md |
| H3 | epic H3: opencode adapter | CONTRACT.md / DECISIONS.md |
| N1 | epic N1: engine adapter | CONTRACT.md / DECISIONS.md |
| N2 | epic N2: StateStore and backends | CONTRACT.md / DECISIONS.md |
| N3 | epic N3: Engine-layer handoff and replay | CONTRACT.md / DECISIONS.md |
| R1 | epic R1: README and assets (also default R-numbers R1 to R8 in DECISIONS.md share the R prefix; epics R1 to R4 are the ship lane) | CONTRACT.md / DECISIONS.md |
| R2 | epic R2: plugin shell, marketplace, companions (also default R-numbers R1 to R8 in DECISIONS.md share the R prefix; epics R1 to R4 are the ship lane) | CONTRACT.md / DECISIONS.md |
| R3 | epic R3: companion-change catalog (also default R-numbers R1 to R8 in DECISIONS.md share the R prefix; epics R1 to R4 are the ship lane) | CONTRACT.md / DECISIONS.md |
| R4 | epic R4: fixtures and e2e (also default R-numbers R1 to R8 in DECISIONS.md share the R prefix; epics R1 to R4 are the ship lane) | CONTRACT.md / DECISIONS.md |
| S1-state | branch name suffix of epic S1 | CONTRACT.md / DECISIONS.md |
| S2-router | branch name suffix of epic S2 | CONTRACT.md / DECISIONS.md |
| S3-evidence | branch name suffix of epic S3 | CONTRACT.md / DECISIONS.md |
| S4-ownerpack | branch name suffix of epic S4 | CONTRACT.md / DECISIONS.md |
| S5-handoff | branch name suffix of epic S5 | CONTRACT.md / DECISIONS.md |
| P1-pipelines | branch name suffix of epic P1 | CONTRACT.md / DECISIONS.md |
| P2-tokens | branch name suffix of epic P2 | CONTRACT.md / DECISIONS.md |
| P3-cache | branch name suffix of epic P3 | CONTRACT.md / DECISIONS.md |
| P4-review | branch name suffix of epic P4 | CONTRACT.md / DECISIONS.md |
| H0-interface | branch name suffix of epic H0 | CONTRACT.md / DECISIONS.md |
| H1-claude | branch name suffix of epic H1 | CONTRACT.md / DECISIONS.md |
| H2-codex | branch name suffix of epic H2 | CONTRACT.md / DECISIONS.md |
| H3-opencode | branch name suffix of epic H3 | CONTRACT.md / DECISIONS.md |
| N1-engine | branch name suffix of epic N1 | CONTRACT.md / DECISIONS.md |
| N2-statestore | branch name suffix of epic N2 | CONTRACT.md / DECISIONS.md |
| N3-handoff | branch name suffix of epic N3 | CONTRACT.md / DECISIONS.md |
| R1-readme | branch name suffix of epic R1 | CONTRACT.md / DECISIONS.md |
| R2-shell | branch name suffix of epic R2 | CONTRACT.md / DECISIONS.md |
| R3-companions | branch name suffix of epic R3 | CONTRACT.md / DECISIONS.md |
| R4-fixtures | branch name suffix of epic R4 | CONTRACT.md / DECISIONS.md |
| S1-S5 | range of the five spine epics | CONTRACT.md / DECISIONS.md |
| N1-N3 | range of the three engine epics | CONTRACT.md / DECISIONS.md |
| H0-H3 | range of the four host epics | CONTRACT.md / DECISIONS.md |
| W0 | wave 0: S1, S3, H0, R2 | CONTRACT.md / DECISIONS.md |
| W1 | wave 1: S2, S5, P2, H1, R4 skeleton | CONTRACT.md / DECISIONS.md |
| W2 | wave 2: S4, P1, P4, H2, H3, N2 | CONTRACT.md / DECISIONS.md |
| W3 | wave 3: P3, N1, N3, R3 | CONTRACT.md / DECISIONS.md |
| W4 | wave 4: R1, R4 completion, release gates | CONTRACT.md / DECISIONS.md |
| L1 | lane 1: squad spine | CONTRACT.md / DECISIONS.md |
| L2 | lane 2: squad economy | CONTRACT.md / DECISIONS.md |
| L3 | lane 3: squad hosts-a | CONTRACT.md / DECISIONS.md |
| L4 | lane 4: squad engine | CONTRACT.md / DECISIONS.md |
| L5 | lane 5: squad ship | CONTRACT.md / DECISIONS.md |
| G0 | gate G0: anamnesis questionnaire | CONTRACT.md / DECISIONS.md |
| G1 | gate G1: scope confirmation | CONTRACT.md / DECISIONS.md |
| G4 | gate G4: plan review | CONTRACT.md / DECISIONS.md |
| G-10 | plan-it governance rule: worktrees only | CONTRACT.md / DECISIONS.md |
| T1 | tier 1, powerful | CONTRACT.md / DECISIONS.md |
| T2 | tier 2, balanced | CONTRACT.md / DECISIONS.md |
| PD-06 | Engine dev-squad default 06: review loop cap 3 | CONTRACT.md / DECISIONS.md |
| R5 | default R5: Codex and OpenCode stop-gate is a conductor checklist | CONTRACT.md / DECISIONS.md |
| R6 | default R6: SVG hero assets | CONTRACT.md / DECISIONS.md |
| R7 | default R7: README claims only what a fixture measured | CONTRACT.md / DECISIONS.md |
| R8 | default R8: tier-to-model map per host | CONTRACT.md / DECISIONS.md |
| O1 | open question 1: reference video | CONTRACT.md / DECISIONS.md |
| O2 | open question 2: Engine adjustments to apply | CONTRACT.md / DECISIONS.md |
| O3 | open question 3: marketing channels | CONTRACT.md / DECISIONS.md |
| D1 | owner ruling 1 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D2 | owner ruling 2 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D3 | owner ruling 3 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D4 | owner ruling 4 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D5 | owner ruling 5 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D6 | owner ruling 6 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D7 | owner ruling 7 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D8 | owner ruling 8 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D9 | owner ruling 9 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D10 | owner ruling 10 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D11 | owner ruling 11 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D12 | owner ruling 12 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D13 | owner ruling 13 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D14 | owner ruling 14 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D15 | owner ruling 15 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D16 | owner ruling 16 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D17 | owner ruling 17 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D18 | owner ruling 18 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D19 | owner ruling 19 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D20 | owner ruling 20 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| D21 | owner ruling 21 in DECISIONS.md | CONTRACT.md / DECISIONS.md |
| T-*-NN | test case ID, epic then two digits (T-S1-01) | CONTRACT.md |
| A1 | contract amendment 1 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A2 | contract amendment 2 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A3 | contract amendment 3 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A4 | contract amendment 4 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A5 | contract amendment 5 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A6 | contract amendment 6 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| A7 | contract amendment 7 folded into v1.1 (CONTRACT.md section 11) | CONTRACT.md |
| SHA-256 | cryptographic hash used to pin the CONTRACT | KICKOFF.md |
| T3 | tier 3, cheap | CONTRACT.md |
| M1 | core-logic model 1: run lifecycle | CONTRACT.md |
| M2 | core-logic model 2: review loop | CONTRACT.md |
| M3 | core-logic model 3: conductor ceiling | CONTRACT.md |
