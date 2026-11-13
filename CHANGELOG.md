# Changelog

## 1.1.0 — 2026-11-09
Trust and fixes release (D7; resumable test gates ship separately as 1.2.0). Summary by epic first, then the detail.

Summary
- S1 stop-gate ownership: the stop gate gates only the session that owns a run. D9 keeps the cwd fallback only for runs that also have no session id. D10 adds `do-it pack withdraw --by stop-gate` (marks unanswered stop-gate questions `withdrawn`, kept, never deleted; answered ones untouched). The session id comes from the host (`DO_IT_SESSION_ENV`), not from a hand-exported variable. `resume --run <id> --take-over` is required to re-bind a run owned by another non-null session (X25, owner-approved X27). A per-session registry at `~/.do-it/sessions` lets the hook find a session's runs. CP-03 hardening rounds R4 to R10 (details below).
- E1 host isolation: R3, D2. Integration code lives under `hosts/<name>/`, core names no host (G-12). Engine is labelled "Experimental: server side declined (PR #727, 2026-10-29)" in the README, hero alt text, `SKILL.md` and `hosts/engine/README.md`; G-9 keeps the table honest.
- H1 `check-pins --tags`: G-3, D3 (prompt-it v1.0.0 tag), D4 (marketplace entries pin each sibling with `ref: "v<version>"`). `check-pins --marketplace` also compares the version labels with `companions.json`.
- B1 board truth: `status-write view --json` reports `stale`, and the fixture test `tests/status/b1-stale.test.mjs` proves a board that no longer matches its plan is shown as stale (X16).
- K2 optional companions: init-it (D1, public, 0.1.0) and doc-it (D11, public, 0.1.0) are listed in `companions.json` and the marketplace as `required: false`. D14: when doc-it is missing, consumers print `[skip] doc-it not installed: <check>`, never report that check as PASS and never fail (X10 says how doc-it is found).
- Pre-tag hardening: N1 dormant host settings (the 1.0.5 shape, `state.backend` local plus a dormant `state.<host>` block, stays valid in repo and installed layouts); drift guards for the bundle, the mirror and the version files.
- Sibling pins: prompt-it 1.0.0, plan-it 5.3.0, build-it 4.2.0, review-it 2.2.0, conclude-it 2.2.0, parallel-lifecycle 1.0.0, deploy-it 1.0.0, reconcile-it 1.0.1, init-it 0.1.0, doc-it 0.1.0. Marketplace refs `v<version>` for every sibling it lists (X4, D4, H1-04).
- Proposed CONTRACT amendments A3 to A16 (proposed, owner-approved A9 to A12, X27): T-S1-05b legacy-only, the spine parks and the hook does not, `gate escalate --reason`, the per-session registry. A3 to A5 cover `resume --take-over`. The rest are proposals awaiting the owner.

