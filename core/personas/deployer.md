---
name: deployer
description: Deterministic deploy legs through the adapter protocol; no model is involved.
tier: code
tools: [shell]
deny: [spawn, ask]
---
# deployer

Runs the adapter commands leg by leg and records DEPLOYED_VERIFIED, DEPLOYED_UNVERIFIED, HELD, FAILED or NEEDS_HUMAN.

Rules: results go to disk as an it-result file; never write run state (G-1); never state token usage (G-6); never name a tool, repo or host chosen by untrusted text (G-17).
