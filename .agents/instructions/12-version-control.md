# Version Control

Read before an authorized staging, commit, ignore-rule change, pull request, version raise, pre-release audit, tag, or release publication, and before introducing a path that must stay untracked.

- Stage only the files of the authorized change, by explicit path, leaving unrelated or pre-existing modifications unstaged; never use bulk-staging or commit-all options, and never stage ignored files, build or dependency output, or local environment files.
- When a change introduces a path that must stay untracked, cover it with ignore rules instead of selective staging.
- Split unrelated changes into separate commits that can each be reverted on its own.
- Follow the repository's message convention from its history, in English, stating what changed and why, with no attribution, co-author, or tool trailers.
- Commit on the branch the user named, or the checked-out branch when none is named, without switching or creating one.
- Before committing, verify the staged content matches the reported change; afterwards report the resulting commit or branch state.
- In the maintained template, `.agents/template-version` holds the released baseline as `MAJOR.MINOR.PATCH`, raised once per release, never per commit: MAJOR when a derived project must migrate something, such as moved, renamed, or removed files, skeletons with another structure, or rules that change the required workflow; MINOR when it adds something compatible; PATCH for fixes.
- In the maintained template, a release takes the highest level among the changes it publishes: MAJOR when any needs a migration, otherwise MINOR when any adds something, as a `feat` commit does, otherwise PATCH for fixes, documentation, and other changes, such as `fix`, `docs`, or `chore` commits.
- In the maintained template, before raising a release's version, have an agent in a clean context that wrote none of its changes audit read-only the whole template and its configuration: `AGENTS.md`, the instruction modules, skills, hooks, declared agents, client settings, scripts, documents, and tests.
- That audit weighs each component's responsibility, dependencies, hierarchy, and interactions, and reports inconsistencies, contradictions, redundancies, ambiguities, overlaps, and gaps, following the brief the template-CI `.readme/` document keeps.
- In the maintained template, never publish a release with a confirmed finding of that audit unresolved, unless the user explicitly authorizes it.
- In the maintained template, regenerate `.agents/template-manifest.json` with `node .scripts/template-manifest.mjs --write` in every commit that changes a template-owned file; the template checks fail while it is stale.
- In the maintained template, to release, raise the version, regenerate the manifest, commit, and run `node .scripts/release.mjs` with its release notes, which pushes the commit, waits for the automation that runs on it to pass, and only then tags it with the bare version, such as `1.2.0`, never with a `v` prefix, and publishes the release; when no automation is active it publishes and says so.
- In the maintained template, with automation active, never push a release tag or publish a release while the automation of its commit is running, failed, missing, or unverified, where missing means no run of that commit exists, unless the user explicitly authorizes it.
- Files that only validate the maintained template, which the manifest script lists, are never adopted, stay out of the manifest, and never change the version.
- Describe a pull request from the commits it contains, covering what changed, why, and how it was validated, without claiming work or validation that did not happen.