Detail: host integrations stay isolated under `hosts/` (epic E1, ruling R3, decision D2).
- The Engine state store moved out of core: `core/state-stores/engine.mjs`, `engine-drivers/*` and their tests now live in `hosts/engine/state-store/`, with their CLI commands (`driver`, `config`) and the conformance target. `core/state-stores/index.mjs` keeps `local-fs` and `git-branch` and loads any other backend from the `state_store` entry of `hosts/<name>/adapter.manifest.json`; a backend whose host folder is missing fails with `DRIVER_UNKNOWN` naming the host.
- Settings: `state.backend` stays; `state.<backend>` is one object keyed by the backend name, validated by the host's own schema (`hosts/engine/state-store/settings.schema.json`). The `engine` default is gone from core; existing `state.engine.blobs` files stay valid. No new top-level settings key (G-8). `--set state.<backend>.<key>=value` reaches the host schema.
- The G-12 scan gains the word `engine` and covers `core/` and `scripts/` (T-E1-01); deleting `hosts/engine/` leaves every core suite green (tests/hosts/isolation.test.mjs).
- The host tables in the README and the generated `SKILL.md` are built from `hosts/*/adapter.manifest.json` (`level`, `server_side`, `status_label`) by `scripts/hosts-table.mjs`; `check-readme.mjs --hosts` fails when a host folder has no row or a host whose server side is declined is listed as Supported (G-4).
- D2: Engine shows as "Experimental: server side declined (PR #727, 2026-10-29)" in the README table, the hero alt text, `SKILL.md` and `hosts/engine/README.md`. The adapter is kept; no redesign.
- The Engine live case T-R4-05 moved from `tests/e2e/r4.test.mjs` to `hosts/engine/tests/`.
- Stop gate (CP-03 R8-S1-M15): the gate fails open only when a run's `state.json` cannot be read. When the state was read and the run has open rows, a refusal whose own bookkeeping cannot be written (`STATE_TOO_LARGE`, a read-only run folder, any write error) is still `STOP_REFUSED` (hook exit 2). The answer lists the error in `unwritable` and carries `refusal_uncounted: true` and `uncounted_runs`. Patience cannot advance without a write, so such a run is refused on every stop and never parked by the gate until the write error is fixed or its rows close.
- Stop gate (CP-03 R9-S1-M16): at patience the gate test-serialises the parked state (schema, cap) before it adds the park question, so a park that fails that check adds nothing to the owner pack. The owner pack dedupes on the stored (redacted) text, and the gate never adds a second park question while the run still has an open one it wrote.
- Stop gate (CP-03 R10-S1-M17): the park question is deduped only against open questions (not withdrawn, not answered). A park after the owner answered the last park question asks again, even with the same open rows, and its `stop_parked` event names the new question.
- Stop gate (CP-03 R10 L-d): a park that reuses the gate's still-open question rewrites its text to the current open rows.
- Stop gate (CP-03 R10 L-g): an `answers.json` that cannot be read no longer makes every park fail. For the park it counts as no answers (so an answered park question still counts as open and is reused), and the `stop_parked` event carries `answers_error`.
- Known limit (CP-03 R9 L-a): an uncounted refusal never parks. An unattended session is refused on every stop until the write fault (ENOSPC, EACCES, `STATE_TOO_LARGE`) is fixed; each refusal prints the cause.
- Stop gate (CP-03 R9 L-b): when `.do-it/runs` exists but cannot be listed, the hook gates the runs the session registry names there (looked up by path) and reports `runs_unlistable` on stderr. A run the registry does not name is not seen.
- Known limit (CP-03 R10 L-e): the gate trusts its own `stop_parked` events. A hand-written event that names a stage question makes the gate treat that question as its park question: a park then adds no question of its own, and `pack withdraw --by stop-gate` withdraws it. The stage question's text is never rewritten.
- Known limit (CP-03 R10 L-f): a state write that fails on I/O (a read-only `state.json`, a disk filling between two writes) after the park question was added leaves one open park question on a run that is not parked. It is never more than one, and the next stop that can write parks the run and reuses it.
- Known limit (CP-03 R4-S1-M7, R9 L-c): when the session registry cannot be written at `start`, the run gates only from its own cwd.
- `doctor --install --dry-run` without `--host` reports the plan (`INSTALL_PLANNED`) and writes nothing (CP-04 part A, D1).
- Headroom: `gate build` accepts a plan only when the state and the finish line it seeds are at most the state cap less 1 MiB (`STATE_ACCEPT_CAP`), measured as written (after redaction). `record` accepts a result file up to the same limit (CP-03 R8-S1-M15).

## 1.0.5
Four frictions from the BCL r11 run (backlog note do-it-plugin-friction-from-bcl-r11).
- Stop gate run scope: `start` records the owning session and cwd on the run; the Stop hook passes its session and cwd to `gate stop`, which gates only the run they own (and parks only that run). Runs written before this have no owner and stay gated for everyone.
- Multi-round checkpoint files: the last re-review/round section decides, or an explicit `Final verdict:` line. A flat file with both PASS and FAIL is still contradictory.
- `it-result` status aliases `done`, `pass`, `success` are recorded as `ok`. Any other word is still `RESULT_INVALID`.
- A package row closes by itself when every `T-<slice>-<n>` case row is terminal: DONE if all DONE, else BLOCKED naming the rest.

