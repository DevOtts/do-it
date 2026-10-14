# do-it v1 — Token Discipline

> **Status:** DRAFT v0.1 · 2026-09-27
> **Scope:** how `do-it` prevents token leaks and token misuse across every run it supervises
> (`plan-it` → `build-it` → `review-it` → `conclude-it`), on any LLM and any agent harness.
> **Origin:** written after measuring two Claude Code sessions from 2026-09-26 that burned a third of
> a weekly subscription limit in ~8 hours. Source sessions, for context via `/read-chat`:
> `"secretario-whatsapp-v2-exec"`, `"secretario-whatsapp-v2-plan-pt2"`. Analysis session:
> the one that produced this doc (2026-09-27).

---

## 0. The one-paragraph version

The cost of an agent run is **not** the amount of work it does. It is the **sum, over every model
call, of the context that call had to read**. A coordinator that keeps one conversation alive for
hours pays for its entire history again on every turn — every relay, every notification, every
wake-up tick. That makes cost grow roughly with the **square** of session length. So `do-it`'s
first job is not "use fewer agents" or "use cheaper models". It is: **keep every long-lived context
small, kill contexts that have stopped earning their keep, and make the expensive tier touch as
few tokens as possible.** Everything below is an elaboration of that.

---

## 1. The founding case (why this document exists)

Two sessions ran in parallel on 2026-09-26: a **planning** session that handed off, and an
**execution** session that ran a multi-agent build (17 worker subagents). Measured from the
transcripts' per-call usage records:

| Where the top-tier tokens went | Input tokens processed | Share |
|---|---|---|
| Execution coordinator main loop | 167M | 43% |
| Planning session main loop | 81M | 21% |
| Workers explicitly spawned on the top tier | 135M | 36% |
| **Total, top tier** | **383M** | |

Plus 340M on the mid tier and 97M on a second top-ish tier. The result: 34% of the weekly
all-models limit, 54% of the top-tier limit.

**What actually happened — four compounding failures:**

1. **Unbounded coordinator context.** The execution coordinator grew from 47K to 857K context
   and was only compacted by the harness at **965K**. 175 of its calls each read >500K tokens
   (123M total). About half the growth was the model's *own output* (mostly reasoning); the rest was
   shell output, a 51K-char contract file read twice, and ~60 relayed worker messages.
2. **A finished session kept polling.** The planning session handed off at 13:40 and then stayed
   alive as a monitor until 21:10: 50 scheduled wake-ups plus relays = **128 calls at 400–600K
   context = 64M tokens** for doing almost nothing.
3. **Wrong tier for workers.** 10 worker spawns explicitly requested the top tier for spec'd
   implementation tasks that a mid tier handles. One worker alone burned 34M.
4. **Model switch mistaken for a fix.** Switching the coordinator to a different model at 806K
   context changed the price per token, not the token count. The next 106 calls still read 94M.

**What was *not* the problem:** worker subagents started fresh at ~57K context each (not forks of
the parent), and the mid-tier workers were cheap relative to their output. Parallelism was fine.
The context lifetime of the *conductors* was the leak.

**Counterfactual:** had the execution coordinator been restarted from its on-disk state at ~200K,
its main loop would have cost roughly a third of what it did. Had the planning session been closed
at handoff, 64M tokens would never have been spent.

> **Lesson in one line:** a long-lived context is a liability that accrues interest every turn.

---

## 2. The cost model do-it reasons with (model-agnostic)

Every provider bills or rate-limits on some mix of these quantities. `do-it` models them explicitly
so its rules hold regardless of vendor.

```
call_cost   ≈ price(tier) × [ fresh_input + cache_write×w + cache_read×r + output×o ]
context_i   = everything the model must read on call i  (system + tools + history + new input)
session_cost ≈ Σ_i  price(tier_i) × context_i            (input side dominates in agent loops)
```

Consequences that hold for every LLM:

