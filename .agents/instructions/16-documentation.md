# Documentation

Read when creating, locating, naming, renaming, relocating, or licensing project documentation, or answering questions about registered pending work.

- Use `.readme/` as the default location for repository-wide operational, architectural, setup, and troubleshooting documentation.
- Preserve canonical documentation locations established by an explicit request, project-specific policy, package boundary, ecosystem convention, governance requirement, or approved tool or framework under `05-repo-layout.md`.
- Preserve third-party and generated documentation in its upstream or tool-owned structure; do not relocate or rewrite it merely to satisfy project documentation conventions.
- Create a root `LICENSE` file only when explicitly requested; use the approved license and never infer licensing terms or ownership.
- Place explanations of project code according to the established documentation topology; do not create new sidecar documentation beside code when `.readme/` already owns that subject.
- Name each `.readme/` file with a unique numeric prefix used as a stable identifier, not a reading order, and the domain it governs; never reuse a prefix.
- Reserve `.readme/` prefixes `90` and above for template-owned documentation, which derived projects inherit except the template-only documents that `01-meta-guidelines.md` excludes from adoption; number project-owned documentation below `90`.
- Declare the location of a project's pending-work index, when one exists, in the primary references of `AGENTS.md`.
- Limit a pending-work index to topic names and links to the authoritative documents assigned by `21-document-maintenance.md`.
- Before answering a question about registered pending work, start with the declared index when present and follow its references to read the owners' current state.
