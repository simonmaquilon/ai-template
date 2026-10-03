# Examples

These examples show form, not project facts. Verify every project claim before using it; never copy an example's particulars into an improved prompt without evidence.

## Open decision

Rule illustrated: `393f26e:.agents/skills/prompt/SKILL.md`, Goals line 23 and Workflow step 5 line 43. The illustrative draft asks for a report and names two delivery options without choosing one.

> Open decision — delivery: Recommended: leave delivery pending because the destination is unsettled. Alternatives: publish to the team wiki; email the report to the requester. Ask the requester to choose before resolving delivery under any option, including the recommendation. Continue drafting the report. Report delivery as pending if unanswered.

## Findings line

Rule illustrated: `393f26e:.agents/skills/prompt/SKILL.md`, Output lines 119, 121, 125, and 127. Use this form only after verifying an internal project contradiction that bears on the authorized work. Place it after the improved prompt's fenced block; replace both evidence markers with actual project paths and lines.

> Findings:
> - `<verified-guide-path>:<line>` prescribes one check, but `<verified-manifest-path>:<line>` defines another; carried in the prompt's validation sentence.

## Bounded rewrite

Rules illustrated: the current [SKILL.md](../SKILL.md), Interpretation and Workflow step 9, and [implementation-prompts.md](implementation-prompts.md), the consolidation and Severity and precision rules.

This schematic is inspired by a centered-greeting rewrite; its measurements illustrate the distinction and are not project evidence.

Draft: "Change the greeting from Hello World to Hello React and preserve its existing horizontal centering."

Schematic baseline: the greeting's center offset was reported as 0 px at whole-pixel precision. Neither the draft nor an established project requirement demands exact 0 px equality. That observation does not authorize adding such a threshold.

> Change the greeting from Hello World to Hello React. AC1: The visible greeting is Hello React. AC2: The existing horizontal centering remains in effect in the route, viewport, and state used for verification. Report the measured center offset at the precision the measurement supports. Verify and audit against AC1 and AC2. Keep the baseline observation separate from the acceptance criteria.

The real prompt must carry the verified route, viewport, state, approved text change, and baseline evidence. If exact numerical equality is explicitly required, preserve it; if choosing a tolerance changes which results are acceptable, resolve that choice under step 5.
