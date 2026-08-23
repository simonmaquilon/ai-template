# Change Workflow

Read before starting a new or expanded capability, a broad change, or handling a reported defect.

- For a new or expanded capability, enumerate the relevant data, contracts, shared logic, user surface, localized assets, configuration, access rules, tests, and docs; mark each as applicable or not applicable with one reason before editing.
- Establish the cause or review finding under `19-diagnosis-and-review.md` before implementing a reported defect.
- For a reported defect within an authorized change, create or update its stable `SECURITY.md` record with the affected component and version, severity, security impact, status, owner, evidence, and fixed version when resolved; for diagnosis-only requests, report the pending registry update without writing it.
- Preflight: identify the files to touch and keep the edit within the requested scope.
- Treat the user's explicit request as a closed scope; do not add, remove, or modify unrelated files without explicit direction.
- Treat every `TODO` in a primary reference as unresolved: ask only when it materially changes the requested work, and never invent the decision.
- Sweep every usage of a changed name, symbol, key, or contract, including tests, fixtures, generated files, translations, styles, and documentation.
