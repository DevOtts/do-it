## T-N2-04 live (conformance, engine backend, rows driver, PR #727 b901a9bd local)
ok   12 getBlob of an unknown or malformed key fails closed
PASS 12/12
backend: engine, driver: rows, real: true, root: engine-run-rows

## T-N1-16/17/18 + T-N3-14 + T-R4-05 live
# VERDICT T-N1-16 VERIFIED card 6ad0172f8b41e00dfb9848e5
# VERDICT T-N1-17 VERIFIED
# VERDICT T-N1-18 VERIFIED
# VERDICT T-N3-14 IMPLEMENTED-NOT-VERIFIED engine gap: inject and state verified for 5 cards (round trip ok); no do-it W3 pipeline is installed on this Engine, so the cards are never run and 5 expected outcomes (run_status/exit_code) cannot be compared. injected={"happy":{"task_id":"6ad0172e8b41e00dfb9848c5","created":true,"replay_same_id":true,"status":"todo","external_ref":{"system":"do-it","id":"card-lp-content-1"}},"stale-head":{"task_id":"6ad0172f8b41e00dfb98490d","created":true,"replay_same_id":true,"status":"todo","external_ref":{"system":"do-it","id":"card-stale-head"}},"budget-denied":{"task_id":"6ad0172f8b41e00dfb984936","created":true,"replay_same_id":true,"status":"todo","externa
ok 5 - T-R4-05 sandboxes equal slices needing a build (D16) [REAL] # SKIP IMPLEMENTED-NOT-VERIFIED: Engine reachable at http://localhost:3001 but Engine PR \#727 only injects cards and reads their state: no do-it W3 pipeline or drain is installed, so no card runs and no sandbox is created to sample (sampler and check are ready in tests/e2e/lib/worktrees.mjs)
