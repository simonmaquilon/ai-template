# Tooling

Adapt the agent tooling once STACK's Selected Stack is settled. Batch every change of this step into one approval message with reason, impact, and alternatives (`03`, `28`).

## Skills

- Baseline skills, never retired, because the template's rules and documents rely on them: `commit`, `prompt`, `prompt-plan`, `start`, `security-audit`, `impeccable`, `playwright-cli`, `context7-mcp`. Retiring one is a deviation under `01`.
- Every other vendored skill in `.agents/skills/` is stack-specific: judge each against the Selected Stack and whether the project has a user-facing surface.
- Retire one with `node .scripts/run-pinned.mjs skills remove <names> -y`, after confirming the options with the pinned version's `--help` (`04`). Afterwards confirm that only that skill's folder and its `skills-lock.json` entry changed, and that `.claude/skills` is still a symlink. Never edit the lockfile by hand (`06`).
- Keep one the stack does not use by writing in its STACK skills Notes cell: `Kept by user decision on <YYYY-MM-DD>; the Selected Stack does not use it.`
- Add one only after checking publisher, provenance, license, and maintenance (`07`), with `node .scripts/run-pinned.mjs skills add <owner/repo>`; then review the `allowed-tools` and hooks it brings and record accepted grants in the permissions table of `.readme/90-agent-skills.md`.

## Tool servers

`context7` stays. Propose another server only when an official one exists for a selected technology, and add it as "Añadir otro servidor" in `.readme/95-agent-tool-servers.md` describes: declared in both `.mcp.json` and `.codex/config.toml`, with its row and section in that document, stating what data it receives.

## Language servers

- TypeScript and JavaScript: the plugin is enabled and stays, because the template's `.scripts/` are JavaScript. Offer `node .scripts/run-pinned.mjs --install typescript-language-server typescript`, which installs globally on the machine, after consent.
- Another language: follow "Añadir otro servidor" in `.readme/93-agent-language-servers.md`, with its STACK Project Tooling row. Codex has no language-server support.

## Notices only

- Codex asks to trust the repository's hooks in its first session (`.readme/92-agent-hooks.md`).
- Claude Code asks to approve each project tool server.
- No sandbox exemption until the project has an end-to-end runner (`.readme/91-agent-sandbox.md`).
