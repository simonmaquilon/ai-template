# Contracts and Automation

Read before changing APIs, events, other shared contracts, or automation.

- For a contract, identify its canonical definition, owners, producers, consumers, transport, versioning, and rollout constraints before editing.
- Preserve documented contract behavior, including field meaning, required and optional semantics, defaults, nullability, identifiers, ordering, statuses, and errors, unless an authorized migration changes it; prefer additive evolution and tolerant readers, keeping unknown fields when round-tripping requires it.
- Treat removals, renames, type or semantic changes, stricter validation, and altered defaults or errors as breaking: they need explicit authorization and defined deprecation, consumer migration, rollout, rollback, and removal criteria before implementation.
- Use only the established versioning scheme, keep compatibility while old and new producers and consumers coexist through retries, duplicates, reordering, and partial rollout, and validate both sides of each contract with contract or integration tests and representative fixtures.
- Discover the automation platform, workflows, triggers, required checks, and targets before changing them, and have workflows invoke repository scripts or manifest commands; disabling or retriggering automation, or configuring it to deploy, mutate remote systems, or transform data, needs explicit authorization.
- Supply automation credentials only through the platform's secret store, and pin reusable actions by immutable reference and images, runners, runtimes, and tools at least to a release line.
