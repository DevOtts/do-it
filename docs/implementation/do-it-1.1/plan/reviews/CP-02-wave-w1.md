# CP-02 review: after W1, contract cases of the finished waves, on the merged tree

checkpoint: CP-02
verdict: FAIL

Reviewer: an independent opus reviewer who built none of this. Date: 2026-11-07. This is the only file written. Every probe ran in temp copies under the session scratchpad, and both temp worktrees were removed afterwards.

## Tree under review

- plan-it merged temp tree: `git worktree add --detach <tmp> origin/main` (origin/main = `bfbfaa1`), then `merge --no-ff epic/L1-V1-trust-preflight` (`8e771e0`), then `merge --no-ff epic/H1-skill-paths` (`617defc`). Merged HEAD was `5ec59fe`.
- **Merge conflicts: none at the text level. There is one semantic conflict.** L1-V1 adds a bare `node scripts/gate-check.mjs claims …` to SKILL.md Phase 5, line 439, in both mirrors. That is the exact bug class H1-06 removes, and H1's T-H1-04 test goes red on the merged tree (D1).
- doc-it: `/Users/macbook/Workspace/Devotts/doc-it-wt/K1` @ `426a858`, `DOC_IT_CLI=…/plugins/doc-it/scripts/doc-it.mjs`. Node v22.23.2.

## Cases

