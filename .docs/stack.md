# Technology Stack

The technology the project uses and the tooling its agents run. Product decisions live in [product.md](product.md), technical decisions in [plan.md](plan.md), and each component's security state in [security.md](security.md). `.scripts/sync-stack.mjs` rewrites the blocks between `stack:generated` markers from the files that pin them, through the agent hooks: edit only their Notes column. Outside those blocks and the version tables, name the file that pins a value instead of copying it. Template Tooling belongs to the template; every other section belongs to the project. Replace each `TODO`.

## Selected Stack

TODO: the chosen stack, or `delegated:` with what was chosen and why. With existing code, delete this section: the installed stack governs.

## Runtime and Version Constraints

- Runtime and supported versions: TODO
- Version constraints and their reasons: TODO

<!-- stack:generated runtime -->
_None found in package.json engines, .nvmrc, or .node-version._
<!-- /stack:generated runtime -->

## Approved Target Versions

Approved but not yet installed; a row moves to Platform Versions or Dependencies once installation resolves its version.

| Technology | Target version | Approval |
| --- | --- | --- |
| TODO | TODO | TODO |

## Package Manager

<!-- stack:generated package-manager -->
_None found in package.json packageManager or a lockfile._
<!-- /stack:generated package-manager -->

## Platform Versions

Runtimes, databases, platforms, and external services. The application's own version is in [security.md](security.md).

| Component | Declared version | Resolved or deployed version | Source of truth | Support or EOL |
| --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO |

## Dependencies

- Dependency and license policy: TODO

Direct dependencies of package.json:

<!-- stack:generated dependencies -->
_None found in package.json._
<!-- /stack:generated dependencies -->

Other ecosystems, and transitive dependencies through an inventory or SBOM linked here:

| Ecosystem | Package | Role | Declared version | Resolved version | Manifest or lockfile | License | Maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Libraries and Tools

- UI component library or design system: TODO
- Icons: TODO
- Static analysis, formatting, and type checks: TODO
- Test runners by level: TODO
- Logs, metrics, traces, and error tracking: TODO

## Template Tooling

The tooling that the template's agent configuration runs. The commands in `.readme/` run these packages through `node .scripts/run-pinned.mjs`, which takes the version from this table or from Project Tooling, so no command repeats it; changing a version is an update that `06-dependencies-and-stack.md` subjects to approval.

| Package | Version | License | Origin | Verification |
| --- | --- | --- | --- | --- |
| `skills` | 1.7.4 | MIT | [vercel-labs/skills](https://github.com/vercel-labs/skills) | published with a provenance attestation from `vercel-labs/skills`; checked in the npm registry when pinned |
| `typescript-language-server` | 6.0.1 | Apache-2.0 | [typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) | published from GitHub Actions with a provenance attestation; registry signature and attestation checked with `npm audit signatures`; no dependencies or install scripts; requires Node 22.22.2 or later |
| `typescript` | 6.0.3 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | published by `typescript-bot`; registry signature checked with `npm audit signatures`; no dependencies or install scripts |
| `playwright` | 1.64.0 | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright) | published from GitHub Actions with a provenance attestation; registry signatures and attestations of it and its only dependency, `playwright-core` at the same version, checked with `npm audit signatures`; no install scripts; `.scripts/browser.mjs` installs it with npm in a per-user cache outside the repository, not through `run-pinned.mjs`, and runs its `cli` command for agent-operated browser sessions |

The rest of the agent tooling is pinned by its own configuration and listed under Agent and Automation Inventory.

## Project Tooling

Tooling that the project adds to the agent configuration, such as the binary of another language server, with the same columns as Template Tooling; adopting a newer template version never changes it.

| Package | Version | License | Origin | Verification |
| --- | --- | --- | --- | --- |

## Agent and Automation Inventory

Generated from the files that pin each part; their configuration is described in [Agent skills](../.readme/90-agent-skills.md), [Agent language servers](../.readme/93-agent-language-servers.md), and [Agent tool servers](../.readme/95-agent-tool-servers.md).

### Skills

<!-- stack:generated skills -->
| Skill | Source | Pinned by | Notes |
| --- | --- | --- | --- |
| commit | this repository | none | |
| prompt | this repository | none | |
| prompt-plan | this repository | none | |
| security-audit | cloudflare/security-audit-skill | skills-lock.json | |
| start | this repository | none | |
<!-- /stack:generated skills -->

### External Tool Servers

<!-- stack:generated mcp-servers -->
| Server | Claude Code | Codex | Endpoint or command | Notes |
| --- | --- | --- | --- | --- |
| context7 | yes | yes | https://mcp.context7.com/mcp | |
<!-- /stack:generated mcp-servers -->

### Claude Code Plugins

<!-- stack:generated plugins -->
| Plugin | Marketplace | Enabled | Notes |
| --- | --- | --- | --- |
| typescript-lsp | claude-plugins-official | yes | |
<!-- /stack:generated plugins -->

### Workflows

<!-- stack:generated workflows -->
| Workflow | Runners | Node | Actions | Notes |
| --- | --- | --- | --- | --- |
| template-checks.yml | ubuntu-24.04, windows-2025 | 24 | actions/checkout v7.0.1, actions/setup-node v7.0.0 | |
<!-- /stack:generated workflows -->
