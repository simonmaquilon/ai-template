# Meta Guidelines

Read before editing `AGENTS.md`, an instruction module, a primary-reference or root `README.md` skeleton, template-owned `.readme/` documents, or `.agents/template-version`.

- Keep persistent agent rules in `AGENTS.md`, which holds the primary references, the core rules every request needs, and the routing table, and in the modules under `.agents/instructions/`; a derived project's `AGENTS.md` also holds a Deviations section.
- Give every module a routing entry in `AGENTS.md`, as an unindented list item, that states only when to load it, matching the module's scope line.
- Give each module a unique two-digit prefix used as a stable identifier, not a reading order; this file holds `01`, and a retired prefix is never reused.
- Name each module for the decision area it governs; group subjects that load together, and split a module when part of it applies in cases where the rest does not.
- Keep `AGENTS.md` within 8 KB and each module within 6 KB, as `check-instructions.mjs` measures; condense or split before exceeding them, never by dropping an independent requirement.
- Write one operational decision per rule on a single line, and start a rule that applies only at some change levels by naming those levels.
- Avoid citing one module from another: a rule that needs another module's subject belongs in that module's routing condition or in `AGENTS.md`.
- Keep baseline rules independent of named tools, products, vendors, languages, and frameworks; state the required capability and resolve concrete tools through skills, configuration, and `.readme/`.
- When retiring a module, move the rules that must survive to their new owner and remove its routing entry.
- Before adding, materially editing, or retiring a rule, check the repository-declared agent tooling that cites or enforces it and update both in the same change.
- The maintained template is the repository whose `origin` points to the template repository that the template-adoption `.readme/` document records; every other repository is a derived project.
- A derived project keeps the version and the `.agents/template-manifest.json` it adopted, changes them only when adopting a newer release through the adoption procedure, and records each deliberate deviation from a baseline rule in the Deviations section of `AGENTS.md` with a link to the project module that replaces it.
- Without a prior template commit, preserve a verifiable inherited version; start a new template with no inherited version at `1.0.0`, and never infer a release number when provenance is ambiguous.
- Keep template-maintenance findings out of the primary-reference skeletons that derived projects inherit; report them, or record them in a template-owned register when one is configured.
- Reserve `.readme/` prefixes `90` and above for template-owned documents, which derived projects inherit except the template-only ones.
- Treat the Template Tooling section of `.docs/stack.md` as template-owned and replaced as a whole on adoption, and every other section as project-owned.
