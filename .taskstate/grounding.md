# grounding
Repo /Users/macbook/Workspace/Devotts/do-it, base commit 9576d151 (planning package). CONTRACT sha256 e9a485e2...8e5d verified; gate-check handoff PASS, 352 IDs/19 files.
gate-check: node /Users/macbook/Workspace/Devotts/plan-it/scripts/gate-check.mjs {handoff|adversary} delivery/
DoD = every case in delivery/epics/epics-{1..5}-*.md (S1-S5,P1-P4,H0-H3,N1-N3,R1-R4), VERIFIED w/ run output or IMPLEMENTED-NOT-VERIFIED(reason) for [REAL] unreachable.
Verification path: each lane has local tests (CONTRACT A2); node 22 available; hosts CLIs probed per docs/research/11-host-cli-probe.md.
Fences: no edits to Engine-Core outside docs/implementation/do-it-engine-layer/; no sibling plugin repo edits; never read ~/.config/opencode/opencode.jsonc; .secrets never printed.
