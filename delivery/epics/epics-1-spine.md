# Epics 1: Spine (lane L1)

PRD: delivery/prds/prd-1-spine.md. CONTRACT: delivery/CONTRACT.md v1.0-draft. Lane paths: `core/spine/**`, `core/schemas/**`, `core/renderers/**`, `core/drivers/**`.

Test harness shared by all five epics (named once, referenced by every case):
- **Build**: `node core/spine/build.mjs` writes `core/spine/do-it.mjs`. Unit cases import `core/spine/src/*.mjs` in-process (node:test, zero dependency) with fixtures under `core/spine/test/fixtures/`.
- **[REAL]** means the case spawns `node core/spine/do-it.mjs` (the built single file) as a child process, with the working directory a fresh `mkdtemp` directory on which `git init` ran, and `HOME` pointed at a second temp directory. No mock of the spine, filesystem or git. Cases that need a host hook use a real local shell script file as the hook executable (the hook is the host's, not the spine's).
- Every command is called with `--json`; assertions are on `outcome`, the process exit code and file contents. `{run_id}` is the id printed by `start`.
- Outcome tokens and exit codes are defined in PRD D2. Exit codes: 0 ok, 1 failed, 2 needs human, 3 blocked or usage limit.

---

## Epic S1 — State, schemas, settings, init, doctor, trace fields
Branch: `epic/S1-state-settings-doctor`. Depends on: none (wave W0; first inside the lane because S3 needs the state writer).

### Scope
`do-it-state/1`, events and meter rows, the schema validator, atomic writes with the sidecar digest, settings precedence (run flag, workspace, global, defaults) with `doctor` printing every value and its source, `init`, `doctor --migrate`, `doctor --install`, home resolution across worktrees, governance G-1 and G-12, trace fields frozen for v2 exporters (ruling D17). Sources: CONTRACT sections 2, 3, 9; docs/03 sections 3, 4, 6, 7; docs/02 behavior 4; rulings D1, D11, D12, D17.

### Tasks
- [ ] `core/spine/build.mjs`: deterministic bundler (sorted module order, import and export stripped, only `node:` imports allowed in output)
- [ ] `core/spine/src/cli.mjs`: argument parsing, `--json`, exit code mapping, `--set key=value`
- [ ] `core/spine/src/fs-atomic.mjs`, `hash.mjs`: temp-fsync-rename writes, sha256, fault injection env `DO_IT_FAULT` (test hook, names only `after_tmp`, `after_ledger`)
- [ ] `core/spine/src/schema.mjs`: JSON Schema subset validator with JSON pointer errors
- [ ] `core/schemas/do-it-state.1.schema.json`, `settings.schema.json`, `events.schema.json`, `token-meter.schema.json`
- [ ] `core/spine/src/state.mjs`: only module that writes `state.json` and `.state.sha256`; tamper check on every command
- [ ] `core/spine/src/settings.mjs`: layered load, validation, source tracking, reject secret-looking values
- [ ] `core/spine/src/events.mjs`, `meter.mjs`: row writers with the frozen field sets
- [ ] `core/spine/src/init.mjs`: creates `.do-it/settings.json`, `.env.example` (names only), gitignore entries for `.do-it/runs/` and `.secrets/`, idempotent
- [ ] `core/spine/src/doctor.mjs`, `migrate.mjs`, `install.mjs`: `doctor`, `--migrate`, `--install` (copies the built file to `${DO_IT_BIN_DIR:-~/.do-it/bin}/do-it`, executable bit, verifies with `--version`)
- [ ] `core/spine/test/s1/*.test.mjs` and fixtures

### Cascade classes
- partial-failure: N/A — S1 has no multi-target operation; multi-leg failure is S3.
- rollback/compensation: N/A — S1 performs no deploy; compensation is S3.
- failed-recovery to escalation: N/A — no retry ladder in S1; the ladder is S2.
- recovery/resume: covered by T-S1-03 (interrupted write leaves the previous valid state) and T-S1-14 (state shared from a second checkout).
- adversarial-verify: covered by T-S1-01 (state altered between write and next read).

