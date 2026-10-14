# codex stop-gate checklist (conductor, default R5)

codex has no stop hook that do-it can rely on (`hooks.stop_gate` is false). Before ending any turn, the conductor works through these five checks in order. Each names the spine command to run.

1. Run `do-it gate stop --json` and read `outcome`. `STOP_ALLOWED` means go to check 5; `STOP_REFUSED` means continue the run with the `reason` it names; `PARKED` means stop and report.
2. Run `do-it next --json` and read the next row: if a finish-line row is still open and no owner question is pending, do that row instead of ending the turn.
3. Run `do-it gate ceiling --status --json`: on `CEILING_BLOCKED` do not spawn another `codex exec`; write the handoff with `do-it handoff` and stop.
4. Run `do-it status --json`: if it lists an owner pack with unanswered questions, send the pack (markdown channel) and park, never guess an answer.
5. Run `do-it gate verify --json`, quote the finish-line counts in the final message, and only then end the turn. After 3 refusals without progress, park and ask the owner (G-9).
