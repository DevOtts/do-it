# 05. Components

Verdict legend: **build** (new), **adapt** (change an existing plugin), **reuse** (take as is). Epic IDs are the build plan (see delivery/00-program-plan.md).

## Lane L1: spine (`core/spine`)
| Component | Verdict | Epic | Notes |
|---|---|---|---|
| State, events, ledger, schemas, settings precedence, `init`, `doctor` (+`--migrate`, `--install`) | build | S1 | single file built from `src/`; atomic writes; JSON-schema validation without dependencies |
| Router, pipeline engine, `next`, finish-line, stop-gate logic | build | S2 | deterministic-first; stop refusal counter |
| `record` / `gate`: evidence rules, `it-result/1` validation, conclude refusal | build | S3 | VERIFIED needs resolvable evidence |
| Owner pack build, terse-reply parser, `answer`, html and markdown renderers | build | S4 | reply grammar in docs/03 |
| `handoff`, `park`, `resume`, wake scheduling hook, ceilings, secrets drivers (file, env, aws, 1password) | build | S5 | values never logged |

## Lane L2: pipelines, personas, token economy (`core/pipelines|personas|routing|cache`)
| Component | Verdict | Epic |
|---|---|---|
| Five preset pipelines (data) and ten personas (md, frontmatter lint) | build | P1 |
| Tier policy, escalation and downgrade, decomposition rule, brief builder (paths validated, 8K), meter with `estimated` flag | build | P2 |
| Cache rules, `drivers.json` per provider, stable-prefix ordering, warm-then-fan-out, cache telemetry | build (adapt prior art) | P3 |
| Review-loop convergence controller, roteiro fingerprint, severity classes, ratchet and ATTENDED-GATE | build | P4 |

## Lane L3: hosts, interface and three CLIs (`hosts/_interface`, `claude-code`, `codex`, `opencode`)
| Component | Verdict | Epic |
|---|---|---|
| HostAdapter schema + shared conformance suite | build | H0 |
| claude-code adapter (hooks incl. Stop gate, `claude -p` continue, AskUserQuestion mapping, ScheduleWakeup) | build | H1 |
| codex adapter (`codex exec` spawn and continue, `request_user_input` where available, markdown fallback) | build | H2 |
| opencode adapter (`opencode run`, provider routing, JS plugin events, markdown fallback) | build | H3 |

## Lane L4: Engine host and state stores
| Component | Verdict | Epic |
|---|---|---|
| Engine adapter: compile `squad.yaml` to `pipeline_definition`, asks on CT/chat/WhatsApp, tier pass-through | build | N1 |
| StateStore interface with local-fs, git-branch and the Engine backend (rows/interactions + object store) | build | N2 |
| Engine layer hand-over: spec in Engine-Core `do-it-engine-layer/`, conformance replay of the W3 `lp_content` card | build (spec only) | N3 |

## Lane L5: marketing, packaging, companions, tests
| Component | Verdict | Epic |
|---|---|---|
| README.md + hero and pipeline SVGs, in the DevOtts plan-it/build-it pattern | build | R1 |
| Plugin shell (`plugins/do-it`), marketplace entry with `dependencies`, generated SKILL.md, `companions.json` pins | build | R2 |
| Companion-plugin change catalog (one section per plugin: it-result, `.do-it/` roots, tier vocabulary, marketplace pins, deploy-it adapter, reconcile-it packaging) | adapt | R3 |
| Fixtures and e2e harness for the five use cases | build | R4 |

## Companion plugin changes (R3 detail)
| Plugin | Change | Size |
|---|---|---|
| all | write `it-result/1`; one tier vocabulary (T1/T2/T3, Engine aliases); one result vocabulary; resolve root from `DO_IT_HOME` (default `<repo>/.do-it`) | M each |
| prompt-it | emit a brief with a validated pointer list; bump pin in plan-it and build-it marketplaces from 0.2.1 | S |
| plan-it | readiness verdict + DECISIONS.md at G4; `verify-mode` column (auto/attended/judgement) | M |
| build-it | resolve the `.build-it-reports` vs `.fable-it-reports` ambiguity; ceiling-compatible wording | S |
| review-it | own and re-cut ATTENDED-GATE.html per round; frozen roteiro fingerprint; severity classes | M |
| conclude-it | refuse close on unaccounted rows; read finish-line | S |
| parallel-lifecycle | stays separate; expose `isolation` driver contract | S |
| deploy-it (new, from engine-deploy + deploy-router) | `.deploy-it/adapter.json`, LEG protocol, Engine specifics move to an adapter | L |
| reconcile-it (new plugin) | `scan` / `plan` / `apply --approved`, persisted state | M |
