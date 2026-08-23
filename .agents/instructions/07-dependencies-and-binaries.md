# Dependencies and Binaries

Read when evaluating, adding, updating, replacing, or removing libraries, CLI tools, or binaries.

- Reuse installed capabilities; do not add a package that duplicates the standard library, platform, framework, design system, or an existing dependency.
- Before proposing a dependency or binary, identify runtime, language, framework, version constraints, license policy, and deployment targets.
- Validate maintenance, a compatible stable release, security advisories, license fit, and compatibility with the detected environment.
- Keep the complete direct and transitive dependency inventory in `SECURITY.md` synchronized from manifests, lockfiles, or an approved SBOM, including declared and resolved versions, role, provenance, license, maintenance status, known advisories, and last verification.
- When an update is discovered rather than explicitly requested, notify the user and wait for approval before upgrading; a request that names the exact dependency, CLI tool, or binary update is already approval for that update.
- Prefer official or widely adopted ecosystem libraries.
