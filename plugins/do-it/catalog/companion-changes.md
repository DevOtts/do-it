# Companion-plugin change catalog

Epic R3, decision D14, PRD-5 section 5. This is a CATALOG: it lists what each companion plugin owner must change so the plugin fits do-it. No sibling repo is edited by this program (CONTRACT section 5). "Current state" cells cite a real line of a real sibling file in the form `repo/path:LINE` contains «text»; `tests/catalog/catalog.test.mjs` re-reads each cited line (read-only) and fails if the text is not on that line. Sizes follow docs/05. Lint: `node scripts/lint-catalog.mjs plugins/do-it/catalog/companion-changes.md`.

## all companions

**Owner repo:** each plugin repo (DevOtts/prompt-it, plan-it, build-it, review-it, conclude-it, parallel-lifecycle, plus the two proposed new repos deploy-it and reconcile-it).

**Current state:** no companion writes `it-result/1` today; each keeps its own report folder and its own vocabulary. Tier words found per plugin are listed in the plugin sections below. Result words in use today: review-it reports PASS / FAIL / `IMPLEMENTED-NOT-VERIFIED` (`review-it/SKILL.md:109` contains «IMPLEMENTED-NOT-VERIFIED»), build-it reports VERIFIED / IMPLEMENTED-NOT-VERIFIED (`build-it/SKILL.md:46` contains «.build-it-reports/lessons.md»). The do-it contract has three verdicts, so review-it PASS maps to VERIFIED and FAIL to BLOCKED when it writes `it-result/1`.

**Exact changes:**

### it-result/1 (G-1, written atomically as the last act of a stage)

- it-result/1 fields: schema, stage, run_id, slice_id, version, head_sha, status, exit_code, verdicts, run_verdict, next, pending_human, artifacts, resume, tokens.
- Status values: ok, needs_human, blocked, failed, context_reset, usage_limit.
- exit_code mirror: ok 0, failed 1, needs_human 2, blocked 3, usage_limit 3, context_reset 3.
- Write to a temp file in the same directory, then rename; the stage never writes `state.json` (only the spine does, G-1).

### Root resolution (`DO_IT_HOME`)

1. `DO_IT_HOME` set: use its value.
2. Unset inside a linked git worktree: `{main checkout}/.do-it`, found with `git rev-parse --git-common-dir` (the parent of the common dir is the main checkout).
3. Unset in the main checkout: `{repo}/.do-it`.

Reference resolver: `tests/catalog/resolve-home.mjs`. Legacy paths (`.build-it-reports/`, `.fable-it-reports/`, `.taskstate/`) are read as a resume fallback and never created by the new code.

### Tier vocabulary (one table for every plugin)

| Tier | Meaning | Engine alias | Use |
|---|---|---|---|
| T1 | powerful | powerful | hard reasoning; needs a written reason or is downgraded (G-4) |
| T2 | balanced | balanced | spec'd implementation; conductor default |
| T3 | cheap | cheap | deterministic and gather work |

Model names never appear in a companion's output: a plugin asks for T1/T2/T3 and the host maps it (G-4).

### Result vocabulary

Verdicts: VERIFIED, IMPLEMENTED-NOT-VERIFIED, BLOCKED. Run verdicts: DONE_ALL_VERIFIED, DONE_WITH_RESIDUALS, BLOCKED, NEEDS_RESET, USAGE_LIMIT. A plugin may keep its own display words but the `it-result/1` file carries only these.

**Size:** M each

**Verification case:** T-R3-03, T-R3-04, T-R3-05

## prompt-it

**Owner repo:** DevOtts/prompt-it

