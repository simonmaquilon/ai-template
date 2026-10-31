# Security and Data

Read before changing authentication, authorization, trust boundaries, sessions, permissions, untrusted input, audit behavior, secrets, storage, sensitive or persisted data, schemas, or migrations.

- Identify the actors, trust boundaries, data classifications, attacker-controlled inputs, privileged operations, and enforcement points, and for data changes the schema owners, readers, writers, invariants, volume, deployment order, compatibility window, and recovery path, from primary references, configuration, and source.
- Consult only the configured security guidance that applies to the change before editing, and before acting on an edit-hook warning check input ownership, reachable sinks, and existing mitigations.
- Enforce authentication and authorization at the server, service, or data boundary of the protected operation, from trusted identity and authoritative relationships, never caller-supplied ownership; client checks only support the experience.
- Validate and normalize untrusted input at its entry, encode output for its destination, and use safe APIs for queries, commands, serialization, and dynamic content.
- Apply least privilege and deny-by-default to roles, permissions, credentials, network access, and data scopes, each grant explicit and traceable to product intent.
- Evaluate replay, idempotency, rate abuse, and resource exhaustion for operations that can be repeated or triggered externally, and expose only the minimum information callers and operators need in responses, logs, and errors.
- Discover storage bindings, retention, environment scopes, and classifications from configuration without inventing names; route real secret creation, rotation, and deletion through the configured workflow.
- Minimize sensitive data, keep its classification across logs, fixtures, backups, exports, replicas, and environments, apply its documented encryption, retention, deletion, residency, and access requirements, and keep secret and sensitive values out of validation output.
- Keep readers and writers compatible while versions coexist, staging expansion, backfill, verification, and contraction when an atomic change is unsafe, and keep related writes atomic or with documented compensation and idempotent retries.
- Make backfills bounded, restartable, observable, and safe under partial completion.
- Never delete, truncate, overwrite, or irreversibly transform persisted data without explicit authorization and a verified recovery path.
- Validate migrations and backfills on synthetic or sanitized data, checking preconditions, postconditions, counts, invariants, compatibility, and recovery; apply them only to isolated disposable environments during validation, and to shared, remote, or persistent ones only with explicit authorization, stopping on failed invariants.
- Test authorized success, unauthenticated access, insufficient privilege, invalid input, ownership boundaries, and applicable abuse cases at the lowest effective level.
- Before completing, review the change's whole security-relevant diff, including commits since the recorded base and staged, unstaged, and new files, reading related source only to resolve input-to-sink paths and controls.
- Report each finding with its location, input-to-sink path, boundary, impact, and smallest correction, separating confirmed issues, hypotheses, and hardening advice; a quiet detector or empty review proves nothing.
- Run a full security audit only on explicit request, and for reproductions enforce the review capability's isolation and evidence requirements, reporting the gap when they are unavailable.
- Record vulnerabilities and advisories with remediation, exceptions, and evidence in `.docs/security.md`, decided security design in `.docs/plan.md`, and undecided risks in `.docs/backlog.md`, without secrets or needless exploit detail.
