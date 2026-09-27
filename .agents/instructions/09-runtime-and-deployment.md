# Runtime and Deployment

Read when touching runtime configuration, environment bindings, migration deployment ordering, generated platform types, or deployment behavior.

- Discover the runtime, deployment targets, selected tools, and environments from `PLAN.md` first, then repository manifests, infrastructure files, and project documentation before editing.
- Keep application, runtime, platform, database, and external-service versions synchronized in `SECURITY.md` under `21-document-maintenance.md`, including their source of truth, support status, security state, and last verification; record libraries, frameworks, CLI tools, and binaries, and anything only template-owned agent tooling or automation requires, where `07-dependencies-and-binaries.md` records them.
- Treat platform bindings and types as generated artifacts under `14-code-authoring.md`; discover their runtime or platform generation requirements before using the established project workflow.
- Apply `23-data-integrity-and-migrations.md` to persistent schema changes, migrations, and backfills; keep deployment ordering and recovery compatible with every affected target environment.
- Deploy only to an environment explicitly named by the user; ask when none is named and leave unrelated environments untouched.
- When a local asset or emulator flow is configured, use it instead of hard-coding platform-specific behavior; otherwise use the documented supported environment without inventing local substitutes or configuration to bypass constraints.
- Validate configuration with the provider or repository's supported dry-run or check command when available.
