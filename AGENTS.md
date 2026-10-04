# AGENTS.md

## Primary references

- [Product](PRODUCT.md)
- [Design](DESIGN.md)
- [Technology Stack](STACK.md)
- [Plan](PLAN.md)
- [Test Coverage Register](TESTS.md)
- [Bug Register](BUGS.md)
- [Security and Maintenance Register](SECURITY.md)

## Instruction routing

Instruction files live in `.agents/instructions/`. Load every file whose scope matches the request before acting, plus any file cited by a loaded rule that applies to the request, and only those.

### Governance

- `01-meta-guidelines.md`: before adding, renaming, removing, or editing any instruction file, the primary references or routing table in `AGENTS.md`, a primary-reference or root `README.md` skeleton, template-owned `.readme/` documentation, or `.agents/template-version`; authoring, naming, numbering, sizing, routing entries and their grouping, and retirement of instruction files, plus the skeletons, the baseline template version, how the maintained template is told apart from derived projects, and derived-project deviations.
- `03-approval-boundaries.md`: before sensitive or write actions, and whenever a decision needs the user's input; authorization for repository writes, version-control writes, dependencies, destructive actions, external changes, agent permissions and operating limits, open decisions, and confirmations.
- `04-sources-and-skills.md`: before selecting authoritative sources, skills, plugins, or tools, and before acting on a request an available or user-named skill covers, handling an unavailable capability, resolving an instruction conflict, or searching outside the workspace; the locations excluded from sources, the selected stack, fallbacks, official documentation, source-authority precedence, and conflicts between loaded instructions or between an explicit user instruction and a routed default.
- `15-language-and-naming.md`: when naming files or symbols, writing comments, scripts, commits, or documentation, or handling user-visible copy; comment, identifier, and document languages, existing-file divergences, user language, localization, and terminology.
- `20-response-and-reporting.md`: before the first substantive conversational response and before the final implementation report; concise response tone, copy-paste code blocks, clickable links, and closing reports.

### Change lifecycle

#### Discovery

- `02-change-workflow.md`: before every implementation, code change, or reported defect, regardless of size; the phase sequence of a change, ordered discovery, capability preflight, defect entry, unresolved markers in primary references, and usage sweeps.
- `10-code-indexing.md`: before locating, reading, or changing code for any implementation, fix, refactor, review, or question about existing behavior, and before managing index state; index detection, freshness, coverage, fallback, and index-state management.
- `29-language-servers.md`: before locating, reading, or changing code, and before enabling, installing, updating, or removing a language server; server detection, exact symbol resolution, usage sweeps, diagnostics, and fallback when none is configured.
- `05-repo-layout.md`: when moving code, removing files or directories, or deciding where a new piece belongs; ownership boundaries, locating new work, `.scripts/` boundaries and portability, and directory lifecycle.

#### Specification

- `30-change-specification.md`: before the first edit of every implementation or code change, and whenever its acceptance criteria, affected contracts, or scope must change; specification content, acceptance criteria and their checks, preservation criteria, the specification gate, test-first criteria, and specification revisions.

#### Implementation

- `14-code-authoring.md`: before writing or modifying code; generated artifacts and their canonical source, implementation simplicity, SOLID principles, abstraction, comments, source-file size, and edit scope.
- `06-commands-and-local-runtime.md`: before running repository commands that build, test, format, generate, start, stop, deploy, or otherwise modify project state, and before managing repository tooling, recovering local services, operating agent-operated browser sessions, or writing temporary or ad-hoc artifacts; command discovery, scripts, URLs, lockfiles, local service recovery, and `.temp/` artifacts.
- `07-dependencies-and-binaries.md`: when evaluating, adding, updating, replacing, or removing dependencies, CLI tools, or binaries; reuse, migration coexistence, release selection, provenance, the dependency inventory, and update approval.
- `33-stack-register.md`: before editing `STACK.md`, and before recording, changing, or relying on the selected stack, runtime or version constraints, approved target versions, the package manager, platform or dependency versions, the dependency and license policy, UI libraries, validation or observability tooling, or the pinned versions of agent tooling; the single home of the technology stack, values pinned elsewhere, boundaries with the product, plan, and security registers, template and project tooling, pinned tool execution, generated blocks, and section ownership.

#### Verification

