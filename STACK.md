# Technology Stack

> Template: replace the bracketed content. Template Tooling belongs to the template and is replaced as a whole when adopting a newer template version; every other section belongs to the project.

This file is the single home of the technology stack: the selected stack, runtime and version constraints, approved target versions, the package manager, platform and dependency versions with their policy, UI libraries, validation and observability tooling, and the pinned tooling that agents run. [PRODUCT.md](PRODUCT.md) keeps the product decisions, [PLAN.md](PLAN.md) the architecture and delivery decisions, and [SECURITY.md](SECURITY.md) the security state of every component listed here. Outside the declared and resolved versions of Platform Versions and Dependencies, a value that a manifest, lockfile, or configuration file already pins is named by that file, never copied.

## Selected Stack

[In a new project, the chosen stack, or `delegated:` followed by what was chosen and why. This section is the authoritative source of the stack, and the code follows it. If the project already had code when this file was created, delete this section and the `Stack` section of PRODUCT.md: the installed stack governs.]

## Runtime and Version Constraints

- Runtime and supported versions: [name and range, or the file that pins it]
- Version constraints and their reasons: [constraint and why]

## Approved Target Versions

Technologies approved but not yet installed, with the version to use until installation resolves one; once installed, they move to Platform Versions or Dependencies.

| Technology | Target version | Approval |
| --- | --- | --- |
| [name] | [exact version] | [decision or reference] |

## Package Manager

- Package manager: [name]
- Version pinned in: [manifest field or file]

## Platform Versions

Covers runtimes, databases, platforms, and external services. The application's own version is the Current version of [SECURITY.md](SECURITY.md).

| Category | Component | Declared version | Resolved or deployed version | Source of truth | Support or EOL |
| --- | --- | --- | --- | --- | --- |
| [runtime] | [name] | [range] | [exact version] | [file or command] | [status or date] |

## Dependencies

- Dependency and license policy: [allowed licenses, sources, and constraints]

Covers every direct and transitive dependency, including frameworks, CLI tools, and binaries, except the tooling under Template Tooling and Project Tooling, through this table or an approved generated inventory or SBOM linked from here. When the detail lives outside this file, document its location, scope, and update method here without duplicating its rows. Mark anything unverified as unknown.

| Ecosystem | Package | Role | Relationship | Declared version | Resolved version | Manifest, lockfile, or SBOM | License | Maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ecosystem] | [package] | [production, development, build, or test] | [direct or transitive] | [range] | [exact version] | [path or identifier] | [SPDX or unverified] | [active, EOL, or unknown] |

## UI Libraries

- Component library or design system: [name, or none] — its usage rules are in Components of [DESIGN.md](DESIGN.md)
- Icon library: [name, or none]

## Validation Tooling

- Static analysis, formatting, and type checks: [tools]
- Test runners by level: [unit, integration, and end-to-end runners]

What each level validates is in the validation strategy of [PLAN.md](PLAN.md).

## Observability Tooling

- Logs, metrics, traces, and error tracking: [tools]

The observability approach is in [PLAN.md](PLAN.md).

## Template Tooling

The tooling that the template's agent configuration runs. The commands in `.readme/` run these packages through `node .scripts/run-pinned.mjs`, which takes the version from this table or from Project Tooling, so no command repeats it; changing a version is an update that `07-dependencies-and-binaries.md` subjects to approval.

| Package | Version | License | Origin | Verification |
| --- | --- | --- | --- | --- |
| `skills` | 1.7.0 | unverified | [vercel-labs/skills](https://github.com/vercel-labs/skills) | published with a provenance attestation from `vercel-labs/skills`; checked in the npm registry when pinned |
| `impeccable` | 4.1.0 | unverified | unverified | published without a provenance attestation; checked in the npm registry when pinned |
| `typescript-language-server` | 6.0.1 | Apache-2.0 | [typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) | published from GitHub Actions with a provenance attestation; registry signature and attestation checked with `npm audit signatures`; no dependencies or install scripts; requires Node 22.22.2 or later |
| `typescript` | 6.0.3 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | published by `typescript-bot`; registry signature checked with `npm audit signatures`; no dependencies or install scripts |

The rest of the agent tooling is pinned by its own configuration:

- External tool servers: `.mcp.json` and `.codex/config.toml`, described in [Agent tool servers](.readme/95-agent-tool-servers.md).
- Language-server and other Claude Code plugins: `enabledPlugins` in `.claude/settings.json`, described in [Agent language servers](.readme/93-agent-language-servers.md).
- Skills: `skills-lock.json`, described in [Agent skills](.readme/90-agent-skills.md).
- Continuous-integration actions, runners, and Node version: `.github/workflows/template-checks.yml`, described in [Template CI](.readme/94-template-ci.md).

## Project Tooling

Tooling that the project adds to the agent configuration, such as the binary of another language server, with the same columns as Template Tooling; adopting a newer template version never changes it.

| Package | Version | License | Origin | Verification |
| --- | --- | --- | --- | --- |
