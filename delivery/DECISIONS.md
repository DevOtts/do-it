# DECISIONS.md: do-it v1 decision queue

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

## Ruled
| ID | Decision | Ruling | Effect / where it lands | Ruled by · date |
|---|---|---|---|---|
| D1 | Spine language | [DECIDED] Node, single file, zero dependencies | S1-S5 | Fernando · 2026-10-14 |
| D2 | Keep the revision-brainstorm design | [DECIDED] yes: ratchet, fingerprinted roteiro, `verify-mode` column, review-it owns ATTENDED-GATE.html | P4, R3 | Fernando · 2026-10-14 |
| D3 | Block or warn | [DECIDED] block on context ceiling, untiered spawn, wake on a fat context, close with unaccounted rows; warn on the rest | S3, S5, P2 | Fernando · 2026-10-14 |
| D4 | Ceilings | [DECIDED] absolute and window-scaled, whichever fires first | S5 | Fernando · 2026-10-14 |
| D5 | Meter on hosts without usage output | [DECIDED] estimate from characters, flagged `estimated:true` | P2 | Fernando · 2026-10-14 |
| D6 | Hosts in v1 | [CHANGED] claude-code, codex, opencode, engine. Hermes and OpenClaw removed at G1 | H0-H3, N1 | Fernando · 2026-10-14 |
| D7 | Owner pack | [DECIDED] one pack for all stages, produced by do-it; stages only append questions; delivery `auto` (native for 4 questions or fewer, else html, markdown last) | S4 | Fernando · 2026-10-14 |
| D8 | Escalation and downgrade | [DECIDED] one step up per slice then the owner pack; downgrade after three first-try passes | P2 | Fernando · 2026-10-14 |
| D9 | Review rounds | [DECIDED] default 3 (matches Engine PD-06) | P4 | Fernando · 2026-10-14 |
| D10 | Stop-gate patience | [DECIDED] 3 refusals without progress, then park and ask | S2 | Fernando · 2026-10-14 |
| D11 | Deliverable docs | [DECIDED] stay in `docs/implementation/<x>/`, not under `.do-it/` | S1, R3 | Fernando · 2026-10-14 |
| D12 | Legacy migration | [DECIDED] explicit `do-it doctor --migrate` only | S1 | Fernando · 2026-10-14 |
| D13 | Handoff at ceiling | [DECIDED] `auto` (fresh conductor) with cap 5 per run, once headless start is tested with the owner's aliases | S5, H1 | Fernando · 2026-10-14 |
| D14 | parallel-lifecycle | [DECIDED] stays a separate plugin behind an `isolation` driver | R2, R3 | Fernando · 2026-10-14 |
| D15 | Warm cloud box | [DECIDED] none in v1; do-it only requires cold-start resume | N2 | Fernando · 2026-10-14 |
| D16 | Secrets providers | [DECIDED] file, env, AWS Secrets Manager, 1Password behind one interface | S5 | Fernando · 2026-10-14 |
| D17 | Observability | [DECIDED] Langfuse/LangSmith in v2; trace fields frozen in v1 | S1, v2 README | Fernando · 2026-10-14 |
| D18 | Engine knowledge | [DECIDED] lives in Engine-Core `docs/implementation/do-it-engine-layer/`; Engine is only one host adapter in do-it | N1-N3 | Fernando · 2026-10-14 |
| D19 | Engine ask channels and state | [DECIDED] asks answerable on Control Tower, chat/p2p and WhatsApp; state store may be DB rows, interactions or R2 (Engine chooses) | N1, N2 | Fernando · 2026-10-14 |
| D20 | README | [DECIDED] marketing-grade README in the plan-it/build-it pattern, for promotion | R1 | Fernando · 2026-10-14 |
| D21 | Plan size | [DECIDED] size L at G1 | all | Fernando · 2026-10-14 |

## Open: recommendation attached
| ID | Question | Recommendation | Why nobody should pick for you | Blocks |
|---|---|---|---|---|
| O1 | Is `videoplayback.mp4` the intended reference video? | Keep the ADW reading; send another file if wrong | only the owner knows what he meant | docs only |
| O2 | Which of the 12 Engine dev-squad adjustments to apply | 1, 2, 4, 6, 7 first | edits another repo with live sessions | N3 |
| O3 | Marketing channels and launch date for R1 | write for GitHub + a short post; no dated claims | the owner runs the promotion | R1 tone |

## Defaults applied by plan-it (contradict at G4)
| ID | Default | Rationale |
|---|---|---|
| R1 | Spine file `core/spine/do-it.mjs`, Node 22 floor | matches installed Node 22; plan-it ships Node already [default — contradict if wrong] |
| R2 | License MIT | same as plan-it and build-it [default — contradict if wrong] |
| R3 | Install name `do-it@devotts`, marketplace `devotts` | family convention [default — contradict if wrong] |
| R4 | Versions start 0.1.0; 1.0.0 when v0.3 passes on three hosts | honest maturity signal [default — contradict if wrong] |
| R5 | Codex and OpenCode run the stop-gate as a conductor checklist | no stop-hook equivalent found [default — contradict if wrong] |
| R6 | Hero and pipeline assets are SVG (like plan-it); an animated GIF is optional later | small, diffable [default — contradict if wrong] |
| R7 | README claims only what a fixture measured; no benchmark numbers before R4 produces them | the owner's honesty bar [default — contradict if wrong] |
| R8 | Tier-to-model map lives in `hosts/<host>/tiers.json`, asked once at `do-it init` | models change often [default — contradict if wrong] |

## Copy-your-rulings block
```
O1 keep | O2 1,2,4,6,7 | O3 github+post | R-contradict: none
```
