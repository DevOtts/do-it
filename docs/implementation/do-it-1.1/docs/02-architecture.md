# do-it 1.1: architecture

One rule from the trust diagnosis governs this doc: **extend the shipped layer, never add a parallel road.** Each section names the shipped piece it extends.

## Principles

| # | Principle | Solves |
|---|---|---|
| P1 | A gate binds only the session that owns an active run | F1 |
| P2 | There is one path to `0-done/`, and it is the guarded close | F2, F3 |
| P3 | A shipped piece is installable, or the docs say it is not | F4, F5, F7 |
| P4 | A claim that backs a decision carries its source tier, and the tier decides whether it may be stated as fact | F6 |
| P5 | Verification happens before publishing, sized to the stakes, by a reader that did not write the claim | F6 |
| P6 | Read what is current: `origin/main` and the shipped layers, before proposing | F6, L8 |

## A. Stop gate ownership (F1) — extends 1.0.5 run scope

Shipped: `start` records `owner {session_id, cwd}`, the hook passes `--session` and `--cwd`, and `selectScopedRunId` picks one run. The missing piece is the session id: do-it ignores the one Claude Code provides (C26).

Change:

0. **Read the session id Claude Code already sets.** `cli.mjs:141` falls back to `CLAUDE_CODE_SESSION_ID` after `--session` and `DO_IT_SESSION_ID`. No new hook is needed. Edge case to test: the id changes on `/clear`, so `resume` from the same conversation after `/clear` must re-bind the run (record the new id with a history entry) instead of losing the gate.
1. `selectScopedRunId` matches on `owner.session_id` only. A cwd match is used only when the host gives no session id **and** the run has none (D9).
2. Legacy runs (no `owner`) and null-session runs are not gated from a Claude Code hook that has a session id. `gate stop` returns `STOP_ALLOWED` with a reason. An explicit `--run <id>` still gates them.
3. `gateStop` reads the run status through the existing `peekRunStatus` (`state.mjs:141`) and allows by exclusion: `PARKED`, `NEEDS_HUMAN`, `BLOCKED`, `AWAIT_RATIFY` and the terminal statuses (`TERMINAL_RUN_STATUSES`, `migrate.mjs:14`) return `STOP_ALLOWED`. Every other run status gates (C36). A run waiting on the owner must not trap the session the owner needs to answer from.
4. The board shown and counted is the run's own rows. Rows gain a `run_id`, and rows without one never gate a hook stop.
5. The patience path parks only a run the hook's session owns. (Duplicate questions are already skipped, C35.)
6. Cleanup tool (D10, S1-08): `do-it pack withdraw --by stop-gate` marks unanswered stop-gate questions `withdrawn: stop-gate artifact (do-it 1.1, S1)`, never deleted; answered and stage questions are untouched. Running it on a consumer repo is that repo's work.

Stop-gate decision table (the model the tests follow):

| Hook session matches owner | Run status | Run has owner | Outcome |
|---|---|---|---|
| yes | active | yes | gate (refuse up to patience, then PARK this run only) |
| yes | PARKED, NEEDS_HUMAN, BLOCKED, AWAIT_RATIFY or terminal | yes | STOP_ALLOWED |
| no | any | yes | STOP_ALLOWED |
| n/a | any | no (legacy) | STOP_ALLOWED from a hook |
| no session from host | active | session null, cwd inside | gate (non-Claude host fallback) |

## B. One path to `0-done/` (F2) — extends conclude-it's guarded close

Shipped: `ledger-card.mjs close` → `status-write close --by conclude-it --move` (refuses unless all tasks are verified or an owner note is given).

Change:

1. conclude-it ship pipeline S4 calls `ledger-card.mjs close` instead of `git mv` whenever the package has a `status.json`. Without a `status.json`, S4 writes a `CLOSEOUT.md` listing each piece as shipped (with evidence), dropped or carried over (with a backlog path). Then it moves the folder. A move with neither is refused.
2. doc-it `check archive` (amendment 2; was build-it `status-write audit`): a read-only scan. It lists `0-done/` packages whose `status.json` has `closed: false`, or that have neither `status.json` nor `CLOSEOUT.md`, plus active boards whose `updated_at` is older than their folder's newest commit by more than the stale threshold. Exit 1 when any are found. conclude-it Step 0 runs it and reports the results; it never fixes anything on its own.
3. Repairing a consumer repo's archived boards is that repo's call, not automatic and not do-it's work (D5, R3): A1-05 gives it `close --owner-note "<the commit's disposition>"`.

