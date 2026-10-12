# Subagent Delegation

Read before delegating work to a subagent or choosing which agent runs it.

- Delegate a task when it is independent of the session's open reasoning and its result can be verified; keep in the session the work that needs the conversation's context or the user's answers.
- Choose the agent for a delegated task by capability tier, never by model or product name; the agent-subagents `.readme/` document maps each tier to the agents each client declares.
- Fast tier: bounded, mechanical work with an exact specification, such as searching, listing, reading and summarizing files, or applying a fully specified edit.
- Standard tier: well-specified implementation, tests, and focused reviews whose acceptance criteria are already fixed under `30-change-specification.md`.
- Strong tier: ambiguous design, root-cause analysis under `19-diagnosis-and-review.md`, and work that `22-security-and-trust-boundaries.md`, `23-data-integrity-and-migrations.md`, or `25-contracts-and-compatibility.md` governs.
- Delegate to the lowest tier that can complete the task reliably.
- When a delegated result fails verification for lack of capability rather than a missing specification, rerun the task one tier higher.
- Run the independent verification of `31-verification-loop.md` at the strong tier; when the client maps no agent to that tier, use the fresh-session capability that `31-verification-loop.md` allows.
- When the client maps no agent to another tier, run that tier's work in the session itself.
- Give each subagent the complete task, its constraints, its acceptance criteria, and the paths it needs; it receives none of the session's reasoning unless the task states it.
- Treat a subagent's result as evidence to verify before relying on it, never as completed or approved work.
- Never delegate approvals, decisions owed to the user under `03-approval-boundaries.md`, or the final report under `20-response-and-reporting.md`.
- A subagent follows the same routed instructions as the session; delegation never widens permissions or operating limits.
- Run independent delegated tasks in parallel when the client allows it.
- Report which tier and agent ran each delegated task.
