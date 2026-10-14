# PLAN-REVIEW.md: do-it v1, gate G4

Legend: G-n governance rule · T-EID-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

> Defaults were applied and marked inline. Read this, contradict anything wrong by ID, or answer nothing and the run proceeds as drafted.

## What is in the package
5 PRDs, 5 epics files, 20 epics, **352 binding test cases** (S 86 · P 75 · H 73 · N 50 · R 68), 101 of them marked `[REAL]` (live target; may end IMPLEMENTED-NOT-VERIFIED). `gate-check` handoff, adversary, glossary and contract-freeze (draft) all pass. Contract is v1.1-draft (squad amendments A1 to A7 folded in).

## Defaults applied (contradict any that are wrong)
| ID | Question | Default applied | Rationale |
|---|---|---|---|
| R1 | Spine file and Node floor | `core/spine/do-it.mjs`, Node 22 | installed Node is 22 |
| R2 | License | MIT | same as plan-it and build-it |
| R3 | Install name | `do-it@devotts` | family convention |
| R4 | Versioning | 0.1.0 start, 1.0.0 when v0.3 passes on three hosts | honest maturity |
| R5 | Codex and OpenCode stop-gate | conductor checklist | no stop-hook equivalent found |
| R6 | Hero assets | SVG | small, diffable |
| R7 | README claims | only what a fixture measured | your honesty bar |
| R8 | Tier-to-model map | `hosts/{host}/tiers.json`, asked once at init | models change often |

## Decisions that moved because of the squads (new, contradict if wrong)
1. Hosts in v1: claude-code, codex, opencode, engine (your G1 ruling; Hermes and OpenClaw removed).
2. `host.driver` default is `auto` so no harness name sits in `core/` (G-12).
3. Review-loop exit checks run in this order: convergence, cost cap, repeated fingerprint, counts not falling, round budget. Cost cap default 600000 tokens (to calibrate).
4. Token estimate = characters / 4 when a host gives no usage; Codex cache_write recorded as 0.
5. deploy-it and reconcile-it repos do not exist yet; they are `planned` in `companions.json`, not in `dependencies`, until published. Repo names `DevOtts/deploy-it` and `DevOtts/reconcile-it` are placeholders.
6. Three marketplaces pin prompt-it 0.2.1 (build-it, plan-it, review-it), not two.
7. Plugin `dependencies` field validates, but install-time resolution is unverified: the README may say "installs the family" only if T-R2-11 records `resolved`; otherwise it points to `do-it doctor --install`.

## Still open for you
O1 is the reference video the right file? · O2 which Engine dev-squad adjustments to apply (saved in Engine-Core `do-it-engine-layer/`, none applied) · O3 marketing channels for the README.

## Package tree
```
CONTRACT.md  00-program-plan.md  STATUS.md  DECISIONS.md  GLOSSARY.md  README-SPEC.md  PLAN-REVIEW.md  KICKOFF.md (after this gate)
prds/    prd-1-spine  prd-2-economy  prd-3-hosts  prd-4-engine  prd-5-ship
epics/   epics-1-spine (S1-S5)  epics-2-economy (P1-P4)  epics-3-hosts (H0-H3)  epics-4-engine (N1-N3)  epics-5-ship (R1-R4)
```

## States if you answer nothing
Every default stands, the CONTRACT ratifies from v1.1-draft to v1.1, and the run proceeds to KICKOFF.md and the launch prompt for the build.

## Copy-your-rulings block
```
R-contradict: none | O1 keep | O2 1,2,4,6,7 | O3 github+post
```

Reviewed-by: Fernando Ott 2026-10-14 (recorded when he asked for the kickoff; no default contradicted, so all defaults stand)
