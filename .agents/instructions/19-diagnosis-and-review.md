# Diagnosis and Review

Read when debugging, reviewing, or auditing code, configuration, documentation, instructions, or runtime behavior.

- When the request asks only for diagnosis, review, or audit, deliver findings rather than changes; obtain authorization under `03-approval-boundaries.md` before editing source, configuration, or project documents to apply a fix.
- Establish the confirmed cause or review evidence using exact source, configuration, documentation, test, or runtime citations; distinguish verified failures from unconfirmed hypotheses.
- Report each finding clearly: state the issue or risk, provide the exact file and line or runtime evidence, protect secrets and sensitive data under `08-storage-and-secrets.md`, omit unnecessary exploit details, and outline the concrete fix.
- Prioritize findings by impact, likelihood, affected scope, and evidence confidence; distinguish correctness, security, reliability, and compatibility defects from optional maintainability or style suggestions, and omit preference-only findings unless requested.
- Keep findings strictly within the reviewed scope and clean up all temporary debugging logs or traces before finishing.
