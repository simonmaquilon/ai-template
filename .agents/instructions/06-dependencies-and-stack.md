# Dependencies and Stack

Read before adding, updating, replacing, or removing a dependency, CLI tool, or binary, or editing `.docs/stack.md`.

- Reuse installed capabilities and prefer official or widely adopted libraries; add no package that duplicates the standard library, platform, framework, design system, or an existing dependency, except for the coexistence an authorized migration needs.
- For an authorized migration, document the coexistence scope and removal criterion, keep compatibility during the transition, and remove the superseded dependency when the criterion is met.
- Before proposing a dependency or binary, identify the runtime, language, framework, version constraints, license policy, and deployment targets; prefer a compatible stable release, and use a prerelease only when approved or required, documenting its risk.
- Before accepting one, verify its source authenticity, publisher, integrity metadata, release channel, install-time behavior, transitive footprint, maintenance, advisories, and license fit.
- Ask before an upgrade the user did not request.
- Keep `.docs/stack.md` as the single home of the stack: the selected stack, runtime and version constraints, approved target versions, the package manager, platform and dependency versions with the dependency and license policy, UI libraries, validation and observability tooling, and the pinned versions of agent tooling.
- Keep the direct and transitive dependency inventory, with declared and resolved versions, role, provenance, license, and maintenance status, in `.docs/stack.md` or a generated inventory it links, and advisories with their remediation and evidence in `.docs/security.md`.
- Keep runtime, platform, database, and external-service versions in `.docs/stack.md` with their source of truth and support status.
- Outside declared and resolved versions and the generated blocks, name in `.docs/stack.md` the file that pins a value instead of copying it, and never repeat a `.docs/stack.md` value in another document.
- Record an approved technology's target version under Approved Target Versions until installation resolves one, then move it to the installed section.
- Record the tooling that template-owned agent configuration runs under Template Tooling and the tooling the project adds under Project Tooling, never both, with version and provenance; packages and binaries that only agent tooling or automation needs go there, never in `.docs/security.md`.
- Run that tooling through the repository script that reads its version from `.docs/stack.md`, and never write a version into a command in documentation.
- Leave the blocks between `stack:generated` markers to the script that regenerates them, editing only their Notes column.
