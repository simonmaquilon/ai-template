# Commands and Local Runtime

Read before running commands, managing repository tooling, or recovering local services.

- Discover supported commands from repository instructions, manifests, lockfiles, task runners, and CI; use the repository-owned package manager and version pinning.
- Prefer repository scripts (in manifests or `.scripts/`) over direct tool invocations because scripts own flags, environment, and output locations.
- Never invent a command alias, environment name, retry flag, or release workaround.
- Derive the local application URL from project configuration or startup output; do not switch host or port to bypass a conflict.
- Keep generated lock and integrity files valid; never hand-edit hashes or resolved metadata.
- Confirm service failure or port unresponsiveness with logs or health checks; distinguish local infrastructure crashes from application code bugs.
- Identify the exact listening process using read-only tools (`lsof` or the platform equivalent) and verify it belongs to this repository before stopping it with the platform-supported graceful termination mechanism.
- Restart using the repository-owned dev command without changing host/port, wait for readiness, and resume validation.
- When Playwright is configured, set `PLAYWRIGHT_BROWSERS_PATH` to the repository's `.temp/playwright-browsers/` directory for both browser installation and test execution, keep that directory ignored by Git, and treat branded Chrome or Edge installations as system-managed exceptions.
- Keep repository-owned temporary outputs, logs, backups, and ad-hoc artifacts inside `.temp/`; remove task-specific artifacts before closing, preserve ignored caches explicitly configured for repository tools, and never turn tool-managed operating-system temp into a durable project location.
