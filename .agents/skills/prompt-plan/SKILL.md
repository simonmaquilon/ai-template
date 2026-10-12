---
name: prompt-plan
description: Run the prompt skill on a draft and lay out the improved prompt as a change plan for the target project, following that project's own rules, with build fragments, patch and check scripts, review evidence, and a checkmark report. Use only when the user explicitly invokes prompt-plan.
disable-model-invocation: true
---

# Prompt plan

Turn a change request into a plan that can be built, verified, and reverted in small steps. This skill extends the `prompt` skill and never relaxes it.

## Precedence

- Read [../prompt/SKILL.md](../prompt/SKILL.md) and apply it to the draft supplied with this invocation, with all its rules: questions, inspection, measured baseline, the independent review of its step 12, and its output. When this invocation creates a plan, the user's invocation of this skill is the requested format that replaces that output: the prompt is neither printed nor saved, apart from the temporary review file that skill's step 12 allows; the fragments and `rules.md` carry its content, and its corrections and findings lines go to the report.
- That skill's Boundaries govern its own run. Start the plan only once its answer is final, with every question answered and its review done, as a separate step the user requests by invoking this skill.
- Create a plan only for an implementation prompt, one that authorizes changes to a target project; for any other prompt, return the prompt skill's output and state that no plan applies.
- Before creating the plan, read the target project's agent instructions and documented policy that apply to it, such as `AGENTS.md`, `CLAUDE.md`, the files they route or import, and contributing guides. They govern every step here and win on a conflict, except that they never relax this skill's gates: asking where to put a plan inside the project that version control does not ignore or inside another repository, never changing ignore rules unasked, executing no fragment and running no `record`, `apply`, or `revert` script until the user asks, deleting a plan only when the user asks, and no commit, push, or deploy unless the user asks. Where they are silent, this skill's defaults apply.
- In a session that cannot receive a reply, as the prompt skill defines it, create no plan when this skill would have to ask where to put it or whether to plan without `patch/`; return the prompt skill's output and report that question instead. The question Plan workspace asks about a plan in the session's scratch folder or the operating system's temporary folder is not one of these: in such a session, this skill writes the plan there without asking.

## Plan workspace

Create the plan directory `<YYYY-MM-DD>-<slug>/`, with an English kebab-case slug for the task, where the target project's rules place change plans, or else under a `plans/` folder in the temporary location the prompt skill defines. When that location is inside a project under version control, confirm before writing that version control ignores it; when it is not ignored, ask the user where to put the plan, and never change ignore rules unasked. A folder inside a repository other than the target project's never holds a plan, whoever names it, because the scripts take the plan's repository as the project; ask the user for another. A plan outside the project runs its scripts from the project's root, and the report names its absolute path. When the plan's location lies in the session's scratch folder or the operating system's temporary folder, which the client or the system may empty, such as when the session restarts, and `check/` does not require a folder of the project that version control ignores, ask the user, before writing, where to keep the plan. Offer, in this order: when one exists, a folder of the target project that version control ignores, that no tool manages, and that lies in no folder a tool manages (dependency, build, or cache folders, for example); a folder the user names, which follows the rules above; and the scratch or temporary folder last. In that case, a session that cannot receive a reply writes the plan there without asking, and the report carries that folder as a ⚠️ risk, as it does when the user keeps it. The plan directory holds only these four folders, plus `.cache/` when a check isolates a tool or an `all` run shares a command's result: `build/`, `patch/`, `check/`, and `review/`, which [references/plan-workspace.md](references/plan-workspace.md) defines together with the rules for the scripts they hold; read it before creating a plan or executing any of its fragments.

## Execution

- Execute no fragment, and run no `record`, `apply`, or `revert` script, until the user asks.
- Before executing a fragment, recording an answer to an open decision or a pending datum, or changing a plan already created, read [references/execution.md](references/execution.md); its rules govern every step after the plan is created.

## Report

- After creating the plan and after each execution, report one line per criterion, decision, and requirement, with its fragment and the exact evidence file in `review/`, plus one line per script a dry run ran, and keep the same lines in `review/report.md`: ✅ met · ❌ failed · ⏸ pending or open decision · ⚠️ risk. The unmet criteria of a `failed` fragment are ❌. A line an `all` run reports as SKIPPED keeps its last status and cites the last `NN-check-<UTC timestamp>` log in which it ran, never the one that skipped it nor a fix record, and a criterion with lines in both cites both logs; the closing fragment's `--slow` run refreshes them. In the chat, lines that share a status, fragment, and evidence file may be merged into one that lists their identifiers.
- The chat answer carries no copy of the prompt: it gives these lines and the prompt skill's corrections and findings lines, which `review/report.md` keeps as well, all in the user's language, with each findings line naming the fragment, or `rules.md`, that carries it instead of a section of the prompt, and complements the closing report the improved prompt requires instead of replacing it.

## Retention and limits

- Keep plans after closing and delete one only when the user asks; when the target project's rules, or the global configuration that set the plan's location, require removing temporary artifacts at closing without exempting plans, ask the user whether to keep it, or, when the session cannot receive a reply, keep it and report that question.
- No commit, push, or deploy unless the user asks, directly or through the prompt the plan carries out.
