# Agent Tooling

Read before changing client settings, tool servers, hooks, language servers, vendored skills, or declared agents.

- Discover every agent client and tooling file the repository declares before editing any, apply each change to every client it affects or state which were left out and why, and keep tooling working on every supported operating system or document the exclusion in that tooling's `.readme/` document.
- Treat an external tool server, plugin, language server, or vendored skill as a third-party dependency, pinned as far as its lockfile or client configuration allows unless its `.readme/` document records following upstream.
- Before invoking or accepting a new or updated skill or plugin, review the pre-approvals, hooks, and permissions it grants itself or its installer writes, raise each as an open decision, and record each accepted one, with what it allows, in the agent-skills `.readme/` document.
- Keep server identities, file types, binaries, installation commands, and runtime requirements in configuration and `.readme/`, and their versions in `.docs/stack.md`, never in instruction files.
- Give every repository-declared hook the rule it enforces, cite that rule in its message, and register it in the agent-hooks `.readme/` document, registering a third-party hook as a declared exception.
- Once authorized, declare a command the sandbox cannot confine through the client's documented exemption mechanism; when the client has none, report the gap instead of widening session limits.
- Declare one agent per capability tier for each client and map them in the agent-subagents `.readme/` document; give a higher tier on a stronger model an effort no higher than the tier below it and on the same model a higher one, keep the session above the strong tier, and keep each agent's prompt to a pointer to the inherited instructions, the limits of a delegated task, and what its final message returns.
