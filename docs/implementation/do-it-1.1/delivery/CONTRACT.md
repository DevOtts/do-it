# CONTRACT v1.0 — do-it 1.1

Final 2026-11-06: ratified by Fernando Ott at G4 (plan review). Changes from here on are dated amendments (v1.1 …).

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Dn ruling — see GLOSSARY.md

## 1. Vocabulary

| Term | Meaning |
|---|---|
| active run | a do-it run whose status is not PARKED, NEEDS_HUMAN, BLOCKED, AWAIT_RATIFY or terminal (DONE, ESCALATED, FAILED) |
| owner session | the host session id recorded in `state.json` `owner.session_id` at `start` |
| legacy run | a run whose `state.json` has no `owner` object (written before 1.0.5) |
| guarded close | `ledger-card.mjs close` → `status-write close --by conclude-it --move` |
| CLOSEOUT | `CLOSEOUT.md` in a package without `status.json`: one row per piece, `shipped` (with evidence) / `dropped` (with reason) / `carried` (with backlog path) |
| claim ledger | `audit/claims.md`, table `ID \| Claim \| Tier \| Source` |
| source tier | one of `live@<date>`, `code`, `git`, `generated`, `durable-doc`, `program-doc`, `transcript`, `local`, `pointer` |
| decision-grade | an artifact that backs an owner decision or a plan freeze |
| audit chain | ledger → auditor → ombudsman → SAFE / DO-NOT-PUBLISH lists |
| shipped-layers file | `research/SHIPPED-LAYERS.md` in a plan-it package |

## 2. Interfaces

### 2.1 Spine (`core/spine/src/`, rebuilt into `core/spine/do-it.mjs`)

- `gate stop --session <id> --cwd <path> [--run <id>] --json` → `STOP_ALLOWED` | `STOP_REFUSED` | `PARKED`. The response always carries `owned: true|false` and, when allowed, a `reason`.
- `start` records `owner.session_id` from `--session`, else `DO_IT_SESSION_ID`, else `CLAUDE_CODE_SESSION_ID`. When any is set it never records `null`.
- Finish-line rows carry `run_id`. A hook stop counts only rows whose `run_id` is the gated run.

### 2.2 doc-it `check archive` (amendment 2: moved from build-it `status-write audit`)

- `doc-it check archive [--root <repo>] [--stale-hours N] [--json]`. Roles come from `.doc-it/config.json`. Read-only. Exit 0 = clean, 1 = findings, 2 = config or usage error. JSON: `{done_unclosed[], done_without_closeout[], stale_active[]}`.
- Also in doc-it 0.1.0: `check checkout <repo...>` (exit 1 when behind), `check expiry` (report only), `tiers --json`, the CLOSEOUT template. build-it keeps `status-write close` (the board writer).

### 2.3 conclude-it

- Ship pipeline S4 archives a package only through the guarded close (`status.json` present) or after writing a CLOSEOUT (absent). A plain `git mv` is no longer an S4 instruction.
- Step 0 runs `doc-it check archive` and reports what it finds. Report only; it does not fix. Without doc-it: the `[skip]` line (D14).

### 2.4 plan-it

- `gate-check claims <claims.md>`: exit 0 clean, 1 findings (each names the row and the rule).
- `gate-check preflight` adds the probes `behind-remote` (per read repo) and `shipped-layers` (file present and non-empty for size M/L).
- `gate-check handoff` fails a size M/L package without `research/SHIPPED-LAYERS.md`, and a decision-grade package whose ledger fails `claims`.

### 2.5 review-it

- `/review-it --audit <claims.md> [--stakes decision|routine]` writes `audit/audit-<model>.md` (auditor), `audit/ombudsman.md` (rulings) and `audit/SAFE.md` (the SAFE and DO-NOT-PUBLISH lists, plus tokens per role).

### 2.6 init-it

- Repository `DevOtts/init-it`, tag `v0.1.0`; `core/companions.json` entry `required: false`; marketplace entry.

## 3. Core-logic models

### 3.1 Stop gate

| Hook session = owner | Run status | Owner object | Outcome |
|---|---|---|---|
| yes | active | present | gate: refuse up to patience, then PARK this run only |
| yes | PARKED, NEEDS_HUMAN, BLOCKED, AWAIT_RATIFY, DONE, ESCALATED, FAILED | present | STOP_ALLOWED |
| no | any | present | STOP_ALLOWED |
| any | any | absent (legacy) | STOP_ALLOWED (an explicit `--run` still gates) |
| host gave no session | active | session null, cwd inside run cwd | gate (non-Claude host fallback) |

