# Commands and Local Runtime

Read before running repository commands that build, test, format, generate, start, stop, deploy, or otherwise modify project state; managing repository tooling, recovering local services, or writing temporary or ad-hoc artifacts.

- Discover supported commands from repository instructions, `.readme/` documentation, manifests, lockfiles, task runners, and CI; use the repository-owned package manager and version pinning.
- Prefer repository scripts (in manifests or `.scripts/`) over direct tool invocations because scripts own flags, environment, and output locations.
- Never invent a command alias, environment name, retry flag, or release workaround.
- Derive the local application URL from project configuration or startup output; do not switch host or port to bypass a conflict.
- Keep generated lock and integrity files valid; never hand-edit hashes or resolved metadata.
- Confirm service failure or port unresponsiveness with logs or health checks; distinguish local infrastructure crashes from application code bugs.
- Identify the exact listening process using the platform's available read-only process and port inspection capabilities and verify it belongs to this repository before stopping it with the platform-supported graceful termination mechanism.
- Restart using the repository-owned dev command without changing host/port, wait for readiness, and resume validation.
- Before a test run that starts long-lived processes, clear the ones a previous interrupted run left behind, using a repository-owned command for that cleanup when one exists.
- After interrupting a run or observing one end abnormally, clear the processes it left behind instead of leaving them holding ports, connections, or memory.
- For configured browser automation, follow the applicable skills and project configuration for runtime installation and cache locations; keep repository-managed downloads in an ignored tool-specific directory under `.temp/`, use consistent paths for installation and execution, and preserve system-managed browser installations.
- Keep repository-owned temporary outputs, logs, backups, and ad-hoc artifacts inside `.temp/`; remove task-specific artifacts before closing, preserve ignored caches explicitly configured for repository tools, and never turn tool-managed operating-system temp into a durable project location.
