# 05 — Components (verdict, keep / build, cost)

Cost is ESTIMATED in person-days of a T2 builder against the Test Contract; risk names the failure the epic must test.

| Piece | Home (path) | Verdict | Builds on | Cost | Top risk |
|---|---|---|---|---|---|
| P1 store | `core/spine/src/gate-results.mjs`, schema `core/schemas/gate-result.1.schema.json` | build | `fs-atomic.mjs` (atomicWrite, appendLine), `hash.mjs` (canonicalJson, sha256) | 2 d | torn rows, compaction race, name collision in the bundle |
| P3 fingerprint | `core/spine/src/gate-fingerprint.mjs` (CORE, installed, env, platform, manifest) + adapter-side closure | build | research/03 §2.6 table, a pilot repo's CORE_PATTERNS | 4 d | silent false PASS from an input outside the key |
| P4 CLI + verdict | `core/spine/src/gate-run.mjs`, `gate-verdict.mjs`; `cli.mjs:180-193` new subcommands | build | `cli.mjs` dispatch, `record.mjs` exit codes | 3 d | a composed verdict that hides its sources; laundering a FAIL |
| P4 clean + flaky | inside `gate-run.mjs` / `gate-verdict.mjs` | build | M1 | 2 d | T3 that cannot fail (the prove-the-gate-can-fail rule) |
| P2 jest adapter | `core/gates/adapters/jest/{reporter,filter,closure}.cjs` | build | jest 29.7 reporter + `--filter` + DependencyResolver | 3 d | crash read as PASS; `--runTestsByPath` dropping files |
| P2 pytest plugin | `core/gates/adapters/pytest/do_it_gate.py` | build (wave 3) | xdist controller hooks, a consumer's Python static graph | 3 d | per-file completion under `--dist load` |
| P2 vitest reporter | `core/gates/adapters/vitest/reporter.mjs` | build (wave 3) | `onTestModuleEnd`, SSR module graph | 2 d | private API moves; unhandled errors after module end |
| P5 settings + stages | `settings.mjs`, `settings.schema.json`, `feature.yaml`, `drain.yaml`, `gate-train.mjs` | build | `next.mjs` RUN_CODE, `readiness.mjs` slices, `wake.mjs` | 3 d | train detection keyed on DONE instead of merged |
| P6 queue | `core/spine/src/gate-queue.mjs`, `gate-signals.mjs` | build | a consumer's single-heavy-job semantics, research/03 §2.8 estimator | 4 d | admitting into a loaded machine; orphaned children |
| P7 consumer adoption | moved out | moved | n/a | n/a | consumer adoption moved to the pilot consumer's own program (do-it 1.1 R3) |

Not built: a remote store (interface only, OQ-3), Windows support, a launchd installer (R15), per-file coverage storage
(OQ-4), ts-jest `isolatedModules` flip (R10).