### Test Contract — S1 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 15 · Surfaces: CLI + filesystem + git · [REAL] cases: 7
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-S1-01 is VERIFIED only on a real tampered file.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-S1-01 | G-1 tamper between write and read is detected | temp git repo; `start --preset feature --request "ship W0"`; a separate node script rewrites `runs/{run_id}/state.json` setting status to the string BUILDING without touching `.state.sha256`; then `status --json` | exit 1; outcome STATE_TAMPERED; sha256 of state.json before and after the `status` call identical (spine did not repair it); events.jsonl gains a row with event `state_tamper_detected` | [REAL] |
| T-S1-02 | G-1 single writer, schema-valid state | unit: `start` in a temp dir; validate state.json against `do-it-state.1.schema.json`; then scan `core/spine/src/*.mjs` for write calls naming `state.json` | state validates with schema `do-it-state/1` and fields run_id, preset, request, status, size, host, stage, slices, gates, handoffs, stop_refusals, review, created_at, updated_at all present; exactly one source file (`state.mjs`) contains a write call for `state.json` | happy |
| T-S1-03 | Interrupted write leaves previous state valid | temp git repo; `start`; copy state.json bytes; run a state-changing command with env `DO_IT_FAULT=after_tmp` that exits the process after the temp file is written and before rename | exit 1; outcome FAULT_INJECTED; state.json bytes equal the copy; sidecar still matches; a following `status --json` exits 0; the stale temp file is ignored and removed by that `status` call | [REAL] |
| T-S1-04 | Settings precedence: workspace beats global | temp HOME with `.do-it/settings.json` setting stop_gate.patience 4; workspace `.do-it/settings.json` setting stop_gate.patience 5; `doctor --json` | exit 0; entry `stop_gate.patience` has value 5 and source `workspace`; entry `ceilings.warn_tokens` has value 150000 and source `default` | [REAL] |
| T-S1-05 | Settings precedence: run flag beats workspace | unit with the same two files as T-S1-04 plus `--set stop_gate.patience=6` | value 6, source `run-flag`; with `--set` removed value returns to 5, source `workspace`; `--set unknown.key=1` exits 1 with outcome SETTINGS_UNKNOWN_KEY | happy |
| T-S1-06 | Defaults when no files exist | unit: empty HOME and workspace; `doctor --json` | every key of the settings schema present with source `default`; interaction.fallback equals native, html, markdown; handoff.max_per_run 5; review.max_rounds 3; stop_gate.patience 3; ceilings 150000 40 250000 60; host.driver equals `auto` | happy |
| T-S1-07 | Invalid settings fail loudly | unit: workspace settings.json with stop_gate.patience set to the string "three" and a second file with trailing garbage | exit 1; outcome SETTINGS_INVALID; error pointer `/stop_gate/patience` named; second file reports a JSON parse error with the file path; neither is silently ignored | failure |
| T-S1-08 | `init` is idempotent and writes no secrets | temp git repo; `init --secrets-provider file --secrets-ref .secrets/` twice | first call exit 0 creating `.do-it/settings.json` and `.env.example`; sha256 of both files identical after the second call (exit 0, outcome INIT_NOOP); `git check-ignore .do-it/runs/x` and `git check-ignore .secrets/x` both exit 0; settings.json secrets block equals provider file with ref `.secrets/` | [REAL] |
| T-S1-09 | `doctor --migrate` refuses with a run in flight (ruling D12) | unit: temp repo with a legacy `.build-it-reports/a.md`; `start` leaves status INTAKE; `doctor --migrate` | exit 1; outcome MIGRATE_REFUSED naming the run id; `.do-it/build/` not created | failure |
| T-S1-10 | `doctor --migrate` copies, never moves | temp git repo with legacy `.fable-it-reports/r1.md` (fixed bytes) and `.plan-it/x.json`, no runs | exit 0; outcome MIGRATED; copies exist under `.do-it/`; manifest `.do-it/migration.json` lists each file with sha256 equal to the original; originals still present with identical bytes; a second `--migrate` exits 0 outcome MIGRATE_NOOP | [REAL] |
| T-S1-11 | `doctor --install` places the single file | temp git repo; `DO_IT_BIN_DIR` set to a temp directory; `doctor --install` | exit 0; outcome INSTALLED; `{bin_dir}/do-it` exists, mode has the executable bit, sha256 equals `core/spine/do-it.mjs`; running it with `--version` exits 0 and prints the version of the build; the command makes no write outside `{bin_dir}` and `.do-it/` | [REAL] |
| T-S1-12 | Events and meter trace fields are frozen (ruling D17) | unit: `start`, then `meter --append` with a row lacking `source`, then with source `estimate` and estimated true | events.jsonl rows have exactly the keys ts, run_id, slice_id, stage, persona, tier, model, host, event, parent_id, verdict (11 keys); the sourceless meter row exits 1 with outcome METER_SOURCE_REQUIRED and is not appended; the valid row has the 11 event keys plus tokens_in, tokens_out, cache_read, cache_write, estimated, source (17 keys) with source `estimate` | happy |
| T-S1-13 | G-12 core names no harness | unit: grep `core/` recursively (excluding `core/spine/test/`) for the words claude, codex, opencode, hermes, openclaw as case-insensitive whole words, including the built `core/spine/do-it.mjs` | zero matches; settings schema `host.driver` is typed string with no enum | happy |
| T-S1-14 | Worktree resolves the main checkout (home rule D7) | temp git repo with one commit; `start`; `git worktree add ../wt`; run `status --json` from `../wt` | exit 0; the reported `.do-it` root is the main checkout path; run_id equals the one created in the main checkout; with `DO_IT_HOME` set to a third temp directory the root equals that directory | [REAL] |
| T-S1-15 | Secret-looking values are rejected in settings (G-7) | unit: workspace settings.json with `secrets.value` set to a 40-character token string, and another with `secrets.ref` set to the string AKIAABCDEFGHIJKLMNOP | exit 1; outcome SETTINGS_SECRET_VALUE for both; error text names the key path only and does not contain the token string | failure |

---

## Epic S2 — Router, next, finish-line, stop-gate, readiness gate, failure ladder
Branch: `epic/S2-router-next-stop-gate`. Depends on: S1.

### Scope
Deterministic-first routing with the single logged model fallback; the YAML-subset pipeline reader; `next` returning the next runnable wave; `finish-line.json` and the roughly 300-token board; the stop-gate with patience 3 (G-9); the readiness verdict gate (G-8); mid-run question refusal; BLOCKED outcome; the FAILED, retry one tier up once, ESCALATED ladder. Sources: CONTRACT sections 2, 4, 8 (M1), G-4, G-8, G-9; docs/02 behaviors 1 and 2; ruling D10.

