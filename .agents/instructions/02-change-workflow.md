# Change Workflow

Read before the first edit of a normal or risk change, and whenever its criteria, contracts, or scope must change.

- Locate the affected code through the project's code index or language server when it has one, otherwise through scoped searches, then reconcile it with the relevant project documentation and the official documentation of the APIs involved.
- For a new project or missing source, start from the available requirements, configuration, and approved technology choices without requiring an index or an installation.
- Before the first edit, state the affected scope, its evidence, and the skills or tools selected, and repeat discovery for any scope the work later expands into.
- For a new or expanded capability, assess data, contracts, shared logic, user surfaces, localization, configuration, access rules, failure modes, observability, compatibility, performance, recovery, tests, and documentation, load the module of each affected area, and state the affected areas and material exclusions.
- Sweep every usage of a changed name, symbol, key, schema, or contract, including consumers, tests, fixtures, generated files, translations, styles, and documentation, starting from index or language-server references and completing them with scoped literal searches.
- Before the first edit, write the specification in the conversation: the objective, the acceptance criteria, the exclusions a reader could expect included, and the contracts and data affected, stating none when none are.
- State each criterion as an observable outcome of a given input or state, never as an implementation step or an unverifiable quality, and name the check that proves it: an automated test, a command, or a runtime observation with its route, state, and viewport.
- Derive criteria from the request and, where the change touches them, from `.docs/product.md`, the observable criteria of `.docs/design.md`, and the `.docs/backlog.md` entry being delivered; a criterion that contradicts them is an open decision.
- Name the `.docs/coverage.md` requirement or journey each criterion covers when the register records one.
- Risk: also state as preservation criteria, each with its check, the working behavior the change can affect, including the callers found in discovery and the fixes `.docs/bugs.md` records for the area; when the change extends or reorders that behavior, state the expected result after the change.
- Risk: record the task's base revision and authorized paths in the specification.
- Do not edit until every criterion names its check, no material decision is open, and the specification contradicts none of its sources.
- Keep the specification in the conversation; write a separate plan only when the user asks for one, under `.temp/plans/`.
- When implementation or verification shows that a criterion, a contract, or the scope must change, stop editing that behavior and revise the specification; ask before a revision that drops or weakens a criterion the user stated, widens the scope, or changes an external contract, and state every other revision.