- `31-verification-loop.md`: after implementing a specified change, whenever one of its checks fails, and before reporting it complete; fix directives, loop cycles, stop conditions, over-correction reports, unvalidated closings, and independent verification.
- `17-validation-policy.md`: before choosing, running, or reporting validation and before closing changes; validation scope, local environment drift, reruns, documentation checks, agent-operated browser verification of web surfaces, failure resolution, environment-blocked checks, and bypass prevention.
- `18-testing-and-coverage.md`: when planning, writing, or executing automated tests, deciding the test level a change needs, or recording coverage, gaps, or manual or agent-operated verification; test levels, what counts as automated coverage, project/framework test tooling, regression, coverage gates, the test coverage register, and test execution.
- `19-diagnosis-and-review.md`: when debugging, reviewing, or auditing code, configuration, documentation, instructions, or runtime behavior; root-cause analysis, evidence, findings, and diagnosis-only boundaries.

#### Closing

- `21-document-maintenance.md`: before editing `README.md`, a primary reference, or any document under `.readme/`, and before closing any change that touched product source or configuration; content ownership, synchronization triggers, authoritative evidence, update sequence, and reconciliation.
- `16-documentation.md`: when creating, locating, naming, renaming, relocating, or licensing project documentation; documentation placement, canonical and third-party locations, `.readme/` naming, and on-demand licensing.
- `27-version-control.md`: before staging, committing, changing ignore rules, or composing a pull request or its description; staging scope, ignore rules, commit granularity, commit message content, branch selection, and pull-request composition.

### Specialized areas

#### Interface

- `11-frontend-and-components.md`: when touching user-facing interfaces, client routes, layouts, state, or visual components; framework detection, state ownership, data loading, component boundaries, and accessibility.
- `12-ui-theming-and-tokens.md`: when changing theme entrypoints, design tokens, colors, or color modes; token declaration, semantic tokens, color-mode coverage, and accessible contrast.
- `13-ui-design-workflow.md`: before creating, redesigning, auditing, or changing UI or UX; design references, pre-edit design, per-task critique, complete-screen and flow audits, scoped polish, bounded visual verification, accessibility criteria, and design-system consistency.

#### Data and security

- `08-storage-and-secrets.md`: when touching storage, buckets, media, sensitive data, credentials, environment files, or secrets; storage boundaries, secret handling, data classification, and lifecycle controls.
- `22-security-and-trust-boundaries.md`: before changing authentication, authorization, externally reachable surfaces, sessions, permissions, sensitive operations, untrusted data ingestion, or audit behavior; trust boundaries, untrusted input, abuse controls, and security validation.
- `32-security-review-workflow.md`: before implementing or reviewing source code, runtime configuration, dependencies, or automated workflows; continuous security guidance, edit-hook candidates, scoped task-diff review, evidence, and coordination with independent verification.
- `23-data-integrity-and-migrations.md`: before changing persistent schemas, migrations, backfills, transactional workflows, stored-data transformations, or compatibility between data readers and writers; atomicity, recovery, migration application, and data validation.

#### Platform and contracts

- `09-runtime-and-deployment.md`: when touching runtime configuration, environment bindings, migration deployment ordering, generated platform types, or deployment behavior; runtime targets, environments, platform bindings, component version synchronization, and deployments.
- `24-runtime-reliability-and-observability.md`: before changing external I/O, background work, retries, queues, schedules, caches, health checks, runtime telemetry, resource-sensitive paths, or performance-critical behavior; failure handling, resource limits, and performance evidence.
- `25-contracts-and-compatibility.md`: before changing APIs, events, messages, webhooks, command interfaces, configuration schemas, serialized formats, generated clients, or any contract shared across components, versions, repositories, or external consumers; compatibility, versioning, deprecation, and consumer validation.

#### Automation and agent tooling

- `26-automated-workflows.md`: when creating or changing continuous-integration, delivery, or scheduled automation configuration, or the checks, credentials, and dependencies it runs; required checks, automation credentials, and pinned automation dependencies.
- `28-agent-tooling-configuration.md`: when adding, changing, or removing repository-declared agent tooling: client settings, external tool servers, hooks, or vendored skill and plugin content; the permissions they pre-approve, sandbox exemptions, tooling credentials, operating-system support, and cross-client consistency.
