# Meta Guidelines

Read before adding, renaming, removing, or editing any file under `.agents/instructions/`, the primary references or routing table in `AGENTS.md`, a primary-reference or root `README.md` skeleton, template-owned `.readme/` documentation, or `.agents/template-version`.

- Persistent agent instructions live in `.agents/instructions/`.
- The maintained template is the repository whose default remote points to the template repository that the template-adoption `.readme/` document records, which continuous integration may approximate with the hosting platform's template flag; every other repository is a derived project.
- In the maintained template, `.agents/template-version` identifies the baseline release; increment it exactly once per commit changing baseline instructions, the primary references or routing table in `AGENTS.md`, primary-reference skeletons, the root `README.md` skeleton, template-owned `.readme/` documentation, repository-declared agent tooling configuration, template-owned `.scripts/` helpers and automation workflows that derived projects adopt, vendored skills and their lockfile, or template-owned ignore or attribute rules, relative to the previously committed template version.
- Files that only validate the maintained template, such as its continuous-integration workflow, the check runner with its tests and the scripts only it uses, and that workflow's documentation, are never adopted by derived projects and never increment `.agents/template-version`; the template-adoption `.readme/` document lists them.
- All pending edits and conversation turns belonging to the same commit share that single version increment; do not increment again for revisions before committing.
- Derived projects retain the adopted baseline version; completing or editing their product documents and local policies does not increment it. Update it when adopting a newer template release, following the adoption procedure in the template-owned `.readme/` documentation, and record each deliberate baseline deviation in a Deviations section of root `AGENTS.md` with a link to the routed project-specific policy that replaces it.
- Without a prior template commit, preserve a verifiable inherited baseline version; for a newly created template with no inherited version, initialize it to 1. Do not infer a release number when baseline provenance is ambiguous.
- Root `AGENTS.md` holds the primary references, the instruction routing table with the rule for loading the files it routes to, and in a derived project the Deviations section; keep every other operational rule in the files it routes to under `.agents/instructions/`.
- Every instruction file needs a routing entry in `AGENTS.md` that starts by stating when to load it, consistent with the file's scope line, followed by the subjects it governs.
- Place each routing entry as an unindented list item under the `AGENTS.md` heading of its group and, where the group is subdivided, of its phase or area; those headings only name groups, phases, and areas and hold no rules.
- This file holds prefix `01`; give every other file a unique numeric prefix used as a stable identifier, not a reading order.
- When retiring a file, absorb the rules that must survive into the file that now owns them, remove its routing entry from `AGENTS.md`, and never reuse its prefix.
- Before adding, materially editing, renaming, renumbering, or retiring a rule, check repository-declared agent tooling for citations or enforcement; when found, update that configuration in the same change under `28-agent-tooling-configuration.md`.
- Name each file for the decision it governs, not for where its subject lives.
- Keep baseline rules independent of named tools, products, external tool servers, vendors, programming languages, and frameworks; express required capabilities and selection criteria, and resolve concrete tooling through applicable skills and project configuration or documentation.
- One subject per file; split when a second subject appears instead of widening the name.
- Keep each instruction file at 25 physical lines or fewer, including its heading and blank lines; split the subject into a new focused routed file before exceeding the limit.
- Keep one operational decision per rule and never compress independent requirements merely to satisfy the line limit.
- Do not hard-wrap a rule across multiple lines.
