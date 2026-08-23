# Code Authoring

Read before writing or modifying code.

- Re-read each target immediately before editing; treat pre-existing and concurrent changes as user-owned and stop when safe integration is uncertain.
- Implement the simplest solution that satisfies the request; do not add speculative features, boilerplate, options, or extension points.
- Apply SOLID proportionally to demonstrated complexity: keep responsibilities cohesive and introduce abstractions only when real boundaries, substitution, or multiple consumers justify them.
- Keep single-use logic local; extract shared code when the same intent repeats or an owner instruction requires it.
- Do not handle failures the code cannot reach; guard only real failure modes.
- Comment only when the reason is not evident, and match the surrounding naming and comment density.
- Implementation-style precedence: repository-owned documented standards, official guidance for the installed technology version, then surrounding convention; report any deliberate divergence.
- Avoid unrelated formatting, reordering, or renaming inside authorized target files.
- Delete the code a change makes dead instead of leaving it unreachable.