## C. Board truth for harness-status-tracking (F3) — uses the shipped review-it path

An independent review-it run (not the session that ran REAL-VERIFY, which is why the earlier attempt was reverted) takes `REAL-VERIFY.md` as its evidence and moves the board's 8 tasks (ST-01…ST-08) to `verified` where their cases are verified. T-B-20's stale half stays parked: no commit to the folder is yet more than 24 h newer than the board (newest is about 3.8 h after).

## D. Installable or honest (F4, F5, F7)

- **init-it 0.1.0:** create the `DevOtts/init-it` repo (decision D1), tag `v0.1.0`, add it to `core/companions.json` and the marketplace, and make `doctor --install` fetch it. Until then, plan-it's hand-off line says "init-it not installed" when it is missing.
- **Engine adapter:** downgrade to `Experimental: Engine declined the host hooks (PR #727, 2026-10-29)` in the README hosts table, the hero alt text and `hosts/engine/README.md`. The adapter code stays, untouched. A redesign as a squad import onto Engine's `pipeline_definition` road belongs to Engine's consolidation program, not to do-it 1.1 (decision D2).
- **Release hygiene:** tag prompt-it `v1.0.0` from the commit its plugin.json became 1.0.0, or pin 0.2.1 (decision D3). Remove reconcile-it's duplicate script (1.0.1). `check-pins` also fails when a pin has no matching tag on the remote. Marketplace `ref` pinning is decision D4.

## E. Claim ledger with source tiers (F6; TRUST 3.1, 3.3, 3.4) — new, in plan-it

The ledger is the one new artifact. It lives where analysis is authored (plan-it), and review-it reads it.

- **Format:** `audit/claims.md`, a markdown table `ID | Claim | Tier | Source`, as in this package. An optional `claims.json` twin is generated from it, never hand-written.
- **Tiers (closed enum):** `live@<date>`, `code`, `git`, `generated`, `durable-doc`, `program-doc`, `transcript`, `local`, `pointer`. `code`/`git` sources must name a repo and sha (in the ledger header or the row) and a path.
- **Fact rule:** a row whose only tier is `program-doc`, `transcript` or `pointer` must say so in the claim text ("the study says…", "the session reports…") or be marked `UNVERIFIED`.
- **Counts:** a claim containing a number of things carries the list (inline or a linked file) and the counting rule. `gate-check claims` flags a digit-plus-plural-noun claim with neither.
- **Evidence against:** when the request contains the owner's hypothesis, the findings doc has a section "Evidence against the hypothesis" before any section that confirms it. This is guidance plus a lint: the doc has the heading, or no claim uses "confirms".
- **Gate:** `gate-check claims <ledger>` checks the tier enum, sources present, the sha/path rule, the fact rule and the count rule. Decision-grade packages (D6) must pass it before G4.

## F. Grounding preflight (F6, TRUST 3.2, L8) — extends plan-it Phase 3 and `preflight`

`gate-check preflight` gains two probes:

1. **Behind remote.** For each repo the run reads, compare `HEAD` and the working tree with `origin/<default>` after a fetch. If the checkout is behind, it warns and records the remote sha the run must read. The KICKOFF "0. Pinning" block uses the remote sha.
2. **Shipped layers.** The run writes `research/SHIPPED-LAYERS.md`: the last N weeks of `0-done/` entries, the session-ledger cards and the decision registers (ADRs, CONTRACT rulings), each with a one-line "what it shipped". A proposal in `02` that adds a road, layer or registry must cite the shipped layer it extends, or state "none applies" with a reason. `gate-check handoff` checks that the file exists and is non-empty for size M and L.

## G. Audit mode in review-it (F6, TRUST 3.5) — new mode, routes to existing subagents

`/review-it --audit <claims.md>` runs the chain the owner built by hand in `grokbot-plan`:

```
ledger ──► AUDITOR (a different model from the author, primary sources only, sees no conclusions)
             │ per-claim verdicts TRUE/PARTIAL/FALSE/STALE/UNVERIFIABLE + corrections
             ▼
         OMBUDSMAN (checks the auditor's non-TRUE verdicts + a sample of TRUE ones)
             │ UPHELD / AMENDED / OVERTURNED per finding
             ▼
         SAFE-TO-PUBLISH list + DO-NOT-PUBLISH list  → the author rewrites from SAFE only
```

