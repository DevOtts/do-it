# 06. Roadmap and open questions

## Releases
| Release | Scope | Done when |
|---|---|---|
| v0.1 | contract + spine core (S1, S3, S5 partly) + meter; `it-result/1` written by build-it and review-it | a fixture feature run reaches DONE through the spine on claude-code |
| v0.2 | back half (deploy-it adapter, conclude-it, reconcile-it), finish-line and stop-gate (S2), owner pack (S4) | the drain fixture closes with zero unaccounted rows |
| v0.3 | presets, router, convergence controller (P4), token policy (P2), cache (P3), codex and opencode adapters (H2, H3), README (R1) | five fixtures pass on three hosts or list exact skips |
| v0.4 | Engine adapter and state stores (N1, N2), Engine-layer conformance (N3), `doctor --migrate` | the W3 `lp_content` replay passes against the Engine spec |
| v2 | Langfuse/LangSmith exporter, Hermes and OpenClaw hosts, cross-harness cache handoff | see docs/implementation/do-it-v2 |

## First vertical slice
`/do-it "<small feature>"` on claude-code: intake -> plan -> ratify via owner pack -> build one slice -> verify with evidence -> conclude, writing `it-result/1` at each stage and a token meter.

## Risks
| Risk | P/I | Mitigation |
|---|---|---|
| Stop-gate loops or annoys | M/H | patience cap 3, parks and asks |
| Headless `claude -p` handoff behaves differently under subscription aliases | M/M | test with the owner's aliases (S5 case); fall back to `ask` mode |
| Codex and OpenCode question tools unusable non-interactively | M/M | markdown fallback is the default path |
| Stage plugins resist the envelope change | M/M | R3 catalog, one change per plugin, shims for old output |
| Token meter wrong on hosts without usage output | H/M | `estimated:true`, never presented as exact |
| Engine R2 unverified; Job start latency unmeasured | M/M | StateStore interface hides it; measure before warm-box decision |
| Prior-art cache figures stale | M/L | re-verify when drivers are written |

## Open (not blocking the build)
Reference video confirmation; which of the 12 Engine dev-squad adjustments to apply (saved, not applied); real exit codes of codex and opencode; Codex and OpenCode stop-gate equivalents; plugin `dependencies` install-time resolution and semver syntax; `.do-it/` under worktrees (recommend main checkout); owner's marketing channels for R1.
