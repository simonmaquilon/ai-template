# Contracts and Compatibility

Read before changing APIs, events, messages, webhooks, command interfaces, configuration schemas, serialized formats, generated clients, or any contract shared across components, versions, repositories, or external consumers.

- Identify the canonical contract, owners, producers, consumers, transport, versioning policy, compatibility window, and rollout constraints from primary references, configuration, and source before editing.
- Preserve documented behavior, field meaning, required and optional semantics, defaults, nullability, identifiers, ordering guarantees, status outcomes, and error contracts unless an authorized migration changes them.
- Prefer additive evolution and tolerant readers; define writer behavior explicitly and preserve unknown fields when the established contract requires round-trip compatibility.
- Treat removals, renames, type changes, semantic changes, stricter validation, and altered defaults or errors as breaking until compatibility evidence proves otherwise.
- Require explicit authorization under `03-approval-boundaries.md` for breaking changes and define deprecation, consumer migration, rollout, rollback, and removal criteria before implementation.
- Use only the established versioning and negotiation scheme; do not invent a parallel version channel, compatibility flag, or undocumented fallback.
- Preserve compatibility while old and new producers or consumers can coexist, including asynchronous delivery, retries, duplication, reordering, and partial rollout where applicable under `24-runtime-reliability-and-observability.md`.
- Validate both sides of each affected contract with schema, contract, integration, or compatibility tests and representative fixtures under `18-testing-and-coverage.md`.
- Update canonical definitions, generated artifacts, types, fixtures, consumers, and owning documentation together; regenerate derived output under `14-code-authoring.md`.
- Apply data classification and exposure rules under `08-storage-and-secrets.md` and trust-boundary rules under `22-security-and-trust-boundaries.md` to every added or changed field and operation.
