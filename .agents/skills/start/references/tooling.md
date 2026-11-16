# Tooling

Adapt the agent tooling once stack.md's Selected Stack is settled, or, with existing code, once Platform Versions and Dependencies record the installed stack. Batch every change of this step into one approval message with reason, impact, and alternatives (`AGENTS.md`, `13`).

## Skills

- Baseline skills are the ones `.readme/90-agent-skills.md` lists as the template's base; the template's rules and documents rely on them, so they are never retired, and retiring one is a deviation under `01`.
- Stack-specific skills come from the optional catalog of `.readme/90-agent-skills.md`: propose the ones the Selected Stack, or the installed stack with existing code, uses, and `playwright-cli` only when the project adopts agent-operated browser verification.
- Add one only after checking publisher, provenance, license, and maintenance (`06`), with the install command that catalog documents, after confirming its options with the pinned version's `--help`, as `node .scripts/run-pinned.mjs <package> --help` (`03`); then review the `allowed-tools` and hooks it brings and record accepted grants in the permissions table of `.readme/90-agent-skills.md`.
- Keep one the stack does not use by writing in its stack.md skills Notes cell: `Kept by user decision on <YYYY-MM-DD>; the stack does not use it.`
- Afterwards confirm that only that skill's folder and its `skills-lock.json` entry changed, and that `.claude/skills` is still a symlink. Never edit the lockfile by hand (`03`).
- The launcher of the browser capability is exempt from the sandbox through `node .scripts/browser.mjs*` in `sandbox.excludedCommands` of `.claude/settings.json`, which serves nothing else: when the project does not adopt agent-operated browser verification, include removing that entry in this step's approval message unless step 2 already did, and leave it when the project adopts it or while plan.md leaves that line as `TODO` with a backlog.md entry, until that entry is resolved. A project that adopts the capability later adds the entry back, and one that drops it later removes the entry (`.readme/90-agent-skills.md`).

## End-to-end runner

- When `plan.md` adopts end-to-end tests that start a browser, an Electron app, or a mobile emulator or simulator, include in this step's approval message the `sandbox.excludedCommands` exemption for the exact command of the project's runner, in the form the repository publishes it (`03`), with a space before the final `*` when the command takes arguments so that no other script with the same prefix is covered, and the shape `.readme/91-agent-sandbox.md` requires.
- State its reason and risk: on macOS a runner that starts a browser or an Electron app, or that reaches a mobile simulator, cannot run inside the sandbox, and the failure looks like a broken start; the exemption runs the project's tests and scripts outside the sandbox, which `filesystem.denyWrite` does not protect; Codex has no per-command exemption, so the runner asks for the sandbox escalation.
- When `plan.md` adopts end-to-end tests of a mobile app, offer in the same message, as a separate item, the exemption `node .scripts/device.mjs *` for the device launcher, which the template does not declare: it checks requirements and lists, boots and shuts down emulators and simulators that already exist, and cannot reach them inside the sandbox; it runs the SDK and system tools the environment points to, outside the sandbox (`.readme/90-agent-skills.md`).
- Add each one only after an explicit yes, and record it in the project's own copy of `.readme/91-agent-sandbox.md`; without a yes, leave it unexempted and say so in the report.
- When the project has no runner command yet because it adds the dependency later, add nothing, and record the offer in its own backlog.md entry (`11`) until the command exists; an offer the user declines or postpones gets its own entry too, since the line itself is adopted and has none. An API-only runner needs no exemption until a confined run shows a sandbox restriction (`04`).

## Tool versions

`.agents/tool-versions.json` records the version and integrity hash of the tools the template runs; the scripts read it, and nothing changes it but `node .scripts/tool-versions.mjs --refresh`.

- Offer the refresh in this step's approval message: it re-resolves each recorded package from the npm registry by the rule of `.scripts/tool-versions-select.mjs` (stable `latest` old enough, or the newest stable version before it that is), keeps each hold with its reason, accepts a version only with a provenance attestation naming the recorded repository, or without one when the entry records a `provenanceException`, installs nothing, and prints each previous and new version. State that it runs outside the client sandbox, with that approval, because the project protects the file; run it only after an explicit yes, and keep the versions as shipped on any other answer.
- Confirm that `.agents/tool-versions.json` is in `sandbox.filesystem.denyWrite` of `.claude/settings.json`, which launchers outside the sandbox trust; when it is missing, include adding it in the same message.
- After a refresh, run `node .scripts/tool-versions.mjs --check` and confirm with the version's `--help`, as `node .scripts/run-pinned.mjs <package> --help`, that the commands `.readme/90-agent-skills.md` cites still exist (`03`).

## Tool servers

`context7` stays. When the project has a mobile app, offer `appium-mcp` for agent-operated sessions as a separate item of this step's approval message, stating that it runs outside the sandbox with the machine's SDK tools, what it can do on a device and on the machine, that only the approval of each call limits it, and that under Codex a confined command can rewrite its launcher and its recorded version, which only Claude Code's `filesystem.denyWrite` protects; only after an explicit yes, record its version with `node .scripts/tool-versions.mjs --add`, which writes a protected file and so runs outside the sandbox (`.readme/91-agent-sandbox.md`), and declare it, launched through `.scripts/mobile-server.mjs`, with the restrictions `.readme/95-agent-tool-servers.md` gives, in both clients; without a yes, declare nothing and say so in the report. Propose another server only when an official one exists for a selected technology, and add it as "Añadir otro servidor" in `.readme/95-agent-tool-servers.md` describes: declared in both `.mcp.json` and `.codex/config.toml`, with its row and section in that document, stating what data it receives.

## Language servers

- TypeScript and JavaScript: the plugin is enabled and stays, because the template's `.scripts/` are JavaScript. Offer `node .scripts/run-pinned.mjs --install typescript-language-server typescript`, which installs globally on the machine, after consent.
- Another language: follow "Añadir otro servidor" in `.readme/93-agent-language-servers.md`, with its stack.md Project Tooling row. Codex has no language-server support.

## Notices only

- Codex asks to trust the repository's hooks in its first session (`.readme/92-agent-hooks.md`).
- Claude Code asks to approve each project tool server.
- No sandbox exemption for a runner the project does not have yet (`.readme/91-agent-sandbox.md`): the end-to-end runner's one is offered as the End-to-end runner section says, and the launcher's stays, or comes back, only when the project adopts agent-operated browser verification.
