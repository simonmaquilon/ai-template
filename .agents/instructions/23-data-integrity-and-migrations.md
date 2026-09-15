# Data Integrity and Migrations

Read before changing persistent schemas, migrations, backfills, transactional workflows, stored-data transformations, or compatibility between data readers and writers.

- Identify the authoritative schema, owners, readers, writers, invariants, data volume, deployment order, compatibility window, and verified recovery mechanism from primary references, configuration, and source before editing.
- Preserve backward and forward compatibility while multiple application or schema versions can coexist; use staged expansion, backfill, verification, and contraction when an atomic change is unsafe.
- Preserve atomicity and consistency for related writes through established transaction boundaries or documented compensating behavior; define retry and idempotency semantics for interruptible operations.
- Make backfills bounded, restartable, observable, and safe under partial completion; avoid unbounded memory, locks, or write amplification that can disrupt production workloads.
- Do not delete, truncate, overwrite, or irreversibly transform persisted data without explicit authorization under `03-approval-boundaries.md` and a verified recovery path.
- Validate migrations and backfills against synthetic or sanitized representative data before application; verify preconditions, postconditions, row or object counts, invariants, compatibility, and recovery behavior, and apply `08-storage-and-secrets.md` to any authorized sensitive sample.
- Apply migrations to a configured disposable local or test environment only when it is isolated from shared or persistent data and the execution is part of authorized validation.
- Require explicit authorization under `03-approval-boundaries.md` before applying migrations to remote, shared, or persistent environments; record execution evidence without sensitive data and stop on failed invariants rather than continuing with partial assumptions.
- Apply data classification, encryption, retention, deletion, and environment controls under `08-storage-and-secrets.md`, and record applicable risks or remediation evidence in `SECURITY.md` under `21-document-maintenance.md`.
