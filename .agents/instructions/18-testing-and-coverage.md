# Testing and Coverage

Read when planning, writing, or executing automated tests.

- Every implementation adding, changing, or fixing executable behavior must include automated tests verifying that behavior.
- Within the project's test root, whatever its name, organize suites under `unit/` (isolated logic), `integration/` (I/O & contracts), `e2e/` (user-visible flows), and `stubs/` (mocks & fixtures).
- Cover behavior at the lowest sufficient level; repeat a critical invariant across levels only when each level exercises a distinct failure boundary.
- Every bug fix requires a regression test reproducing the issue at the level where it was observable.
- Detect test runners, configurations, server commands, and report locations before running tests.
- For browser automation and end-to-end web tests, prefer Playwright when the detected project and runtime support it unless the user explicitly requests another compatible tool; preserve an established browser runner unless its replacement is explicitly requested, and obtain approval under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md` before adding or replacing tooling.
