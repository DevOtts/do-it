# Squad plan (names / model / scope)
| Worker | Model | Wave | Epics | Branch |
| spine-w0 | sonnet | W0 | S1,S3 | epic/S1-state, epic/S3-evidence |
| hosts-w0 | sonnet | W0 | H0 | epic/H0-interface |
| ship-w0 | sonnet | W0 | R2 | epic/R2-shell |
| spine-w1 | sonnet (S2 stop-gate: opus on fail) | W1 | S2,S5 |
| economy-w1 | sonnet | W1 | P2 |
| hosts-w1 | sonnet (H1 handoff: opus on fail) | W1 | H1 |
| ship-w1 | sonnet | W1 | R4 skeleton |
| W2: spine S4; economy P1,P4(opus-on-fail); hosts H2,H3; engine N2 ; W3: P3,N1,N3,R3 ; W4: R1,R4 completion, release gates
Per wave: merge -> integration gate -> /review-it style fresh verifier (haiku/sonnet reads results+reruns tests) -> /iterate on failures -> STATUS update -> next wave.
Ping: ScheduleWakeup fallback ~10-20 min while workers run; resume from .taskstate/ + delivery/STATUS.md.
