# Technology Stack

The technology the project uses and the tooling its agents run. Product decisions live in [product.md](product.md), technical decisions in [plan.md](plan.md), and each component's security state in [security.md](security.md). `.scripts/update-stack-doc.mjs` rewrites the blocks between `stack:generated` markers from the files that pin them, through the agent hooks: edit only their Notes column. Outside those blocks and the version tables, name the file that pins a value instead of copying it. Template Tooling belongs to the template; every other section belongs to the project. Replace each `TODO`.

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

TODO: when the block above finds none, as in a stack without `package.json`, name the package manager and the file that pins it; otherwise delete this line.

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

The tooling that the template's agent configuration runs. `.agents/tool-versions.json` records, for each package, its exact version, integrity hash, publication and resolution dates, source repository, license, and any hold on a version line with its reason. A version is never written by hand: `node .scripts/tool-versions.mjs --refresh` resolves it from the npm registry as the dist-tag `latest` when that is stable and at least 7 days old, otherwise the newest stable version before it that is, inside the held line, and records it only when its provenance attestation names the recorded repository; it runs only when asked, and outside the client sandbox, which protects the file. The commands in `.readme/` run these packages through `node .scripts/run-pinned.mjs`, which takes the version from that file, or from Project Tooling for a package the file does not list, so no command repeats it; `06-dependencies-and-stack.md` subjects a refresh that changes a version to approval. The block below is generated from the file: edit only its Notes column.

<!-- stack:generated template-tooling -->
| Package | Version | Published | License | Origin | Retention | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `playwright` | 1.64.0 | 2026-10-07 | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright) | line 1.64.0: the launcher filter .scripts/browser-args.mjs lists the options of 1.64.0, and 1.65.0 adds console --all, requests --all and cookie-delete --domain and --path | its provenance is checked by `--refresh`; its only dependency, `playwright-core` at the same version, is recorded with its integrity hash too; no install scripts; `.scripts/browser.mjs` installs it with npm in a per-user cache outside the repository, not through `run-pinned.mjs`, refuses an install whose integrity hash is not the recorded one, and runs its `cli` command for agent-operated browser sessions |
| `skills` | 1.7.6 | 2026-11-03 | MIT | [vercel-labs/skills](https://github.com/vercel-labs/skills) | none | its provenance is checked by `--refresh`; `run-pinned.mjs` runs it with `npx` |
| `typescript` | 6.0.3 | 2026-04-16 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | line 6: typescript-language-server wraps tsserver, which TypeScript 7 does not ship; its README installs typescript@6 | published by `typescript-bot` without a provenance attestation, an exception recorded in `.agents/tool-versions.json`; no step of the template validates its signature, and `npm audit signatures` is a manual check that nobody runs; no install scripts |
| `typescript-language-server` | 6.0.3 | 2026-11-02 | Apache-2.0 | [typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) | none | its provenance is checked by `--refresh`; no install scripts; the Node version it requires is in its `engines` |
<!-- /stack:generated template-tooling -->

The rest of the agent tooling is pinned by its own configuration and listed under Agent and Automation Inventory.

### Client Requirements

| Client | Minimum version | Requirement | Source |
| --- | --- | --- | --- |
| Claude Code | 2.1.233 | Task tracking in all models via `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` in `.claude/settings.json` | [Environment variables](https://code.claude.com/docs/en/env-vars) |

## Project Tooling

Tooling that the project adds to the agent configuration, such as the binary of another language server, with the columns below, which hold the version `run-pinned.mjs` reads; adopting a newer template version never changes it.

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
| context7 | yes | yes | `https://mcp.context7.com/mcp` | |
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
