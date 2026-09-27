# AGENTS.md

## Primary references

- [Product](PRODUCT.md)
- [Design](DESIGN.md)
- [Plan](PLAN.md)
- [Test Coverage Register](TESTS.md)
- [Bug Register](BUGS.md)
- [Security and Maintenance Register](SECURITY.md)

## Instruction routing

Instruction files live in `.agents/instructions/`. Load every file whose scope matches the request before acting, plus any file a loaded rule cites, and only those. Read `01-meta-guidelines.md` before adding, renaming, removing, or editing any file in this table, the primary references or this routing table itself, a primary-reference or root `README.md` skeleton, template-owned `.readme/` documentation, or `.agents/template-version`.

- `01-meta-guidelines.md`: authoring, naming, numbering, sizing, routing, and retirement of instruction files, plus the primary references and root `README.md`, their skeletons, template-owned `.readme/` documentation, the baseline template version, and derived-project deviations.
- `02-change-workflow.md`: every implementation or code change, ordered discovery, capability preflight, defect entry, unresolved markers in primary references, and usage sweeps.
- `03-approval-boundaries.md`: authorization for repository writes, version-control writes, dependencies, destructive actions, external changes, agent permissions and operating limits, open decisions, and confirmations.
- `04-sources-and-skills.md`: selecting repository sources and the locations excluded from them, skills, plugins, fallbacks, official documentation, searching outside the workspace, source-authority precedence, and conflicts between loaded instructions or between an explicit user instruction and a routed default.
- `05-repo-layout.md`: discovering ownership boundaries, locating new work, `.scripts/` boundaries and portability, and directory lifecycle.
- `06-commands-and-local-runtime.md`: repository commands, scripts, URLs, lockfiles, local service recovery, agent-operated browser sessions, and `.temp/` artifacts.
- `07-dependencies-and-binaries.md`: evaluating, adding, updating, replacing, or removing dependencies, CLI tools, or binaries.
- `08-storage-and-secrets.md`: storage boundaries, sensitive data, credentials, environment files, and secrets.
- `09-runtime-and-deployment.md`: runtime targets, environments, platform bindings, component version synchronization, migration deployment ordering, and deployments.
- `10-code-indexing.md`: before locating, reading, or changing code for any implementation, fix, refactor, review, or question about existing behavior; index detection, freshness, coverage, fallback, and index-state management.
- `11-frontend-and-components.md`: framework detection, user-facing routes, state ownership, data loading, component boundaries, and accessibility.
- `12-ui-theming-and-tokens.md`: theme entrypoints, design tokens, color modes, and accessible contrast.
- `13-ui-design-workflow.md`: UI/UX creation, redesign, audit, polish, accessibility, and visual validation.
- `14-code-authoring.md`: writing or modifying code, generated artifacts and their canonical source, implementation simplicity, SOLID principles, abstraction, comments, source-file size, and edit scope.
- `15-language-and-naming.md`: comment, identifier, and document languages, existing-file divergences, commits, user language, localization, and terminology.
- `16-documentation.md`: documentation placement, canonical and third-party locations, `.readme/` naming, and on-demand licensing.
- `17-validation-policy.md`: before choosing or reporting validation and before closing changes; validation scope, local environment drift, reruns, documentation checks, agent-operated browser verification of web surfaces, failure resolution, environment-blocked checks, and bypass prevention.
- `18-testing-and-coverage.md`: test levels, what counts as automated coverage, project/framework test tooling, regression, coverage gates, the test coverage register, and test execution.
- `19-diagnosis-and-review.md`: debugging, root-cause analysis, reviews, audits, evidence, and findings.
- `20-response-and-reporting.md`: concise response tone, copy-paste code blocks, clickable links, and closing reports.
- `21-document-maintenance.md`: content ownership, synchronization triggers, authoritative evidence, update sequence, and reconciliation for root references and `.readme/` documentation; also required before closing any change to product source or configuration.
- `22-security-and-trust-boundaries.md`: authentication, authorization, externally reachable surfaces, trust boundaries, untrusted input, sensitive operations, abuse controls, audit behavior, and security validation.
- `23-data-integrity-and-migrations.md`: persistent schemas, compatibility, atomicity, migrations, backfills, recovery, and data validation.
- `24-runtime-reliability-and-observability.md`: external I/O, failure handling, retries, background work, queues, schedules, caches, runtime telemetry, health, resource limits, and performance evidence.
- `25-contracts-and-compatibility.md`: APIs, events, messages, webhooks, command interfaces, configuration schemas, serialization, versioning, deprecation, and consumer compatibility.
- `26-automated-workflows.md`: continuous-integration, delivery, and scheduled automation configuration, required checks, automation credentials, and pinned automation dependencies.
- `27-version-control.md`: staging scope, ignore rules, commit granularity, commit message content, branch selection, and pull-request composition.
- `28-agent-tooling-configuration.md`: repository-declared agent clients, external tool servers, hooks, vendored skill and plugin content and the permissions they pre-approve, sandbox exemptions, tooling credentials, operating-system support, and cross-client consistency.
- `29-language-servers.md`: before locating, reading, or changing code, and before enabling, installing, updating, or removing a language server; server detection, exact symbol resolution, usage sweeps, diagnostics, and fallback when none is configured.
