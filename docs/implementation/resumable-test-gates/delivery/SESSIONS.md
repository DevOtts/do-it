# SESSIONS — planning squads (orchestrator+squads)

Legend: G-n governance rule · T-<EID>-NN test case · Wn wave · Rn default · Dn ruling — see GLOSSARY.md

| Squad | Model tier | Agent id (SendMessage address) | Lane | Files |
|---|---|---|---|---|
| SQ-A1 | T1 (opus) | ac4ab0c11301d979f | store | prds/prd-1-store-fingerprint.md, epics/epics-1-store-fingerprint.md |
| SQ-A2 | T1 (opus) | ad73b4f8c3d95a50a | verdict | prds/prd-2-gate-run-verdict.md, epics/epics-2-gate-run-verdict.md |
| SQ-B | T2 (sonnet) | aee16e69d7c01cb3f | adapters | prds/prd-3-runner-adapters.md, epics/epics-3-runner-adapters.md |
| SQ-C | T1 (opus) | a73ff1dade1a71ff9 | queue | prds/prd-4-gate-queue.md, epics/epics-4-gate-queue.md |
| SQ-D | T2 (sonnet) | a69739553387d2e19 | stages | prds/prd-5-settings-stages.md, epics/epics-5-settings-stages.md |

Discovery agents (read-only, research/): 01 do-it repo T2 (sonnet), 02 pilot consumer gates T2 (sonnet), 03 runners and
fingerprint T1 (opus). Squads are planning-only and are reaped at handoff; the build runs in a fresh session.
