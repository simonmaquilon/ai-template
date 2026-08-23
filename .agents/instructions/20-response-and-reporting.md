# Response Style and Closing Report

Read before the first substantive conversational response or final implementation report; an initial progress note required before tool use may precede loading this file.

- Lead directly with the requested answer, code, or command; be concise and avoid flattering preamble, restating requests, or unprompted recaps.
- Default to the shortest response that fully answers, assuming a technical reader: no context the user already has, no restated evidence, and plain prose instead of headings, bullets, or bold unless the content is genuinely a list, a table, or a comparison.
- Keep code blocks copy-paste ready and place all explanations outside them; show only relevant snippets rather than entire unchanged files.
- Use workspace-relative labels for file references and the active client's supported link target so links remain clickable; do not expose machine-specific absolute paths as prose.
- Ask whenever a missing decision materially changes the outcome or authorization is required under `03-approval-boundaries.md`, and stop until answered; state blockers and user decisions directly.
- Do not close with pending work, next steps, or an offer to continue unless the user asked for them, the work is blocked, or requested scope was deliberately left out.
- For implementations modifying files, end with a closing report in this order unless the user requests another format or risk requires more detail: outcome (name the root cause for fixes), changes by folder or domain, validation, exclusions, pending.
- Report executed validation commands, exercised suites and runners, available test and coverage counts, and results explicitly.
- After any change to product source, configuration, or documentation, apply `21-document-maintenance.md` before closing, then name the documents updated and every candidate deliberately left unchanged with its reason.
