# Warning triage

How to tell a ⚠️ warning that stops the work from one that does not. [SKILL.md](../SKILL.md) links here from its Execution rules, and [execution.md](execution.md) applies it when an execution ends.

## When

- Run the triage before presenting the report that delivers a plan and before the closing report of an execution, on every ⚠️ line that report would carry.
- A subagent that did not write the plan makes it, through the subagent mechanism of the prompt skill's Client bindings; where the session offers no subagents, a separate pass of the coordinator makes it, after the report is drafted and from the lines, their fragments, and their evidence alone.

## Classification

- The marker rule of the project's `AGENTS.md` decides which lines are ⚠️, and the triage only classifies the ⚠️ lines it leaves; under that rule, in the report of a plan, a measurement the plan defers to a named fragment is not due until that fragment executes, so it is an ℹ️ note, never 🚫 or ⚠️, and a residual risk of the delivered work that prevents closing no criterion is an ℹ️ note whose only pending decision, its acceptance, the closing report's ⏳ line carries; where the project has none, the status list of [SKILL.md](../SKILL.md) applies.
- A ⚠️ line that already has its own question and ID, as [execution.md](execution.md) gives each risk the user chose to review one by one, is not reclassified.
- The reviewer tries to prove that each ⚠️ blocks: it reads the line, its fragment, and its evidence, and classifies it as blocking or not blocking with its reason in one sentence.
- Blocking: continuing would produce incorrect or unauthorized work or lose data, a criterion could not close, or a decision only the user can take is missing, other than the acceptance of residual risks that the closing report's ⏳ line asks for.
- Not blocking: the measurement is only deferred and a fragment of the plan runs it when it executes, and the classification names the fragment and its check line; the risk existed before the change and the change does not touch it; the line is an observation outside the scope; or it is a residual risk of the delivered work that prevents closing no criterion, which the closing report groups in one ⏳ line, as [execution.md](execution.md) defines.
- In doubt, it blocks.
- The coordinator writes each classification with its reason next to its line in `review/report.md`, or in a file of `review/` that the line cites.
- The triage never makes a check more permissive and never changes a criterion, and every decision that changes what the plan authorizes goes to the user.

## Report

- A warning that does not block is reported as ℹ️ with its classification and where it will be measured, not as ⚠️.
- A check that the dry run cannot run and that a fragment measures when it executes is reported as ℹ️ from the start.
- A warning that blocks stays ⚠️, and the report says why it blocks.
- In the closing report, the ℹ️ lines classified as a risk of the delivered work are listed in one ⏳ line that asks for their acceptance, as [execution.md](execution.md) defines.
