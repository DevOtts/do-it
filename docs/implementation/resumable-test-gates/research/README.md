# research/ moved to audit/

The planning research named the pilot consumer repos, so it lives under the package's `audit/` (the only place the
neutral-names scan exempts, do-it 1.1 decision X18). Every `research/<file>` reference in this package resolves to:

| Old path | New path |
|---|---|
| `research/01-do-it-repo.md` | `audit/research/01-do-it-repo.md` |
| `research/02-*.md`, `research/03-*.md` | `audit/research/02-*.md`, `audit/research/03-*.md` |
| `research/PILOT-PATHS.md` | `audit/research/PILOT-PATHS.md` (exports for `PILOT_JEST_REPO`, `PILOT_PYTEST_REPO`, `PILOT_VITEST_REPO`) |
| `research/SHARED-CONTEXT.md` | `audit/research/SHARED-CONTEXT.md` |
| `ENV-FACTS.md`, `ENV-PROBES.json` | `audit/ENV-FACTS.md`, `audit/ENV-PROBES.json` |