## 1.0.4
- Merge model (H-22). A program whose slices merge to main one by one could never merge, because the adversarial and pre-merge reviews cover every wave and can only run after the last. Policy section 3b and decision D20: plan-it 5.2.0 takes `merge_model: incremental`, writes no `pre-merge`, and the closing reviews gate `release`. The spine already read gates from each checkpoint, so a block without `pre-merge` is accepted as is.
- `due --at merge` and `due --at release` list every checkpoint that gates that action (build-it 4.1.3, H-27).
- Companion pins: plan-it 5.2.0, build-it 4.1.3. review-it 2.1.1, conclude-it 2.1.1, prompt-it 1.0.0, parallel-lifecycle 1.0.0, deploy-it unchanged.

## 1.0.3
- Checkpoints, second fix from the first real run. A checkpoint no longer holds the start of the work it covers (H-21): with W0 covered, a W0 slice that needs another W0 slice waited on a review that only runs after W0 ends, so the wave could never finish. It holds the slices outside the covered work that depend on it, and the promotion of that work. `due --at merge` and `due --at release` returned the wrong checkpoint or none (H-22); they are now aliases of the `pre-merge` and `pre-release` kinds. Both fixes are in build-it 4.1.2; the policy states the rule, with decision D19.
- plan-it 5.1.2 (H-23): the glossary check no longer reads a `STATUS.md` generated from `status.json` as prose (47 false unknown ids on the real package).
- Companion pins: plan-it 5.1.2, build-it 4.1.2. review-it 2.1.1, conclude-it 2.1.1, prompt-it 1.0.0, parallel-lifecycle 1.0.0, deploy-it 1.0.0 and reconcile-it 1.0.0 are unchanged.
- Known limits: `gate` needs each slice to carry its `wave` to resolve a wave checkpoint, and exits 1 saying so when it does not. A `verified` status row is still a claim, not proof.

## 1.0.2
- Checkpoints no longer serialize the waves. A wave checkpoint holds only the slices that depend on the reviewed work and the promotion of that work, never independent slices (checkpoint items gain `gates` and `covers`, slices gain `wave`; build-it 4.1.1 adds `checkpoints.mjs gate`, plan-it 5.1.1 emits the fields). Older READINESS files are read with the corrected meaning. Policy rewritten, with decisions D13 to D18, in `docs/implementation/do-it-next/CHECKPOINT-POLICY.md`; tests T-CP-05 to T-CP-10.
- Fix to 1.0.1: the `checkpoint:CP-NN` finish-line row closed for any existing evidence file, without reading the verdict, so a checkpoint could count as satisfied with no PASS. It now closes only when the evidence is that checkpoint's verdict file and the file passes the same rule build-it reads (one overall verdict, code blocks and comments ignored, PASS with FAIL is not a pass); otherwise the row stays OPEN and `record` answers `CHECKPOINT_NOT_PASS`.
- `gate build` rejects a `depends_on` cycle (READINESS_INVALID with the cycle printed) instead of leaving the slices unrunnable with no explanation.
- Marketplace: the version labels of the siblings equal the pins in `companions.json` (they showed old versions on a real install), and `check-pins --marketplace` fails on that drift.
- Companion pins: plan-it 5.1.1, build-it 4.1.1, review-it 2.1.1, conclude-it 2.1.1. prompt-it, parallel-lifecycle, deploy-it and reconcile-it are unchanged. plan-it, review-it and conclude-it now name their marketplace after themselves, so `devotts` is only this hub.
- README: the version badge the header check requires once a release exists.
- Known limits: `gate` needs each slice to carry its `wave` to resolve a wave checkpoint, and exits 1 saying so when it does not. A `verified` status row is still a claim, not proof.

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
