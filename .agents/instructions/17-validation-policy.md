# Validation

Read before choosing, running, or reporting validation and before closing changes.

- Run the smallest set of checks that covers the changed behavior and file types.
- A passing run covers only the inputs and dependencies as they stood; after later edits, re-run every affected check after the last relevant change and never report a superseded result.
- Validate docs and instructions with applicable syntax, structure, link, and repository-specific checks.
- Verify structural claims against the working tree rather than Git status, because Git does not track empty directories.
- Do not bypass configured checks with no-verify, ignore, disable, skip, focus, or equivalent directives unless explicitly requested.
