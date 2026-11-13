# do-it 1.1: decisions

Owner away during planning (2026-11-06). Every decision carries plan-it's recommendation, applied as `[default — contradict if wrong]`. **G4 (2026-11-06, Fernando Ott): D1–D10 approved as defaulted, with amendment 1; D11 added by the owner. D12–D14 (amendment 2's defaults) confirmed by the owner the same day. Plan approved in full; contract final v1.0.**

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Dn ruling — see GLOSSARY.md

## To decide (each has a default applied)

| ID | Decision | Default applied | Why | Reversible |
|---|---|---|---|---|
| D1 | Create `DevOtts/init-it` and release 0.1.0. Public or private? | **Public**, like the other companions (plan-it, build-it, review-it, conclude-it, prompt-it, parallel-lifecycle are public; reconcile-it and deploy-it are private) `[default — contradict if wrong]` | build-it and review-it already try to register sessions through init-it and skip silently when it is missing, which today is always (C15) | Visibility yes; a public push no |
| D2 | Engine host: keep it as an isolated host, and have the README show it as "Experimental: server side declined (PR #727)", read from its `adapter.manifest.json`? No redesign in 1.1 | **Yes** *(amended 2026-11-06 after R3: the host stays, isolated under `hosts/engine/`; epic E1)* `[default — contradict if wrong]` | The repo is public and says "Supported" for a server half that was closed on 2026-10-29 | Yes |
| D3 | prompt-it: tag v1.0.0 at the commit where plugin.json became 1.0.0, or pin back to the released 0.2.1? | **Tag v1.0.0** `[default — contradict if wrong]` | main already says 1.0.0 and do-it 1.0.1–1.0.5 pinned it; the tag is what is missing | A pushed tag is visible |
| D4 | Marketplace entries pin each sibling with `ref: v<version>` instead of the default branch? | **Yes, after each tag exists** (prompt-it v1.0.0 and do-it v1.0.5 are missing today); T-H1-03 proves it on a real install `[default — contradict if wrong]` | Today an install takes each sibling's default branch, not the version do-it was tested with (C21). The format supports `ref` and `sha` (C33) | Yes |
| D5 | *(moved out, 2026-11-06, R3)* Repairing a consumer repo's archived boards is that repo's work, not do-it's. It is tracked in the pilot repo's own docs program, using A1-05 | — | do-it ships the tool (A1-05); applying it to a project's data belongs to that project | — |
| D6 | Which artifacts get the full audit chain (auditor + ombudsman)? | **Decision-grade only**: anything that backs an owner decision or a plan freeze. Everything else gets the ledger plus `gate-check claims`. Auditor is a different model from the author; ombudsman is Opus `[default — contradict if wrong]` | The chain costs real tokens: in this run 132,544 (auditor) + 195,909 (ombudsman) (C34). In this run it also found 1 false row, 4 partial, 7 missed items and 13 text defects before you saw them | Yes |
| D7 | Ship trust and fixes together with resumable-test-gates as one 1.1.0, or trust and fixes as 1.1.0 now and test gates as 1.2.0? | **Two releases: 1.1.0 = this package, 1.2.0 = resumable-test-gates** `[default — contradict if wrong]` | This package is small (W0 is mostly bug fixes and hygiene) and fixes the stop-gate trap now; test gates has 7 pieces and its own owner questions | Yes |
| D8 | Package home: new `docs/implementation/do-it-1.1/`, leaving `do-it-next/` as the 1.0.1 program board? | **Yes**; `do-it-next/` gets closed through the guarded close once its open rows are dispositioned `[default — contradict if wrong]` | One home per fact (doc-it L5): a new version's plan should not share a board with 1.0.1's | Yes |
| D10 | do-it ships `do-it pack withdraw --by stop-gate` (S1-08): marks unanswered questions the stop gate wrote as `withdrawn`, kept, never deleted; answered ones are untouched? Running it on a consumer repo is that repo's work | **Yes** *(amended 2026-11-06, R3)* `[default — contradict if wrong]` | In the pilot repo all 62 pack questions came from the stop gate (C28); left in place they bury any real question | Yes (un-withdraw) |
| D11 | Create `DevOtts/doc-it`, public, release 0.1.0, and refactor the family to consume it | **Owner ruling 2026-11-06** (epics K1, K2) | The documentation rules get one owner (R4); the rules A1, V1 and L1 would otherwise each keep a copy | Visibility yes; a public push no |
| D12 | doc-it 0.1.0 scope: checks for DS-3 (archive), the board-age half of DS-2 (`stale_active`), DS-4 (expiry, report only) and DS-6 (stale checkout), the tier enum and the CLOSEOUT template; DS-1, DS-5, DS-7 ship as written rules marked "not yet checked" | **Yes** `[default — contradict if wrong]` | These are the rules with a defined check today and a consumer in this package (A1, V1, L1, Q1); the others need the role map from real projects first | Yes |
| D13 | doc-it's owner questions 1–5 (roles and tiers, one archive folder plus closeout, one board format, downgrade expired docs at once, 60-day expiry) take their recommendations in 0.1.0 | **Yes** `[default — contradict if wrong]` | 0.1.0 needs fixed rules to ship checks; each is a config default a project can override | Yes |
| D14 | When doc-it is missing, consumers print `[skip] doc-it not installed: <check>` and never report that check as PASS; they do not fail | **Yes** `[default — contradict if wrong]` | The init-it lesson (F4): a silent skip looks like a pass. A hard failure would block every project that has not installed doc-it | Yes |
| D9 | Stop gate on a host that gives no session id: keep the cwd fallback? | **Yes, only for runs that also have no session id** `[default — contradict if wrong]` | do-it's own host research marks codex and opencode session ids as unknown; without the fallback such a host could never be gated | Yes |

