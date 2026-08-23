# Storage and Secrets

Read when touching storage, buckets, media, sensitive data, credentials, environment files, or secrets.

- Discover storage bindings, retention, environment scopes, and data classifications from repository configuration; never invent bucket or variable names.
- Store secrets only through ignored local files or the configured remote secret store; never commit secret-bearing content.
- Never open, display, copy, or edit the contents of secret environment files; approved repository processes may load them without exposing values, example files may contain placeholders, and users supply real values through the approved secret workflow.
- Preserve least-privilege access and avoid logging secret or sensitive values during validation.
