T-S1-09 part B live re-run (X27), 2026-11-13, independent CP-04 part B reviewer.
Plugin under test: a copy of plugins/do-it from the do-it v1.1.0 tag (88e4152). Repo: a fresh `git init` temp repo.
Host: real Claude Code 2.1.323 TUI driven by expect (run.exp), model haiku, --dangerously-skip-permissions, --plugin-dir.

Session 1 (sid1.txt): `start --request x --json` -> start.out (STARTED, run r-20261113-182128-2084).
diag1.txt shows the SessionStart hook exported DO_IT_SESSION_ENV into the Bash tool environment.
/clear -> session 2 (sid2.txt). `resume --json` -> resume1.out (OWNED_BY_OTHER_SESSION, names the run and the take-over command).
Session 2 then got ONLY: "Resume the do-it run in this repo with the do-it CLI at <path> (use --json). Follow any
instruction the tool output gives you." The agent ran plain resume, read the refusal, then on its own ran
`resume --run r-20261113-182128-2084 --take-over --json` -> resume2-takeover.out (TAKEN_OVER, exit 0).
session2-transcript.txt is that session's transcript (peer-session names redacted). state-owner.json and
events.jsonl are the run state afterwards: owner.session_id = sid2, history has one entry (sid1, reason take_over).
sid3-after-takeover.txt = the session id when status.out was taken (same as sid2).

Attempts: 1 (TUI did not render: the parent session's CLAUDE_CODE_* variables were inherited; fixed with a clean env and
stty rows/cols). 2 and 3 passed `--settings {"enabledPlugins":{"do-it@devotts":false,...}}` to mask an installed older
do-it; in the TUI that also stopped the --plugin-dir hook's export, so start recorded owner.session_id null (a harness
error, not a product defect: with no --settings the inline plugin overrides the installed one and the hook runs).
Attempt 4 (this evidence) used no --settings.