| Fact | Consequence for a harness |
|---|---|
| Each call re-reads the whole context | Cost per turn = context size. A 900K turn costs ~18× a 50K turn. |
| Context only grows until compacted/reset | Session cost ≈ O(turns²). Long sessions are superlinearly expensive. |
| The model's own output (incl. reasoning, where retained) joins the context | Verbose thinking inflates every *future* turn, not just this one. |
| Prompt caching discounts reads, doesn't remove them | Caching lowers the price of a bloated context; it doesn't make bloat free. Many subscription meters count cached reads heavily. |
| Caches expire (TTL minutes–hour) | An idle context that wakes after TTL pays a full re-write. Polling on a big context is the worst case. |
| Switching models doesn't shrink context | A cheaper model on a 900K context is still a 900K call. |
| Workers that start fresh are cheap to start | Delegation is cheap *if* the worker is not a fork of a fat parent and returns a short result. |
| Tiers differ in price by 5–25× | Tier choice is a multiplier on everything else; context size is the base. Fix the base first. |

**Therefore the two levers, in priority order:**

1. **Volume** — the tokens each call reads (context size × number of calls).
2. **Rate** — the price tier those tokens are billed at.

Most "cost optimisation" advice attacks lever 2. The founding case was a lever-1 failure.

---

## 3. Principles

- **P1 — Context is rent, not a purchase.** Every token in a live context is paid again on every
  future call. Admit a token into a long-lived context only if it will be needed again.
- **P2 — State lives on disk; context is a cache.** Anything the run must remember goes to files
  (`.taskstate/`, decisions, ledgers). Then resetting a context is a cheap resume, not a loss.
  Compaction/restart is a *routine* operation, not an emergency.
- **P3 — Conductors stay thin.** The coordinator routes, decides, and verifies. It does not read
  large files, raw logs, or full diffs. It receives digests.
- **P4 — A session that stopped producing must stop consuming.** Handoff = close. Monitoring is a
  separate, small, cheap context — or a script, not an LLM.
- **P5 — Price the tokens, then pick the tier.** Expensive tiers get small, high-leverage contexts
  (judgment, adversarial review, the genuinely hard slice). Bulk reading and spec'd implementation
  go to mid/cheap tiers.
- **P6 — Measure, don't feel.** The harness reads per-call usage, not vibes. A run that can't show
  its token meter isn't under `do-it`'s watch.
- **P7 — Budgets are declared up front.** Every run states a token budget and a burn-rate
  expectation before it starts, and alarms when reality diverges.
- **P8 — Fix volume before rate.** Before changing model, shrink or reset context.

---

## 4. The rules do-it enforces

Each rule is a **gate**: `trigger → test → action`. Thresholds are defaults, configurable per
project, expressed both in absolute tokens and as a fraction of the model's window (whichever
fires first), so they transfer across models with 128K, 200K, 1M+ windows.

### 4.1 Context budget (lever 1 — the one that would have prevented the founding case)

| Gate | Trigger | Test | Action |
|---|---|---|---|
| **CB-1 Soft ceiling** | Any long-lived context (coordinator, monitor, reviewer) | context ≥ **150K** or **40% of window** | Warn; require the next turn to checkpoint state to disk. |
| **CB-2 Hard ceiling** | Same | context ≥ **250K** or **60% of window** | **Mandatory reset:** checkpoint → compact or restart fresh from state files. No further tool calls until done. |
| **CB-3 Growth rate** | Every N=10 calls | context grew > **50K per 10 calls** | Flag the top contributors (see §6) and apply 4.4 hygiene. |
| **CB-4 Never rely on the harness's own compaction** | Always | harness auto-compaction threshold > CB-2 | `do-it` compacts first. Harness defaults (often 80–95% of window) are a last-resort backstop, not a policy. |
| **CB-5 Checkpoint discipline** | Before any reset | state files updated in this phase? | Write/refresh: goal + DoD status, decisions, open items, next action, pointers. Reset only after. |

