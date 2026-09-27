# Version Control

Read before staging, committing, changing ignore rules, or composing a pull request or its description.

- Obtain authorization for the version-control write under `03-approval-boundaries.md`; this file governs only how an authorized write is composed.
- Stage only the files belonging to the authorized change; leave unrelated or pre-existing modifications unstaged as user-owned under `14-code-authoring.md`.
- Stage by explicit paths; never use bulk-staging or commit-all options.
- Split unrelated changes into separate commits so each commit stands alone and can be reverted independently.
- Never stage ignored files, build or dependency output, local environment files, or secret-bearing content under `08-storage-and-secrets.md`.
- When an authorized change introduces a generated, temporary, tool-managed, local-environment, or secret-bearing path that must remain untracked, ensure the ignore rules cover it; do not use selective staging to hide a missing rule.
- Before committing, apply the template-version rule under `01-meta-guidelines.md` to every file it covers.
- Discover the repository's established message convention from its existing history and follow it; write messages in English under `15-language-and-naming.md`.
- State what changed and why in the message, and add no attribution, co-author, or tool-authorship trailers.
- Commit on the branch the user named; when none is named, use the checked-out branch and report it instead of switching or creating one.
- Verify the staged content matches the reported change before committing, and report the resulting commit or branch state afterwards.
- Describe a pull request from the commits it actually contains, covering what changed, why, and how it was validated, without claiming work or validation that was not performed.