```
HOOK_STOP --(owner session, active run, open rows)--> REFUSED
REFUSED --(patience reached)--> PARKED_THIS_RUN
HOOK_STOP --(not owner, legacy, or inactive run)--> ALLOWED
HOOK_STOP --(state.json unreadable)--> STATE_ERROR
STATE_ERROR --(fail open, event logged; next status reports it)--> ALLOWED
```

Failure path: if `state.json` is unreadable (ERROR), the hook fails open (STOP_ALLOWED with `reason: "state unreadable"`) and logs an event, matching 1.0.x's fail-open rule. Recovery: the next `do-it status` reports the unreadable run.

### 3.2 Audit chain

```
LEDGER_READY --(dispatch auditor)--> AUDITING
AUDITING --(all rows covered)--> AUDITED
AUDITING --(rows missing)--> AUDIT_RETRY_FAILED
AUDIT_RETRY_FAILED --(re-dispatch missing rows)--> AUDITING
AUDIT_RETRY_FAILED --(second miss)--> ESCALATED_TO_OWNER
AUDITED --(dispatch ombudsman)--> ADJUDICATING
ADJUDICATING --(rulings written)--> ADJUDICATED
ADJUDICATING --(a TRUE verdict overturned)--> PARTIAL_TRUST
PARTIAL_TRUST --(auditor re-checks that class)--> ADJUDICATING
ADJUDICATED --(SAFE list written)--> PUBLISHABLE
AUDITING --(owner abort)--> ABORTED
ADJUDICATING --(owner abort)--> ABORTED
ABORTED --(rollback: keep last published version)--> LEDGER_READY
```

| State | Event | Next |
|---|---|---|
| LEDGER_READY | dispatch auditor | AUDITING |
| AUDITING | verdict file covers every row | AUDITED |
| AUDITING | verdict file missing or rows uncovered (FAIL) | AUDIT_RETRY |
| AUDIT_RETRY | re-dispatch with the missing rows | AUDITING |
| AUDIT_RETRY | second failure (ESCALATE) | ESCALATED_TO_OWNER |
| AUDITED | dispatch ombudsman | ADJUDICATING |
| ADJUDICATING | rulings written | ADJUDICATED |
| ADJUDICATING | ombudsman overturns a TRUE verdict (PARTIAL trust) | REAUDIT_SAMPLE |
| REAUDIT_SAMPLE | auditor re-checks that class of claim | ADJUDICATING |
| ADJUDICATED | SAFE list written | PUBLISHABLE |
| any | owner aborts (ABORT) | ABORTED; ROLLBACK: nothing is republished, the last published version stays |

### 3.3 Archive

```
REQUESTED --(status.json, all verified or owner note)--> CLOSED_MOVED
REQUESTED --(status.json, unverified, no note)--> REJECTED
REQUESTED --(no status.json, CLOSEOUT written)--> CLOSED_MOVED
REQUESTED --(no status.json, no CLOSEOUT)--> DENIED
DENIED --(S4 writes CLOSEOUT or asks owner once)--> REQUESTED
REQUESTED --(killed after freeze, before move)--> PARTIAL_FAILED
PARTIAL_FAILED --(re-run close: board already frozen, move completes)--> CLOSED_MOVED
```

| Package has | Move requested | Outcome |
|---|---|---|
| `status.json`, all tasks verified | guarded close | moved, `closed: true` |
| `status.json`, unverified tasks, owner note | guarded close | moved, `closed: true`, note in history |
| `status.json`, unverified tasks, no note | guarded close | REJECTED, nothing moved |
| no `status.json`, CLOSEOUT written | S4 | moved |
| no `status.json`, no CLOSEOUT | S4 | REJECTED (DENIED), S4 writes the CLOSEOUT first or asks the owner once |

## 4. Governance rules

- **G-1** A hook stop is gated only by an active run owned by the hook's session. (test: T-S1-01..06)
- **G-2** Nothing reaches `0-done/` except through the guarded close or a CLOSEOUT. (test: T-A1-01..04)
- **G-3** A pin names a tag that exists on the remote. (test: T-H1-02)
- **G-4** The README never states a host level that the host's server side does not support. (test: T-E1-05)
- **G-5** A decision-grade ledger passes `gate-check claims` before G4. (test: T-L1-01..05)
- **G-6** An auditor is never the same model as the claim's author. (test: T-Q1-03)
- **G-7** Analysis reads `origin/<default>`, never a checkout that is behind, without saying so. (test: T-V1-01)
- **G-8** No settings key is added by this package; `gates` belongs to resumable-test-gates. (test: T-S1-07, T-E1-04)
- **G-10** The documentation rules (tier enum, CLOSEOUT template, archive, expiry and checkout checks) have one home, doc-it; a consumer calls doc-it and keeps no copy, and without doc-it it prints the `[skip]` line and never PASS (D11, D14). (test: T-K2-03, T-K1-07)
- **G-9** Host integrations live only under `hosts/<name>/`: no host name in `core/` or `scripts/` (the G-12 word list includes `engine`), and deleting a host folder leaves every core suite green (R3). (test: T-E1-01, T-E1-02)

