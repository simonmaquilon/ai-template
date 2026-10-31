# Code Authoring

Read before writing or modifying code, placing new files, or running repository commands or local services in a normal or risk change.

- Follow implementation style in this order: the selected stack and its constraints in `.docs/stack.md`, the technical decisions in `.docs/plan.md`, the repository's documented standards, official guidance for the installed version, then surrounding convention; report any deliberate divergence.
- The selected stack is the one the Selected Stack section of `.docs/stack.md` names, or the installed stack when that section is absent.
- Before writing code against a library, framework, or platform API, check its official documentation for the version the lockfile or runtime resolves, or the approved target version `.docs/stack.md` records for a technology not yet installed; prefer documentation skills and configured documentation tools over web search, confirm the result matches that library and version, and state any gap.
- A skill describes a tool as of the version it was written for; confirm its commands against the installed version's help or documentation, preferring the version the repository pins.
- Apply SOLID only as far as demonstrated complexity requires: keep single-use logic local, extract shared code when the same intent repeats, and add abstractions only for real boundaries, substitution, or several consumers.
- Comment only when the reason is not evident, matching the surrounding density; keep test titles in their suite's language, and report remaining language divergence instead of translating whole files.
- Treat an unfinished change handed over from another session as the in-scope baseline: review all of it against the request before building on it, without inheriting its unverified claims.
- Edit the canonical source of a generated artifact and regenerate it through the project workflow; keep lock and integrity files valid without hand-editing hashes; when no generation workflow exists, find the supported method in skills and official documentation and report the gap instead of inventing one.
- Keep each source file, tests included, within the line limit the repository's checks enforce, splitting along responsibility boundaries, and never grow a file already over it; documentation, data, configuration, lockfiles, binaries, generated or vendored files, and skill content are exempt, and an exempt file the check does not recognize gets the exemption attribute in `.gitattributes`.
- Discover ownership from manifests, build configuration, and existing directories, and place new work beside the feature or domain that owns it; when ownership is ambiguous, reuse the nearest established pattern and say so.
- Put code in a shared area only when it has several real consumers and no domain-specific runtime dependency.
- Create a top-level file or directory only when the request, an approved technology, the template structure, or an established layout requires it; otherwise ask.
- Create a directory together with its first file, and remove it when its last file leaves, except the fixed template directories.
- Reserve `.scripts/` for repository-owned developer and operational tasks, outside application runtime dependencies, runnable on every supported operating system without a particular shell, and free of workflow definitions, long-running processes, and required application code.
- Discover commands from repository instructions, `.readme/`, manifests, task runners, and CI; prefer repository scripts over direct tool invocations, use the package manager `.docs/stack.md` names, and never invent aliases, environment names, or flags.
- Derive the local application URL from configuration or startup output, and never switch host or port to work around a conflict.
- Confirm a service failure with logs or health checks; before stopping a process, identify the exact listening process and verify it belongs to this repository, then stop it gracefully, restart it with the repository's dev command, and wait for readiness.
- Treat `.temp/` as outside the repository's truth: never cite it as evidence, count it in usage sweeps, or update it to match a change, and keep there the ignored tool caches and hook state the repository configures.
