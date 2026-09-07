# Meta Guidelines

Read before adding, renaming, removing, or editing any file under `.agents/instructions/`, the primary references or routing table in `AGENTS.md`, a primary-reference or root `README.md` skeleton, template-owned `.readme/` documentation, or `.agents/template-version`.

- Persistent agent instructions live in `.agents/instructions/`.
- In the maintained template, `.agents/template-version` identifies the baseline release; increment it exactly once per commit changing baseline instructions, the primary references or routing table in `AGENTS.md`, primary-reference skeletons, the root `README.md` skeleton, or template-owned `.readme/` documentation, relative to the previously committed template version.
- All pending edits and conversation turns belonging to the same commit share that single version increment; do not increment again for revisions before committing.
- Derived projects retain the adopted baseline version; completing or editing their product documents and local policies does not increment it. Update it when adopting a newer template release, and record deliberate baseline deviations in root `AGENTS.md` with links to routed project-specific policy.
- Without a prior template commit, preserve a verifiable inherited baseline version; for a newly created template with no inherited version, initialize it to 1. Do not infer a release number when baseline provenance is ambiguous.
- Root `AGENTS.md` holds the primary references and the instruction routing table; keep every operational rule in the files it routes to under `.agents/instructions/`.
- Every instruction file needs a routing entry in `AGENTS.md` stating when to load it.
- This file holds prefix `01`; give every other file a unique numeric prefix used as a stable identifier, not a reading order.
- When retiring a file, absorb the rules that must survive into the file that now owns them, remove its routing entry from `AGENTS.md`, and never reuse its prefix.
- Before adding, materially editing, renaming, renumbering, or retiring a rule, check repository-declared agent tooling for citations or enforcement; when found, update that configuration in the same change under `28-agent-tooling-configuration.md`.
- Name each file for the decision it governs, not for where its subject lives.
- Keep baseline rules independent of named tools, external tool servers, vendors, and frameworks; express required capabilities and selection criteria, and resolve concrete tooling through applicable skills and project configuration or documentation.
- One subject per file; split when a second subject appears instead of widening the name.
- Keep each instruction file at 25 physical lines or fewer, including its heading and blank lines; split the subject into a new focused routed file before exceeding the limit.
- Keep one operational decision per rule and never compress independent requirements merely to satisfy the line limit.
- Do not hard-wrap a rule across multiple lines.