### Tasks
- [ ] `core/spine/src/yaml-lite.mjs`: YAML subset parser, `PIPELINE_UNSUPPORTED_YAML`
- [ ] `core/spine/src/router.mjs`: ordered rule table, rule ids, `ROUTE_MODEL` fallback logged with reason
- [ ] `core/spine/src/next.mjs`: wave order from `needs`, tier and class, reads preset files from `DO_IT_PIPELINES` or `core/pipelines/`
- [ ] `core/spine/src/finish-line.mjs`: row states per CONTRACT section 2 (OPEN, PARKED, BLOCKED and the closed state); BLOCKED requires a reason; PARKED requires an owner_question; board renderer capped at 1200 characters
- [ ] `core/spine/src/readiness.mjs`: READINESS.json verdict, re-read on every `next`
- [ ] `core/spine/src/stopgate.mjs`: refusal counter, progress reset, park and ask at patience+1
- [ ] `core/spine/src/ladder.mjs`: attempts, one tier up with written reason, ESCALATED
- [ ] `core/schemas/finish-line.schema.json`, `readiness.schema.json`
- [ ] `core/spine/test/s2/*.test.mjs` and fixtures (five preset YAML files copied from L2 once they exist, until then minimal fixtures)

### Cascade classes
- partial-failure: N/A — a slice either passes or fails here; multi-leg partial failure is S3.
- rollback/compensation: N/A — no deploy leg exists in S2; compensation is S3.
- failed-recovery to escalation: covered by T-S2-16 and T-S2-17.
- recovery/resume: N/A — resume from park is S5 (T-S5-11); S2 only guarantees `next` is a pure function of disk state.
- adversarial-verify: covered by T-S2-18 (READINESS.json edited after the gate passed).

### Test Contract — S2 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem + git · [REAL] cases: 4
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-S2-12 is VERIFIED only on the built binary.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-S2-01 | Route ship request to feature, no model call | temp git repo; `start --request "ship W0-W2"` | exit 0; state preset `feature`; events has one `route` row with a rule id and field model_call false; zero rows with event `route_model` | [REAL] |
| T-S2-02 | Route Portuguese bug report to investigate-fix | unit: `route("O Secretário não recebe mensagens completas")` | preset `investigate-fix`; rule id recorded; model_call false | happy |
| T-S2-03 | Route backlog request to drain | unit: `route("drain the 107 backlog cards")` | preset `drain`; extracted size hint stored in state.size as the number 107 | happy |
| T-S2-04 | Ambiguous request asks the model once, logged | unit: `start --request "make it better"` then `next --json` twice, second after a recorded route answer `feature` with reason text | first `next` returns action `ROUTE_MODEL`, class `gather`, tier `T3`, exit 0; after the answer, the `route_model` event holds the reason; second `next` never returns ROUTE_MODEL again (count of route_model events stays 1) | happy |
| T-S2-05 | G-8 build refused without READINESS.json | unit: run in AWAIT_RATIFY, no `.do-it/plan/READINESS.json`; `gate build` | exit 1; outcome READINESS_MISSING; state status unchanged (AWAIT_RATIFY); no slice has status RUNNING | failure |
| T-S2-06 | G-8 build refused with an unresolved decision | unit: READINESS.json with decisions D1 RESOLVED, D2 OPEN, preflight.passed true | exit 1; outcome READINESS_UNRESOLVED; error lists decision id D2 only | failure |
| T-S2-07 | G-8 build starts when the verdict is clean | temp git repo; READINESS.json with every decision RESOLVED or DEFAULTED, preflight.passed true, credentials empty, slices without depends_on_owner_answer; `gate build` then `next --json` | `gate build` exit 0 outcome READINESS_OK, state status BUILDING, `gates.build.approved` true; `next` exit 0 returns the first runnable slice with its tier and class | [REAL] |
| T-S2-08 | Mid-run question is decided by recommendation (G-8) | unit: BUILDING run; record a result with status needs_human and a question of kind `attended` with recommendation "keep" and default "keep" | exit 1; outcome MIDRUN_QUESTION_REFUSED; run status stays BUILDING; event `default_applied` with answer "keep"; owner pack gains a question of kind `default` carrying the same text | failure |
| T-S2-09 | `next` returns waves in dependency order | unit: preset fixture with waves w1, w2 needs w1, w3 needs w1; finish-line rows OPEN | `next` returns w1; after the w1 row is closed with evidence, `next` returns w2 then w3 (stable order by declaration); with all rows terminal `next` returns action `NONE` outcome FINISH_LINE_REACHED | happy |
| T-S2-10 | Board stays small | unit: finish-line with 60 rows (50 closed with evidence, 6 OPEN, 2 PARKED, 2 BLOCKED) | `status --json` board string is at most 1200 characters; it lists every OPEN, PARKED and BLOCKED row id and collapses closed rows into the count 50; deterministic (same input, same bytes) | edge |
| T-S2-11 | G-9 stop-gate refuses with the board, three times | unit: one OPEN row; call `gate stop` three times with no row change | each call exits 1 outcome STOP_REFUSED with the board in the output; state.stop_refusals is 1, 2, 3 after the calls | failure |
| T-S2-12 | G-9 fourth refusal parks and asks | temp git repo; one OPEN row; `gate stop` four times | calls 1 to 3 exit 1 STOP_REFUSED; call 4 exits 2, outcome PARKED; state status PARKED; `owner-pack.json` contains a question with kind `default`, a recommendation and a text naming the open row id; stop_refusals reset to 0 | [REAL] |
| T-S2-13 | Progress resets the stop-gate counter | unit: two refusals, then one row is closed with evidence while a second row is OPEN, then `gate stop` | outcome STOP_REFUSED with stop_refusals equal to 1 (not 3) | edge |
| T-S2-14 | Stop is allowed when every row is terminal | unit: rows closed with evidence, PARKED with owner_question, BLOCKED with reason | `gate stop` exit 0 outcome STOP_ALLOWED; stop_refusals unchanged | happy |
| T-S2-15 | BLOCKED outcome parks only its own slice | unit: two slices; record result status blocked for slice a with reason "owner gate: prod flag" | slice a status BLOCKED, row BLOCKED with the reason; run status stays BUILDING; `next` returns slice b; after b is closed, run status becomes BLOCKED and the exit code is 3; a BLOCKED row recorded with an empty reason is rejected with exit 1 outcome BLOCK_REASON_REQUIRED | failure |
| T-S2-16 | FAILED then retry one tier up (CONTRACT M1) | unit: slice at tier T3 with attempts 0; record status failed; `next --json` | slice status FAILED with attempts 1; outcome FAILED; `next` returns the same slice with tier `T2`, reason "retry after FAILED", escalations 1; a T2 slice returns T1; a T1 slice returns T1 | failure |
| T-S2-17 | Second failure ends in ESCALATED | temp git repo; slice at T3; fail it, `next`, fail it again, `next --json` | after the second failed record: exit 2, outcome ESCALATED, slice and run status ESCALATED; owner-pack.json has a question naming the slice id; `next` returns no runnable action (action `NONE` with reason `escalated`) | [REAL] |
| T-S2-18 | Readiness re-read catches an edit after the gate (adversarial) | unit: `gate build` passes; then the test rewrites READINESS.json changing decision D1 to OPEN; call `next` | exit 1; outcome READINESS_UNRESOLVED; state status is not advanced; event `readiness_revoked` appended; restoring the file bytes makes the next `next` exit 0 | failure |

