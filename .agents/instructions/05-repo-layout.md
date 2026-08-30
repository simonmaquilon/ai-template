# Repo Structure

Read when moving code or deciding where a new piece belongs.

- Discover ownership boundaries from root references, manifests, build configuration, and existing directories before choosing a location.
- Place new work beside the feature or domain that owns it and preserve established client, server, infrastructure, test, generated, and documentation boundaries.
- Put code in a shared area only when it has multiple real consumers and no domain-specific runtime dependency.
- Follow existing locations and naming for commands, migrations, fixtures, assets, and generated output.
- Reserve `.scripts/` for manually invoked, optional developer or operational tasks, including repeatable tasks.
- Treat everything in `.scripts/` as optional: the application must build, run, and deploy without any of it.
- Keep long-running processes, application or framework code, configuration, and automation (Nuxt, React, and equivalents) out of `.scripts/`, in the location their framework or owning domain defines.
- Create a top-level file or directory only when required by the explicit request, the approved framework, or the fixed template structure; ask before introducing any other top-level boundary.
- Create a directory only together with the first file it holds, except the fixed template directories that ship with a placeholder.
- Remove a directory when its last file leaves it, unless the fixed template structure requires it.
- If ownership is ambiguous, reuse the nearest established pattern and state the choice in the closing report.
