# Dependencies and Binaries

Read when evaluating, adding, updating, replacing, or removing libraries, CLI tools, or binaries.

- Reuse installed capabilities; avoid packages that duplicate the standard library, platform, framework, design system, or an existing dependency, except for temporary coexistence required by an authorized migration.
- For authorized dependency migrations, document the coexistence scope and removal criterion, preserve compatibility during transition, and remove superseded dependencies when that criterion is met within the authorized scope.
- Before proposing a dependency or binary, identify runtime, language, framework, version constraints, license policy, and deployment targets.
- Prefer a compatible stable release and validate maintenance, security advisories, license fit, and environment compatibility; use a prerelease only when explicitly requested or approved, or when required by an approved platform, and document the additional risk.
- Before accepting a dependency or binary, verify source authenticity, publisher or ownership, integrity metadata, release channel, installation or build behavior, and transitive footprint through available authoritative evidence.
- Maintain a complete direct and transitive dependency inventory from manifests and lockfiles, either in `SECURITY.md` under `21-document-maintenance.md` or an approved generated inventory or SBOM linked from it; retain declared and resolved versions, role, provenance, license, maintenance status, advisories, and verification evidence without duplicating detailed rows across sources.
- Record the dependencies, binaries, runtimes, platforms, and external tool servers that only template-owned agent tooling or automation requires in the template-owned `.readme/` document that configures them, not in `SECURITY.md`.
- When an update is discovered rather than explicitly requested, notify the user and wait for approval before upgrading; a request that names the exact dependency, CLI tool, or binary update is already approval for that update.
- Prefer official or widely adopted ecosystem libraries.