> The founding case would have tripped CB-1 at ~14:05, CB-2 at ~14:50, and been reset at least
> three times before the model switch. Estimated saving: ≥100M top-tier tokens.

### 4.2 Session lifecycle (idle and zombie contexts)

| Gate | Trigger | Test | Action |
|---|---|---|---|
| **SL-1 Close on handoff** | A stage hands off (plan → build, build → review) | Is the handing-off context still alive? | Run `conclude-it` on it and close. Handoff artifacts go to disk; the next stage reads them. |
| **SL-2 No big-context polling** | Scheduled wake-up / loop tick / poll | context > **50K**? | Refuse. Move the poll to a script, a cheap-tier fresh context, or a notification the harness delivers. |
| **SL-3 Poll cadence vs cache TTL** | Wake-ups on any LLM context | interval < TTL with nothing new, or interval > TTL on a big context | Poll only when something could have changed; when waking a big context after TTL, reset it first (the full re-write is already being paid). |
| **SL-4 One conductor per run** | A second session starts steering the same run | Two contexts both relaying/deciding? | Pick one conductor; the other becomes read-only or closes. Two conductors = double rent. |
| **SL-5 Reap finished workers** | Worker returned and output captured on disk | Worker still addressable? | Stop it. Resuming an old worker later re-reads its whole transcript, usually uncached. Spawn fresh with a pointer to the files instead. |

### 4.3 Tier routing (lever 2)

`do-it` uses abstract tiers so it works with any vendor mapping:

| Tier | Typical use | Context policy |
|---|---|---|
| **T1 — frontier** | Crown-jewel design, ambiguous cross-cutting decisions, adversarial verification, final judgment | Small, curated contexts only. Never a long-lived conductor by default. |
| **T2 — workhorse** | Spec'd implementation against a test contract, refactors, most reviews, the conductor | Default tier. |
| **T3 — fast/cheap** | Mechanical edits, grep/summarise, log triage, monitors, formatting, digest production | Anything that reads a lot and decides little. |