## To know (no decision needed)

- **The pilot repo's owner pack holds no stage questions.** All 62 were written by the stop gate (2 already answered) (C28). 1,997 of its 2,034 parks hit a run that was already parked (C31). S1 stops it; D10 gives the tool to clean it.
- **The 1.0.5 stop-gate fix rarely takes effect from Claude Code.** do-it ignores `CLAUDE_CODE_SESSION_ID`, so a run is owned by its folder unless the model exports the id by hand (C26). The fix is one fallback line plus the status rule.
- **The public README says Engine is "Supported"**; the hooks PR was closed on 2026-10-29 (C16, C17). D2 fixes the wording.
- **The core already has a host-name rule, with one gap.** G-12 "core names no harness" is tested by T-S1-13, but its word list is claude, codex, opencode and two removed hosts; `engine` is missing, and `core/state-stores/engine.mjs`, its drivers and the `state.engine` settings default live in `core/` (E1).
- **harness-status-tracking shipped** (41 of 42 cases verified against real artifacts); its board is behind. B1 fixes the board, no code.
- **do-it 1.0.5 itself has no tag** (latest v1.0.4) (C32).
- **The audit chain caught real errors before you saw them**: 1 false and 4 partial rows out of 24, 7 missed items, then 4 more amendments and 13 text defects from the ombudsman (`audit/`).

## To confirm (facts plan-it assumed)

- resumable-test-gates is planned by session `study-bateria-testes-tempo` and merges here at its G4. Its owner questions are added to the owner artifact when it reaches G4.
- No settings key is added by this package (G-8).

## Ruled

| ID | Ruling | Owner | Date |
|---|---|---|---|
| R1 | Trust proposal direction agreed | Fernando Ott | 2026-11-06 |
| R2 | doc-it is a future independent harness plugin; not designed in 1.1 | Fernando Ott | 2026-11-06 |
| R3 | do-it's core is host-agnostic. Integrations with a harness or platform (claude-code, codex, opencode, engine) live only under `hosts/<name>/`; nothing in `core/` or `scripts/` names a host. `plugins/do-it/` is the Claude Code package and may name it | Fernando Ott | 2026-11-06 |
| R4 | doc-it is its own plugin and repo, `DevOtts/doc-it`, like init-it. It owns the documentation rules (source tiers, one home per fact, derived status, expiry, guarded archive); conclude-it, plan-it and review-it consume it and say so when it is missing | Fernando Ott | 2026-11-06 |
| R5 | The pattern proposed in the pilot repo (P3) becomes doc-it's global standard, written in project-neutral roles; each project maps its own folders to those roles | Fernando Ott | 2026-11-06 |
