# Version Control

Read before an authorized staging, commit, ignore-rule change, or pull request.

- Stage only the files of the authorized change, by explicit path, leaving unrelated or pre-existing modifications unstaged; never use bulk-staging or commit-all options, and never stage ignored files, build or dependency output, local environment files, or secrets.
- When a change introduces a path that must stay untracked, cover it with ignore rules instead of selective staging.
- Split unrelated changes into separate commits that can each be reverted on its own.
- Follow the repository's message convention from its history, in English, stating what changed and why, with no attribution, co-author, or tool trailers.
- Commit on the branch the user named, or the checked-out branch when none is named, without switching or creating one.
- Before committing, verify the staged content matches the reported change; afterwards report the resulting commit or branch state.
- In the maintained template, whose `origin` is the template repository the template-adoption `.readme/` document records, `.agents/template-version` holds the released baseline as `MAJOR.MINOR.PATCH`, raised once per release, never per commit: MAJOR when a derived project must migrate something, such as moved, renamed, or removed files, skeletons with another structure, or rules that change the required workflow; MINOR when it adds something compatible; PATCH for fixes.
- In the maintained template, regenerate `.agents/template-manifest.json` with `node .scripts/template-manifest.mjs --write` in every commit that changes a template-owned file; the template checks fail while it is stale.
- To release, raise the version, regenerate the manifest, commit, and tag that commit with the bare version, such as `1.2.0`, never with a `v` prefix.
- Files that only validate the maintained template, which the manifest script lists, are never adopted, stay out of the manifest, and never change the version.
- Describe a pull request from the commits it contains, covering what changed, why, and how it was validated, without claiming work or validation that did not happen.