| case | verdict | command | quoted output | weakness |
|---|---|---|---|---|
| T-L1-01 | PASS | `node scripts/gate-check.mjs claims tests/fixtures/claims/do-it-1.1.md` | `✓ …do-it-1.1.md: 38 row(s) — source, sha/path, fact and count rules clean, tier enum clean` / `PASS — claim ledger`, exit 0 | The fixture is byte-identical to the real `audit/claims.md` today (`diff` clean), but it is a copy that can drift. The contract says 24 rows and the file has 38, so the test asserts `>= 24`. Without doc-it the case SKIPs and the judge still reports PASS (D2). |
| T-L1-02 | PASS | `node --test tests/claims/*.test.mjs` | `ok 3 - T-L1-02 tier code with no sha anywhere: exit 1 naming the row and the sha/path rule` (+ ok 4, 5, 6) | A bare file name in the claim text satisfies the rule: `The SKILL.md loader skips hidden folders \| code \| read it in the repo` exits 0. One sha anywhere in the preamble exempts every code row (documented). On the real ledger this masks one row (C32), and that row is legitimately covered by the preamble pins. |
| T-L1-03 | PASS | same | `ok 7 - T-L1-03 '5 credential ways' with tier code and no list: exit 1 count rule` | Detection uses a fixed noun list. `5 credential entry points` and `accepts 5 credentials` pass. So does any backticked command in Source, even an unrelated one (`` `cat README.md` ``), which counts as "a command that counts". |
| T-L1-04 | PASS | same | `ok 9 - T-L1-04 tier program-doc as plain fact: exit 1 fact rule; 'the study says' passes` | `ATTRIBUTION_RE` is too broad (D6). These plain facts pass as "attributed": `The rollout plans are two weeks long` (program-doc), `The pager names the on-call owner` (pointer) and `Two machine states are terminal` (program-doc). All exit 0. |
| T-L1-05 | PASS | same | `ok 10 - T-L1-05 findings doc 'your suspicion is confirmed' with no evidence-against heading: exit 1`, `ok 11 …` | Triggers only on suspicion/hypothesis + confirm. `As you suspected, …`, `You were right: …` and `The hypothesis holds: …` all exit 0 with no Evidence-against section. |
| T-V1-01 | PASS (case) | `node --test tests/preflight/behind-remote.test.mjs` | `ok 1 - T-V1-01 local main 3 behind its remote: probe WARN names the repo, local and remote sha; ENV-FACTS records the remote sha`, `ok 2 …`; `# pass 2 # fail 0` | **False PASS outside the fixture (D3).** When doc-it returns `status: "error"` (not a git repo, fetch failed or offline, no origin default), the probe prints `✓ behind-remote: PRESENT — <repo> up to date: local undefined, remote undefined` and preflight passes. A repo that really was 3 behind, with an unreachable origin, reported PRESENT. |
| T-V1-02 | PASS | `node --test tests/preflight/shipped-layers.test.mjs` | `ok 1 - T-V1-02 size M package without research/SHIPPED-LAYERS.md: handoff exit 1 naming the file`, `ok 2 …` | It fails open when no size is declared: a package with no plan.json size, no state and no SCOPE-BRIEF exits 0 (`size":"medium"` too). The real do-it 1.1 package (size M from SCOPE-BRIEF/state) correctly fails it. |
| T-V1-03 | PASS | same | `ok 3 - T-V1-03 02 doc proposes a new registry with no 'extends' citation: handoff exit 1 naming the section`, `ok 4 …`; `# pass 7 # fail 0` | Lexical, verb + ≤3 words + registry/layer/road. The narrowness is documented in formats.md §12. |
| I1-03 | PASS | `node --test tests/doc-it-missing/plan-it-preflight.test.mjs` | `ok 4 - I1-03 handoff prints 'init-it not installed' when the init-it plugin is missing, and not when it is installed` | None found. The mutation goes red. |
| T-K2-03 (plan-it) | PASS (case) | same | `ok 1 - T-K2-03 plan-it preflight on a temp HOME without doc-it prints '[skip] doc-it not installed' …`, `ok 2`, `ok 3`; `# pass 4 # fail 0` | The `claims` ok-line still reports the skipped fact rule as "clean" (D4). The test only asserts `doesNotMatch(/tier enum clean/)`. |
| judge | PASS (false) | `node tests/run-contract.mjs` | `PASS  T-L1/V1/K2  claims, preflight and doc-it-missing node:test suites all pass` … `58/58 mechanism-ready cases correct`, exit 0 | **Identical PASS with DOC_IT_CLI unset and HOME empty**, while `node --test` reports `# pass 13 # skipped 13`. T-L1-01..04, T-V1-01, L1-04 and V1-03-pin are all `# SKIP IMPLEMENTED-NOT-VERIFIED`. The judge checks only the exit status (D2). It does not run tests/plugin either, so it stays green while T-H1-04 is red. |
| mirror-check | PASS | `node plugins/plan-it/skills/plan-it/scripts/gate-check.mjs mirror-check` | `PASS — mirror-check: 11 pair(s) byte-identical`, exit 0 | The mirror faithfully copies the bad SKILL.md line 439. |
| full plan-it set | FAIL | `node --test "tests/**/*.test.mjs"` | `# tests 109 # pass 99 # fail 2 # skipped 8`; `not ok 23 - T-H1-04 no documented node command points outside the plugin root (no bare node scripts/…)`; `not ok 86 - AT-01 / T-B-16 plan-it on fixture: full CLI writes valid status.json` | T-H1-04 is a merge regression (D1). AT-01 is pre-existing, see below. The 8 skips are DOIT_STATUS_WRITE / build-it recheck, not in scope. tests/v3 `*.mjs` sweep cells exit 1 by convention (12 of 12, the same count on origin/main). |
| AT-01 / T-B-16 on clean origin/main | confirmed pre-existing | `node --test tests/status-json/*.test.mjs` in a clean `origin/main` worktree | `not ok 22 - AT-01 / T-B-16 plan-it on fixture: full CLI writes valid status.json` … `0 !== 6` at plan-to-status.test.mjs:59; `# pass 36 # fail 1` | Not caused by W1. Out of scope, but it keeps "full plan-it set green" unattainable. It needs an owner or a waiver. |
| real-world claims | PASS | `node <merged>/scripts/gate-check.mjs claims …/do-it-1.1/audit/claims.md` | `✓ …claims.md: 38 row(s) — source, sha/path, fact and count rules clean, tier enum clean` / `PASS — claim ledger`, exit 0 | Without doc-it it also exits 0, and its ok-line says "fact … rules clean" right after `[skip] … fact rule` (D4). |