Audit-chain states (core-logic model; failure states included):

| State | Event | Next |
|---|---|---|
| LEDGER_READY | auditor dispatched | AUDITING |
| AUDITING | verdict file written, all rows covered | AUDITED |
| AUDITING | verdict file missing or rows uncovered (FAIL) | AUDIT_RETRY |
| AUDIT_RETRY | re-dispatched once with the missing rows | AUDITING |
| AUDIT_RETRY | second failure (ESCALATE) | ESCALATED_TO_OWNER |
| AUDITED | ombudsman dispatched | ADJUDICATING |
| ADJUDICATING | rulings written | ADJUDICATED |
| ADJUDICATING | ombudsman overturns ≥ 1 TRUE verdict (PARTIAL trust) | REAUDIT_SAMPLE |
| REAUDIT_SAMPLE | auditor re-checks the overturned class | ADJUDICATING |
| ADJUDICATED | SAFE list emitted | PUBLISHABLE |
| any | owner aborts (ABORT) | ABORTED, nothing published (ROLLBACK: the artifact keeps its last published version) |

- **Stakes sizing (D6):** decision-grade = backs an owner decision or a plan freeze → the full chain. Everything else → ledger + `gate-check claims`, no auditor.
- **Models:** the auditor must be a different model from the author (recorded in the verdict file); the ombudsman is Opus. The tier policy needs a written reason for each T1 spawn.
- **Cost line:** the verdict file records the tokens per role, so the owner sees what a decision-grade audit costs.

## H. resumable-test-gates (planned elsewhere) — coupling only

See `docs/01` F8. Rules for merging the two packages at G4:

1. One release, do-it 1.1.0, if both are ready; otherwise trust ships as 1.1.0 and test gates as 1.2.0 (decision D7).
2. The spine source files are disjoint (`stopgate.mjs`/`state.mjs` here; `settings.mjs`, a new gates module and pipelines there). The generated `core/spine/do-it.mjs` is rebuilt **after** each merge, never merged by hand.
3. The `gates` settings key belongs to resumable-test-gates. This package adds no settings key.
4. S1 reads `CLAUDE_CODE_SESSION_ID` in `cli.mjs`, which resumable-test-gates does not touch.

## I. Host isolation (F10, R3) — epic E1, moves code, no new key

The core knows two state stores, `local-fs` and `git-branch`. Any other backend is declared by a host in `hosts/<name>/adapter.manifest.json` (`state_store: "<relative module>"`) and loaded from there. Settings keep `state.backend`; the options object keyed by the backend name is passed to the host unread and validated by the host's own schema, so existing `state.engine.blobs` files stay valid and no key is added (G-8).

```
core/state-stores/index.mjs ──openStore({backend})──► local-fs | git-branch
                                   │ other backend
                                   ▼
                     hosts/<name>/adapter.manifest.json ──state_store──► hosts/<name>/state-store/*.mjs
                                   │ missing host
                                   ▼
                     DRIVER_UNKNOWN "<backend>: host <name> not installed"
```

Host tables (README, SKILL) are generated from the manifests' `level` and `server_side`. The G-12 scan gains `engine` and covers `core/` and `scripts/`; `hosts/` and `plugins/do-it/` (the Claude Code package) are exempt. Proof of isolation is behavioural, not textual: with `hosts/engine/` deleted, every core suite passes (T-E1-02).

## J. doc-it 0.1.0 and its consumers (D11, R4) — epics K1, K2

doc-it owns the documentation rules; every other plugin calls it and keeps no copy (G-10).

```
conclude-it Step 0 / S4 ──► doc-it check archive  ──► JSON + exit 0/1/2
conclude-it Step 2       ──► doc-it check expiry   ──► report only
plan-it preflight (V1)   ──► doc-it check checkout ──► exit 1 when behind
plan-it ledger (L1)      ──┐
review-it --audit (Q1)   ──┴► doc-it tiers --json
any consumer, doc-it missing ──► "[skip] doc-it not installed: <check>", never PASS (D14)
```

build-it keeps `status-write close` because it writes the board; doc-it only reads. 0.1.0 checks DS-3, DS-4, DS-6 and the board-age half of DS-2 (`stale_active`); DS-1, DS-5, DS-7 ship as written rules (D12).
