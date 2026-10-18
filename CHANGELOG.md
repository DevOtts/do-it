# Changelog

## 1.0.1
- Review checkpoints: plan-it decides the number and position of review-it checkpoints from size, complexity and importance and records it in `READINESS.json`; the spine reads it and a run does not close without each checkpoint's PASS verdict, as a `checkpoint:CP-NN` finish-line row. Policy in `docs/implementation/do-it-next/CHECKPOINT-POLICY.md`; tests T-CP-01 to T-CP-04.
- Status tracking: the harness-status-tracking board and the program board (`docs/implementation/do-it-next/status.json`, migrated from `delivery/STATUS.md` and marked approximate) are written through build-it's status writer. 41 of the 42 binding status cases are verified against real artifacts; the stale half of T-B-20 is parked until a commit lands more than 24 hours after the board.
- Companion pins: plan-it 5.1.0, build-it 4.1.0, review-it 2.1.0, conclude-it 2.1.0. prompt-it 1.0.0, parallel-lifecycle 1.0.0, deploy-it 1.0.0 and reconcile-it 1.0.0 are unchanged. Those four siblings had been moved to 5.0.0, 4.0.0, 2.0.0 and 2.0.0 on main without a tag or GitHub Release; they are now published.
- README: animated header and outro in the her0 style, each with a `prefers-reduced-motion` poster, and `assets/marketing/` with the animations, their layers and the Remotion source. `scripts/check-readme.mjs` now accepts `<picture>` and `<source>`.
- Known limits: a `verified` status row is a claim, not proof. The README animations use third-party meme clips of a real person whose rights are not cleared. The repo stays private.

## 1.0.0
- do-it v1 built against CONTRACT v1.1: 20 epics (S1-S5, P1-P4, H0-H3, N1-N3, R1-R4), 352 test cases. 347 VERIFIED, 5 IMPLEMENTED-NOT-VERIFIED (live aws/op access; Engine W3 pipeline and drain not installed), 0 BLOCKED.
- Spine: single-file Node spine (`core/spine/do-it.mjs`) with init, start, next, record, gate, answer, handoff, resume, park, status, meter, doctor. `it-result/1` written atomically at every stage.
- Hosts: claude-code, codex, opencode, engine adapters on one interface. Engine adapter wired to the Engine hooks (ask cards, x_do_it step metadata, card inject and state, run rows) via PR #727.
- Companion pins: prompt-it 1.0.0, plan-it 5.0.0, build-it 4.0.0, review-it 2.0.0, conclude-it 2.0.0, parallel-lifecycle 1.0.0, deploy-it 1.0.0, reconcile-it 1.0.0.
- README: animated hero, pipeline and four use-case visuals; figures come from measured fixtures only.
- Repo is private; public visibility is a separate, later decision.

## 0.1.0 (unreleased)
- Plugin shell, `devotts` marketplace entry, pinned companion ledger, generated root `SKILL.md`, mirror parity check (epic R2).