---

## Epic S3 — record and gate: evidence, it-result/1, deploy failure cascade, conclude
Branch: `epic/S3-record-gate-evidence`. Depends on: S1 (state writer, schema validator).

### Scope
`record` validates `it-result/1` (schema, exit_code mirroring status, run_id match), stores verdicts in `ledger.json` with evidence hashes, enforces G-2 and G-3; `gate verify` re-reads the world; `gate conclude` enforces G-13; the multi-leg deploy cascade PARTIAL_FAILURE, ROLLED_BACK, ESCALATED and re-verify after rollback; crash-safe two-phase record. Sources: CONTRACT sections 2, 4, 7, 8, G-2, G-3, G-13; docs/03 sections 2, 5; docs/02 "Isolation and deploy" and "Failure and recovery".

### Tasks
- [ ] `core/schemas/it-result.1.schema.json`, `ledger.schema.json`
- [ ] `core/spine/src/record.mjs`: validation, exit_code mirror table, evidence resolution (path, result:file, sha256 in artifacts), journal then ledger then state
- [ ] `core/spine/src/ledger.mjs`: rows with verdict, evidence, evidence_sha256, real, recorded_at
- [ ] `core/spine/src/verify.mjs`: `gate verify` re-hash, downgrade, reopen row
- [ ] `core/spine/src/legs.mjs`: leg states, PARTIAL_FAILURE, rollback plan in reverse order, ROLLED_BACK, ESCALATED, re-verify rule
- [ ] `core/spine/src/conclude.mjs`: G-13 refusal reasons, run_verdict computation
- [ ] `core/spine/test/s3/*.test.mjs` and fixtures

### Cascade classes
- partial-failure: covered by T-S3-15.
- rollback/compensation: covered by T-S3-16.
- failed-recovery to escalation: covered by T-S3-17.
- recovery/resume: covered by T-S3-18 (re-verify after rollback) and T-S3-19 (crash between ledger and state, replay converges).
- adversarial-verify: covered by T-S3-10 (evidence file altered between record and gate).

