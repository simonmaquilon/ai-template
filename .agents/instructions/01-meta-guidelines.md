# Meta Guidelines

Read before adding, renaming, or editing any file under `.agents/instructions/`.

- Persistent agent instructions live in `.agents/instructions/`.
- The application template version lives in `.agents/template-version`; increment it whenever baseline instructions or primary-reference skeletons change.
- Derived projects copy that version; add project-specific policy through new routed files, and state any deliberate baseline change in root `AGENTS.md` instead of silently drifting.
- Root `AGENTS.md` holds the primary references and the instruction routing table; keep every operational rule in the files it routes to under `.agents/instructions/`.
- Every instruction file needs a routing entry in `AGENTS.md` stating when to load it.
- This file holds prefix `01` and is read first; give every other file a unique numeric prefix used as a stable identifier, not a reading order.
- Name each file for the decision it governs, not for where its subject lives.
- One subject per file; split when a second subject appears instead of widening the name.
- Keep each instruction file at 25 physical lines or fewer, including its heading and blank lines; add a focused fragment before exceeding the limit.
- Write one rule per line and never hard-wrap it.