## Mutation probes (temp copy of the merged tree; gate-check edited, then the named suite run)

| rule | mutation | result |
|---|---|---|
| sha/path | sha/path condition → `false` | red: `not ok 3 T-L1-02 …`, `not ok 12`, `not ok 13` |
| sha/path (preamble) | `pinned = true` | red: `not ok 3`, 12, 13 |
| count | count finding → `if (false)` | red: `not ok 7 T-L1-03 …` |
| fact | fact condition → `false` | red: `not ok 9 T-L1-04 …` |
| evidence-against | `CONFIRM_RE` match → `null` | red: `not ok 10`, `not ok 11 T-L1-05 …` |
| evidence-against (empty body) | accept empty section | red: `not ok 11` |
| tier enum | enum finding → `if (false)` | red: `not ok 5 T-L1-02 a unknown tier is refused` |
| behind-remote | `status === "behind"` branch → `false` (behind reported PRESENT) | red: `not ok 5 T-V1-01 …` |
| behind-remote advisory | WARN → `fail()` | red: T-V1-01, T-K2-03 #1, V1-02 probe |
| doc-it missing | no-doc-it row WARN → PRESENT | red: `not ok 1 T-K2-03 …` |
| KICKOFF remote pin | pin finding → `if (false)` | red: `not ok 7 V1-03 KICKOFF pinning …` |
| shipped-layers (handoff) | finding → `if (false)` | red: `not ok 1`, `not ok 2 T-V1-02 …` |
| shipped-layers (probe) | WARN → PRESENT | red: `not ok 5 V1-02 preflight probe …` |
| new-layer citation | skip every section | red: `not ok 3 T-V1-03 …` |
| L1-04 handoff wiring | `decisionGrade = false` | red: `not ok 13 L1-04 …`, `not ok 16 T-K2-03 handoff …` |
| I1-03 | message suppressed | red: `not ok 4 I1-03 …` |
| skip-line wording | `[skip] doc-it missing:` | red: L1-02 no-doc-it, T-K2-03 #1, #3 |

Every mutant was killed. The tests prove the Expected column for the fixtures they use. The defects below are rule gaps and wiring false passes the tests do not exercise. Survivor-style probes (rule inputs that should fail but pass) are quoted in the Cases table: B1, C1–C3, D1–D3, E1–E3, the doc-it error path and the undeclared size.

## Governance findings

