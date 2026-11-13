# SCOPE-BRIEF — resumable-test-gates

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

Chosen: **size M · shape 1 (multi-doc + delivery) · topology orchestrator+squads · mode autonomous-draft** (owner away;
G0 and G1 derived from the owner-approved README and the do-it planner brief; contradict at G4).

| Option | Produces | Cost | Wrong for |
|---|---|---|---|
| S, single-file PRD | one PRD with ~20 cases | lowest | two repos, seven pieces, four state machines: too much for one file |
| **M, shape 1 (chosen)** | docs 01-06, CONTRACT, 5 PRDs, 11 epics with ≥10 cases each (consumer adoption moved out, A15) | medium | nothing in scope; it is the smallest shape that freezes a shared contract |
| L, program | multi-squad program with board automation | highest | a feature-sized change to an existing spine |

Numbered Definition of Done for this planning run:
1. Ground-truth findings doc with every claim cited (`docs/01`).
2. Vision and architecture solving each finding (`docs/02`), data model and models M1 to M5 (`docs/03`), components and roadmap (`docs/05`, `docs/06`).
3. `delivery/CONTRACT.md` frozen as a draft, with governance rules, RUN-POLICY and core-logic models.
4. Six PRDs and thirteen epics, each epic ending in a binding Test Contract (≥10 cases, `[REAL]` tagged), README T-01 to T-15 carried, every new gate with a can-fail case.
5. DECISIONS (rulings D1 to D5, defaults, OQ-1 to OQ-4), GLOSSARY, KICKOFF, PLAN-REVIEW, STATUS board, READINESS pair, rendered twins.
6. plan-it state at G4 (`planReview`), lint, adversary and readiness gates clean.

Assumptions: no code and no test run during planning; pilot facts read at `origin/main`; one pilot repo has no installed node_modules so its runner was not read.
