# Tooling

Adapt the agent tooling once stack.md's Selected Stack is settled, or, with existing code, once Platform Versions and Dependencies record the installed stack. Batch every change of this step into one approval message with reason, impact, and alternatives (`AGENTS.md`, `13`).

## Skills

- Baseline skills are the ones `.readme/90-agent-skills.md` lists as the template's base; the template's rules and documents rely on them, so they are never retired, and retiring one is a deviation under `01`.
- Stack-specific skills come from the optional catalog of `.readme/90-agent-skills.md`: propose the ones the Selected Stack, or the installed stack with existing code, uses, and `playwright-cli` only when the project adopts agent-operated browser verification.
- Add one only after checking publisher, provenance, license, and maintenance (`06`), with the install command that catalog documents, after confirming its options with the pinned version's `--help` (`03`); then review the `allowed-tools` and hooks it brings and record accepted grants in the permissions table of `.readme/90-agent-skills.md`.
- Keep one the stack does not use by writing in its stack.md skills Notes cell: `Kept by user decision on <YYYY-MM-DD>; the stack does not use it.`
- Afterwards confirm that only that skill's folder and its `skills-lock.json` entry changed, and that `.claude/skills` is still a symlink. Never edit the lockfile by hand (`03`).

## Tool servers

`context7` stays. Propose another server only when an official one exists for a selected technology, and add it as "Añadir otro servidor" in `.readme/95-agent-tool-servers.md` describes: declared in both `.mcp.json` and `.codex/config.toml`, with its row and section in that document, stating what data it receives.

## Language servers

- TypeScript and JavaScript: the plugin is enabled and stays, because the template's `.scripts/` are JavaScript. Offer `node .scripts/run-pinned.mjs --install typescript-language-server typescript`, which installs globally on the machine, after consent.
- Another language: follow "Añadir otro servidor" in `.readme/93-agent-language-servers.md`, with its stack.md Project Tooling row. Codex has no language-server support.

## Notices only

- Codex asks to trust the repository's hooks in its first session (`.readme/92-agent-hooks.md`).
- Claude Code asks to approve each project tool server.
- No sandbox exemption until the project has an end-to-end runner (`.readme/91-agent-sandbox.md`).
