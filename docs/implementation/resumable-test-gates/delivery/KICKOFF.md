# KICKOFF — resumable-test-gates (build session)

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

## 0. Pinning

- Plan package: `/Users/macbook/Workspace/Devotts/do-it/docs/implementation/resumable-test-gates/` (planned while the
  local checkout sat at 9a253febda6b202b3d1e522e401eff278254e192, untracked docs).
- Code grounded on DevOtts/do-it `origin/main` @ d38cedbee0e3e63e8c03b1e51f7ac2bbec4bfb71 (do-it 1.0.5). Pilot consumer
  shas are evidence in `research/`.
- `[REAL]` targets: export `$PILOT_JEST_REPO`, `$PILOT_PYTEST_REPO`, `$PILOT_VITEST_REPO` from `research/PILOT-PATHS.md`.
- Run state: `docs/implementation/resumable-test-gates/.plan-it/resumable-test-gates.state.json` (state `done` once handed off).
- CONTRACT: `delivery/CONTRACT.md` v1.1 (final, ratified at G4 2026-11-06), SHA-256 584304c1a42b03d42d3d5811685ea9a8c53b28cabccb00d88b50e564d5fd4639.
- Release: do-it 1.2.0, built after do-it 1.1.0 merges (peer plan `docs/implementation/do-it-1.1/`).

## 1. First steps for the builder (numbered, in order)

1. Re-derive the tally and reconcile from disk: `node {plan-it}/scripts/gate-check.mjs handoff --dir {package} --run
   resumable-test-gates` and the case count per epic; on any mismatch with §3 below, stop and report.
2. G4 is recorded (2026-11-06, Fernando Ott: OQ-1 yes, OQ-2 jest → pytest → vitest, OQ-3 per machine, OQ-4 fresh leg in v1, A14 kept, no Rn contradicted). Check the CONTRACT hash in §0; if it differs, stop.
3. Branch from do-it `main` after 1.1.0; never merge `core/spine/do-it.mjs` or its plugin mirror by hand — rebuild with
   `node core/spine/build.mjs` and `node scripts/sync-mirror.mjs --write` after every merge (CONTRACT §11 A12).
4. Wave W1 first: L1, F1, Q1 (crown jewels, builder tier T1). Then W2 (A1, V1, V2, Q2, S1), W3 (S2, A2), W4 (A3).
5. Never run a test suite outside one heavy gate per machine; once Q1 ships, every suite runs under `do-it gate queue`.

## 2. One-liner and first slice

Record every test file's result as it finishes, keyed by everything that can change it, so a killed or failed gate
resumes and reuses every still-valid PASS, with a verdict that says it is composed and a nightly clean run as the net.
First vertical slice: L1 + F1 (NARROW only) + A1 + V1 on the 30-file fixture `core/gates/tests/fixtures/jest-30/` —
kill at file 20, resume runs exactly 10 plus the NEVER set, verdict names 20 reused from 1 run.

## 3. Tally

| Epic | Wave | Cases | Real |
|---|---|---|---|
| L1 store | W1 | 16 | 1 |
| F1 fingerprint | W1 | 16 | 2 |
| Q1 admission | W1 | 17 | 2 |
| A1 jest | W2 | 17 | 8 |
| V1 gate run | W2 | 18 | 3 |
| V2 clean and flaky | W2 | 17 | 1 |
| Q2 cleanup | W2 | 15 | 2 |
| S1 settings | W2 | 16 | 1 |
| S2 stages | W3 | 18 | 2 |
| A2 pytest | W3 | 12 | 7 |
| A3 vitest | W4 | 12 | 7 |
| **Total** | | **174** | **36** |

Real (live-target) cases in total: 36. Board: `status.json` (81 tasks) rendered to `delivery/STATUS.md`. Review
checkpoints: 5 (level full) in `plan/READINESS.json`. Consumer adoption (former E1/E2, 31 cases) moved out (CONTRACT §11 A15).

## 4. Repo map

do-it lanes and paths: CONTRACT §5 (store, verdict, adapters, queue, stages). No consumer lane: adoption is the pilot's
own program, built against the frozen 1.2.0 CONTRACT (location in `research/PILOT-PATHS.md`).

## 5. Locked decisions

Rulings D1 to D5 (DECISIONS.md). Defaults R1 to R24 stand (none contradicted at G4). OQ-1 to OQ-4 took their recommendations.

## 6. Gotchas carried from planning

- A jest suite that crashes reports zero failures: PASS needs at least one passing case and no execution error (R5).
- The installed `node_modules` diverges from the lockfile in the pilot's jest repo; hash the installed state (R8).
- `--` is not parsed by the spine today and `--resume T2` would swallow `T2`: V1 fixes `parseArgs` first (A7).
- jest rejects unknown argv: the manifest travels in `DO_IT_GATE_MANIFEST` (A1).
- `os.freemem()` reads about 1 GB on a healthy Mac; admission uses the compressor-aware estimator (R13).
- The pilot's own gate rules contradict composed T2 and never-without-a-slot; amending them is the pilot program's work.
- Pilot repos may be shared checkouts: read with `git show origin/main:path`, never check out there.
- `[REAL]` cases with no runner or target are IMPLEMENTED-NOT-VERIFIED, never a mock pass.

## 7. Handoff state

G4 approved and the CONTRACT is final (v1.1). Plan-it state `done`. Build after do-it 1.1.0 merges (D7).
Registration for the build session: `run /init-it resumable-test-gates --role build`.

## 8. Launch prompt

```
/build-it docs/implementation/resumable-test-gates — build do-it 1.2.0 from the frozen package, after do-it 1.1.0 merges.
Read delivery/KICKOFF.md first and follow its §1 in order. Goal: CONTRACT v1.1 shipped.
DoD: all 174 cases pass (36 [REAL] on the pilot repos in research/PILOT-PATHS.md; unreachable = IMPLEMENTED-NOT-VERIFIED),
CP-01..CP-05 PASS, do-it 1.2.0 released. Waves W1 → W4; run every wave to the end; report per criterion.
```
