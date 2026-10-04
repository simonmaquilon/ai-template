# Commands and Local Runtime

Read before running repository commands that build, test, format, generate, start, stop, deploy, or otherwise modify project state; managing repository tooling, recovering local services, operating agent-operated browser sessions, or writing temporary or ad-hoc artifacts.

- Discover supported commands from repository instructions, `.readme/` documentation, manifests, lockfiles, task runners, and CI; use the package manager that `STACK.md` names and the repository's version pinning.
- Prefer repository scripts (in manifests or `.scripts/`) over direct tool invocations because scripts own flags, environment, and output locations.
- Never invent a command alias, environment name, retry flag, or release workaround.
- Derive the local application URL, including the one agent-operated browser sessions open, from project configuration or startup output; do not switch host or port to bypass a conflict.
- Keep generated lock and integrity files valid; never hand-edit hashes or resolved metadata.
- Confirm service failure or port unresponsiveness with logs or health checks; distinguish local infrastructure crashes from application code bugs.
- Identify the exact listening process using the platform's available read-only process and port inspection capabilities and verify it belongs to this repository before stopping it with the platform-supported graceful termination mechanism.
- Restart using the repository-owned dev command without changing host/port, wait for readiness, and resume validation.
- Before a test run that starts long-lived processes, determine whether the ones already listening belong to an abandoned run or to a run still in progress, and clear only the abandoned ones, using a repository-owned command for that cleanup when one exists.
- Treat runs, including agent-operated browser sessions, that seed or mutate shared local state as mutually exclusive on the machine regardless of which session started them; when a run in progress cannot be ruled out, ask instead of starting or clearing.
- After interrupting a run or observing one end abnormally, clear the processes it left behind instead of leaving them holding ports, connections, or memory.
- For configured browser automation, both end-to-end runners and agent-operated browser sessions, follow the applicable skills and project configuration for runtime installation and cache locations; keep repository-managed downloads in an ignored tool-specific directory under `.temp/`, use consistent paths for installation and execution, and preserve system-managed browser installations.
- Run agent-operated browser sessions against non-production data, signed in only with test accounts whose credentials are not secrets; a check that needs a secret-bearing credential cannot run under `17-validation-policy.md`.
- Close the agent-operated browser sessions and browser processes a task opened before closing it.
- Keep repository-owned temporary outputs, logs, backups, and ad-hoc artifacts inside `.temp/`; remove task-specific artifacts before closing except change plans under `.temp/plans/`, which stay until the user removes them, preserve ignored caches explicitly configured for repository tools, and never turn tool-managed operating-system temp into a durable project location.