**Current state:** prompt-it already refuses to emit delegation notes. Tier words found in `prompt-it/SKILL.md` (scan: whole words T1 T2 T3 opus sonnet haiku tier tiers tiering, case-insensitive): `prompt-it/SKILL.md:41` contains «tiering»; `prompt-it/SKILL.md:59` contains «tiers». The rule is stated at `prompt-it/SKILL.md:59` contains «NEVER emit delegation/tiering/economics notes». Its own marketplace is at the newest pin: `prompt-it/.claude-plugin/marketplace.json:13` contains «"version": "0.3.0"». Pin drift in the three siblings that depend on it (G-15): `build-it/.claude-plugin/marketplace.json:18` contains «"version": "0.2.1"»; `plan-it/.claude-plugin/marketplace.json:16` contains «"version": "0.2.1"»; `review-it/.claude-plugin/marketplace.json:16` contains «"version": "0.2.1"».

**Exact changes:** (1) emit a brief with a validated pointer list: every path or id cited exists, the brief is at most 8000 tokens (G-11). (2) Fix the drift: bump the prompt-it pin to 0.3.0 in the build-it, plan-it and review-it marketplaces. The three ready-to-apply diffs are under "Ready-to-apply diffs" below (prompt-it owner or each sibling owner applies them; this program does not).

**Size:** S

**Verification case:** T-R3-06, T-R3-11

## plan-it

**Owner repo:** DevOtts/plan-it

**Current state:** the Test Contract header is defined at `plan-it/references/formats.md:67` contains «Test Contract — <feature>» and described at `plan-it/SKILL.md:129` contains «The Test Contract». It has no `Verify` column and plan-it writes no readiness verdict. Tier words found in `plan-it/SKILL.md`: `plan-it/SKILL.md:651` contains «tier» (about a test-tier matrix, not model tiers).

**Exact changes:** at G4, plan-it writes `plan/READINESS.json` and `plan/DECISIONS.md` (G-8: build cannot start without them). The Test Contract grammar gains a `Verify` column whose only values are `auto`, `attended`, `judgement` (any other value is a lint error).

READINESS.json requires every decision RESOLVED or DEFAULTED, `preflight.passed` true, and `owner_dependent_slices` equal to 0:

```json readiness-schema
{
  "type": "object",
  "required": ["schema", "decisions", "preflight", "owner_dependent_slices"],
  "properties": {
    "schema": { "const": "do-it-readiness/1" },
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "status"],
        "properties": { "id": { "type": "string", "minLength": 1 }, "status": { "enum": ["RESOLVED", "DEFAULTED"] } }
      }
    },
    "preflight": { "type": "object", "required": ["passed"], "properties": { "passed": { "const": true } } },
    "owner_dependent_slices": { "const": 0 }
  }
}
```

```json readiness-example
{
  "schema": "do-it-readiness/1",
  "decisions": [{ "id": "D1", "status": "RESOLVED" }, { "id": "D2", "status": "DEFAULTED" }],
  "preflight": { "passed": true },
  "owner_dependent_slices": 0
}
```

Sample Test Contract rows with the new column:

| ID | Scenario | Expected | Kind | Verify |
|---|---|---|---|---|
| T-X-01 | build passes | exit 0 | happy | auto |
| T-X-02 | morning report reads well | owner confirms | edge | attended |
| T-X-03 | copy matches brand voice | reviewer judgement | edge | judgement |

**Size:** M

**Verification case:** T-R3-12

## build-it

**Owner repo:** DevOtts/build-it

**Current state:** the skill already writes `.build-it-reports/` and reads the legacy folder: `build-it/SKILL.md:46` contains «.build-it-reports/lessons.md». The ambiguity left is that the legacy folder is still listed as ignored run output, not declared read-only. Tier words found in `build-it/SKILL.md`: `build-it/SKILL.md:3` contains «Sonnet»; `build-it/SKILL.md:3` contains «Opus»; `build-it/SKILL.md:55` contains «tiers»; `build-it/SKILL.md:55` contains «tier». The conductor ceiling (warn 150000 tokens or 40 percent, block 250000 tokens or 60 percent) is owned by the spine, so wording that tells the model to "keep going until done" must not override a ceiling block.

**Exact changes:** keep `.build-it-reports/` as the only report folder, treat `.fable-it-reports/` as legacy read-only (read for lessons, never create or write it), and use wording compatible with the conductor ceiling (a CEILING_BLOCKED step waits for a handoff). One-line diff in "Ready-to-apply diffs" (id `report-dir-build-it`).

