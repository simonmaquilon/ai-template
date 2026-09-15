# Repo Layout

Read when moving code, removing files or directories, or deciding where a new piece belongs.

- Discover ownership boundaries from root references, manifests, build configuration, and existing directories before choosing a location.
- Place new work beside the feature or domain that owns it and preserve established client, server, infrastructure, test, generated, and documentation boundaries.
- Put code in a shared area only when it has multiple real consumers and no domain-specific runtime dependency.
- Follow existing locations and naming for commands, migrations, fixtures, assets, and generated output.
- Reserve `.scripts/` for repository-owned developer or operational tasks, whether invoked manually or by repository automation, including repeatable tasks.
- Keep `.scripts/` outside application and framework runtime dependencies.
- Repository commands and automation may invoke `.scripts/` helpers under `06-commands-and-local-runtime.md` and `26-automated-workflows.md`.
- Keep workflow definitions, schedules, and continuous-integration configuration out of `.scripts/`; `26-automated-workflows.md` governs where they live.
- Keep long-running processes and required application or framework code out of `.scripts/` and in the location their framework or owning domain defines.
- Create a top-level file or directory when required by the explicit request, approved technology, fixed template structure, or a clearly established repository ownership and layout pattern; ask before introducing a new top-level boundary without that evidence or when it changes architecture.
- Create a directory only together with the first file it holds, except the fixed template directories that ship with a placeholder.
- Remove a directory when its last file leaves it, unless the fixed template structure requires it.
- If ownership is ambiguous, reuse the nearest established pattern and state the choice in the closing report.