### Test Contract — S3 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 19 · Surfaces: CLI + filesystem + git · [REAL] cases: 5
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-S3-10 is VERIFIED only on a real altered file.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-S3-01 | G-2 VERIFIED with resolvable evidence is accepted | temp git repo; write `proof/out.txt` containing "ok"; it-result with one verdict row DOD-1 VERIFIED, real false, evidence `proof/out.txt`; `record --result results/r1.json` | exit 0; outcome RECORDED; `ledger.json` row DOD-1 has verdict VERIFIED and evidence_sha256 equal to the sha256 of the file bytes; finish-line row DOD-1 closed with evidence set | [REAL] |
| T-S3-02 | G-2 VERIFIED with empty evidence is refused | unit: same result with evidence "" | exit 1; outcome EVIDENCE_REQUIRED naming row DOD-1; ledger has no DOD-1 row; finish-line row stays OPEN | failure |
| T-S3-03 | G-2 VERIFIED with unresolvable evidence is refused | unit: evidence `proof/missing.txt` (no such file) and a second row with evidence `sha256:` plus 64 zeros not present in artifacts | exit 1; outcome EVIDENCE_UNRESOLVED listing both rows; ledger unchanged | failure |
| T-S3-04 | G-3 real row on a mock artifact is refused | unit: row real true, VERIFIED, evidence path resolves to a file listed in artifacts with kind `mock` | exit 1; outcome REAL_ON_MOCK; ledger row verdict IMPLEMENTED-NOT-VERIFIED; the run_verdict computed afterwards is not DONE_ALL_VERIFIED | failure |
| T-S3-05 | G-3 unreachable target is IMPLEMENTED-NOT-VERIFIED | unit: row real true, verdict IMPLEMENTED-NOT-VERIFIED, evidence `result:unreachable.txt` holding the text "connection refused"; all other rows VERIFIED; `gate conclude` | record exit 0; conclude exit 0 with run_verdict DONE_WITH_RESIDUALS (never DONE_ALL_VERIFIED); the residual row id listed | edge |
| T-S3-06 | it-result/1 schema violations are named | unit: results missing `stage`; with status "weird"; with verdict value "PASS" | each exits 1 outcome RESULT_INVALID with JSON pointers `/stage`, `/status`, `/verdicts/0/verdict` respectively; ledger and state unchanged | failure |
| T-S3-07 | exit_code must mirror status | unit: status ok with exit_code 1; status needs_human with exit_code 0 | exit 1 outcome EXIT_CODE_MISMATCH naming expected 0 and expected 2 respectively; nothing recorded | failure |
| T-S3-08 | All six statuses record with the mirrored code | unit: table ok 0, failed 1, needs_human 2, blocked 3, usage_limit 3, context_reset 3 | each result is accepted with outcome RECORDED; state reflects slice status and run status per CONTRACT M1; the `record` process exit code equals the mirrored code (0, 1, 2, 3, 3, 3) | happy |
| T-S3-09 | Result for another run is refused | unit: it-result run_id "other-run" recorded into {run_id} | exit 1 outcome RUN_ID_MISMATCH; no file written under `results/` | failure |
| T-S3-10 | Adversarial: evidence tampered between record and gate | temp git repo; record VERIFIED row DOD-1 with `proof/out.txt`; rewrite the file with different bytes of the same length and restore its original mtime with `utimes`; `gate verify` | exit 1; outcome EVIDENCE_CHANGED naming DOD-1; ledger row now IMPLEMENTED-NOT-VERIFIED; finish-line row DOD-1 back to OPEN; event `evidence_changed` appended; the sha256 comparison, not mtime, caused detection | [REAL] |
| T-S3-11 | G-13 conclude refuses an unaccounted row | temp git repo; finish-line has rows DOD-1 and DOD-2; only DOD-1 recorded; `gate conclude` | exit 1; outcome CONCLUDE_REFUSED with reason `unaccounted_row` naming DOD-2; run status unchanged | [REAL] |
| T-S3-12 | G-13 conclude refuses a live worker | unit: a slice with status RUNNING, every ledger row recorded | exit 1 outcome CONCLUDE_REFUSED with reason `live_worker` naming the slice id | failure |
| T-S3-13 | G-13 conclude refuses a pending wake | unit: `wake.json` with status scheduled, all rows recorded, no live worker | exit 1 outcome CONCLUDE_REFUSED with reason `pending_wake`; after the file is changed to status consumed the call exits 0 | failure |
| T-S3-14 | Conclude closes when everything is accounted | temp git repo; two VERIFIED rows with real evidence files, no workers, no wake; `gate conclude` | exit 0; outcome CONCLUDED; run_verdict DONE_ALL_VERIFIED; the state status equals the closing status of the run lifecycle; `ledger.json` rows both VERIFIED with hashes | [REAL] |
| T-S3-15 | Multi-leg deploy ends in PARTIAL_FAILURE | unit: deploy-it result with legs api DEPLOYED_VERIFIED, worker DEPLOYED_VERIFIED, web FAILED; status failed | record exit 1; outcome PARTIAL_FAILURE; run status PARTIAL_FAILURE; `next` returns action ROLLBACK for legs worker then api (reverse order) and none for web; run_verdict stays null | failure |
| T-S3-16 | Compensation ends in ROLLED_BACK | unit: from T-S3-15, record rollback results for worker then api with state ROLLED_BACK and evidence files | after the second rollback record: outcome ROLLED_BACK; run status ROLLED_BACK; each rollback row has evidence_sha256; `gate conclude` refuses with reason `deploy_not_reverified` until a fix is deployed | failure |
| T-S3-17 | Failed rollback ends in ESCALATED | unit: from T-S3-15, the rollback result for api has status failed | exit 2; outcome ESCALATED; run status ESCALATED; owner-pack.json has a question naming leg api and the evidence path; `next` returns action NONE with reason `escalated` | failure |
| T-S3-18 | Recovery: re-verify after ROLLED_BACK | unit: run ROLLED_BACK; a new deploy result with all legs DEPLOYED_VERIFIED whose evidence files are the old pre-rollback files, then again with fresh files written after the rollback event | first record exits 1 outcome REVERIFY_REQUIRED (evidence older than the rollback event), run stays ROLLED_BACK; second exits 0, run status PROVING | edge |
| T-S3-19 | Recovery: crash between ledger and state, replay converges | temp git repo; `record` with env `DO_IT_FAULT=after_ledger`; then the same `record` without the fault | first call exit 1 outcome FAULT_INJECTED, journal file present; second call exit 0 outcome RECORDED; ledger holds exactly one row for DOD-1 (no duplicate); state and sidecar consistent (`status` exits 0); journal removed | [REAL] |

---

## Epic S4 — Owner pack, terse reply parser, renderers
Branch: `epic/S4-owner-pack`. Depends on: S1.

### Scope
Build the single `owner-pack.json` from questions appended by stages; the deterministic reply parser (grammar `N answer`, `all except N N`, `N: free text`); `answer` with `--reply`, `--render`, `--finalize`, `--native-max`; html, markdown and native renderers; fallback order; defaults applied when unanswered. Sources: CONTRACT section 2 owner-pack, G-16; docs/03 section 5; docs/02 "Owner pack and settings" and Hosts; ruling D7; CONTRACT section 6.

### Tasks
- [ ] `core/schemas/owner-pack.schema.json`, `answers.schema.json`
- [ ] `core/spine/src/pack.mjs`: merge appended questions, stable numbering, dedupe, pack_id
- [ ] `core/spine/src/reply.mjs`: normalization and grammar, no locale-dependent calls
- [ ] `core/spine/src/answer.mjs`: validate against options, finalize defaults, status transition NEEDS_HUMAN to BUILDING
- [ ] `core/renderers/html.mjs`, `markdown.mjs`, `native.mjs`
- [ ] `core/spine/test/s4/*.test.mjs`, golden corpus `core/spine/test/fixtures/replies.json` (25 replies with expected answers)