**Size:** S

**Verification case:** T-R3-11, T-R3-14

## review-it

**Owner repo:** DevOtts/review-it

**Current state:** review-it reports PASS / FAIL / `IMPLEMENTED-NOT-VERIFIED` (`review-it/SKILL.md:109` contains «IMPLEMENTED-NOT-VERIFIED») and consumes the plan-it Test Contract (`review-it/SKILL.md:80` contains «Consume the plan-it Test Contract»). It does not own an attended-gate artifact. Tier words found in `review-it/SKILL.md`: `review-it/SKILL.md:39` contains «tiers»; `review-it/SKILL.md:80` contains «tier».

**Exact changes:** review-it owns and re-cuts `.do-it/review/ATTENDED-GATE.html` every round, uses a frozen roteiro fingerprint to detect a repeated round, and uses the severity classes blocker, major, minor, nit (ruling D2). One writer per path:

Severity classes: blocker, major, minor, nit.

| Path | Writer | Readers |
|---|---|---|
| `.do-it/review/ATTENDED-GATE.html` | review-it | do-it, build-it, conclude-it |
| `.do-it/review/roteiro.json` | review-it | do-it |
| `.do-it/review/findings.json` | review-it | build-it, do-it |
| `.do-it/runs/{run_id}/state.json` | spine | review-it, build-it, conclude-it |

The gate file is re-cut each round (rewritten whole, never appended); do-it, build-it and conclude-it only read it. Two writers for any path make the lint exit 1.

**Size:** M

**Verification case:** T-R3-13

## conclude-it

**Owner repo:** DevOtts/conclude-it

**Current state:** conclude-it closes a session with a verdict of safe or not safe to exit (`conclude-it/SKILL.md:13` contains «safe-to-exit verdict») and reaps idle subagents (`conclude-it/SKILL.md:12` contains «idle-subagent reaping»). It does not read a finish line. Tier words found in `conclude-it/SKILL.md`: none found.

**Exact changes:** read `.do-it/finish-line.json` and refuse to close (G-13) when a row is unaccounted (state OPEN), a worker is live, or a wake-up is pending; each refusal names the row or worker. Rows in DONE, PARKED or BLOCKED with a reason or evidence count as accounted.

**Size:** S

**Verification case:** T-R3-14

## parallel-lifecycle

**Owner repo:** DevOtts/parallel-lifecycle

**Current state:** it gives each git worktree an isolated runtime (`parallel-lifecycle/SKILL.md:17` contains «isolated»), detects a linked worktree with `parallel-lifecycle/SKILL.md:30` contains «--git-common-dir», and removes it with `parallel-lifecycle/SKILL.md:72` contains «git worktree remove». The behaviour is implicit in prose, with no callable contract.

**Exact changes:** stays a separate plugin (ruling D14). Expose an `isolation` driver contract with exactly three operations: `create` (make an isolated checkout and runtime for a slice), `remove` (tear it down after merge or abandon), and `path` (print its absolute path). do-it selects the driver through settings `isolation`; the default driver is plain git worktrees.

**Size:** S

**Verification case:** T-R3-14

## deploy-it

**Owner repo:** proposed new repo DevOtts/deploy-it (built from the user-level skills engine-deploy and deploy-router, which live outside the read-only sibling set).

**Current state:** none in a sibling repo. Deploy knowledge is split between the user-level `deploy-router` skill (coordination, locks) and Engine-specific deploy steps; neither declares its targets in data, so the Engine specifics cannot be swapped.

**Exact changes:** a deploy is an ordered list of legs declared in `.deploy-it/adapter.json`; Engine specifics move into an adapter. Order: router lock first, canary on the lowest-risk target, then every declared leg is required.

Adapter schema (requires `legs[]` with name, command, verify, rollback, risk):

```json adapter-schema
{
  "type": "object",
  "required": ["schema", "legs"],
  "properties": {
    "schema": { "const": "deploy-it-adapter/1" },
    "legs": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "command", "verify", "rollback", "risk"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "command": { "type": "string", "minLength": 1 },
          "verify": { "type": ["string", "null"] },
          "rollback": { "type": ["string", "null"] },
          "risk": { "enum": ["low", "medium", "high"] }
        }
      }
    }
  }
}
```

