# CP-02 review: after W1, contract cases of the finished waves, on the merged tree

checkpoint: CP-02
verdict: PASS

## Round 5 (2026-11-08, D6 / R2-M1 only, on 8815962)

The reviewer is the same independent opus reviewer who wrote rounds 1–4. The tree under review is `int/plan-it-1.1` at `8815962` (`f53d5ed` + `8815962` on top of `f19045b`), judged from a `git archive 8815962` copy in the session scratchpad. No code, tests or ledger were edited.

### Verdict

**PASS.** Both round-4 must-fixes are in.
- `PLAIN_VERB` is exactly `says|said|describes|proposes|specifies|mentions|wrote|explains`.
- Form 6a needs a plain verb, or an attribution verb followed by a word-bounded determiner, a digit, a backtick or `:`. The coordinator's `\b` correction ("a" must not match "are") is right: my round-4 lookahead had that bug.
- Each fix is held by a test. Putting `described` back into `PLAIN_VERB`, or dropping the `\b` from the determiner lookahead, each give `not ok 26 - CP-02 round 4: no participles in form 5; a file.ext subject needs an unambiguous verb or a following determi…`.

Every in-scope case passes on real evidence, and no HIGH or MEDIUM defect is open.

### (1) Loophole hunt on 8815962 (tier `program-doc`, Source `read docs`)

- **All 28 earlier leaks exit 1.** That covers rounds 1–4: round 1's three, round 2's eleven, round 3's fifteen-plus-two and round 4's four.
- **New 6a probes exit 0, and that is correct.**
  - The probes: `status.json records all writes atomically`, `state.json records the last run`, `config.yaml names no default host`, `status.json records 3 retries max`, `README.md lists no secrets`, `package.json lists the dependencies`, `index.html notes the version in a footer`.
  - Why this is correct: the file is the grammatical subject and the verb is a verb. The claim says what the file contains, which is an attribution to that file. These are not plain facts posing as attribution.
  - The noun-reading forms (`status.json records expire …`, `package.json names must be unique`, `README.md lists are short`) all exit 1.
- **New form-5 probes.**
  - `The session explains why tokens expire`, `The message says hello on startup` and `The audit wrote 5 rows` exit 0. Each attributes to a source noun, so this is correct.
  - `The issue tracker says the bug is open` exits 1, because `tracker` is not a source noun. The rule is strict and fails safe.
- **Deliberate evasion stays LOW.** `The study said nothing, but two states are terminal`, `The issue says nothing; tokens never expire` and `Their doc mentions nothing; locks never leak` exit 0. They need deliberate bad faith; this is not the accidental plain-fact defect T-L1-04 guards against.
- **Positives exit 0:** `README.md lists three commands`, `docs/plan.md states two machine states are terminal`, `plan.md states: two states` and `The study says two states are terminal`.

### (2) C23 and C34

- C23 passes with its path-segment Source, unchanged.
- The real ledger at do-it `fix/cp03-stopgate` @ `b5d257d` (`…/.worktrees/cp03/docs/implementation/do-it-1.1/audit/claims.md`, committed, clean) has C34 reading `In this run, the audit chain cost: …`. It carries a dated note: `Amended 2026-11-08 (build, CP-02 round 3): C34 reworded … meaning unchanged`.
- Its rows are identical to the fixture's (`real rows == fixture rows`).

### (3) Runs on clean 8815962 (`DOC_IT_CLI` = doc-it main; `DOIT_STATUS_WRITE` = fresh detached build-it origin/main `aaa6973` worktree, removed afterwards)

| run | result |
|---|---|
| `node --test "tests/**/*.test.mjs"` | `# tests 128 # pass 128 # fail 0 # skipped 0`, exit 0 |
| `node tests/run-contract.mjs` (no `--allow-skips`) | `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 … correct`, `58/58 … correct; 0 pending mechanism(s); 1 manual`, exit 0 |
| mirror-check | `PASS — mirror-check: 11 pair(s) byte-identical` |
| `gate-check claims tests/fixtures/claims/do-it-1.1.md` | `PASS — claim ledger`, exit 0 |
| `gate-check claims` on the reworded real ledger (`b5d257d`) | `PASS — claim ledger`, exit 0 |

These match the coordinator's numbers.

### Accepted LOWs (documented limits; none block)

**Fact-rule limits.** I agree to accept these as limits of formats.md §11:
- `According to plan, …` (idiom).
- `In session <hyphenated-word> …` (form 3 takes any hyphenated word).
- `In the run, …` (form 4 by design).
- Deliberately evasive "X says nothing; <fact>".
- A 2+-hyphen identifier that is also a code-file or folder segment of the Source (round 4, 348b92b pass).
- **Doc follow-up:** formats.md §11 item 6 still reads "a `file.ext` subject with any attribution verb", which is stale since `f53d5ed`. §11 also does not yet list these limits, and its count-rule noun list predates D8's widening. Update all three with the next formats.md edit.

**Carried from round 2, not re-verified this round:**
- R2-L1: any 40-hex sha in the KICKOFF silences an UNVERIFIED repo.
- R2-L2: the PRESENT hex-check and unparseable branches are untested.
- R2-L3: handoff does not confirm ENV-FACTS has a `behind-remote` row.
- R2-L4: count and evidence-against lexical residuals.
- R2-L5: the contract's T-L1-01 still says "24 rows", which needs a dated owner amendment. AT-01's `WRITER_CANDIDATES` still holds machine paths.

### Release preconditions (outside plan-it, not CP-02 defects)

- do-it `fix/cp03-stopgate` (`b5d257d`, the C34 reword) must land, or the real-ledger G-5 check fails on C34 again.
- AT-01/T-B-16 needs a build-it writer that contains `463b656` (build-it origin/main has it). The release run must set `DOIT_STATUS_WRITE`.
- The release run must not pass `--allow-skips`.

_Round 5 reviewed by an independent opus reviewer; no code, tests or ledger were edited._

## Round 4 (2026-11-08, FAIL, on f19045b)

The reviewer is the same independent opus reviewer who wrote rounds 1–3. The tree under review is `int/plan-it-1.1` at `f19045b`, judged from a `git archive f19045b` copy in the session scratchpad. This supersedes the 348b92b request, and my 348b92b pass is kept at the end of this round. No code, tests or ledger were edited.

### Verdict

**FAIL, narrowly.** The structural fix is in and it works:
- `lintLedger` now calls only `startsWithAttribution`.
- All 24 earlier leaks exit 1: rounds 1–3 plus the two extra ones.
- Restoring the old anywhere-in-claim test gives `not ok 25 - CP-02 round 3 (structural) …`.

Two openers still accept the same noun/participle class that rounds 2–3 graded MEDIUM. Both are one-line fixes, and I prototyped both: the suite stays green and the fixture ledger passes.

