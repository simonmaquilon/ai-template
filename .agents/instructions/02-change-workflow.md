# Change Workflow

Read before every implementation, code change, or reported defect, regardless of size.

- Before code discovery, load `10-code-indexing.md` and `04-sources-and-skills.md`; reading governing instructions and discovery-tool guidance is prerequisite setup, not code discovery.
- Follow this order before editing: query the existing code index under `10-code-indexing.md`; reconcile source with relevant project documentation and official API documentation for the installed or approved target version under `04-sources-and-skills.md`; resolve remaining gaps through targeted index queries and then scoped text searches or direct reads; load and apply relevant implementation skills and tool guidance.
- For a new project or absent index, use the fallback in `10-code-indexing.md` and available requirements, configuration, and approved technology choices; do not require nonexistent source, an index, or an installation to begin authorized work.
- Before the first edit, briefly state the affected scope, supporting evidence, selected skills/tools, and any justified index fallback.
- When the affected scope expands during implementation, repeat discovery and documentation reconciliation for that scope before editing it.
- For a new or expanded capability, assess data, contracts, shared logic, user surfaces, localization, configuration, access rules, failure modes, observability, compatibility, performance, recovery, tests, and documentation before editing; load the routed file governing each affected area and communicate affected areas and material exclusions rather than a checklist of unrelated categories.
- Apply `18-testing-and-coverage.md` to every change that adds, modifies, or fixes executable behavior, including fixes outside a new or expanded capability.
- Establish the cause or review finding under `19-diagnosis-and-review.md` before implementing a reported defect.
- For a reported defect in the maintained product within an authorized change, update its stable `SECURITY.md` record using the register schema; for diagnosis-only requests, report a needed registry update without writing it.
- Keep template-maintenance findings out of primary-reference skeletons intended for derived products; use an existing template-owned register when configured, otherwise report the finding without creating a new register.
- Treat the user's explicit request as a closed scope; do not add, remove, or modify unrelated files without explicit direction.
- Treat every unresolved marker in a primary reference, including `TODO` and bracketed placeholders, as an undecided item: ask only when it materially changes the requested work, and never invent the decision.
- Sweep every usage of a changed name, symbol, key, schema, or contract, including consumers, tests, fixtures, generated files, translations, styles, and documentation.
