# Agent Tooling Configuration

Read when adding, changing, or removing repository-declared agent tooling: client settings, external tool servers, hooks, or vendored skill and plugin content.

- Discover every agent client and tooling file the repository declares before editing any of them; never assume a client, server, hook, or setting the repository does not declare, and add one only as an authorized change.
- Apply a tooling change to every configured client it affects, or state which clients were deliberately left out and why.
- Keep repository-declared agent tooling working on each operating system the repository supports, or declare the excluded systems and the reason in the agent-tooling `.readme/` documentation.
- Treat an external tool server, client-installed plugin, or vendored skill as a third-party dependency under `07-dependencies-and-binaries.md`, pinned as far as its lockfile or client configuration allows, unless the `.readme/` document that configures it records a decision to follow upstream releases.
- Before invoking or accepting a newly vendored, enabled, or updated skill or plugin, review the tool pre-approvals, hooks, and permissions it declares for itself or its installer writes into client configuration under `03-approval-boundaries.md`.
- Record each accepted self-granted permission, with what it actually allows, in the agent-skills `.readme/` document under `21-document-maintenance.md`.
- Keep credentials and tokens out of tooling configuration; supply them through the configured secret mechanism under `08-storage-and-secrets.md`.
- When tooling configuration enforces or cites a routed instruction, update both together so the automation and the rule it represents cannot diverge.
- Give every repository-declared hook the routed rule it enforces, cite that rule in its message, and register it in the agent-hooks `.readme/` document; register a third-party hook there as a declared exception, stating why its command differs per client.
- Once authorized under `03-approval-boundaries.md`, declare a command the sandbox cannot confine through the client's documented exemption mechanism; when the client has none, report the gap instead of widening session-wide limits.
- Resolve changes to permissions, operating limits, or autonomy settings under `03-approval-boundaries.md`.
