# Agent Tooling Configuration

Read when adding, changing, or removing repository-declared agent tooling: client settings, external tool servers, hooks, or vendored skill and plugin content.

- Discover every agent client and tooling file the repository declares before editing any of them; never invent a client, server, hook, or setting the repository does not already establish.
- Apply a tooling change to every configured client it affects, or state which clients were deliberately left out and why.
- Treat an external tool server or vendored skill as a third-party dependency: verify its source and provenance and pin it as the repository's lockfile requires, under `07-dependencies-and-binaries.md`.
- Keep credentials and tokens out of tooling configuration; supply them through the configured secret mechanism under `08-storage-and-secrets.md`.
- When tooling configuration enforces or cites a routed instruction, update both together so the automation and the rule it represents cannot diverge.
- Resolve changes to permissions, operating limits, or autonomy settings under `03-approval-boundaries.md`.
