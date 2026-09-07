# Security and Trust Boundaries

Read before changing authentication, authorization, externally reachable surfaces, sessions, permissions, sensitive operations, untrusted data ingestion, or audit behavior.

- Identify actors, trust boundaries, data classifications, attacker-controlled inputs, privileged operations, and authoritative enforcement points from primary references, configuration, and source before editing.
- Enforce authentication and authorization at the server, service, or data boundary that controls the protected operation; client-side checks support user experience but never establish access.
- Validate and normalize untrusted input at its entry boundary, encode output for its destination context, and use established safe APIs for queries, commands, serialization, and dynamic content.
- Apply least privilege and deny-by-default behavior to roles, permissions, credentials, network access, and data scopes; make every grant explicit and traceable to product intent.
- Prevent cross-user, cross-tenant, and object-ownership access by deriving authorization from trusted identity and authoritative relationships rather than caller-supplied ownership claims.
- Evaluate replay, idempotency, rate-abuse, and resource-exhaustion risks when the affected operation can be repeated or externally triggered; apply operational retry, backpressure, capacity, degradation, and isolation controls under `24-runtime-reliability-and-observability.md`.
- Protect secrets, personal data, logs, errors, and diagnostic evidence under `08-storage-and-secrets.md`; expose only the minimum information required by the caller and operator.
- Test authorized success, unauthenticated access, insufficient privilege, invalid input, ownership boundaries, and applicable abuse cases at the lowest effective level under `18-testing-and-coverage.md`.
- Record applicable security risks, vulnerabilities, accepted exceptions, remediation status, and validation evidence in `SECURITY.md`, and security design decisions in `PLAN.md`, under `21-document-maintenance.md` and without including secrets or unnecessary exploit details.
