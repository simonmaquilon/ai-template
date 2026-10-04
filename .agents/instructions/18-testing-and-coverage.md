# Testing and Coverage

Read when planning, writing, or executing automated tests, deciding the test level a change needs, or recording coverage, gaps, or manual or agent-operated verification.

- Every implementation adding, changing, or fixing executable behavior must include automated tests when the project has a compatible test harness.
- When no compatible test harness exists, do not introduce testing infrastructure without authorization under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md`; verify under the closest-verification rule of `17-validation-policy.md`, report the testing gap, and request a decision when automated coverage is material to acceptance.
- Place tests and fixtures according to established project structure, framework conventions, and applicable testing skills; distinguish unit, integration, and end-to-end coverage without imposing directory names or relocating existing suites.
- Distinguish repository-owned end-to-end suites, which are reproducible, run through the project's runner and in continuous integration when configured, and count as automated coverage, from agent-operated browser sessions, which verify behavior interactively and never count as automated coverage.
- Keep automated tests deterministic and isolated by controlling time, randomness, external dependencies, mutable state, and execution order; use project-owned fixtures or test environments and never depend on production data or services.
- Cover behavior at the lowest sufficient level; repeat a critical invariant across levels only when each level exercises a distinct failure boundary.
- Require end-to-end coverage for changed behavior that depends on real browser navigation, rendering, or client-server integration that no lower level can certify; when no compatible harness exists, the missing-harness fallback above applies.
- Preserve configured coverage thresholds and gates; do not lower thresholds, exclude affected code, or narrow required measurement scope to obtain a passing result without explicit authorization, and report available coverage changes when material.
- When a change removes or rewrites tests, keep every assertion whose behavior survives the change, adapted to the new interface, and remove only the assertions that exercised retired behavior.
- Fixes to executable behavior require a regression test reproducing the issue at the observable level when a compatible test harness exists; otherwise apply and report the fallback above; documentation and instruction corrections need no regression test and follow `17-validation-policy.md` instead.
- A regression test for a bug recorded in `BUGS.md` cites its `BUG-…` identifier following the suite's convention, and that bug's `BUGS.md` evidence names the test.
- Detect test runners, configurations, server commands, and report locations before running tests.
- Take the adopted validation strategy from `PLAN.md`, test tooling decisions from `STACK.md`, and the runnable truth from delivered configuration; report material disagreement under `04-sources-and-skills.md`.
- Update `TESTS.md` under `21-document-maintenance.md` when a change alters the automated coverage of a requirement or journey, leaves a gap, substitutes manual or agent-operated verification for automated verification, or moves a test into or out of quarantine, without enumerating individual tests.
- For repository-owned end-to-end suites, use applicable testing skills and project configuration to select a compatible existing runner; preserve established tooling unless replacement is explicitly requested, and obtain approval under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md` before adding or replacing tooling.
