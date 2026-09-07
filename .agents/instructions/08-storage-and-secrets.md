# Storage and Secrets

Read when touching storage, buckets, media, sensitive data, credentials, environment files, or secrets.

- Discover storage bindings, retention, environment scopes, and data classifications from repository configuration; never invent bucket or variable names.
- Store secrets only through configured secret mechanisms appropriate to the environment, including ignored local files, local credential stores, and remote, integration, or platform secret stores; never commit secret-bearing content.
- Never open, display, copy, log, or directly edit secret values; approved repository processes may consume them without exposing their contents.
- Inspect or change variable names, schemas, placeholders, and non-sensitive configuration through example files, documented configuration, or supported tooling; route real value creation, rotation, and deletion through the configured secret workflow.
- Minimize collection and copying of sensitive data; preserve its classification across logs, fixtures, backups, exports, replicas, and environments, and never move it to a less protected scope without authorized controls.
- Apply the documented encryption, retention, deletion, residency, and access requirements for each data classification, and validate affected lifecycle operations without exposing real sensitive values.
- Restrict storage and secret access to the required scopes and environments, and ensure validation output contains no secret or sensitive values.
