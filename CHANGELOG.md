# Changelog

## 1.0.0
- do-it v1 built against CONTRACT v1.1: 20 epics (S1-S5, P1-P4, H0-H3, N1-N3, R1-R4), 352 test cases. 347 VERIFIED, 5 IMPLEMENTED-NOT-VERIFIED (live aws/op access; Engine W3 pipeline and drain not installed), 0 BLOCKED.
- Spine: single-file Node spine (`core/spine/do-it.mjs`) with init, start, next, record, gate, answer, handoff, resume, park, status, meter, doctor. `it-result/1` written atomically at every stage.
- Hosts: claude-code, codex, opencode, engine adapters on one interface. Engine adapter wired to the Engine hooks (ask cards, x_do_it step metadata, card inject and state, run rows) via PR #727.
- Companion pins: prompt-it 1.0.0, plan-it 5.0.0, build-it 4.0.0, review-it 2.0.0, conclude-it 2.0.0, parallel-lifecycle 1.0.0, deploy-it 1.0.0, reconcile-it 1.0.0.
- README: animated hero, pipeline and four use-case visuals; figures come from measured fixtures only.
- Repo is private; public visibility is a separate, later decision.

## 0.1.0 (unreleased)
- Plugin shell, `devotts` marketplace entry, pinned companion ledger, generated root `SKILL.md`, mirror parity check (epic R2).
