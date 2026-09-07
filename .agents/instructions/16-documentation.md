# Documentation Structure

Read when creating, locating, naming, renaming, relocating, or licensing project documentation.

- Use `.readme/` as the default location for repository-wide operational, architectural, setup, and troubleshooting documentation.
- Preserve canonical documentation locations established by an explicit request, project-specific policy, package boundary, ecosystem convention, governance requirement, or approved tool or framework under `05-repo-layout.md`.
- Preserve third-party and generated documentation in its upstream or tool-owned structure; do not relocate or rewrite it merely to satisfy project documentation conventions.
- Create a root `LICENSE` file only when explicitly requested; use the approved license and never infer licensing terms or ownership.
- Place explanations of project code according to the established documentation topology; do not create new sidecar documentation beside code when `.readme/` already owns that subject.
- Name each `.readme/` file with a unique numeric prefix used as a stable identifier, not a reading order, and the domain it governs; never reuse a prefix.
- Reserve `.readme/` prefixes `90` and above for template-owned documentation that derived projects inherit; number project-owned documentation below `90`.