### Cascade classes
- partial-failure: N/A — a partial reply is a normal pending state (T-S4-03), not a failure state.
- rollback/compensation: N/A — S4 mutates no deployable target.
- failed-recovery to escalation: N/A — the retry ladder is S2.
- recovery/resume: N/A — park and resume is S5; S4 only guarantees an answered pack is reloaded identically (T-S4-15).
- adversarial-verify: covered by T-S4-16 (pack altered after rendering).

### Test Contract — S4 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 16 · Surfaces: CLI + filesystem + HTML + markdown · [REAL] cases: 5
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-S4-06 is VERIFIED only on the built binary.)
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-S4-01 | One pack from two stages (ruling D7) | temp git repo; two it-results (plan-it and review-it) each with a questions file of 1 and 2 questions; `record` both | one `owner-pack.json`; questions n 1, 2, 3 in arrival order; each has n, kind, text, options, recommendation, default, reversible; pack_id equals sha256 of the canonical questions JSON; a third result repeating question 2's text adds nothing (still 3 questions) | [REAL] |
| T-S4-02 | Terse reply with a free-text clause (G-16) | unit: pack of 3 questions with options yes, no, and A, B; reply `1 yes 2 no 3: B` | answers: n1 "yes", n2 "no", n3 "B" with free_text false for 1 and 2 and true for 3; exit 0 outcome ANSWERED | happy |
| T-S4-03 | all except leaves the named questions pending | unit: 7 questions each with a recommendation; reply `all except 4 7` | answers 1, 2, 3, 5, 6 equal each recommendation with source `recommendation`; 4 and 7 absent; exit 2 outcome PENDING with pending list 4 and 7; the variant `approve all except 4 and 7` yields the same result | edge |
| T-S4-04 | Free text may contain digits | unit: reply `3: use 2 workers; 4 yes` and the same with a newline instead of the semicolon | both yield n3 free text "use 2 workers" and n4 "yes"; reply `3: keep it` alone yields n3 "keep it" | edge |
| T-S4-05 | G-16 golden corpus is deterministic | unit: 25 replies in `replies.json` (mixed case, CRLF, non-breaking spaces, uppercase ALL EXCEPT, extra spaces), each parsed 20 times | every parse of a given reply returns byte-identical JSON equal to the golden answer; zero differences across 500 parses | happy |
| T-S4-06 | G-16 same answers regardless of environment | built binary run via child process five times with the same reply under LC_ALL=C, LC_ALL=pt_BR.UTF-8, LC_ALL=tr_TR.UTF-8 (Turkish dotless i), TZ=UTC and TZ=Asia/Tokyo | all five `answers.json` files have identical sha256; the Turkish locale parses `ALL EXCEPT 2` identically to `all except 2` | [REAL] |
| T-S4-07 | Invalid option or unknown question | unit: reply `1 maybe` where options are yes and no; reply `9 yes` on a 3-question pack | exit 1; outcome ANSWER_INVALID naming n1 and the allowed options; exit 1 outcome ANSWER_UNKNOWN_QUESTION naming 9; no answers.json written for either | failure |
| T-S4-08 | Defaults applied when unanswered | unit: 4 questions: n1 reversible true default "A", n2 reversible true default "B", n3 reversible false default "C", n4 kind owner-gate with default "D"; reply `1 B`; `answer --finalize` | n1 "B" source `reply`; n2 "B" source `default`; n3 and n4 not answered; exit 2 outcome PENDING with pending 3 and 4; events contain `default_applied` for n2 only | happy |
| T-S4-09 | HTML renderer is well-formed and escaped | temp git repo; a question text `Use <b>X</b> & "Y"?` and an option `</script><script>alert(1)</script>`; `answer --render html` | `owner-pack.html` exists and is non-empty; a tag-balance parser run on it reports zero unclosed or stray tags; the raw string `<script>alert(1)</script>` does not appear; the escaped form `&lt;b&gt;X&lt;/b&gt; &amp;` appears; no `http://` or `https://` resource reference; each question number 1..n appears once as a list item | [REAL] |
| T-S4-10 | Markdown renderer | unit: 3 questions; `answer --render markdown` | `owner-pack.md` has a numbered line `1.` `2.` `3.` per question, each with text, an options line, a `Recommendation:` line and a `Default:` line; the last line is an example reply built from the recommendations; no unclosed code fence | happy |
| T-S4-11 | Native renderer for 4 questions or fewer | unit: 3 questions, each with 3 options; `answer --render auto --native-max 4` | output mode `native`; payload has 3 entries each with header, question and 3 options; no html file created | happy |
| T-S4-12 | Native limit exceeded falls back to html | unit: 5 questions; `answer --render auto --native-max 4`; and 3 questions where one has 5 options | both choose mode `html`, file `owner-pack.html` written, exit 2 outcome AWAITING_REPLY, output names the file path | edge |
| T-S4-13 | Fallback chain ends in markdown | temp git repo; `--native-max 0`; a directory named `owner-pack.html` is pre-created in the run directory so the html write fails; `answer --render auto` | html write fails (event `render_failed` with mode html); markdown written to `owner-pack.md`; exit 2 outcome AWAITING_REPLY with mode `markdown` | [REAL] |
| T-S4-14 | Settings fallback order is honored | unit: settings `interaction.fallback` equal to markdown, html with 2 questions and `--native-max 4` | mode `markdown` chosen first; native never attempted | edge |
| T-S4-15 | Full reply resumes the run | temp git repo; run status NEEDS_HUMAN with a 2-question pack; `answer --reply "1 yes 2 no"`; then the same command again | first call exit 0 outcome ANSWERED, `answers.json` written, run status BUILDING; second call exit 0 outcome ANSWER_NOOP and `answers.json` bytes unchanged | [REAL] |
| T-S4-16 | Adversarial: pack altered after rendering | unit: render html for a 3-question pack; the test then edits `owner-pack.json` changing question 2's options; `answer --reply "1 yes 2 no 3 yes"` | exit 1; outcome PACK_CHANGED (pack_id differs from the one embedded in the rendered file); no answers.json written | failure |