## 5. Repo and branch map

| Repo | Epics | Branch |
|---|---|---|
| DevOtts/doc-it (new, public) | K1 | `epic/K1-doc-it-0.1.0` from the local tree |
| DevOtts/do-it | S1, E1, H1 (pins, check-pins), B1 (board), K2-04, release | `epic/<EID>-<slug>` from `main` |
| DevOtts/build-it | A1-05 (close in place) | `epic/A1-close-in-place` |
| DevOtts/conclude-it | A1 (S4, Step 0) | `epic/A1-guarded-archive` |
| DevOtts/plan-it | L1, V1 | `epic/L1-claim-ledger`, `epic/V1-grounding-preflight` |
| DevOtts/review-it | Q1 | `epic/Q1-audit-mode` |
| DevOtts/init-it (new) | I1 | `main` (first push) |
| DevOtts/prompt-it, DevOtts/reconcile-it | H1 | tag only / `epic/H1-dup-script` |

Siblings release first, then do-it pins them (release process memory: siblings first).

## 6. Definition of shipped

An epic is shipped when its Test Contract is 100% passing on `origin/main` of its repo, the sibling is tagged and released, and do-it's `core/companions.json` and marketplace pin that tag. do-it 1.1.0 is shipped when every epic is shipped, `check-pins --marketplace` passes, the CHANGELOG lists each change with its decision id, and each review checkpoint's verdict file says PASS.

## RUN-POLICY

Build tiering (owner's standing rule: haiku mechanical, sonnet spec'd against a test contract, opus hard; escalate on struggle):

| Epic | Tier | Why |
|---|---|---|
| S1 stop gate | sonnet | spec'd decision table; escalate to opus if a T-S1 case fails twice |
| A1 guarded archive | opus | cross-cutting across build-it and conclude-it; touches the only path to 0-done |
| B1 board truth | haiku | runs shipped commands, no code |
| I1 init-it release | haiku | mechanical repo and tag work, after owner D1 |
| K1 doc-it 0.1.0 | sonnet | spec'd CLI against fixed fixtures |
| K2 consumers | sonnet | wires existing skills to the K1 CLI |
| E1 host isolation | sonnet | moves code against an existing conformance suite |
| H1 release hygiene | haiku | tags, pins, a file removal |
| L1 claim ledger lint | sonnet | spec'd lint |
| V1 grounding preflight | sonnet | spec'd probes |
| Q1 audit mode | opus | multi-agent chain with failure states |
| adversarial verify (CP) | opus | fresh eyes on S1, A1, Q1 |

Worktrees: one per epic branch, created from the main session (subagents cannot run git in sibling repos, memory `subagent-cross-repo-git`), reap-on-merge.
Delivery: every worker writes its results to disk under `.taskstate/results/<EID>.md` AND returns a content-bearing final message; a worker that only goes idle has not delivered.

## 7. Changelog

- v1.0-draft (2026-11-06): first freeze, autonomous-draft, owner away.
- v1.0-draft amendment 1 (2026-11-06, owner): R3 host isolation (E1 rewritten as host isolation, G-9 added, D2 amended, D5 moved out, D10 becomes the generic `pack withdraw`, S1-08 added); R4 doc-it is its own repo `DevOtts/doc-it` and owns the documentation rules; R5 the pilot's doc pattern is doc-it's global standard. Cases 40 → 45, tasks 39 → 44.
- v1.0-draft amendment 2 (2026-11-06, owner G4): G4 approved D1–D10 with amendment 1; D11 (owner) creates `DevOtts/doc-it` 0.1.0 public and makes the family consume it: epics K1 (W0) and K2 (W2); A1-01 `status-write audit` moves to doc-it `check archive` (T-A1-01/02 become T-K1-01/02); V1-01 and L1-01 call doc-it; G-10 added; defaults D12–D14.
- v1.0 (2026-11-06, owner G4): plan approved in full; D12–D14 confirmed; contract final.
