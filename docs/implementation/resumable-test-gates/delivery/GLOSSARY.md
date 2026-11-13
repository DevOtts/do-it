# GLOSSARY

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

| ID | Meaning | Defined in |
|---|---|---|
| G-n | governance rule n of this package (G-1 to G-16) | CONTRACT.md §9 |
| T-*-NN | binding test case NN of epic EID, e.g. T-L1-04 | epics/*.md Test Contracts |
| T-NN | case NN of the README test sketch (README §8, T-01 to T-15), carried into the epics | README.md §8 |
| T0 · T1 · T2 · T3 | gate tiers of ruling D1 (edit, push, train complete, nightly); inside do-it they are printed as scopes (R2) and T1–T3 also mean model tiers in RUN-POLICY | DECISIONS.md D1, R2 |
| Wn | delivery wave n (W1 to W4) | docs/06 §1, 00-program-plan.md |
| Rn | plan-it default n (R1 to R24), contradictable at G4 | DECISIONS.md |
| Dn | owner ruling n (D1 to D5); inside a PRD, Dn are PRD-local design decisions | DECISIONS.md, prds/*.md |
| OQ-n | owner question n (OQ-1 to OQ-4) | DECISIONS.md, PLAN-REVIEW.md |
| Pn | proposal piece n (P1 store, P2 adapters, P3 fingerprint, P4 CLI and verdict, P5 stages, P6 queue, P7 consumer adoption, moved out) | README.md §7 |
| L1 | epic: gate results store | epics/epics-1-store-fingerprint.md |
| F1 | epic: fingerprint and invalidation | epics/epics-1-store-fingerprint.md |
| V1 · V2 | epics: gate run and composed verdict; clean runs, flaky and unstable | epics/epics-2-gate-run-verdict.md |
| A1 · A2 · A3 | epics: jest adapter, pytest plugin, vitest reporter (also CONTRACT §11 amendment ids A1 to A11) | epics/epics-3-runner-adapters.md, CONTRACT.md §11 |
| A-n · AM-n · AMD-n | squad-local proposed amendment n (SQ-D, SQ-A2/SQ-B, SQ-A1), adjudicated into CONTRACT §11 | prds/*.md §amendments |
| An | CONTRACT v1.1 amendment n (A1 to A11) | CONTRACT.md §11 |
| Q1 · Q2 | epics: queue admission; child cleanup and entry point | epics/epics-4-gate-queue.md |
| S1 · S2 | epics: gates settings block; train and nightly stages | epics/epics-5-settings-stages.md |
| E1 · E2 | moved out. Consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3; location in `research/PILOT-PATHS.md`). | n/a |
| SQ-A1 · SQ-A2 · SQ-B · SQ-C · SQ-D | planning squads (one per lane) | 00-program-plan.md, SESSIONS.md |
| Mn | core-logic model n (M1 fold, M2 gate run, M3 queue ticket, M4 train gate, M5 compaction) | CONTRACT.md §8 |
| Cn | contradiction n between README and findings (C1 to C14) | docs/01 §8 |
| Fn | finding n of research/03-runners-and-fingerprint.md (F1 to F31) | research/03 §2 |
| UTF-8 | text encoding of every manifest and row | CONTRACT.md §2.2 |
| Hn | high-severity fingerprint gap n (H1 to H8) | docs/01 §6 |
| CP-NN | review-it checkpoint NN | plan/READINESS.json |
| G0 · G1 · G2 · G3 · G4 | plan-it human gates (anamnesis, scope, decisions, delivery, plan review) | plan-it machine |
| rtg-key/1 · rtg-manifest/1 | key manifest format; adapter manifest format | CONTRACT.md §2.2, §11 A1 |
| do-it-gate-result/1 | row schema of the gate results store | CONTRACT.md §2.1 |
| it-result/1 | do-it's per-stage result file | do-it core/schemas |
| SHA-256 | the only hash used in keys and CRCs | CONTRACT.md §2.2 |
| HMAC-SHA256 | keyed hash used for env values with the machine salt | CONTRACT.md §2.2 |
| r-20261106-130657-7ff2 | the do-it run that commissioned this plan | .do-it/runs |
| [REAL] | a test case that needs a live target; never VERIFIED on a mock | CONTRACT.md §7 |
