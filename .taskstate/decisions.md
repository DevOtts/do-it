# decisions (shared contract) — D1..D21 live in delivery/DECISIONS.md; CONTRACT v1.1 is law.
- B1: Orchestrator session runs Sonnet 5.5 (T2) as KICKOFF says; user asked "opus orchestrator" — session model can't be switched in-flight; squads Sonnet(T2), opus only on escalation. Logged.
- B2: Squads = worktrees under .worktrees/{lane-wave} on branch epic/{EID}-slug; coordinator merges sequentially, runs integration gate (lane tests + gate-check) after each merge.
- B3: One worker per squad per wave handles that squad's epics of the wave (one writer per path).
- B4: Workers write results to .taskstate/results/{EID}.md (cases: ID, verdict, command, quoted output tail) and end with <=2K message.
