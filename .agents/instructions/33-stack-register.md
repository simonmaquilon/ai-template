# Stack Register

Read before editing `STACK.md`, and before recording, changing, or relying on the selected stack, runtime or version constraints, approved target versions, the package manager, platform or dependency versions, the dependency and license policy, UI libraries, validation or observability tooling, or the pinned versions of agent tooling.

- Keep `STACK.md` as the single home of the technology stack: the selected stack, runtime and version constraints, approved target versions, the package manager, platform and dependency versions with the dependency and license policy, UI libraries, validation and observability tooling, and the pinned versions of agent tooling.
- Outside the declared and resolved versions of platforms and dependencies, name in `STACK.md` the manifest, lockfile, or configuration file that already pins a value instead of copying the value.
- Keep product decisions in `PRODUCT.md`, architecture and delivery decisions in `PLAN.md`, and each component's security state in `SECURITY.md`, which cites the component's `STACK.md` row; never repeat a `STACK.md` value in them.
- Record an approved technology's target version in Approved Target Versions until installation resolves one, then move it to the section that holds installed versions.
- Record the tooling that template-owned agent configuration runs under Template Tooling and the tooling that the project adds under Project Tooling, with version and provenance, and never list a package in both.
- Run that tooling through the repository script that reads its version from `STACK.md`; never write a version into a command in documentation.
- Treat Template Tooling as template-owned, replaced as a whole on adoption, and every other section of `STACK.md` as project-owned.
