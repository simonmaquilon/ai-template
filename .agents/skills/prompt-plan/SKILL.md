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
- In a session that cannot receive a reply, as the prompt skill defines it, create no plan when this skill would have to ask where to put it or whether to plan without `patch/`; return the prompt skill's output and report that question instead.

## Plan workspace

Create the plan directory `<YYYY-MM-DD>-<slug>/`, with an English kebab-case slug for the task, where the target project's rules place change plans, or else under a `plans/` folder where they place temporary artifacts, and under `.temp/plans/` at the project root when they name neither. When the project is under version control, confirm before writing that version control ignores that location; when it is not ignored, ask the user where to put the plan, and never change ignore rules unasked.

- `build/`: `00-index.md` holds only a table of the fragments in execution order, with each one's link, objective, the identifiers of the criteria and decisions it closes, and the fragments it depends on; the plan keeps no copy of the complete improved prompt. Fragments `NN-<slug>.md` are each small and self-contained, carrying only what the prompt states that applies to that fragment: its objective, the context and baseline it needs, the acceptance criteria, decisions, and other requirements it closes with their identifiers, the requirements that govern every change, such as the prompt's gates and the project rules it cites, and the files and commands the prompt names for them. A mandatory first step of the prompt, such as enumerating the surface or finding a cause and stopping, becomes fragment `01` and ends where the prompt stops. A fragment that changes behavior carries the tests the prompt requires for that behavior, so those that test what it changes fail before it and all pass after it; criteria and requirements that only the fragments together close, such as a final full test run, and the closure audit, belong to the last fragment.
- `patch/`: a `record` script taking a fragment number and `before` or `after`: each snapshots the working tree without touching the repository index, for example through a temporary index file, leaving the plan directory out; `after` also writes `NN.patch`, the diff between both snapshots with new files, and `NN.state`, the hashes of each file it touches before and after the change. `apply` and `revert` scripts take a fragment number or `all`, work out from the recorded hashes how many fragments are applied in order, skip those already in the state they would leave, refuse a fragment out of order or any touched file that matches no recorded state, run `git apply --check` first, and write only the paths their patch lists. This needs a git working tree; when the project is not one, ask the user before planning without `patch/`.
- `check/`: `NN-check` and `all` scripts, idempotent, running the project commands the fragment's criteria name and exiting non-zero on any failure other than those the prompt's measured baseline records as failing before the change, matched by the same test or command. A check for a criterion that depends on an open decision covers its recommended option and says so in the output line and report line it produces, is reported as ⏸ pending while the decision stays open, and is updated to the chosen option once it is settled; when the decision recommends none, or the criterion waits on a pending datum, the check is left out and reported as pending. A fragment that changes no file and whose criteria name no command needs no check script. The scripts leave tracked files unchanged, write only to ignored outputs, tool caches, and `review/`, apply the prompt skill's rule on shared local resources, and stop every server and browser they start.
- `review/`: screenshots, logs, and command output from build, patch, and check, named `NN-<kind>-<UTC timestamp>`, and `report.md`.

Fragments use the improved prompt's language. Scripts use the cross-platform scripting runtime the project already requires, as Node ES modules (`.mjs`) when that is Node or when the project requires none, with only that runtime's standard library; they resolve paths from their own location, contain no secret, and follow the project's language rules for comments and messages, English when it sets none.

## Execution

- Execute no fragment, and run no `record`, `apply`, or `revert` script, until the user asks.
- Take fragments in order. For each, add its tests first, if it carries any; run those that test the behavior it changes, if any, under the limits `check/` scripts follow, and store that run in `review/` as `NN-tests-before-<UTC timestamp>`, stopping without running `record NN after` to report any that already passes; only then implement it, all between `record NN before` and `record NN after` when the plan has `patch/`. Then run the checks of this and every completed fragment, and store the evidence in `review/`, applying the gates each fragment carries and the closure audit at the end.

## Report

- After creating the plan and after each execution, report one line per criterion, decision, and requirement, with its fragment and the exact evidence file in `review/`, and keep the same lines in `review/report.md`: ✅ met · ❌ failed · ⏸ pending or open decision · ⚠️ risk.
- The report follows the prompt skill's code block and labels as the output format the user requested, in the user's language, and complements the closing report the improved prompt requires instead of replacing it.

## Retention and limits

- Keep plans after closing and delete one only when the user asks; when the target project's rules require removing temporary artifacts at closing without exempting plans, ask the user whether to keep it, or, when the session cannot receive a reply, keep it and report that question.
- No commit, push, or deploy unless the user asks.
