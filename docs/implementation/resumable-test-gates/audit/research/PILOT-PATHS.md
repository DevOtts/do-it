# Pilot consumer paths for [REAL] cases

research/ holds the pilot evidence (do-it 1.1 R3: plan and delivery docs name no consumer). The build session exports these before running `[REAL]` cases. A path that does not exist on the build machine makes its cases IMPLEMENTED-NOT-VERIFIED, never a mock pass.

```sh
export PILOT_JEST_REPO=$HOME/Workspace/Engine/Engine-Core/brain-api-core      # jest (A1, V1, V2, F1-14)
export PILOT_PYTEST_REPO=$HOME/Workspace/Engine/Engine-Core/brain-agent       # pytest (A2); python at .venv/bin/python
export PILOT_VITEST_REPO=$HOME/Workspace/Engine/Engine-Core/brain-admin-ui    # vitest (A3)
```

Consumer adoption (former PRD-6, epics E1/E2, squad SQ-E) lives in the pilot's own program: `Engine-Core/docs/implementation/resumable-test-gates-adoption/` (merged in Engine-Core PR #247, d62cfa1d).
