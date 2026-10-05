---
name: prompt-plan
description: Run the prompt skill on a draft and lay out the improved prompt as a change plan in the target project, following that project's own rules, with build fragments, patch and check scripts, review evidence, and a checkmark report. Use only when the user explicitly invokes prompt-plan.
disable-model-invocation: true
---

# Prompt plan

Turn a change request into a plan that can be built, verified, and reverted in small steps. This skill extends the `prompt` skill and never relaxes it.

## Precedence

- Read [../prompt/SKILL.md](../prompt/SKILL.md) and apply it to the draft supplied with this invocation, with all its rules: questions, inspection, measured baseline, the independent review of its step 12, and its output.
- That skill's Boundaries govern its own run. Start the plan only once its answer is final, with every question answered and its review done, as a separate step the user requests by invoking this skill.
- Create a plan only for an implementation prompt, one that authorizes changes to a target project; for any other prompt, return the prompt skill's output and state that no plan applies.
- Before creating the plan, read the target project's agent instructions and documented policy that apply to it, such as `AGENTS.md`, `CLAUDE.md`, the files they route or import, and contributing guides. They govern every step here and win on a conflict, except that they never relax this skill's gates: asking where to put a plan version control does not ignore, never changing ignore rules unasked, executing nothing until the user asks, deleting a plan only when the user asks, and no commit, push, or deploy unless the user asks. Where they are silent, this skill's defaults apply.

## Plan workspace

Create the plan directory `<YYYY-MM-DD>-<slug>/`, with an English kebab-case slug for the task, where the target project's rules place change plans, or else under a `plans/` folder where they place temporary artifacts, and under `.temp/plans/` at the project root when they name neither. When the project is under version control, confirm before writing that version control ignores that location; when it is not ignored, ask the user where to put the plan, and never change ignore rules unasked.

- `build/`: `00-index.md` with the complete improved prompt and its labels, the fragment order, and their dependencies; then fragments `NN-<slug>.md`, each small and self-contained, carrying only what the prompt states: its objective, the acceptance criteria it closes by their identifiers, and the files and commands the prompt names for them. A mandatory first step of the prompt, such as enumerating the surface or finding a cause and stopping, becomes fragment `01` and ends where the prompt stops. Criteria that span fragments, and the closure audit, belong to the last fragment.
- `patch/`: `apply` and `revert` scripts, taking a fragment number or `all`. Before a fragment is executed, snapshot the working tree without touching the repository index, for example through a temporary index file, and snapshot it again after, leaving the plan directory out of both; `NN.patch` is the diff between both snapshots, with new files, and `NN.state` records the hashes of the files it touches after the change. The scripts run `git apply --check` first, write only the paths their patch lists, and refuse when those files match neither the state before nor the state after the fragment. This needs a git working tree; when the project is not one, ask the user before planning without `patch/`.
- `check/`: `NN-check` and `all` scripts, idempotent, running the project commands the fragment's criteria name and exiting non-zero on any failure. They leave tracked files unchanged, write only to ignored outputs, tool caches, and `review/`, apply the prompt skill's rule on shared local resources, and stop every server and browser they start.
- `review/`: screenshots, logs, and command output from build, patch, and check, named `NN-<kind>-<UTC timestamp>`, and `report.md`.

Fragments use the improved prompt's language. Scripts use the cross-platform scripting runtime the project already requires, as Node ES modules (`.mjs`) when that is Node or when the project requires none, with only that runtime's standard library; they resolve paths from their own location, contain no secret, and follow the project's language rules for comments and messages, English when it sets none.

## Execution

- Execute no fragment, and run no `apply` or `revert` script, until the user asks.
- Take fragments in order: snapshot, implement, save the patch when the plan has `patch/`, run the checks of this and every completed fragment, and store the evidence in `review/`, applying the improved prompt's gates to each fragment and its closure audit at the end.

## Report

- After creating the plan and after each execution, report one line per criterion, decision, and requirement, with its fragment and the exact evidence file in `review/`, and keep the same lines in `review/report.md`: ✅ met · ❌ failed · ⏸ pending or open decision · ⚠️ risk.
- The report follows the prompt skill's code block and labels as the output format the user requested, in the user's language, and complements the closing report the improved prompt requires instead of replacing it.

## Retention and limits

- Keep plans after closing and delete one only when the user asks; when the target project's rules require removing temporary artifacts at closing without exempting plans, ask the user whether to keep it.
- No commit, push, or deploy unless the user asks.
