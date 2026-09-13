# Code Authoring

Read before writing or modifying code.

- Complete the pre-edit workflow in `02-change-workflow.md`; obtain or refresh target-source evidence according to `10-code-indexing.md`.
- Treat pre-existing and concurrent changes as user-owned and stop when safe integration is uncertain.
- When the user hands over an unfinished change from another session, treat it as the in-scope baseline: review all of it against the request before building on it, and do not inherit its unverified claims.
- Identify generated artifacts and their canonical source before editing; modify the canonical source and regenerate through the established project workflow instead of hand-editing derived output.
- When required generated output has no configured workflow, identify the supported method through applicable skills and official documentation, resolve new tooling or dependency decisions under `03-approval-boundaries.md` and `07-dependencies-and-binaries.md`, and report the gap rather than inventing a generator.
- Implement the simplest solution that satisfies the request; do not add speculative features, boilerplate, options, or extension points.
- Apply SOLID proportionally to demonstrated complexity: keep responsibilities cohesive and introduce abstractions only when real boundaries, substitution, or multiple consumers justify them.
- Keep single-use logic local; extract shared code when the same intent repeats or an owner instruction requires it.
- Do not handle failures the code cannot reach; guard only real failure modes.
- Comment only when the reason is not evident; follow `15-language-and-naming.md` for language and naming, and match the surrounding comment density.
- Implementation-style precedence: technical decisions in `PLAN.md`, repository-owned documented standards, official guidance for the installed or approved target technology version, then surrounding convention; report any deliberate divergence.
- Avoid unrelated formatting, reordering, or renaming inside authorized target files.
- Delete the code a change makes dead instead of leaving it unreachable.