- **G-5 / L1-04**: enforced. Handoff runs `claims` when `audit/claims.md` exists or `run.decisionGrade`. On a copy of the real do-it 1.1 package, handoff prints `claim ledger clean (38 rows)` and fails only on the (expected, pre-V1) missing `research/SHIPPED-LAYERS.md`.
- **G-7, the advisory half: enforced.** A behind repo gives `! behind-remote: WARN …`, preflight exits 0, and the ENV-FACTS row carries `| WARN |` plus both shas. The mutation turning WARN into a failure goes red.
- **G-7, the handoff half: enforced, but only conditionally.** It fires only when (a) the author listed `behind-remote` in ENV-PROBES.json (opt-in, formats.md §12 "Optional entries"; the real do-it 1.1 ENV-PROBES.json lists none), (b) ENV-FACTS.md sits at the package root or the delivery dir, and (c) doc-it returned `behind`. A doc-it `error` never yields a WARN, so (D3) also silently disables the KICKOFF pin check. Nothing fails a size M/L package whose ENV-PROBES lacks `behind-remote`. §2.4 reads "preflight adds the probes", which makes the opt-in a weakening (D5).
- **G-10 / D14**: without doc-it (DOC_IT_CLI unset, HOME an empty temp dir), each doc-it-backed check prints its exact line: `[skip] doc-it not installed: tier enum`, `[skip] doc-it not installed: fact rule (tier fact_ok flags)` and `[skip] doc-it not installed: behind-remote (is the checkout behind origin)`. The behind-remote row is `WARN — doc-it not installed`, never PRESENT. **There is a violation.** The `claims` ok-line reads `source, sha/path, fact and count rules clean` with the fact rule skipped, and handoff reads `claim ledger clean`. Both are a PASS report for a check that did not run (D4).
- **X13 / no tier copy**: the enum, aliases and fact_ok are read from `doc-it tiers --json` (`readDocItTiers`), and formats.md §11 names no enum. **The tier-cell resolve rule is re-implemented, though.** `tierWords` splits on `+ , / & and`, lowercases, and strips `@…` and parentheticals. doc-it's own `tiers resolve` refuses 5 cells that plan-it accepts: `code / local`, `code, local`, `code and local`, `Code` and `program-doc@2026` (doc-it exit 1, plan-it exit 0). X13 says "An unknown spelling is refused" and "consumers never keep their own copy" (D7). Hardcoded tier words in gate-check: `w === "code" \|\| w === "git"` (sha/path rule) and `ids.includes("code")` (count rule). These are semantic hooks, not an enum copy, but the knowledge of which tier needs a sha belongs in doc-it, whose `format` already reads `code@<repo>@<sha>:<path>:<line>` (D11).
- **X10**: honored. The lookup order is DOC_IT_CLI, then the HOME-relative cache with the newest version (tested with a 0.1.0/0.2.0 fake), then `[skip]`. There is one wrinkle: a doc-it that is installed but broken (`tiers` exits non-zero or prints bad JSON) is reported as "not installed" (LOW, D12).
- **X12** (one L1+V1 branch): fine in itself. It did not prevent the cross-branch SKILL.md regression with H1, because neither branch's suite contains the other's test. X9's "suite green on the branch rebased on origin/main" has to run the full set after the sibling merges, not only the epic's suites.
- **X3** ("skips … never passes") is broken by the judge (D2).

## Defects (ranked)

