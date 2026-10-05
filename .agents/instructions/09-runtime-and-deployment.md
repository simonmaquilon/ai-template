# Runtime and Deployment

Read when touching runtime configuration, environment bindings, migration deployment ordering, generated platform types, or deployment behavior, and before deploying.

- Before editing, discover the selected stack under `04-sources-and-skills.md`, the runtime and selected tools from `STACK.md`, and the deployment targets and environments from `PLAN.md` first, then from repository manifests, infrastructure files, and project documentation.
- Keep runtime, platform, database, and external-service versions synchronized in `STACK.md` under `33-stack-register.md` with their source of truth and support status; record libraries, frameworks, CLI tools, and binaries, and anything only agent tooling or automation requires, where `07-dependencies-and-binaries.md` records them.
- Record the application's own version in `SECURITY.md` under `21-document-maintenance.md`.
- Treat platform bindings and types as generated artifacts under `14-code-authoring.md`; discover their runtime or platform generation requirements before using the established project workflow.
- Apply `23-data-integrity-and-migrations.md` to persistent schema changes, migrations, and backfills; keep deployment ordering and recovery compatible with every affected target environment.
- Deploy only to an environment explicitly named by the user; ask when none is named and leave unrelated environments untouched.
- After a deploy, verify the deployed behavior in the target environment through the checks `PLAN.md` records, and when verification fails, recover through its recovery approach under `03-approval-boundaries.md` instead of deploying further changes.
- When a local asset or emulator flow is configured, use it instead of hard-coding platform-specific behavior; otherwise use the documented supported environment without inventing local substitutes or configuration to bypass constraints.
- Validate configuration with the provider or repository's supported dry-run or check command when available.
