---
name: prompt-plan
description: Run the prompt skill on a draft and lay out the improved prompt as a change plan under .temp/plans, with build fragments, patch and check scripts, review evidence, and a checkmark report. Use only when the user explicitly invokes prompt-plan.
disable-model-invocation: true
---

# Prompt plan

Turn a change request into a plan that can be built, verified, and reverted in small steps. This skill extends the `prompt` skill and never relaxes it.

## Precedence

- Read [../prompt/SKILL.md](../prompt/SKILL.md) and apply it to the draft supplied with this invocation, with all its rules: questions, inspection, measured baseline, the independent review of its step 12, and its output.
- That skill's Boundaries govern its own run. Start the plan only once its answer is final, with every question answered and its review done, as a separate step the user requests by invoking this skill.
- Create a plan only for an implementation prompt, one that authorizes changes to a target project; for any other prompt, return the prompt skill's output and state that no plan applies.
- The repository's `AGENTS.md` and the instructions it routes govern every step here and win on a conflict.

## Plan workspace

Create `.temp/plans/<YYYY-MM-DD>-<slug>/`, with an English kebab-case slug for the task:

- `build/`: `00-index.md` with the complete improved prompt and its labels, the fragment order, and their dependencies; then fragments `NN-<slug>.md`, each small and self-contained, carrying only what the prompt states: its objective, the acceptance criteria it closes by their identifiers, and the files and commands the prompt names for them. A mandatory first step of the prompt, such as enumerating the surface or finding a cause and stopping, becomes fragment `01` and ends where the prompt stops. Criteria that span fragments, and the closure audit, belong to the last fragment.
- `patch/`: `apply.mjs` and `revert.mjs`, taking a fragment number or `all`. Before a fragment is executed, snapshot the working tree without touching the repository index, for example through a temporary index file, and snapshot it again after; `NN.patch` is the diff between both snapshots, with new files, and `NN.state` records the hashes of the files it touches after the change. The scripts run `git apply --check` first, write only the paths their patch lists, and refuse when those files match neither the state before nor the state after the fragment.
- `check/`: `NN-check.mjs` and `all.mjs`, idempotent, running the project commands the fragment's criteria name and exiting non-zero on any failure. They leave tracked files unchanged, write only to ignored outputs, tool caches, and `review/`, apply the prompt skill's rule on shared local resources, and stop every server and browser they start.
- `review/`: screenshots, logs, and command output from build, patch, and check, named `NN-<kind>-<UTC timestamp>`, and `report.md`.

Fragments use the improved prompt's language. Scripts are Node ES modules (`.mjs`) that use only built-in modules, resolve paths from their own location, contain no secret, and keep their comments and messages in English.

## Execution

- Execute no fragment, and run no `apply.mjs` or `revert.mjs`, until the user asks.
- Take fragments in order: snapshot, implement, save the patch, run the checks of this and every completed fragment, and store the evidence in `review/`, applying the improved prompt's gates to each fragment and its closure audit at the end.

## Report

- After creating the plan and after each execution, report one line per criterion, decision, and requirement, with its fragment and the exact evidence file in `review/`, and keep the same lines in `review/report.md`: ✅ met · ❌ failed · ⏸ pending or open decision · ⚠️ risk.
- The report follows the prompt skill's code block and labels as the output format the user requested, in the user's language, and complements the closing report the improved prompt requires instead of replacing it.

## Retention and limits

- Plans stay under `.temp/plans/` after closing, as `06-commands-and-local-runtime.md` allows; delete one only when the user asks.
- No commit, push, or deploy unless the user asks.