1. **D1 HIGH: the merged tree is red. L1-V1 re-introduces a bare `node scripts/gate-check.mjs`.** SKILL.md:439 and plugins/plan-it/skills/plan-it/SKILL.md:439 say `Run \`node scripts/gate-check.mjs claims audit/claims.md docs/01-*.md\``. Installed users run it from their project, where the file does not exist. T-H1-04 fails on the merge. *Fix:* change it to `node ${CLAUDE_PLUGIN_ROOT}/skills/plan-it/scripts/gate-check.mjs claims audit/claims.md docs/01-*.md` (H1's form), re-run `mirror-check`, and run the full `node --test "tests/**/*.test.mjs"` on the merged tree before either PR lands.
2. **D2 HIGH: the judge turns skipped cases into PASS.** At `tests/run-contract.mjs` T-L1/V1/K2, the check is `r.status === 0` only, and node --test exits 0 with 13 skips. The code comment claims the opposite. *Fix:* parse `# skipped N` and `# todo N` from the output. When N > 0, report the line as `IMPLEMENTED-NOT-VERIFIED` (not PASS) and make the judge exit non-zero, or count it as pending rather than correct. Add a judge self-test that runs with DOC_IT_CLI unset and HOME empty and asserts the line is not PASS.
3. **D3 HIGH: `behind-remote` reports PRESENT "up to date" when doc-it says `error`.** In `runBehindRemote`, the `else` branch catches every non-`behind` status. Reproduced on a non-git dir and on a clone that really was 3 behind with an unreachable origin: `✓ behind-remote: PRESENT — … up to date: local undefined, remote undefined`. This is a false pass of the G-7 probe, and it also disables the KICKOFF pin check. *Fix:* map `j.status === "error"` to `ABSENT` (or WARN) with `j.message`. Use PRESENT only when `j.status === "ok"` and `j.local`/`j.remote` are hex, and treat any other status as WARN `unknown status <x>`. Add a test with a non-git repo and one with `remote set-url origin /nonexistent`.
4. **D4 MEDIUM: without doc-it, the `claims` ok-line reports the skipped fact rule as clean** (`source, sha/path, fact and count rules clean`), and handoff says `claim ledger clean`. This is a G-10 "never PASS" violation. *Fix:* when `tiers` is null, print `source, sha/path and count rules clean; tier enum and fact rule skipped (doc-it not installed)`. Make the summary line say so as well, for example `PASS (2 checks skipped)`. Extend the no-doc-it test with `doesNotMatch(/fact[^\n]*clean/)`.
5. **D5 MEDIUM: G-7 is opt-in.** `behind-remote` runs only if ENV-PROBES.json lists it, and handoff never notices when it is missing. *Fix:* for size M/L, make `preflight` (or `handoff`) fail, or at least WARN loudly, when ENV-PROBES.json has no `behind-remote` entry. Alternatively, have the ENV-PROBES template ship it with the read repos filled in at Phase 3. Add a test.
6. **D6 MEDIUM: the fact rule's attribution regex lets plain facts through.** `states?`, `names`, `plans`, `documents`, `reports?` and `claims?` match ordinary nouns and verbs (`Two machine states are terminal` passes as program-doc). *Fix:* require an attribution frame at the start of the claim or near a source noun (`^(?:the|per|according to) … (?:says|states|reports)`, `per <doc>`, `in session …`, `<doc> says`). Drop the bare `states|names|plans|documents|claims`. Add the three quoted survivors as red tests.
7. **D7 MEDIUM: plan-it keeps its own tier-cell resolver, which is more lenient than doc-it's** (5 cells accepted that `doc-it tiers resolve` refuses). This breaks X13/G-10, which require one home and refusal of unknown spellings. *Fix:* resolve each distinct Tier cell with `doc-it tiers resolve "<cell>"` (cache the results per run) and use its `parts[].id`/`fact_ok`. Treat its exit 1 as the tier-enum finding, and delete `tierWords` except for the no-doc-it path.
8. **D8 LOW: count-rule gaps** (`entry points`, `credentials`, and an unrelated backticked command satisfies it). The noun list is documented. *Fix:* accept a command only if it contains a counting verb (`wc -l`, `grep -c`, `| wc`, `length`) and widen the noun list to plural nouns after a number.
9. **D9 LOW: the evidence-against trigger is narrow** (`as you suspected`, `you were right`, `the hypothesis holds` pass). *Fix:* add those patterns, plus `suspected`/`hunch` + `right|correct|holds`.
10. **D10 LOW: handoff skips shipped-layers when no size is found**, failing open. *Fix:* when `readSize` returns null and the package has `docs/02-*`, fail with "size undeclared — cannot decide shipped-layers".
11. **D11 LOW: hardcoded `"code"`/`"git"` tier hooks and a sha in a `code@<sha>` Tier cell are ignored.** `code@a1b2c3d` with source `read it` fails the sha/path rule. *Fix:* include the Tier cell in `rowText`, and drive "needs sha" from doc-it's `format` (contains `<sha>`) instead of the literal ids.
12. **D12 LOW**: a broken doc-it install is reported as "not installed". *Fix:* print `[skip] doc-it unusable (<reason>): <check>`. The `--help` usage line also omits `claims`, and should be added there. The contract's "24 rows" for T-L1-01 should be updated to 38, or read as "≥24", by dated amendment.

## Must-fix before CP-02 can PASS

D1, D2 and D3 (HIGH), and D4, D5, D6 and D7 (MEDIUM). Then re-run the full plan-it set, the judge with and without doc-it, and the real-world `claims` check on the merged tree. AT-01/T-B-16 fails on clean origin/main as well. It is not a W1 defect, but it needs an owner ruling (fix or waiver) before the release claims a green plan-it suite.

_Reviewed by an independent opus reviewer; no code or tests were edited._