1. **Form 5 accepts past participles.** `PLAIN_VERB` was widened beyond the round-3 spec with `described|proposed|specified|mentioned|explained`. Result: `The issue described above is fixed in 1.2` exits 0.
2. **Form 6a (`file.ext` subject) accepts any `ATTR_VERB`, including noun-like ones.** These exit 0: `status.json records expire after 30 days`, `package.json names must be unique`, `README.md lists are short`. The round-3 spec I wrote had this hole too, and I flagged only the backtick variant. 6b was fixed; 6a was not.

### (1) Probes on f19045b (tier `program-doc`, Source `read docs` unless shown)

| claim | exit | note |
|---|---|---|
| 24 earlier leaks (rounds 1–3, the round-3 extras, `Two machine states are terminal, the study says`, `` `foo` lists are cached ``) | 1 (all) | closed |
| `The issue described above is fixed in 1.2` | **0** | MEDIUM: participle in form 5 |
| `status.json records expire after 30 days` / `package.json names must be unique` / `README.md lists are short` | **0** | MEDIUM: noun-like verb in form 6a |
| `The fix proposed in the ticket is merged` / `The limit specified in the config is 5` / `The bug mentioned earlier is gone` | 1 | correct (the subject is not a source noun) |
| `**The study says** two states are terminal` | 1 | strict: the opener does not tolerate markup |
| `Per 24/7 support, tickets are answered in 1 hour` | 1 | correct |
| `According to plan, the rollout finishes Friday` | 0 | LOW: idiom |
| `In session long-lived tokens are cached` | 0 | LOW: form 3 accepts any hyphenated word, and the phrasing is unnatural |
| `In the run, locks are released` | 0 | LOW: form 4 by design |
| `The study explained nothing; two states are terminal` / `the doc says nothing; …` | 0 | LOW: deliberately evasive, not an accidental plain fact |
| positives: `The study says …`, C23 form with a path-segment Source, ``In session a consumer planning session …``, `In this run, the audit chain cost: …` | 0 | correct |

### (2) C23 and C34

- C23 passes with its path-segment Source, as before.
- The fixture's C34 reads `In this run, the audit chain cost: auditor (Fable) …`. The fixture equals the real `audit/claims.md` on every row except C34 (`diff` of everything else is clean).
- The real ledger fails, as the coordinator expected: `row C34: tier transcript stated as plain fact — start the claim with an attribution opener …` / `FAIL — claim ledger`.
- That failure is expected until the do-it package's C34 is reworded with a dated note. **That reword is a release precondition:** G-5's real-world check must exit 0 before tag.

### (3) Runs on clean f19045b (`DOC_IT_CLI` = doc-it main; `DOIT_STATUS_WRITE` = fresh detached build-it origin/main `aaa6973` worktree, removed afterwards)

| run | result |
|---|---|
| `node --test "tests/**/*.test.mjs"` | `# tests 127 # pass 127 # fail 0 # skipped 0`, exit 0 |
| `node tests/run-contract.mjs` (no `--allow-skips`) | `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 … correct`, `58/58 … correct; 0 pending mechanism(s); 1 manual`, exit 0 |
| mirror-check | `PASS — mirror-check: 11 pair(s) byte-identical` |
| `gate-check claims tests/fixtures/claims/do-it-1.1.md` | `✓ …: 38 row(s) — source, sha/path, count, tier enum and fact rules clean` / `PASS — claim ledger`, exit 0 |
| `gate-check claims` on the real ledger | exit 1 on C34 only (expected, see (2)) |

These match the coordinator's numbers.

### Must-fix (two lines, both prototyped)