| Gate | Trigger | Test | Action |
|---|---|---|---|
| **TR-1 Explicit tier on every spawn** | Worker spawn | tier specified? | Reject spawns without an explicit tier. "Inherit the parent" is how T1 leaks into bulk work. |
| **TR-2 Justify T1** | Spawn or conductor at T1 | written reason in the run log (hard slice, adversarial, ambiguity)? | Without a reason, downgrade to T2. |
| **TR-3 Escalate on evidence, don't pre-pay** | Worker fails its contract or thrashes | — | Re-run that slice one tier up. Record the escalation. Never start at T1 "to be safe". |
| **TR-4 Conductor tier ≠ max tier** | Run start | conductor at T1? | Default conductor = T2. T1 is consulted for specific decisions as a short-lived fresh context. |
| **TR-5 Model switch requires reset** | Changing the model of a live context | context > CB-1? | Reset first, then switch. Switching alone is a no-op on volume. |
| **TR-6 Reasoning effort is a tier too** | Setting thinking/reasoning budget | High effort on mechanical work? | Match effort to the task. Where reasoning is retained in context, high effort on a long-lived context compounds (it was ~half of the founding case's growth). |

### 4.4 Input hygiene (what enters a context)

| Gate | Trigger | Test | Action |
|---|---|---|---|
| **IH-1 Tool-output cap** | Any tool result into a long-lived context | > **8K tokens**? | Truncate to head/tail + write full output to a file + return the path. Conductors read the file only if needed, in slices. |
| **IH-2 No whole-file reads in conductors** | Reading a file > **20K tokens** | reader is a conductor? | Read the relevant section (grep/offset), or delegate a T3 worker to return a digest. |
| **IH-3 Read once** | Re-reading the same file/section | unchanged since last read in this context? | Refuse; it's already in context. (Founding case: a 51K-char contract read twice.) |
| **IH-4 Digest, don't dump** | Workers reporting back | report > **2K tokens**? | Workers return a fixed-shape summary (status, evidence pointers, open issues); detail stays on disk. |
| **IH-5 Batch relays** | Worker → conductor messages / notifications | > 3 messages in 10 min with no decision needed? | Buffer them; deliver one digest. Every relay is a full-context turn for the conductor. |
| **IH-6 Filter at source, keep the full log** | Tests, builds, gates | — | Tee full output to a file; bring only the verdict + failures into context. (Never filter *away* evidence — keep the file.) |
| **IH-7 Load instructions lazily** | Skills, playbooks, long system docs | needed this phase? | Load per phase, not all up front. Instructions are context rent too. |

### 4.5 Delegation shape

| Gate | Trigger | Test | Action |
|---|---|---|---|
| **DL-1 Fresh over fork** | Spawning a worker | would it inherit the parent's context? | Default to fresh workers with a curated brief (pointers to files). Fork only when the parent's context is small and truly needed. |
| **DL-2 Brief size** | Worker prompt | > **8K tokens**? | Move detail to a file the worker reads; keep the brief to goal, contract, pointers, return shape. |
| **DL-3 Worker has its own ceiling** | Long-running worker | context ≥ CB-2? | Same checkpoint/reset rule as conductors. A worker at 480K (seen in the founding case) is a conductor-sized leak. |
| **DL-4 Parallelism isn't free, but isn't the enemy** | Fan-out | — | Parallel fresh workers are cheap. Parallel *long-lived* workers each accumulate rent. Prefer short-lived workers per slice over one worker that does five slices. |

---

## 5. Integration with the lifecycle plugins

`do-it` sits above the four plugins. It doesn't re-implement them. It gives each one a token
contract and watches it.

| Stage | Main token risk | do-it's contract for that stage |
|---|---|---|
| **plan-it** | Planner context grows through research, squad fan-out, and amendments; session lingers after handoff. | Research fans out to T3/T2 workers returning digests. Planner checkpoints to the plan package at each gate. **SL-1: close on handoff** is mandatory. The planning session never becomes the build monitor. |
| **build-it** | Conductor becomes a relay hub for many workers and grows unbounded; wake-up loops on a fat context; T1 workers by inheritance. | Conductor at T2, CB-1/CB-2 enforced, relays batched (IH-5), every spawn tiered (TR-1), `.taskstate/` checkpoint before every reset (CB-5). Overnight wake-ups (usage-limit resilience) always wake a **fresh** context that reads state files, never the old one. |
| **review-it** | Reviewer reads whole diffs, full test logs, full transcripts. | Reviews slice by file/epic in fresh workers; test logs tee'd to disk (IH-6); adversarial verification at T1 gets a *curated* context, not the build history. |
| **conclude-it** | Closing ritual runs inside an already-huge context; forgets to stop monitors/wake-ups. | Conclude reads state files, not scrollback. Its footprint sweep must stop every wake-up, loop, and worker the session started (SL-1, SL-5), and it records the run's token meter (§6) in the session card. |

### 5.1 Known conflicts with existing plugin guidance (must be resolved in v1)

- **build-it's "anti-context-anxiety" rule** tells the model long context is survivable and not to
  wrap up early. The intent is right: don't stop working. But the wording lets context grow without
  limit. **Resolution:** keep "don't stop working" and add "reset proactively at CB-2". Compaction is a
  resume, so resetting early costs nothing but a state-file read.
- **"Save context window is a weak reason to parallelize"** (build-it). True for *correctness*.
  But `do-it` counts context savings as a first-class cost reason for delegating *reads* to T3.
  Reword it to: parallelize for independence; delegate reads for cost.
- **Usage-limit resilience via wake-ups** (user default). Keep it, but each wake-up must start a
  fresh context from state files (SL-2/SL-3), never re-animate the original conductor.

---

## 6. Telemetry: the token meter

`do-it` can't enforce what it can't see. Every supervised run keeps a **token meter**: an
append-only file (e.g. `.taskstate/token-meter.jsonl`) with one row per model call:

```json
{"ts":"…","run":"…","context_id":"conductor|worker:<name>|monitor","role":"conductor",
 "model":"<vendor/model>","tier":"T2","ctx_tokens":183402,"fresh_in":512,"cache_write":4210,
 "cache_read":178680,"output":1893,"trigger":"relay|wakeup|user|tool|spawn"}
```

### 6.1 Derived signals (computed continuously)

| Signal | Definition | Alarm |
|---|---|---|
| **Context high-water** | max `ctx_tokens` per context | ≥ CB-1 / CB-2 |
| **Rent ratio** | Σ input tokens ÷ Σ output tokens per context | > **300:1** on a conductor = it's mostly re-reading itself |
| **Idle-turn share** | share of a context's calls triggered by `wakeup`/`relay` with no tool action or decision | > **40%** = zombie (SL-2/SL-4) |
| **Tier mix** | share of tokens at T1 | > **25%** of run tokens without TR-2 justifications |
| **Burn rate** | tokens/hour, weighted by tier price | > declared budget rate × 1.5 |
| **Top contributors** | largest tool results, re-reads, relays by size | shown on every CB-3 flag |

### 6.2 Detectors must see their founding case

Every detector ships with a replay test against the 2026-09-26 transcripts (or a synthetic
fixture shaped like them). If a detector would **not** have fired on the founding case, it is a
false assurance and doesn't ship. Minimum required hits:

- CB-1/CB-2 on the execution conductor before 15:00.
- Idle-turn share on the planning session after 13:40.
- TR-1/TR-2 on the 10 top-tier worker spawns.
- TR-5 on the model switch at 806K.

### 6.3 Provider adapter (what do-it needs from any harness)

| Needed | Preferred source | Fallback when unavailable |
|---|---|---|
| Per-call usage (input/cached/output) | API usage field or transcript usage record | Estimate: chars ÷ 4 of the request payload |
| Current context size | Usage of the last call | Running sum of message sizes |
| Model id → tier | Project config mapping | Ask once at run start, persist |
| Cache TTL | Provider docs/config | Assume 5 min (conservative) |
| Compact / reset primitive | Harness command (compact, new session, clear) | Checkpoint + start a new session from state files |
| Spawn with explicit model | Harness sub-agent API | Separate CLI invocation with model flag |
| Account limit / quota | Provider usage endpoint or UI | Run-level budget only (§7) |

Where a harness exposes hooks (pre-tool, post-tool, pre-compact, session-start), `do-it`
implements gates there. Where it doesn't, gates run as a checklist the conductor must execute at
phase boundaries, and the meter is reconstructed from transcripts after the fact.

---

## 7. Budgets and escalation

- **Declare at start.** Every run states a budget in tier-weighted tokens (or % of the account
  limit), a planned duration, and the expected T1 share. `plan-it` produces an estimate from the
  epic count; `build-it` inherits it.
- **Checkpoints at 25/50/75%.** At each, `do-it` compares progress (DoD items verified) to spend.
  If spend runs > 1.5× ahead of progress, it pauses the fan-out, writes a one-screen burn report
  (top contexts, top contributors, tier mix), and continues only on the cheapest safe path. That
  means resetting fat contexts, downgrading unjustified T1, and batching relays.
- **Hard stop.** At 100% of budget, the run checkpoints and parks with a resume note. It doesn't
  quietly continue into the account limit.
- **Account-limit awareness.** If the provider exposes quota, `do-it` never plans a run that would
  consume more than a configured share of the remaining weekly quota (default **15%** per run)
  without explicit human approval.

---

## 8. Anti-pattern catalog

| # | Anti-pattern | Why it leaks | do-it counter |
|---|---|---|---|
| A1 | The immortal conductor | O(turns²) rent | CB-1/CB-2, CB-5 |
| A2 | The zombie planner (session kept alive after handoff to "watch") | Full-context turns for no work | SL-1, SL-2, SL-4 |
| A3 | Polling on a fat context | Each tick = full read, often cache-cold | SL-2, SL-3 |
| A4 | Inherited top tier ("spawn with parent's model") | T1 price on bulk work | TR-1, TR-2 |
| A5 | "Switch to a cheaper model" on a 900K context | Rate changes, volume doesn't | TR-5, P8 |
| A6 | Whole-file / whole-log reads in the conductor | Permanent rent for one-time info | IH-1, IH-2, IH-6 |
| A7 | Re-reading the same document | Paid twice, rented twice | IH-3 |
| A8 | Chatty workers (long reports, many small relays) | Each relay is a conductor turn | IH-4, IH-5 |
| A9 | Resuming an old idle worker | Re-reads its full transcript uncached | SL-5 |
| A10 | Fork-by-default delegation | Worker starts at parent's size | DL-1 |
| A11 | Max reasoning everywhere | Retained thinking inflates future turns | TR-6 |
| A12 | Trusting the harness's auto-compaction | Fires at 80–95% of window, far too late | CB-4 |
| A13 | Two parallel sessions steering one run | Double rent, conflicting decisions | SL-4 |
| A14 | Eager instruction loading (every skill/playbook up front) | Rent on unused instructions | IH-7 |

---

## 9. Checklists

**Before a run**
- [ ] Budget declared (tier-weighted tokens, duration, expected T1 share).
- [ ] Tier mapping for this provider set; conductor = T2.
- [ ] State files exist and are the source of truth (`.taskstate/` or equivalent).
- [ ] Token meter enabled; ceilings configured for this model's window.
- [ ] Previous stage's session is closed (SL-1).

**During a run (conductor asks itself at each phase boundary)**
- [ ] Am I above CB-1? If so, checkpoint now; above CB-2, reset now.
- [ ] Is any other context alive that isn't producing? Close it.
- [ ] Did every spawn in this phase name a tier, and is every T1 justified?
- [ ] Did anything > 8K tokens enter my context this phase? Should it have been a file + digest?
- [ ] Are relays batched?

**After a run (conclude-it)**
- [ ] Every wake-up, loop, monitor, and worker stopped.
- [ ] Token meter summary written to the session card: total, T1 share, high-water per context,
      rent ratio, top 3 contributors.
- [ ] Any budget overrun explained, in the user's terms.

---

## 10. Open questions for v1

1. **Default ceilings.** 150K/250K are conservative for 1M-window models. Should they scale with the
   window, or stay absolute because cost is absolute? Current proposal: whichever fires first.
2. **Quality cost of resets.** Frequent resets lose implicit context. Measure: DoD pass rate and
   rework before/after enforcing CB-2 on a few real runs.
3. **Where the meter lives** when a run spans multiple harnesses or providers. One meter per run,
   keyed by `context_id`, provider-tagged?
4. **Subscription meters vs API billing.** Subscription limits may weight cached reads and tiers
   differently from list price. `do-it` should learn the weighting from observed limit movement,
   not assume API pricing.
5. **Enforcement vs advice.** Which gates block (CB-2, TR-1, SL-2) and which only warn? Proposal:
   block the three that would have prevented the founding case; warn on the rest in v1.

---

## Glossary

- **Context:** everything a model reads on one call: system prompt, tools, history, new input.
- **Conductor / coordinator:** the long-lived context that routes work and makes decisions.
- **Worker:** a short-lived context that does one slice and returns a digest.
- **Rent:** tokens re-read on every call because they sit in a live context.
- **Reset:** checkpoint state to disk, then compact or start a fresh context from those files.
- **Tier (T1/T2/T3):** a price/capability class, mapped per provider in config.
- **Zombie context:** a live context whose calls are mostly wake-ups or relays with no work done.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
