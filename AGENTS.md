# AGENTS.md

## Primary references

- [Product](PRODUCT.md)
- [Design](DESIGN.md)
- [Plan](PLAN.md)
- [Security Register](SECURITY.md)

## Instruction routing

Instruction files live in `.agents/instructions/`. Load every file whose scope matches the request before acting, and only those. Read `01-meta-guidelines.md` before adding, renaming, or editing any file in this table.

- `01-meta-guidelines.md`: authoring, naming, numbering, sizing, and routing of instruction files.
- `02-change-workflow.md`: implementation scope, capability preflight, defect entry, unresolved decisions, and usage sweeps.
- `03-approval-boundaries.md`: Git writes, dependencies, destructive actions, external changes, open decisions, and confirmations.
- `04-sources-and-skills.md`: selecting repository sources, skills, plugins, and official documentation.
- `05-repo-layout.md`: discovering ownership boundaries and locating new work.
- `06-commands-and-local-runtime.md`: repository commands, scripts, URLs, lockfiles, and local service recovery.
- `07-dependencies-and-binaries.md`: evaluating, adding, updating, replacing, or removing dependencies, CLI tools, or binaries.
- `08-storage-and-secrets.md`: storage boundaries, sensitive data, credentials, environment files, and secrets.
- `09-runtime-and-deployment.md`: runtime targets, environments, platform bindings, migrations, and deployments.
- `10-code-indexing.md`: code index detection, structural exploration, freshness, coverage, and fallback.
- `11-frontend-and-components.md`: framework detection, user-facing routes, state ownership, data loading, component boundaries, and accessibility.
- `12-ui-theming-and-tokens.md`: theme entrypoints, design tokens, color modes, and accessible contrast.
- `13-ui-design-workflow.md`: UI/UX creation, redesign, audit, polish, accessibility, and visual validation.
- `14-code-authoring.md`: implementation simplicity, SOLID principles, abstraction, comments, and edit scope.
- `15-language-and-naming.md`: English code and commits, Spanish operational docs, primary-reference language, user language, localization, and terminology.
- `16-documentation.md`: documentation placement, root exceptions, `.readme/` naming, and on-demand licensing.
- `17-validation-policy.md`: validation scope, reruns, documentation checks, and bypass prevention.
- `18-testing-and-coverage.md`: test levels, project/framework test tooling, regression, and test execution.
- `19-diagnosis-and-review.md`: debugging, root-cause analysis, reviews, audits, evidence, and findings.
- `20-response-and-reporting.md`: concise response tone, copy-paste code blocks, clickable links, and closing reports.
- `21-document-maintenance.md`: content ownership, synchronization triggers, authoritative evidence, update sequence, and reconciliation for root references and `.readme/` documentation; also required before closing any change to product source or configuration.