---

## Epic S5 — Ceilings, handoff, park, resume, wake hook, secrets
Branch: `epic/S5-handoff-park-secrets`. Depends on: S1, S3 (ledger and re-verify).

### Scope
Ceiling gate with absolute-or-percent whichever first (G-5, ruling D4); `handoff.md` and the continue hook; HANDOFF_FAILED and the cap of 5 to ESCALATED; no-hook fallback to ask; `park` with the wake hook; `resume` from state with re-verify; PARKED; secrets drivers file, env, aws-secrets-manager, 1password through the user's own CLI; redaction (G-7); missing credential as a plan-time blocker. Sources: CONTRACT sections 6, 8 (M1, M3), G-5, G-7; docs/02 behaviors 1 and 2, "Failure and recovery"; docs/03 section 6; docs/research/11-host-cli-probe.md section 7; rulings D3, D4, D13, D16.

### Tasks
- [ ] `core/spine/src/ceiling.mjs`: thresholds, `state.ceiling`, `next` block
- [ ] `core/spine/src/handoff.mjs`: handoff.md writer with path validation, attempt counter, continue hook runner, ask-mode fallback, cap to ESCALATED
- [ ] `core/spine/src/park.mjs`, `wake.mjs`, `resume.mjs`: park.json, wake.json, hook contract, resume with re-verify
- [ ] `core/spine/src/redact.mjs`, `secrets.mjs`: redaction set, driver loader, `doctor --secrets`
- [ ] `core/drivers/secrets/file.mjs`, `env.mjs`, `aws-secrets-manager.mjs`, `onepassword.mjs`
- [ ] `core/spine/test/s5/*.test.mjs`, fixtures: hook scripts (real shell files), stub `aws` and `op` scripts, sentinel secret value

### Cascade classes
- partial-failure: N/A — S5 has no multi-leg target; a failed handoff attempt is a single-step failure covered by T-S5-06.
- rollback/compensation: N/A — nothing is deployed by S5.
- failed-recovery to escalation: covered by T-S5-07 (five failed handoffs to ESCALATED).
- recovery/resume: covered by T-S5-11 (fresh process resumes from state) and T-S5-13.
- adversarial-verify: covered by T-S5-12 (evidence altered while parked, resume re-reads).

