# Language Servers

Read before locating, reading, or changing code, and before enabling, installing, updating, or removing a language server.

- Detect the language servers the active agent client has configured, and the file types each serves, from repository-declared agent tooling configuration and its `.readme/` documentation; never assume one from the language alone.
- After the code index that `10-code-indexing.md` puts first, use a language server configured for the affected language to resolve exact definitions, references, and implementations before falling back to text searches.
- Resolve the error-level diagnostics a change introduces before closing it, unless the server cannot use the project's installed language version, as its documented resolution order and the project's installation show; handle pre-existing diagnostics under `17-validation-policy.md`.
- Language-server diagnostics add to the project's configured checks and never replace them.
- When no language server is configured for the affected language or the active client, or the configured one fails to start, continue with the remaining discovery and validation capabilities; never install or enable one merely to satisfy this workflow.
- Keep server identities, served file types, required binaries, and installation commands in project configuration and `.readme/` documentation, and their verified versions and provenance where `07-dependencies-and-binaries.md` records them; never in instruction files.
- Treat enabling, installing, updating, or removing a language server or its binary as an agent tooling change under `28-agent-tooling-configuration.md` and a binary change under `07-dependencies-and-binaries.md`.
