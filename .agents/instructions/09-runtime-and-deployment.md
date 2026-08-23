# Runtime and Deployment

Read when touching runtime configuration, environment bindings, migrations, generated platform types, or deployment behavior.

- Discover the runtime and deployment targets from repository manifests, infrastructure files, and project documentation before editing.
- Keep application, runtime, framework, platform, database, external-service, deployment-tool, and binary versions synchronized in `SECURITY.md`, including their source of truth, support status, security state, and last verification.
- Generate platform bindings and types through the repository-owned command; preserve the source-versus-generated boundary and do not hand-edit generated output.
- Follow the repository's rollback or recovery and data-safety policy for every migration; if none exists, propose a recovery strategy and obtain approval before applying the migration.
- Deploy only to an environment explicitly named by the user; ask when none is named and leave unrelated environments untouched.
- Use the established local asset and emulator flow instead of hard-coding platform-specific configuration.
- Validate configuration with the provider or repository's supported dry-run or check command when available.