### Test Contract — S5 (BINDING: 100% pass or iterate)
Types: [unit][e2e] · Count: 18 · Surfaces: CLI + filesystem + git + local hook scripts · [REAL] cases: 9
Done = every case below is PASS. No [REAL] case VERIFIED on a mock. (T-S5-18 is VERIFIED only by a grep over real files.) The aws and 1password cases use stub CLIs and are not [REAL]; their live behavior stays IMPLEMENTED-NOT-VERIFIED until the owner supplies access.
| ID | Scenario | Setup | Expected | Kind |
|---|---|---|---|---|
| T-S5-01 | Warn thresholds, absolute or percent (G-5, ruling D4) | unit: `gate ceiling` with (ctx 150000, window 1000000), (90000, 200000), (100000, 1000000) | first: exit 0 outcome CEILING_WARN (absolute fires, 15 percent); second: exit 0 CEILING_WARN (45 percent fires first though under 150000); third: exit 0 outcome CEILING_OK; `state.ceiling` is not BLOCKED in any | happy |
| T-S5-02 | Block thresholds, whichever fires first | unit: (250000, 1000000), (125000, 200000), (200000, 1000000) | first: exit 3 CEILING_BLOCKED (absolute, 25 percent); second: exit 3 CEILING_BLOCKED (62.5 percent, under 250000); third: exit 0 CEILING_WARN only (200000 is at least 150000, 20 percent, under both block limits) | failure |
| T-S5-03 | G-5 next is blocked until a handoff exists | temp git repo; BUILDING run; `gate ceiling --ctx-tokens 260000 --window 1000000`; `next`; `handoff` with no continue hook; `next`; `resume` | first `next` exits 3 outcome CEILING_BLOCKED and state.json bytes unchanged; after `handoff` wrote handoff.md, `next` still exits 3 (the block clears only when the fresh conductor calls `resume`); after `resume` exits 0, `next` exits 0 | [REAL] |
| T-S5-04 | handoff.md content and path validation | temp git repo; run with 3 open rows and 6 events; `handoff`; then a second run whose state lists a missing file | `handoff.md` exists; contains the resume prompt line, a `state_files` list where every listed path exists on disk, a `next_action` line, the board, and exactly the last 5 events; size at most 32000 characters; the second case exits 1 outcome HANDOFF_PATH_INVALID instead of writing a false list | [REAL] |
| T-S5-05 | Auto handoff succeeds through the continue hook | unit: `DO_IT_HOST_CONTINUE` set to a shell script that writes its first argument to a marker file and exits 0 | exit 0 outcome HANDOFF_STARTED; marker file contains the absolute path of handoff.md; state.handoffs equals 1; event `handoff_started` appended | happy |
| T-S5-06 | HANDOFF_FAILED is an outcome and retry is allowed | unit: continue hook script exits 7 | exit 1 outcome HANDOFF_FAILED; state.handoffs equals 1; handoff.md retained; a second `handoff` call with a working hook exits 0 and state.handoffs equals 2 | failure |
| T-S5-07 | Handoff cap of 5 ends in ESCALATED | temp git repo; hook script exits 1 always and appends a line to a marker file; call `handoff` six times | calls 1 to 4 exit 1 HANDOFF_FAILED; call 5 exits 2 outcome ESCALATED with run status ESCALATED and an owner-pack question mentioning the handoff cap of 5; call 6 exits 2 ESCALATED without invoking the hook (marker file has exactly 5 lines); state.handoffs equals 5 | [REAL] |
| T-S5-08 | No continue hook falls back to ask | unit: `DO_IT_HOST_CONTINUE` unset | exit 2 outcome HANDOFF_ASK; handoff.md written; output contains one line starting `Run:` with the resume command; state.handoffs equals 1; effective `handoff.mode` reported as ask | edge |
| T-S5-09 | Park on usage limit schedules a wake | temp git repo; `DO_IT_HOST_WAKE` set to a real shell script that records its arguments and prints `wake-123`; `park --reason usage_limit --reset-at 2026-10-15T03:00:00Z` | exit 3 outcome PARKED; run status PARKED; `park.json` has reset_at, resume.state_files (each existing) and resume.next_action; `wake.json` has status scheduled and id `wake-123`; the script's recorded args contain 2026-10-15T03:00:00Z and an existing prompt file path | [REAL] |
| T-S5-10 | Park without a wake capability says so | unit: `DO_IT_HOST_WAKE` unset | exit 3 outcome PARKED; `wake.json` status `unavailable`; output contains the exact text `no wake: parked; run do-it resume after the reset` | edge |
| T-S5-11 | Resume from state in a fresh process | temp git repo; one process runs `start`, `gate build`, marks slice s1 RUNNING, then `park --reason usage_limit` with a past `--reset-at`; a new process (new `node` invocation, no shared memory) runs `resume` | exit 0 outcome RESUMED; run status BUILDING; slice s1 status back to READY with attempts unchanged; `wake.json` status consumed; `next` returns slice s1 | [REAL] |
| T-S5-12 | Resume re-reads evidence (adversarial) | temp git repo; a VERIFIED row with evidence file `proof/out.txt`; `park`; rewrite `proof/out.txt` with other bytes; `resume` | exit 0 outcome RESUMED with warning count 1; ledger row IMPLEMENTED-NOT-VERIFIED; finish-line row OPEN; event `evidence_changed`; `next` returns the reopened row | [REAL] |
| T-S5-13 | Resume before the reset time stays parked | unit: reset_at one hour in the future; `resume`, then `resume --force` | first: exit 3 outcome STILL_PARKED naming reset_at, status stays PARKED; second: exit 0 outcome RESUMED | edge |
| T-S5-14 | File and env secret drivers resolve | temp git repo; `.secrets/API_KEY` holds a sentinel value; env DB_URL set; `doctor --secrets` with provider file for API_KEY, a second run with provider env for DB_URL, and a name MISSING_ONE | file run: exit 0, API_KEY ok with length equal to the sentinel length; env run: DB_URL ok; MISSING_ONE reported `missing` with exit 3 outcome CREDENTIAL_MISSING; output shows names and lengths only | [REAL] |
| T-S5-15 | Missing credential is a plan-time blocker | temp git repo; READINESS.json valid with `credentials: ["STRIPE_KEY"]`, provider file, no `.secrets/STRIPE_KEY`; `gate build`; then create the file and call `gate build` again | first: exit 3 outcome BLOCKED; run status BLOCKED; a finish-line row BLOCKED whose reason names STRIPE_KEY and provider file; no slice RUNNING; second: exit 0 outcome READINESS_OK, status BUILDING | [REAL] |
| T-S5-16 | aws-secrets-manager driver invokes the user's CLI | unit: stub `aws` shell script on PATH that logs argv to a file and prints a value; provider aws-secrets-manager, ref `prod/app`; `doctor --secrets` for name TOKEN | exit 0; logged argv equals `secretsmanager get-secret-value --secret-id prod/app/TOKEN --query SecretString --output text`; output shows name and length only; with the stub removed from PATH: exit 3 outcome CREDENTIAL_MISSING with detail `cli_not_found` | happy |
| T-S5-17 | 1password driver invokes the user's CLI and does not echo its stderr | unit: stub `op` script that exits 1 and writes the sentinel to stderr; another stub that prints a value; ref `op://vault/item`; `doctor --secrets` | failing stub: exit 3 outcome CREDENTIAL_MISSING and the sentinel string is absent from stdout, stderr and events; working stub: logged argv starts with `read` and the reference for field TOKEN; exit 0 | failure |
| T-S5-18 | G-7 values never reach any file or output (proof by grep) | temp git repo; sentinel value SENTINEL_9f3a71c2e5 in `.secrets/API_KEY` and as an env var; run `init`, `start`, `gate build` with credentials API_KEY, a `record` whose it-result `next.launch_prompt` contains the sentinel, `handoff`, `park`, `answer --render html`, `doctor --secrets`, all with `DO_IT_DEBUG=1`, capturing stdout and stderr; then recursive grep of `.do-it/` and of the captured output | zero matches for the sentinel in every `.do-it/` file (events, state, ledger, handoff.md, owner-pack files, briefs, stored results) and in captured output; the stored result and event show `[REDACTED:API_KEY]` where the launch_prompt had the value; an event `secret_redacted` names API_KEY without the value | [REAL] |
