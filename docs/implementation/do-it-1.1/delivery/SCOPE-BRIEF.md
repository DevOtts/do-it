# do-it 1.1: scope brief

Run: plan-it `do-it-1.1` (autonomous-draft, owner away). Session `trust-research-study`, 2026-11-06.
Code read at `origin/main`: do-it `d38cedb` (1.0.5), plan-it `bfbfaa1` (5.2.0), build-it `bea0e4a` (4.1.3), review-it `eed4dec` (2.1.1), conclude-it `3baa221` (2.1.1). init-it is local only (`/Users/macbook/Workspace/Devotts/init-it`, not a git repo).

## Inputs

| Input | Where | State found |
|---|---|---|
| Trust proposal | `inputs/TRUST-PROPOSAL.md` | Owner agreed the direction 2026-11-06; nothing built |
| 1.0.0 KICKOFF residuals | `inputs/KICKOFF-1.0.0-residuals.md` | Written for 1.0.0; several items already resolved by 1.0.1–1.0.5 or owner rulings (see `docs/01`) |
| harness-status-tracking | `../harness-status-tracking/` | Card B shipped in 1.0.1; Card A (init-it) built, unreleased |
| resumable-test-gates | `../resumable-test-gates/` | **Planned by another session** (`study-bateria-testes-tempo`); merged at G4, not planned here |

## Size, shape, topology `[default — contradict if wrong]`

- **Size M.** Five repos touched (do-it, conclude-it, plan-it, review-it, init-it), no new subsystem except the claim ledger.
- **Shape 3**: a feature on an existing large codebase. Findings → locked architecture → epics with Test Contracts, all in one package.
- **Topology solo.** One planner holds the whole plan. The independent auditor and the ombudsman are subagents, used for verification only.

## Definition of Done for this planning run

1. `docs/01-current-state-and-findings.md`: every claim in a claim ledger with a source tier, audited by a different model and checked by an ombudsman (dogfooding TRUST 3.1/3.5).
2. `docs/02-architecture.md`: how each finding is fixed, extending the shipped layers (no parallel roads).
3. `delivery/CONTRACT.md`: final v1.0 (ratified at G4), including the claim-ledger schema and the coupling map with resumable-test-gates.
4. `delivery/epics.md`: every epic ends in a binding Test Contract. Size M: about 20 cases across the package, plus any [REAL] cases.
5. `plan/DECISIONS.md` and `plan/READINESS.json`, with every default marked `[default — contradict if wrong]`.
6. `status.json`/`STATUS.md` via `status-from-plan`, review checkpoints via `review-checkpoints.mjs`.
7. Gate-check `handoff`, `adversary` and `readiness` pass.
8. An owner artifact: the plan plus the decisions to know, take and confirm, with recommendations, merged with resumable-test-gates when its G4 output exists.

## Out of scope

- doc-it design: its own repo `DevOtts/doc-it` (R4), standard v0 drafted there (R5), plugin designed after the pilot.
- Any code, push, tag or release.
- Changes to any consumer repo (applying A1-05 or `pack withdraw` there is that repo's work).
