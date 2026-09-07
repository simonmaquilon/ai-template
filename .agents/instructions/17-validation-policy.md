# Validation

Read before choosing, running, or reporting validation and before closing changes.

- Validate every change against the behavior and file types it touched before reporting it complete; when no supported check covers them, perform the closest available runtime or manual verification instead of skipping validation.
- Run the smallest set of checks that covers changed behavior and file types, plus every check explicitly required by the project for that scope; selecting relevant suites through supported runner options is allowed.
- A passing run covers only the inputs and dependencies as they stood; after later edits, re-run every affected check after the last relevant change and never report a superseded result.
- Validate docs and instructions with applicable syntax, structure, link, and repository-specific checks.
- Verify structural claims against the filesystem rather than version-control status, which may omit empty directories or ignored content.
- Do not bypass mandatory checks or suppress failures with bypass flags, disabled tests, persistent focus markers, or exclusions unless explicitly requested; targeted validation does not authorize omitting a required gate.
- Resolve a failure the change introduced before reporting the change complete; report every other observed failure, including pre-existing failures outside the authorized scope, as a blocker or known gap under `20-response-and-reporting.md` rather than presenting the change as validated.
- A command the execution environment blocked never ran: do not report it as passing or failing, name the restriction and the coverage it left open under `20-response-and-reporting.md`, and propose a durable exemption under `28-agent-tooling-configuration.md` instead of working around it run by run.