```json adapter-example
{
  "schema": "deploy-it-adapter/1",
  "legs": [
    { "name": "web-canary", "command": "./deploy.sh canary", "verify": "./verify.sh canary", "rollback": "./rollback.sh canary", "risk": "low" },
    { "name": "web-prod", "command": "./deploy.sh prod", "verify": "./verify.sh prod", "rollback": "./rollback.sh prod", "risk": "high" }
  ]
}
```

LEG protocol: each leg returns one JSON line `{leg, state, evidence, sha256}`. Result states: DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED, NEEDS_HUMAN.

- DEPLOYED_VERIFIED: a passing verify. DEPLOYED_UNVERIFIED: no verify command declared. HELD: the leg is held by the router lock. FAILED: the command or the verify failed. NEEDS_HUMAN: the leg needs a credential or a production flag.
- Exit codes of the leg runner: DEPLOYED_VERIFIED 0, DEPLOYED_UNVERIFIED 0, HELD 3, FAILED 1, NEEDS_HUMAN 2.
- Adversarial verify, re-read after the claim: once a leg claims success, verify re-reads the target from scratch (a new process, no cached handle) and compares the digest to the claim. A mismatch turns the leg FAILED with `expected A found B`, never VERIFIED.

M1 failure cascade (identical to CONTRACT section 8; this catalog must not change it):

- transition: DEPLOYING --> PARTIAL_FAILURE
- transition: PARTIAL_FAILURE --> ROLLED_BACK
- transition: ROLLED_BACK --> DEPLOYING
- transition: ROLLED_BACK --> ESCALATED

Some legs pass and some fail: PARTIAL_FAILURE; compensation runs the passed legs' `rollback` in reverse order and the run becomes ROLLED_BACK; if a rollback fails the run becomes ESCALATED; after a fix ROLLED_BACK returns to DEPLOYING and every leg is re-verified (recovery by re-verify). Reference checker: `tests/catalog/leg-reference.mjs`.

**Size:** L

**Verification case:** T-R3-07, T-R3-08, T-R3-09, T-R3-10

## reconcile-it

**Owner repo:** proposed new repo DevOtts/reconcile-it (packaging of the user-level reconcile-it skill, which lives outside the read-only sibling set).

**Current state:** none in a sibling repo. The skill runs a five-phase ritual (inventory, classify, approval stop, execute, plan waves) inside one conversation; nothing persists between invocations.

**Exact changes:** three commands with a persisted state file. `scan` (read-only inventory of branches, remote branches and worktrees), `plan` (dispositions: delete-landed, archive-superseded, keep-in-flight, rescue-wip, review), `apply --approved` (executes; re-verifies each target at execution time). `apply` without `--approved` exits 2 and deletes nothing. State file `.do-it/reconcile/state.json` requires `phase`, `inventory`, `dispositions`, `approved_at`; a state with `approved_at` null cannot reach phase apply. Reference gate: `tests/catalog/reconcile-reference.mjs`.

```json reconcile-state-example
{
  "phase": "await_approval",
  "inventory": [{ "ref": "epic/R9-old", "kind": "branch" }],
  "dispositions": [{ "ref": "epic/R9-old", "action": "delete-landed" }],
  "approved_at": null
}
```

**Size:** M

**Verification case:** T-R3-15, T-R4-10, T-R4-11

## Ready-to-apply diffs

Paths are relative to the Devotts parent folder (`a/build-it/...` means the build-it repo root). Apply from that folder with `git apply`. Checked by T-R3-11 against copies of the real files.

