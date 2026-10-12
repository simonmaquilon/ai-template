# Output labels

Part of the Output section of [SKILL.md](../SKILL.md), moved here verbatim; the rest of Output stays there.

Two labels may follow the code block, in this order, each on its own line with its lines beneath it:

- a corrections label, when the target project contradicts a factual claim of the draft, such as a path that does not exist, a test that covers something else, or a command the project does not define, so the user learns what was wrong instead of seeing it silently rewritten;
- a findings label, when the target project contradicts itself in a way that bears on the work the prompt authorizes, such as documentation that describes behavior the code does not implement, a comment or reference that no longer matches what it names, or a stated rule the code applies differently.

One short line each. Each findings line ends by saying whether the prompt already carries it and where, such as a named decision or the context section, or that it does not, so the user can tell whether it still needs action. What the draft asserted belongs under corrections and never under findings; what the project asserts against itself belongs under findings and never under corrections. Both carry only what you verified by inspecting the project, and findings carry only what bears on the work the prompt authorizes. Neither label is a place for notes, advice, summaries, caveats, or a general audit of the project: context the executor needs belongs inside the prompt, and anything that would change what the prompt authorizes is a question you owed the user per step 5. A verified self-contradiction the executor needs appears in both places: as context inside the prompt and as a line under findings.

Both labels are named here in English, but they are descriptions and not tokens: write each as the word the language of the improved prompt uses, followed by a colon, on its own line, and keep the same wording across the whole answer.
