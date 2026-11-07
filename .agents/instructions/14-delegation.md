# Delegation

Read before planning a normal or risk change, and before delegating to a subagent.

- In a normal or risk change, the session discovers, writes the specification, decides, handles approvals and questions to the user, integrates the results, and reports; it delegates the rest of the work.
- Delegate broad searches, read-only analysis, and mechanical or fully specified edits to the fast tier, with every change spelled out in the brief, so work that needs no judgment does not spend the session's costlier model; delegate implementation and debugging that need judgment against the fixed specification, risk changes included, to the standard tier, and implementation that exceeds the standard tier, reviews, difficult decisions, unresolved root causes, risk-area design, and independent verification to the strong tier.
- Keep in the session only questions, trivial changes, reads of known files, single commands, edits that take fewer steps to make than to brief and check, such as a few lines in up to three files, and edits or checks a subagent's environment cannot perform, such as agent permission files; delegate every other implementation step of a normal or risk change.
- Use the agents the repository declares, as the agent-subagents `.readme/` document maps them to tiers, and run a tier the client does not map in the session itself.
- Take the lowest tier that covers each task, as the session judges from discovery and the specification, split a task that spans tiers, and run independent tasks in parallel unless they start services or seed or mutate shared local state.
- A higher tier can take any lower tier's work, such as searches, mechanical edits, or implementation, when its difficulty calls for it, as the session judges; a task moves one tier up when its result fails for lack of capability or a review rejects its fix again.
- Give each subagent the complete task, its constraints, acceptance criteria, and paths, and require concise findings, file paths, evidence, changes made, and open issues.
- Treat a subagent's result as evidence to verify before relying on it, and never delegate approvals, decisions owed to the user, or the final report.
