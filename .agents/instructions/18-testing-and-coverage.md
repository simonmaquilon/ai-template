# Testing and Coverage

Read when planning, writing, or executing automated tests.

- Every implementation adding, changing, or fixing executable behavior must include automated tests when the project has a compatible test harness.
- When no suitable test harness exists, do not introduce testing infrastructure without authorization under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md`; use the closest supported static or runtime validation, report the testing gap, and request a decision when automated coverage is material to acceptance.
- Place tests and fixtures according to established project structure, framework conventions, and applicable testing skills; distinguish unit, integration, and end-to-end coverage without imposing directory names or relocating existing suites.
- Keep automated tests deterministic and isolated by controlling time, randomness, external dependencies, mutable state, and execution order; use project-owned fixtures or test environments and never depend on production data or services.
- Cover behavior at the lowest sufficient level; repeat a critical invariant across levels only when each level exercises a distinct failure boundary.
- Preserve configured coverage thresholds and gates; do not lower thresholds, exclude affected code, or narrow required measurement scope to obtain a passing result without explicit authorization, and report available coverage changes when material.
- Fixes to executable behavior require a regression test reproducing the issue at the observable level when a compatible test harness exists; otherwise apply and report the fallback above; documentation and instruction corrections need no regression test and follow `17-validation-policy.md` instead.
- Detect test runners, configurations, server commands, and report locations before running tests.
- Take adopted validation strategy and test tooling decisions from `PLAN.md` and the runnable truth from delivered configuration; report material disagreement under `04-sources-and-skills.md`.
- For browser automation and end-to-end web tests, use applicable testing skills and project configuration to select a compatible existing runner; preserve established tooling unless replacement is explicitly requested, and obtain approval under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md` before adding or replacing tooling.