```diff pin-build-it
diff --git a/build-it/.claude-plugin/marketplace.json b/build-it/.claude-plugin/marketplace.json
index 376e2c6..7f31ed5 100644
--- a/build-it/.claude-plugin/marketplace.json
+++ b/build-it/.claude-plugin/marketplace.json
@@ -15,7 +15,7 @@
         "source": "github",
         "repo": "DevOtts/prompt-it"
       },
-      "version": "0.2.1",
+      "version": "0.3.0",
       "description": "Harness-aware intent compiler for the DevOtts lifecycle family — turns a rough ask into an optimized, context-grounded prompt routed to the right *-it skill with exactly the slots that target parses, nothing it already owns. Mode 1 compiles new-session prompts from a simple ask; Mode 2 reads review-it/QA findings and generates the evidence-cited continuation prompt. Never emits tiering, persistence, or verification-protocol content the routed target already owns.",
       "author": {
         "name": "DevOtts",
```

```diff pin-plan-it
diff --git a/plan-it/.claude-plugin/marketplace.json b/plan-it/.claude-plugin/marketplace.json
index b24788c..0b0b091 100644
--- a/plan-it/.claude-plugin/marketplace.json
+++ b/plan-it/.claude-plugin/marketplace.json
@@ -13,7 +13,7 @@
         "source": "github",
         "repo": "DevOtts/prompt-it"
       },
-      "version": "0.2.1",
+      "version": "0.3.0",
       "description": "Harness-aware intent compiler for the DevOtts lifecycle family — turns a rough ask into an optimized, context-grounded prompt routed to the right *-it skill with exactly the slots that target parses, nothing it already owns. Mode 1 compiles new-session prompts from a simple ask; Mode 2 reads review-it/QA findings and generates the evidence-cited continuation prompt. Never emits tiering, persistence, or verification-protocol content the routed target already owns.",
       "author": {
         "name": "DevOtts",
```

```diff pin-review-it
diff --git a/review-it/.claude-plugin/marketplace.json b/review-it/.claude-plugin/marketplace.json
index 240ad1b..f10e709 100644
--- a/review-it/.claude-plugin/marketplace.json
+++ b/review-it/.claude-plugin/marketplace.json
@@ -13,7 +13,7 @@
         "source": "github",
         "repo": "DevOtts/prompt-it"
       },
-      "version": "0.2.1",
+      "version": "0.3.0",
       "description": "Harness-aware intent compiler for the DevOtts lifecycle family — turns a rough ask into an optimized, context-grounded prompt routed to the right *-it skill with exactly the slots that target parses, nothing it already owns. Mode 1 compiles new-session prompts from a simple ask; Mode 2 reads review-it/QA findings and generates the evidence-cited continuation prompt. Never emits tiering, persistence, or verification-protocol content the routed target already owns.",
       "author": {
         "name": "DevOtts",
```

```diff report-dir-build-it
diff --git a/build-it/SKILL.md b/build-it/SKILL.md
index 8be4039..11cc4f3 100644
--- a/build-it/SKILL.md
+++ b/build-it/SKILL.md
@@ -43,7 +43,7 @@ Create these four files in `.taskstate/` before writing any code, and re-read th
 | `evidence.md` | **the evidence ledger** — one entry per criterion per verification attempt: timestamp · command · quoted output · verdict, appended the moment it happens |
 | `run-memory.md` | failed approaches (never retry blind), environment quirks, decision rationale, surprises |
 
-Cross-run memory: at the end of a run, roll durable lessons into `.build-it-reports/lessons.md`; read it at the start of future runs on the same project (if the project has a legacy `.fable-it-reports/lessons.md` from pre-v3.1.0 runs, read that too).
+Cross-run memory: at the end of a run, roll durable lessons into `.build-it-reports/lessons.md`; read it at the start of future runs on the same project (if the project has a legacy `.fable-it-reports/lessons.md` from pre-v3.1.0 runs, read that too, read-only; never create or write `.fable-it-reports/`).
 
 **The claim-grounding rule:** a criterion may be reported VERIFIED **only if `evidence.md` holds a passing result from this session**. Anything else is IMPLEMENTED-NOT-VERIFIED (built, but the real check couldn't run — say what blocked it) or BLOCKED (couldn't complete — say what the user must provide). Never VERIFIED on a mock, an assumption, or memory.
 
```