1. **Form 5:** `PLAIN_VERB = "(?:says|said|describes|proposes|specifies|mentions|wrote|explains)"`, which drops the `-ed` participles. Prototype: the full claims suite stays green, the fixture passes, and `The issue described above is fixed in 1.2` exits 1.
2. **Form 6a:** a `file.ext`/path subject counts only with `PLAIN_VERB`, or with an `ATTR_VERB` followed by a determiner, a number, a backtick, `that` or `:`. For example: `` (?:${PLAIN_VERB}\b|${ATTR_VERB}(?=\s+(?:the|a|an|that|every|each|all|no|\d|two|three|four|five|six|seven|eight|nine|ten|`)|\s*:)) ``.
   - This keeps the existing positives `README.md lists three commands` and `docs/plan.md states two machine states are terminal`.
   - It refuses `status.json records expire …`, `package.json names must …` and `README.md lists are short`.
   - A cruder variant I prototyped broke the `README.md lists three commands` positive. The lookahead form avoids that.
3. Add the four MEDIUM claims above as red tests. Then re-run the full set, the judge, mirror-check and the fixture ledger on a clean, committed tree.

With those two lines, I expect CP-02 to PASS: every LOW above is accepted as a documented limit of formats.md §11. Separately, the do-it package's C34 reword is required before the real-ledger G-5 check can pass at release.

### Earlier pass on 348b92b (superseded by f19045b)


The reviewer is the same independent opus reviewer who wrote rounds 1–3. The tree under review is `int/plan-it-1.1` at `348b92b`, judged from a `git archive 348b92b` copy in the session scratchpad. No code, tests or ledger were edited.

#### Verdict

**FAIL, on one item: the 15 leaks from round 3 (on 7e72a82) are untouched.**

`348b92b` changes only `namesOwnSource`/`sourceIds` and its tests. `ATTRIBUTION_RE`, `VERB_OK`, the `per` frame and the `in session`/`in the run` frames are byte-for-byte what round 3 judged. The coordinator's brief for this round lists only my round-3 item 2, from the f06316d pass, so the 7e72a82 findings appear to have been missed rather than rejected.

The `namesOwnSource` fix itself is correct.

#### (1) Probes on 348b92b (tier `program-doc`, Source `read docs` unless shown)

**Fixed in 348b92b (each exits 1):**

| claim | Source |
|---|---|
| `Status-write records are appended atomically` | `` `status-write.mjs:40` `` |
| `Re-run states are terminal` | `` `scripts/pre-run-hook.mjs` `` |
| `Up-to-date states are terminal` | `the up-to-date check` |

Mutating `ids.has(id)` back to a substring test of the Source gives `not ok 24 - D6 round 3: the own-source identifier must be a whole path segment or backticked token in Source`.

**Still open. Each of the 15 round-3 leaks exits 0:**

| class | claims |
|---|---|
| "that" opening a relative clause satisfies the `that` lookahead | `The issue states that are terminal are closed and merged`; `The session records that expire are purged nightly` |
| a list colon satisfies the `:` lookahead | `The issue states: open, closed`; `The ticket names: alpha, beta are reserved` |
| past participle used as an adjective (`VERB_PLAIN` has `reported`, `recorded`, `listed`, `expected`…) | `The issue reported upstream is fixed in 1.2`; `The session recorded in the log expires after 30 days`; `The ticket listed below is still open`; `The message expected by the hook is never sent` |
| ``names\s+` `` in `VERB_PLAIN` | ``The ticket names `a` and `b` are reserved`` |
| `^in the run\b`, `^in session\b`, `in the run` before final punctuation | `In the run loop, locks are released`; `In session storage, tokens persist`; `Locks are released at the end of each step in the run.` |
| `per` + a dotted token counts as a "path" | `Retries fire once, per 2.5 seconds` |
| `[\w-]*${SRC_NOUN}` matches word suffixes | `The possession described is transferable`; `The footnotes described are optional` |

**New LOW finding, not blocking.** A code file or folder whose name is the identifier now satisfies `namesOwnSource`:
- `Up-to-date states are terminal` with `` `lib/up-to-date.mjs:12` `` exits 0.
- `End-to-end reports are written nightly` with `` `tests/end-to-end/run.mjs` `` exits 0.

This is defensible, because the claim then names a file its own Source points at. The structural fix below (the identifier must be the sentence's subject *and* the verb an unambiguous one) would close it anyway.

#### (2) C23

C23 still passes. With Source `` `docs/implementation/resumable-test-gates/README.md` ``, the claim `resumable-test-gates plans a queue` exits 0. As before, it passes only because the identifier is a whole path segment of its Source.

#### (3) Runs on clean 348b92b (`DOC_IT_CLI` = doc-it main; `DOIT_STATUS_WRITE` = fresh detached build-it origin/main `aaa6973` worktree, removed afterwards)

| run | result |
|---|---|
| `node --test "tests/**/*.test.mjs"` | `# tests 126 # pass 126 # fail 0 # skipped 0`, exit 0 |
| `node tests/run-contract.mjs` (no `--allow-skips`) | `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 … correct`, `58/58 … correct; 0 pending mechanism(s); 1 manual`, exit 0 |
| mirror-check | `PASS — mirror-check: 11 pair(s) byte-identical` |
| `gate-check claims …/do-it-1.1/audit/claims.md` | `PASS — claim ledger`, exit 0 |

These match the coordinator's numbers.

#### Must-fix (unchanged from round 3)

Apply the round-3 structural fix (full text in Round 3 below): for a `fact_ok: false` tier, attribution is a closed opener **anchored at the start of the claim**.
- `According to X,`
- `Per <`x`|path|file.ext|the … <source noun>>,`
- ``In session <`x`|"x"|id>``
- `In (this|that|the|our) (run|session|…)` followed by `,` or `:`
- `The … <source noun> (says|said|describes|proposes|specifies|mentions|wrote|explains)`, with no ambiguous verbs, no `that`/`:` escape hatch and no participles
- a backticked token or `file.ext` as the subject + a verb
- a 2+-hyphen identifier as the subject + a verb, when it is a whole path segment or backticked token of the Source (keep `348b92b`'s `sourceIds`)

The reviewer prototype rejected all 22 known plain facts and accepted all 12 real frames. The cost:
1. Reword ledger C34 to `In this run, the audit chain cost …`.
2. Rewrite the three test positives that rely on the escape hatches.
3. Add the 15 claims above as red tests.

**Owner alternative, not recommended:** a dated amendment to formats.md §11 that declares the fact rule a best-effort lexical lint and lists these classes as known limits. That would downgrade R2-M1 to LOW and allow a PASS.

_Round 4 reviewed by an independent opus reviewer; no code, tests or ledger were edited._

## Round 3 (2026-11-08, FAIL, on 7e72a82)

The reviewer is the same independent opus reviewer who wrote rounds 1 and 2. This round covers `int/plan-it-1.1` at `7e72a82`, which the coordinator substituted for `f06316d`. Every run used a `git archive 7e72a82` copy in the session scratchpad, and the plan-it working tree was clean at review time. No code, tests or ledger were edited. My earlier pass on `f06316d` is kept at the end of this round as superseded.

### Verdict

**FAIL. R2-M1 is still open.** `7e72a82` turns every round-2 and round-3 survivor I quoted into a red test, and they do now fail, except the three Source-name cases (rows 21–23 in the table below). Everything else in scope passes on real evidence.

But a fresh probe found **16 new plain facts that still pass** as attributed. They fall into five patterns, all ordinary English. This is the third round of chasing patches over the same MEDIUM. The cause is structural: the attribution patterns can match anywhere in the claim, and they accept words that are also nouns or adjectives. The must-fix below is therefore structural, not one more patch. A prototype of it rejects all 22 known plain facts and accepts all 12 real frames, including C8 and C23.

### (1) Probes on 7e72a82 (tier `program-doc`, Source `read docs` unless shown)

| # | claim | Source | exit | class |
|---|---|---|---|---|
| 1–8 | the eight round-2 survivors (`The issue states are open and closed`, `The session records expire after 30 days`, `The ticket names must be unique`, `Tokens are stored in session storage`, `Locks are released in the run loop`, `Per run, two machine states are terminal`, `The audit records are kept forever`, `Up-to-date states are terminal`) | read docs | 1 | closed |
| 9 | `The issue states that are terminal are closed and merged` | read docs | **0** | relative-clause "that" satisfies the `that` lookahead |
| 10 | `The session records that expire are purged nightly` | read docs | **0** | same |
| 11 | `The issue states: open, closed` | read docs | **0** | a list colon satisfies the `:` lookahead |
| 12 | `The ticket names: alpha, beta are reserved` | read docs | **0** | same |
| 13 | `The issue reported upstream is fixed in 1.2` | read docs | **0** | past participle used as an adjective (`reported`, `recorded`, `listed`, `expected` are in `VERB_PLAIN`) |
| 14 | `The session recorded in the log expires after 30 days` | read docs | **0** | same |
| 15 | `The ticket listed below is still open` | read docs | **0** | same |
| 16 | `The message expected by the hook is never sent` | read docs | **0** | same |
| 17 | ``The ticket names `a` and `b` are reserved`` | read docs | **0** | `names\s+`` ` is in `VERB_PLAIN` |
| 18 | `In the run loop, locks are released` | read docs | **0** | `^in the run\b` (start of claim) |
| 19 | `In session storage, tokens persist` | read docs | **0** | `^in session\b` |
| 20 | `Locks are released at the end of each step in the run.` | read docs | **0** | `in the run` before final punctuation |
| 21 | `Status-write records are appended atomically` | `` `status-write.mjs:40` `` | **0** | `namesOwnSource` substring (unchanged since round 3 on f06316d) |
| 22 | `Re-run states are terminal` | `` `scripts/pre-run-hook.mjs` `` | **0** | substring: `re-run` ⊂ `pre-run-hook` |
| 23 | `Up-to-date states are terminal` | `the up-to-date check` | **0** | the identifier appears in prose in Source |
| 24 | `Retries fire once, per 2.5 seconds` | read docs | **0** | `per` + a dotted token counts as a "path" |
| 25 | `The possession described is transferable` / `The footnotes described are optional` | read docs | **0** | `[\w-]*${SRC_NOUN}` matches word suffixes (`possession` ends in `session`, `footnotes` ends in `notes`) |
| — | positives: `The study says two states are terminal`, `Per the KICKOFF, the queue is optional`, `In this run: two states are terminal` | read docs | 0 | correct |

The new test is not vacuous. Mutating `VERB_AMBIG(?=\s+that\b|\s*:)` back to a bare `VERB_AMBIG` gives `not ok 23 - D6 round 2 (R2-M1): noun/verb ambiguity and location frames are plain facts; real frames still pass`.

### (2) C23

Confirmed in my earlier f06316d pass, and `namesOwnSource` is unchanged in `7e72a82`. C23 passes only because its Source names `resumable-test-gates`:
- With the Source replaced by `read the plan docs`, it gives `✗ …:29: row C23: tier program-doc stated as plain fact … — fact rule`.
- With `namesOwnSource` removed, `not ok 1 - T-L1-01` and `not ok 22 - D6 round 2` go red.

C23's Source has the identifier as a **path segment** (`docs/implementation/resumable-test-gates/README.md`), so the stricter rule proposed below still accepts it.

### (3) Runs on clean 7e72a82 (`DOC_IT_CLI` = doc-it main; `DOIT_STATUS_WRITE` = fresh detached build-it origin/main `aaa6973` worktree, removed afterwards)

| run | result |
|---|---|
| `node --test "tests/**/*.test.mjs"` | `# tests 125 # pass 125 # fail 0 # skipped 0 # todo 0`, exit 0 |
| `node tests/run-contract.mjs` (no `--allow-skips`) | `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 … correct`, `58/58 … correct; 0 pending mechanism(s); 1 manual`, exit 0 |
| mirror-check | `PASS — mirror-check: 11 pair(s) byte-identical` |
| `gate-check claims …/do-it-1.1/audit/claims.md` | `✓ …: 38 row(s) — source, sha/path, count, tier enum and fact rules clean` / `PASS — claim ledger`, exit 0 |

These match the coordinator's numbers.

### Must-fix (R2-M1, structural): attribution is a closed, start-anchored opener, never a pattern found anywhere in the claim

For a tier with `fact_ok: false`, the claim must **begin** with one of these openers (case-insensitive):

1. `According to <source>,`
2. `Per <`x` | path containing "/" | file.ext | the [≤3 words] <source noun>>,` (the comma is required).
3. `In session <`x` | "x" | hyphenated-id>`
4. `In (this|that|the|our) (run|session|chat|transcript|study|doc)` followed by `,` or `:`.
5. `(The|This|That|Our|Its|Their) [≤3 words] <source noun> (says|said|describes|proposes|specifies|mentions|wrote|explains)`. Use **only** verbs that can be neither a plural noun nor an adjectival participle, and drop `states|records|names|reported|listed|…` and the `that`/`:` escape hatch for this frame.
6. A backticked token or a `file.ext` path as the subject, followed by any attribution verb.
7. A hyphenated identifier as the subject, followed by an attribution verb, **only** when the identifier equals a whole `/`-separated segment of a backticked token or path in the Source. This is not a substring test, and prose does not count.

**Prototype result** (scratch file, not committed): all 22 known plain facts are rejected (rows 1–25 above plus the round-1 `Two machine states are terminal` and `The rollout plans are two weeks long`). These 12 are accepted:
- `The study says …`, `The issue says that …`, `The study says: …`
- ``In session `abc-123` …``
- `Per the plan doc, …`, `Per the KICKOFF, …`, `According to the README, …`
- `In this run, the audit chain cost …`
- the real C8 (``In session a consumer planning session (2026-11-02/03) …``)
- the real C23 (its Source has `resumable-test-gates` as a path segment)
- `README.md lists three commands`

One residual remains, which I accept as a documented limit: a backticked subject plus an ambiguous verb (`` `foo` lists are cached ``). For that frame, restrict ambiguous verbs to a following `:`.

**What the fix costs:**
1. Reword ledger **C34** from `The audit chain's cost in this run: …` to `In this run, the audit chain cost …`. It is the only real row that does not start with an opener. C8 and C23 already conform.
2. Rewrite three positives in the R2-M1 test that use the escape hatches being removed: `The issue states that …` → `The issue says that …`, `The study records: …` → `The study says: …`, and the C34 phrasing.
3. Add rows 9–25 above as red tests.
4. Re-run the full set, the judge, mirror-check and the real-ledger check on a clean, committed tree.

**Owner alternative:** if the owner judges the fact rule to be a best-effort lexical lint, record that, with this limitation, in formats.md §11 by dated amendment, and downgrade R2-M1 to LOW. I do not recommend this. T-L1-04 exists to stop exactly these plain facts, and the structural fix is small.

### Earlier pass on f06316d (superseded by 7e72a82)


The reviewer is the same independent opus reviewer who wrote rounds 1 and 2. This round covers the coordinator's fix commit `f06316d` on `int/plan-it-1.1`. Every run below used a `git archive f06316d` copy in the session scratchpad. That copy's `scripts/gate-check.mjs` is byte-identical to `git show f06316d:scripts/gate-check.mjs`. No code, tests or ledger were edited.

**Process note: the tree was dirty during the review.** While this round ran, `/Users/macbook/Workspace/Devotts/plan-it-wt/int` had **uncommitted** edits to both copies of `gate-check.mjs` and to `tests/claims/claims.test.mjs`. That WIP is someone else's follow-up for R2-M1 (b)/(c). With the WIP present, the full set reads `# tests 124 # pass 123 # fail 1` (`not ok 16 - D6 explicit attribution phrases naming a source pass`). The verdict below is on the committed `f06316d`, not on the WIP. The WIP is probed separately, for information only, at the end.

#### Verdict

**FAIL.** `f06316d` closes the hyphen half of R2-M1: all five hyphen survivors now fail. It does not touch parts (b) and (c) of the round-2 must-fix. Six of the round-2 survivors still exit 0 on `f06316d`, and `namesOwnSource` lets in a narrower new class of plain facts. The uncommitted WIP looks like it closes (b) and (c), but it is red and not committed.

#### (1) R2-M1 survivors on f06316d (tier `program-doc`, or `pointer` where noted; source `read docs` unless shown)

| claim | source | exit | status |
|---|---|---|---|
| `Up-to-date states are terminal` | read docs | 1 | closed |
| `End-to-end reports are written to disk nightly` | read docs | 1 | closed |
| `Out-of-band reports are dropped after a day` | read docs | 1 | closed |
| `The state-of-the-art plans cost less` | read docs | 1 | closed |
| `Day-to-day documents live in the wiki` (pointer) | read docs | 1 | closed |
| `The issue states are open and closed` | read docs | **0** | **open (b)** |
| `The session records expire after 30 days` | read docs | **0** | **open (b)** |
| `The ticket names must be unique` (pointer) | read docs | **0** | **open (b)** |
| `Tokens are stored in session storage` | read docs | **0** | **open (c)** |
| `Locks are released in the run loop` | read docs | **0** | **open (c)** |
| `Per run, two machine states are terminal` | read docs | **0** | **open (c)** |
| new: `The audit records are kept forever` / `The decision notes are optional` / `The guide lists are short` | read docs | **0** | open (b), same class |
| new: `Up-to-date states are terminal` | `the up-to-date check` | **0** | new loophole (namesOwnSource) |
| new: `Status-write records are appended atomically` | `` `status-write.mjs:40` `` | **0** | new loophole |
| new: `Two-phase states are terminal` | `two-phase commit notes` | **0** | new loophole |
| new: `Re-run states are terminal` | `` `scripts/pre-run-hook.mjs` `` | **0** | new loophole (substring) |
| new: `To-do lists are kept per run` | `a/to-do-list.md` | **0** | new loophole (substring) |
| legit: `The study says two states are terminal` | read docs | 0 | correct |
| legit: `resumable-test-gates plans a queue` | `resumable-test-gates/02-architecture.md` | 0 | correct |
| `resumable-test-gates plans a queue` | read docs | 1 | correct |

**About the namesOwnSource loophole.** `ID_VERB_RE` now accepts **one** hyphen (`(?:-[a-z0-9]+)+`; the round-2 pattern needed two) and the full ambiguous `ATTR_VERB` list (`states|records|names|lists…`). The Source check is a plain substring test, `src.includes(id)`. The result is that a plain fact whose subject is a hyphenated code or file name counts as "attributed", even when its Source is a code file: `Status-write records are appended atomically` with `` `status-write.mjs:40` ``. Because the test is a substring, `re-run` also matches `pre-run-hook.mjs`.

This is narrower than round 2. It needs a hyphenated subject that the Source also contains. But it is still "the Source names a thing with the same name", not "the claim attributes itself to a source".

*Fix:* require a whole-token match (the identifier bounded by `/`, a backtick, whitespace or the cell edge, and not inside a longer hyphenated token). Use only the unambiguous verbs, or ambiguous verbs followed by `that`/`:`. The WIP's `VERB_OK` already does this for the source-noun frame and should apply here too.

#### (2) C23

Confirmed. Real C23 Source: `` `docs/implementation/resumable-test-gates/README.md` §3–§7; `research/01-do-it-repo.md` … ``.
- On the real ledger, `gate-check claims` gives `38 row(s) — … fact rules clean` / `PASS — claim ledger`.
- With C23's Source replaced by `read the plan docs`, it gives `✗ …:29: row C23: tier program-doc stated as plain fact … — fact rule` / `FAIL — claim ledger`.
- With `&& !namesOwnSource(...)` removed, the real ledger fails on C23 alone, and `not ok 1 - T-L1-01 …` and `not ok 22 - D6 round 2 …` go red.
- Mutating `namesOwnSource` to always return true is caught: `not ok 22 - D6 round 2 …`.

So C23 passes only because its Source names `resumable-test-gates`.

#### (3) Runs on f06316d (clean copy; `DOC_IT_CLI` = doc-it main; `DOIT_STATUS_WRITE` = fresh detached build-it origin/main `aaa6973` worktree, removed afterwards)

| run | result |
|---|---|
| `node --test "tests/**/*.test.mjs"` | `# tests 124 # pass 124 # fail 0 # skipped 0 # todo 0`, exit 0; `ok 22 - D6 round 2: a hyphenated word + verb is attribution only when it names the row's own Source` |
| `node tests/run-contract.mjs` (no `--allow-skips`) | `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 … correct`, `58/58 … correct; 0 pending mechanism(s); 1 manual`, exit 0 |
| mirror-check | `PASS — mirror-check: 11 pair(s) byte-identical` |
| `gate-check claims …/do-it-1.1/audit/claims.md` | `✓ …: 38 row(s) — source, sha/path, count, tier enum and fact rules clean` / `PASS — claim ledger`, exit 0 |

#### Uncommitted WIP (information only, not judged)

On a copy that has the working-tree `gate-check.mjs`:
- These now exit 1: `The issue states are open and closed`, `The session records expire after 30 days`, `Tokens are stored in session storage`, `Locks are released in the run loop`, `Per run, two machine states are terminal`, `The audit records are kept forever`, and `Status-write records are appended atomically` (source `read docs`).
- Still exit 0: `The study says …` and `Per the KICKOFF, …` (both correct), and `Status-write records are appended atomically` with source `` `status-write.mjs:40` `` (the namesOwnSource loophole, still open).
- The real ledger still passes.
- One test is red on the WIP: `not ok 16 - D6 explicit attribution phrases naming a source pass`.

#### Must-fix before CP-02 can PASS

1. Commit the (b)/(c) narrowing (the WIP direction is right) with `not ok 16` resolved.
2. Make `namesOwnSource` a whole-token match, and give `ID_VERB_RE` the `VERB_OK` treatment (ambiguous verbs only before `that`/`:`).
3. Add red tests for `The issue states are open and closed`, `Locks are released in the run loop`, `Per run, …`, `Status-write records are appended atomically` | `` `status-write.mjs:40` `` and `Re-run states are terminal` | `` `scripts/pre-run-hook.mjs` ``.

Then re-run the full set, the judge, mirror-check and the real-ledger `claims` check on a **clean, committed** tree. Everything else in CP-02 scope stays as round 2 found it: passing on real evidence.

_Round 3 reviewed by an independent opus reviewer; no code, tests or ledger were edited._

## Round 2 (2026-11-07, FAIL)

Reviewer: an independent opus reviewer who built none of the fixes. This file is the only thing written. Every probe ran in a `git archive` copy of the tree under the session scratchpad. The tree under review was never edited, and `git status` is clean after the run.

### Tree and environment

- Tree: `/Users/macbook/Workspace/Devotts/plan-it-wt/int`, branch `int/plan-it-1.1`, HEAD `af0eae2`. That is origin/main + H1-skill-paths + L1-V1 + fix commits af94b47, 4790cf8, da3a76f, 3f012a0, 2f8dc87, af0eae2. Node v22.23.2.
- `DOC_IT_CLI=/Users/macbook/Workspace/Devotts/doc-it/plugins/doc-it/scripts/doc-it.mjs`. doc-it `main` HEAD = origin/main = `61f2d8a39540…`.
- `DOIT_STATUS_WRITE=<tmp detached build-it worktree at origin/main aaa6973>/plugins/build-it/scripts/status/status-write.mjs`. The worktree was removed at the end.

### Verdict in one line

Every in-scope case passes on real evidence, and D1–D5 and D7 are fixed. D6 (MEDIUM) is only partly fixed. The fixer's new C23 attribution rule is a loophole: it lets plain facts through, including a one-word variant of the round-1 survivor (`Up-to-date states are terminal`). So the verdict is FAIL, on one must-fix.

### Round-1 defects

| defect | status | evidence |
|---|---|---|
| D1 HIGH bare `node scripts/…` in SKILL.md | FIXED | SKILL.md:439 (both mirrors) reads `node ${CLAUDE_PLUGIN_ROOT}/skills/plan-it/scripts/gate-check.mjs claims …`, and `grep "node scripts/"` finds nothing in either SKILL.md. `ok 32 - T-H1-04 no documented node command points outside the plugin root`. Mutation (restore the bare path in both mirrors) gives `not ok 4 - T-H1-04 …`. |
| D2 HIGH judge turns skips into PASS | FIXED | With `DOC_IT_CLI` unset and HOME empty, the judge exits **1**: `IMPLEMENTED-NOT-VERIFIED  T-L1/V1/K2 … (21 skipped: T-L1-01 …)` / `54/55 passed; 1 IMPLEMENTED-NOT-VERIFIED (skips are not passes; judge exits non-zero)`. Mutation `if (n > 0)` → `if (false)` gives `not ok 1 - D2 judge without doc-it …`. |
| D3 HIGH behind-remote PRESENT on doc-it `error` | FIXED | My own repro: a clone `## main...origin/main [behind 3]`, then `remote set-url origin /nonexistent/x.git`, plus a non-git dir, with the full S probe set. Result: `! behind-remote: WARN — …/behind: UNVERIFIED — fetch failed: fatal: '/nonexistent/x.git' does not appear to be a git repository …` and `! behind-remote: WARN — …/nogit: UNVERIFIED — not a git repository`. Preflight exits 0 (advisory), and ENV-FACTS has `WARN` rows. Handoff with a bare KICKOFF fails: `✗ …KICKOFF.md: preflight could not verify …/behind is current (fetch failed …) — pin the remote sha, or state in the KICKOFF that … is unverified`. Mutation (any status → PRESENT) gives `not ok 3`, `not ok 4` and `not ok 5` (D3 cases). Residual gaps are LOW, see R2-L1 and R2-L2. |
| D4 MED skipped fact rule reported "clean" | FIXED | No doc-it: `✓ …claims.md: 38 row(s) — source, sha/path and count rules clean; tier enum and fact rule SKIPPED (doc-it not installed)` / `PASS — claim ledger (2 checks skipped)`. Mutation (restore the "fact … clean" wording) gives `not ok 13 - D4 …`. |
| D5 MED G-7 opt-in | FIXED | Size M and size L packages with no ENV-PROBES.json each exit 1: `✗ preflight: size M package's …/ENV-PROBES.json (not found) lists no "behind-remote" probe — G-7 is not opt-in for M/L`. Mutation (`if (!listed)` → `if (false)`) gives `not ok 8 - D5 …`. Residual gap is LOW, see R2-L3. |
| D6 MED attribution regex lets plain facts through | **PARTIAL (open, MEDIUM)** | The three round-1 survivors now exit 1 with `— fact rule`. New survivors exit 0 as `program-doc`/`pointer`, see R2-M1. |
| D7 MED own tier resolver | FIXED | `code / local`, `code, local`, `code and local`, `Code` and `program-doc@2026` each exit 1 with `— tier enum rule`, and `doc-it tiers resolve` exits 1 on each. Mutation (`res.unknown` ignored) gives `not ok 5 - T-L1-02 a unknown tier is refused`, `not ok 17 - D7 …`. |
| D8 LOW count-rule gaps | FIXED (residual LOW) | `5 credential entry points`, `accepts 5 credentials` and `` `cat README.md` `` now exit 1, and `` `grep -c cred a.mjs` `` passes. Mutation (any command counts) gives `not ok 19`. Still passing: `5 login flows` (noun not listed), and `` `git log --count` `` / `` `node -e 'x.length'` `` as the "counting" command. |
| D9 LOW evidence-against trigger | FIXED (residual LOW) | `As you suspected`, `You were right:`, `The hypothesis holds:` and `Your hunch was correct` fail handoff. `Your guess is confirmed by the logs`, `This confirms what you feared` and `Your instinct was right` still pass. Mutation gives `not ok 21 - D9 …`. |
| D10 LOW undeclared size fails open | FIXED | docs/02 with no size gives `size undeclared`, exit 1. `size: "medium"` normalises to null and then fails closed the same way. Mutation gives `not ok 9 - D10 …`. |
| D11 LOW tier-cell sha, literal ids | FIXED | `code@a1b2c3d` + `read it` exits 0, and `code` + `read it` exits 1. Mutation (tier cell dropped from rowText) gives `not ok 18 - D11 …`. The mutation `needsSha` → `id === "code"` survives, but it is equivalent with today's doc-it (only `code` has `<sha>` in its format, and `git` resolves to `code`). |
| D12 LOW broken install = "not installed", `--help` | FIXED (contract text PARTIAL) | A fake CLI that exits 3 gives `[skip] doc-it unusable (tiers --json exited 3: no output): tier enum`. `--help` lists `claims`. Mutation gives `not ok 14 - D12 …`. The contract still says "24 rows" (the ledger has 38, and the test asserts ≥24). That needs a dated amendment by the contract owner. |

### In-scope cases (doc-it and status writer set, full run)

| case | verdict | quoted output |
|---|---|---|
| T-L1-01 | PASS | `node scripts/gate-check.mjs claims tests/fixtures/claims/do-it-1.1.md` gives `✓ …: 38 row(s) — source, sha/path, count, tier enum and fact rules clean` / `PASS — claim ledger`, exit 0. Also `ok 1`, `ok 2 - T-L1-01 …`. |
| T-L1-02 | PASS | `ok 3 - T-L1-02 tier code with no sha anywhere: exit 1 naming the row and the sha/path rule`, plus `ok 4`, `ok 5`, `ok 6` |
| T-L1-03 | PASS | `ok 7 - T-L1-03 '5 credential ways' with tier code and no list: exit 1 count rule`, `ok 8` |
| T-L1-04 | PASS (case), rule weak | `ok 9 - T-L1-04 tier program-doc as plain fact: exit 1 fact rule; 'the study says' passes`. See R2-M1 for plain facts that still pass. |
| T-L1-05 | PASS | `ok 10`, `ok 11 - T-L1-05 …` |
| L1-04 (G-5 handoff wiring) | PASS | `ok 20 - L1-04 handoff runs claims for a decision-grade package …` |
| T-V1-01 | PASS | `ok 33 - T-V1-01 local main 3 behind its remote: probe WARN names the repo, local and remote sha; ENV-FACTS records the remote sha`, `ok 34`, plus D3 `ok 35`–`37` |
| T-V1-02 | PASS | `ok 38 - T-V1-02 size M package without research/SHIPPED-LAYERS.md: handoff exit 1 naming the file`, `ok 39`, `ok 42`, `ok 43` |
| T-V1-03 | PASS | `ok 40 - T-V1-03 02 doc proposes a new registry with no 'extends' citation …`, `ok 41`, `ok 44 - V1-03 KICKOFF pinning …` |
| I1-03 | PASS | `ok 25 - I1-03 handoff prints 'init-it not installed' …` |
| T-K2-03 (plan-it half) | PASS | `ok 22`, `ok 23`, `ok 24 - T-K2-03 …` |
| H1-06 / T-H1-04 | PASS | `ok 29`–`ok 32 - T-H1-04 …` |
| full plan-it set | PASS | `node --test "tests/**/*.test.mjs"` gives `# tests 123 # pass 123 # fail 0 # skipped 0 # todo 0`, exit 0 |
| judge | PASS | `node tests/run-contract.mjs` (no `--allow-skips`, all env set) gives `PASS  T-L1/V1/K2 …`, `55/55 passed`, `25/25 mechanism-ready cases correct`, `58/58 mechanism-ready cases correct; 0 pending mechanism(s); 1 manual`, exit 0. Without doc-it it exits 1 (D2 above). |
| mirror-check | PASS | `PASS — mirror-check: 11 pair(s) byte-identical`, both copies of gate-check |
| real-world `claims` | PASS | `gate-check claims …/do-it-1.1/audit/claims.md` gives `✓ …: 38 row(s) — source, sha/path, count, tier enum and fact rules clean` / `PASS — claim ledger`, exit 0. **It passes only because of the C23 rule** (R2-M1): with that one alternative removed, the same ledger fails on `row C23: tier program-doc stated as plain fact`. |

### AT-01 / T-B-16

**Confirmed.** The case fails only against a stale writer.
- Against build-it origin/main (`aaa6973`, which contains `463b656 feat(status): init records a created history entry per new task`), it passes: `ok 100 - AT-01 / T-B-16 plan-it on fixture: full CLI writes valid status.json`.
- With `DOIT_STATUS_WRITE` unset, the test falls back to the local build-it checkout (`e7cfea1`, branch `harness-status-tracking`, which predates the feature): `not ok 22 - AT-01 / T-B-16 …`, `# pass 36 # fail 1 # skipped 8`.

The fixer's root cause (`history.length === 6`) is correct. One caveat remains, LOW and not W1: the test still falls back to hardcoded machine paths in `WRITER_CANDIDATES`, so a release run that forgets `DOIT_STATUS_WRITE` goes red or stale depending on the machine.

### Mutation probes (one per fix; temp copy, reverted after each)

| fix | mutation | result |
|---|---|---|
| D1 | bare `node scripts/gate-check.mjs claims` in both SKILL.md | killed: `not ok 4 - T-H1-04 …` |
| D2 | skip parse disabled | killed: `not ok 1 - D2 judge …` |
| D3 | any doc-it status → PRESENT | killed: `not ok 3`, `4`, `5` |
| D3 | `ok` without the hex check on local/remote | **survives** (R2-L2) |
| D3 | unparseable branch removed | survives, but preflight then crashes on `null.status` (no false pass) |
| D3 | UNVERIFIED KICKOFF check disabled | killed: `not ok 5 - D3 handoff …` |
| D4 | "fact … clean" wording restored | killed: `not ok 13`, `not ok 14` |
| D5 | `if (!listed)` disabled | killed: `not ok 8 - D5 …` |
| D6 | bare `\bstates\b` re-added as attribution | killed: `not ok 15 - D6 …` |
| D7 | `res.unknown` ignored | killed: `not ok 5`, `not ok 17` |
| D8 | any backticked command counts | killed: `not ok 19 - D8 …` |
| D9 | `as you suspected` pattern removed | killed: `not ok 21 - D9 …` |
| D10 | undeclared-size check disabled | killed: `not ok 9 - D10 …` |
| D11 | tier cell dropped from rowText | killed: `not ok 18 - D11 …` |
| D11 | `needsSha` → literal `code` | survives (equivalent mutant today) |
| D12 | unusable reported as not installed | killed: `not ok 14 - D12 …` |

### Open defects (round 2)

1. **R2-M1 MEDIUM, D6 not closed: the fact rule still accepts plain facts as attributed. The C23 rule is a loophole.** Every one of these exits 0 with tier `program-doc` (or `pointer`) and source `read docs`:
   - From the new hyphen rule `[a-z0-9]+(?:-[a-z0-9]+){2,}\s+(says|…|states|plans|documents|reports)` (case-insensitive, so ordinary compound adjectives qualify): `Up-to-date states are terminal` (the round-1 survivor, one word changed), `End-to-end reports are written to disk nightly`, `Out-of-band reports are dropped after a day`, `The state-of-the-art plans cost less`, and `Day-to-day documents live in the wiki` (pointer).
   - The round-1 root cause remains, noun/verb ambiguity, now in the `the … <source-noun> <verb>` frame: `The issue states are open and closed`, `The session records expire after 30 days`, `The ticket names must be unique` (pointer).
   - Location frames that match ordinary prose: `Tokens are stored in session storage` (`\bin session\b`), `Locks are released in the run loop` (`in the run`), and `Per run, two machine states are terminal` (`^per \S+`).

   On the lead's question: **yes, "<hyphenated identifier> plans …" is a loophole.** The rule was added to make the single `program-doc` row in the real ledger (C23) pass. Remove that one alternative and the real ledger fails on C23 alone, so the rule was fitted to the data, not to the decision (X13/G-5 want an explicit source frame).
   *Fix:*
   (a) Drop the 2+-hyphen alternative. Reword ledger C23 to `The resumable-test-gates plan describes \`do-it gate run\` …`, which passes the existing `the … plan describes` frame. The ledger is a do-it 1.1 audit artifact, not the CONTRACT.
   (b) In the source-noun + verb frame and the `<file>.md` + verb frame, restrict the verb to words that cannot be plural nouns (`says|said|stated|describes|described|proposes|proposed|specifies|specified|mentions|wrote|promises`), or require `that`/`:`/a backtick after the verb.
   (c) Tighten `in session` to `in session [A-Za-z0-9_-]+\b` (a session id/alias) and `in the run` to `in (this|that|the) run\b(?!\s+loop)`, or drop both in favour of `per`/`according to`. Require `per` to be followed by `the|<capitalised doc>|<file>`.
   (d) Add the quoted survivors above as red tests.

2. **R2-L1 LOW**: for an UNVERIFIED repo, any 40-hex sha anywhere in the KICKOFF counts as "pinned". `Other repo pinned at 0123456789abcdef0123456789abcdef01234567.` silences the check for an unrelated unverified repo (handoff exit 0). *Fix:* require the sha on a line that names the repo (its path or basename).
3. **R2-L2 LOW**: the PRESENT branch's hex check on `local`/`remote` is untested (its mutant survives), and so is the unparseable-output branch. *Fix:* add a fake-doc-it test that returns `{"status":"ok"}` with no shas, and one that prints non-JSON.
4. **R2-L3 LOW**: D5 checks that ENV-PROBES lists `behind-remote`. It does not check that preflight ran: a size M package with the probe listed and no ENV-FACTS.md passes handoff. The statechart's preflight phase normally covers this. A one-line check (ENV-FACTS has a `behind-remote` row when the probe is listed) would close it.
5. **R2-L4 LOW**: count and evidence-against residuals (D8 and D9 rows above). These are lexical rules whose narrowness is documented, so they are not blocking.
6. **R2-L5 LOW**: the contract's T-L1-01 still says "24 rows". It needs a dated amendment by the owner. The AT-01 `WRITER_CANDIDATES` machine paths are noted above.

### Must-fix before CP-02 can PASS

R2-M1 alone: (a) drop the hyphen rule and reword C23 in the ledger, (b)/(c) narrow the ambiguous verbs and location frames, and (d) add red tests for the quoted survivors. Then re-run the claims suite, the real-world `claims` check and the judge. Everything else in scope passes on real evidence.

_Round 2 reviewed by an independent opus reviewer; no code, tests or ledger were edited._

## Round 1 (2026-11-07, FAIL)

Reviewer: an independent opus reviewer who built none of this. Date: 2026-11-07. This is the only file written. Every probe ran in temp copies under the session scratchpad, and both temp worktrees were removed afterwards.

### Tree under review

- plan-it merged temp tree: `git worktree add --detach <tmp> origin/main` (origin/main = `bfbfaa1`), then `merge --no-ff epic/L1-V1-trust-preflight` (`8e771e0`), then `merge --no-ff epic/H1-skill-paths` (`617defc`). Merged HEAD was `5ec59fe`.
- **Merge conflicts: none at the text level. There is one semantic conflict.** L1-V1 adds a bare `node scripts/gate-check.mjs claims …` to SKILL.md Phase 5, line 439, in both mirrors. That is the exact bug class H1-06 removes, and H1's T-H1-04 test goes red on the merged tree (D1).
- doc-it: `/Users/macbook/Workspace/Devotts/doc-it-wt/K1` @ `426a858`, `DOC_IT_CLI=…/plugins/doc-it/scripts/doc-it.mjs`. Node v22.23.2.

### Cases

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

### Mutation probes (temp copy of the merged tree; gate-check edited, then the named suite run)

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

### Governance findings

- **G-5 / L1-04**: enforced. Handoff runs `claims` when `audit/claims.md` exists or `run.decisionGrade`. On a copy of the real do-it 1.1 package, handoff prints `claim ledger clean (38 rows)` and fails only on the (expected, pre-V1) missing `research/SHIPPED-LAYERS.md`.
- **G-7, the advisory half: enforced.** A behind repo gives `! behind-remote: WARN …`, preflight exits 0, and the ENV-FACTS row carries `| WARN |` plus both shas. The mutation turning WARN into a failure goes red.
- **G-7, the handoff half: enforced, but only conditionally.** It fires only when (a) the author listed `behind-remote` in ENV-PROBES.json (opt-in, formats.md §12 "Optional entries"; the real do-it 1.1 ENV-PROBES.json lists none), (b) ENV-FACTS.md sits at the package root or the delivery dir, and (c) doc-it returned `behind`. A doc-it `error` never yields a WARN, so (D3) also silently disables the KICKOFF pin check. Nothing fails a size M/L package whose ENV-PROBES lacks `behind-remote`. §2.4 reads "preflight adds the probes", which makes the opt-in a weakening (D5).
- **G-10 / D14**: without doc-it (DOC_IT_CLI unset, HOME an empty temp dir), each doc-it-backed check prints its exact line: `[skip] doc-it not installed: tier enum`, `[skip] doc-it not installed: fact rule (tier fact_ok flags)` and `[skip] doc-it not installed: behind-remote (is the checkout behind origin)`. The behind-remote row is `WARN — doc-it not installed`, never PRESENT. **There is a violation.** The `claims` ok-line reads `source, sha/path, fact and count rules clean` with the fact rule skipped, and handoff reads `claim ledger clean`. Both are a PASS report for a check that did not run (D4).
- **X13 / no tier copy**: the enum, aliases and fact_ok are read from `doc-it tiers --json` (`readDocItTiers`), and formats.md §11 names no enum. **The tier-cell resolve rule is re-implemented, though.** `tierWords` splits on `+ , / & and`, lowercases, and strips `@…` and parentheticals. doc-it's own `tiers resolve` refuses 5 cells that plan-it accepts: `code / local`, `code, local`, `code and local`, `Code` and `program-doc@2026` (doc-it exit 1, plan-it exit 0). X13 says "An unknown spelling is refused" and "consumers never keep their own copy" (D7). Hardcoded tier words in gate-check: `w === "code" \|\| w === "git"` (sha/path rule) and `ids.includes("code")` (count rule). These are semantic hooks, not an enum copy, but the knowledge of which tier needs a sha belongs in doc-it, whose `format` already reads `code@<repo>@<sha>:<path>:<line>` (D11).
- **X10**: honored. The lookup order is DOC_IT_CLI, then the HOME-relative cache with the newest version (tested with a 0.1.0/0.2.0 fake), then `[skip]`. There is one wrinkle: a doc-it that is installed but broken (`tiers` exits non-zero or prints bad JSON) is reported as "not installed" (LOW, D12).
- **X12** (one L1+V1 branch): fine in itself. It did not prevent the cross-branch SKILL.md regression with H1, because neither branch's suite contains the other's test. X9's "suite green on the branch rebased on origin/main" has to run the full set after the sibling merges, not only the epic's suites.
- **X3** ("skips … never passes") is broken by the judge (D2).

### Defects (ranked)

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

### Must-fix before CP-02 can PASS

D1, D2 and D3 (HIGH), and D4, D5, D6 and D7 (MEDIUM). Then re-run the full plan-it set, the judge with and without doc-it, and the real-world `claims` check on the merged tree. AT-01/T-B-16 fails on clean origin/main as well. It is not a W1 defect, but it needs an owner ruling (fix or waiver) before the release claims a green plan-it suite.

_Reviewed by an independent opus reviewer; no code or tests were edited._
