# Validation and Testing

Read before validating or testing a normal or risk change, before debugging or reviewing, and whenever a check fails.

- Verify every acceptance criterion through the check its specification names, with evidence observed after the last relevant edit; a criterion without passing evidence is unmet.
- Run the smallest set of checks covering the changed behavior, file types, and preservation criteria, plus every check the project requires for that scope; an interrupted run or one whose final summary was not observed has no result, and a later relevant edit supersedes earlier passes.
- Before validating against a local environment, confirm that the state it depends on matches what the repository declares: applied schema changes, configuration key names, generated artifacts, and provisioned resources.
- When no supported check covers a change, perform the closest runtime or manual verification and report it as such.
- Validate documentation and instructions with the repository's link, cited-path, structure, and syntax checks.
- Resolve the error-level language-server diagnostics a change introduces unless the server cannot use the project's language version; diagnostics add to the configured checks and never replace them.
- A command the environment blocked never ran: name the restriction and the coverage it left open, and propose a durable sandbox exemption instead of working around it.
- Add automated tests for every new, changed, or fixed executable behavior when the project has a compatible test harness, writing each before the implementation and seeing it fail for the expected reason; a test for preserved behavior passes before and after.
- Without a compatible harness, add no testing infrastructure without approval: verify by the closest means, report the gap, and ask when automated coverage is material to acceptance.
- A fix of executable behavior needs a regression test that reproduces the defect at the observable level, serves as the check of the fix's first criterion, and cites the stable `BUG-…` identifier as the suite's convention does.
- Cover behavior at the lowest sufficient level, with end-to-end coverage only for behavior that depends on real browser navigation, rendering, or client-server integration; agent-operated browser sessions verify interactively and never count as automated coverage.
- Keep tests deterministic and isolated: control time, randomness, external dependencies, mutable state, and order, and never depend on production data or services.
- When removing or rewriting tests, keep every assertion whose behavior survives, adapted to the new interface, and add or replace test tooling only with approval.
- Before a run that starts long-lived processes, clear only those an abandoned run left; treat runs that seed or mutate shared local state as mutually exclusive across sessions, asking when one may be in progress, and clear what an interrupted run leaves behind.
- Before fixing an unmet criterion, establish its cause with exact evidence or label it a hypothesis.
- Risk: state each fix directive with the criterion, evidence, cause, minimal fix, and check to rerun.
- A cycle is one fix applied and its check rerun: when the same failure follows two fixes without a new confirmed cause, diagnose instead of fixing, and stop fixing a criterion after three cycles.
- A loop stopped without success leaves the change unvalidated: report each unmet criterion with its evidence, the fixes tried, and the open hypothesis.
- Resolve every failure the change introduced before reporting it complete; a failure counts as introduced until its cause is attributed elsewhere, and other observed failures are reported as blockers or known gaps.
- When debugging or reviewing, cite exact file and line or runtime evidence, separate confirmed failures from hypotheses, rank findings by impact, likelihood, scope, and confidence, stay within the reviewed scope, outline the concrete fix, and remove temporary debugging output before finishing.
