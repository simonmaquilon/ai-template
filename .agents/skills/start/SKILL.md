---
name: start
description: Prepare a project newly created from this template, or an existing project that just adopted it, with or without code, through a conversation in the user's language - remove the files that only validate the template, add the template remote, complete the primary references, and adapt the agent tooling to the chosen or installed stack. Resumable; in the maintained template it changes nothing. Use only when the user explicitly invokes start.
disable-model-invocation: true
---

# Start

Take a project the user just created from this template, or an existing project that just adopted it as `.readme/96-template-adoption.md` describes, with or without code, to the point where coding can begin or continue: template cleanup, primary references, and agent tooling. Text the user passes with the invocation is the first evidence about the project.

## Precedence

- `AGENTS.md` and the instructions it routes govern every step; this skill adds only an order and a conversation style, and never relaxes an approval, the no-invention rule, or a version-control limit. Load `01` and `10` at the start, `03` before deleting files, `06` before stack.md, `11` before the first backlog.md entry, `06` and `13` before changing tooling, and `12` only if the user asks for a commit, plus every other module `AGENTS.md` routes for the step at hand, such as `08` for secrets, `07` for design tokens, `04` for checks, and `15` for the CI workflow.
- The skeletons are the checklist: each section's heading and guide line say what it holds. [references/documents.md](references/documents.md) groups them into topics and lists the cross-document pitfalls; [references/tooling.md](references/tooling.md) covers the tooling step.
- Never rewrite a skeleton's headings, except the title placeholders that take the project name (the README H1 and design.md's `# Design System:`), its guide text, or design.md's frontmatter keys. The documents live in `.docs/`, and this skill writes them itself in their skeleton's structure.

## Boundaries

- No application code, manifests, scaffolding, generators, or dependency installs. The only install is pinned agent tooling through `node .scripts/run-pinned.mjs`, after the user consents.
- No staging, commits, branches, or pushes unless the user explicitly asks, and then under `12`. Otherwise the only git write is `git remote add plantilla <template URL>`, after consent. Delete files through the filesystem, never with `git rm`.
- Do not edit `.agents/instructions/`, the primary references or routing table of `AGENTS.md`, `.agents/template-version`, stack.md's Template Tooling, or `stack:generated` blocks other than their Notes column. Client settings, hooks, sandbox, permissions, `.gitignore`, and `.gitattributes` change only inside a tooling change the user approved.
- Record a deviation only when the user decides to depart from a baseline rule after hearing what it protects; then follow `01`: a `## Deviations` section after the routing table in `AGENTS.md`, linking the routed project policy that replaces the rule.
- Never invent names, metrics, dates, versions, owners, evidence, or legal or regulatory claims. Content you derive from the user's answers, such as principles, terminology, journeys, phases, or acceptance rows, is a proposal written only once the user confirms it. Versions come from official sources consulted in the session (`03`, `06`), never from memory. No secret goes into any document.

## Template guard

First action, every run: read the template URL from `.readme/96-template-adoption.md` and compare it with `git remote get-url origin`, ignoring protocol, the `git@host:` form, a trailing `.git`, and case. When they match, this is the maintained template: change nothing, run nothing else, explain in the user's language that a project is created with `gh repo create <name> --template <owner>/<repo> --private --clone` (or `--public`), then `cd <name>`, opening the agent there, and invoking `/start` or `$start`, and that an existing project adopts it as `.readme/96-template-adoption.md` describes; then stop. Without git or without `origin`, treat the repository as a derived project and, unless `plantilla` already exists, mark the remote step ⏸.

## Progress state

Recompute it on every run from the repository itself; keep no state file.

- Cleanup: which of these still exist: `.github/workflows/template-checks.yml`, `.scripts/run-checks.mjs`, `.scripts/tests/`, `.scripts/check-security-skill.mjs`, `.scripts/security-skill-hash.mjs`, `.readme/94-template-ci.md`. They are the template-only files that `.scripts/template-manifest.mjs` lists and `.readme/96-template-adoption.md` describes in its «Qué pertenece a la plantilla» section; when it describes a file this list lacks, or the reverse, report ⚠️ and delete only what both agree on.
- Remote: whether `git remote get-url plantilla` exists; when it points anywhere but the template, report ⚠️ and leave it.
- Existing code: a root manifest such as `package.json`, `pyproject.toml`, `go.mod`, or `Cargo.toml`, or source directories the template does not ship, mean the installed stack governs: propose deleting stack.md's Selected Stack, as its guide line says.
- Markers: `TODO`, or bracketed text that is not a Markdown link, link reference, or checkbox; ignore code spans, fenced blocks other than README's `text` blocks, frontmatter keys, `stack:generated` blocks, and Template Tooling.
- Each section is pending (has markers), deferred (has markers and a referenced entry in backlog.md), later (filled by later work, per documents.md), or done (no markers). Registered pending detail for every document lives only in backlog.md under `11`; the other documents retain the entry reference.
- Tooling is done when every installed skill is a baseline skill, is used by the Selected Stack, or with existing code by the installed stack, or carries in its stack.md Notes cell the user's decision to keep it.
- Resume at the first step with pending items. Do not ask again about done or deferred items unless the user wants to; mention the deferred ones once in the opening, together with any declined cleanup or remote and the state of tool servers and the language-server binary, which have no resumable marker.

## Conversation

- Talk in the user's language; write each document in the language `AGENTS.md` sets for it.
- Ask everything in the chat as plain text: never use a question tool such as `AskUserQuestion` or `request_user_input`. Give every question its context: what it decides, which document and section it fills, and a short example of an answer.
- Open with two to four lines: what `/start` does, what is already done, and what comes next; then ask the first question.
- One topic per turn, with at most three related questions. Use plain words and explain a term with an example, such as an invariant being "a rule that must never break". Never dump a questionnaire.
- Reuse what the user, the invocation text, and the repository already settle; confirm an inference instead of asking again. Offer options only when evidence supports them, and recommend one only with a stated reason.
- "No sé" or "después": keep the marker, add a backlog.md entry under `11` naming the section, what is missing, and the condition that resolves it, with who decides only when the user names someone, reference that entry from the section, and move on. This includes open items of security.md and README. "No aplica": write that it does not apply and why, in the document's language, and delete the section only when its guide line allows it and nothing links to it. Follow `11` for backlog.md; other empty registers keep their table header and get a single row saying there is none, in the document's language.
- Interview answers supply document content and are not the open decisions of `AGENTS.md`. Approvals are: batch each step's deletions, remote, tooling changes, installs, and deviations into one message with reason, impact, and alternatives, which is that step's single round under `AGENTS.md`, with plain chat as the question mechanism, and act only on an explicit yes.
- Write each section as soon as its topic is settled, so an interruption loses nothing. After each document, summarize what was recorded and what stays open, with a link to the file, and apply corrections before moving on. A settled fact that belongs to a later document is written there at once and not asked again.

## Workflow

1. Orient: run the guard, compute the progress state, and open. In a session that cannot receive replies, report the state and stop, unless the request already gives the approvals and answers the next steps need; then continue with them and stop at the first decision they do not cover.
2. Cleanup: one approval message for the deletions and the remote. Remove `.github/` once empty; leave `.agents/template-version`, `.agents/template-manifest.json`, and the inert `run-checks` sandbox exclusion as they are; the stack hook regenerates its workflows block.
3. product.md, by the topics in documents.md.
4. design.md: first ask whether the project has a user-facing surface. Write tokens only for brand values the user marks as binding; otherwise record one open decision leaving the visual direction to the UI design workflow when the first screen is built, or, with an existing interface, documenting that interface through it. Never ask about aesthetic styles or CSS values.
5. stack.md: apply the existing-code check. When the user delegates the choice, propose a stack with reason, impact, and alternatives, and record `delegated: …` only after the user accepts that proposal; delegating the choice does not accept it in advance. Approved Target Versions get exact stable versions verified in the session. Outside the declared and resolved versions of Platform Versions and Dependencies (`06`), never copy a value that a manifest pins.
6. plan.md, at decision level: no reproduced implementation identifiers, paths, or versions (`10`), while pending-item identifiers and links are allowed. The phase table takes only the delivered phases that documents.md lets existing code record; unfinished phases go to backlog.md (`11`). The agent-operated browser verification line is resolved as documents.md says.
7. security.md's Status, then README.
8. Tooling, by references/tooling.md, with one approval message.
9. Reconcile: run the checklist in documents.md, then `node .scripts/check-doc-links.mjs` and `node .scripts/check-instructions.mjs`, which must print nothing; confirm stack.md's generated blocks reflect the deletions and removals, and rerun the checks after any fix.

## Report

In the user's language, one line per item, each starting with ✅, ⏸, ⚠️, or ❌: cleanup, remote, each document, deferred decisions with their backlog.md identifiers, skills, tool servers, language-server binary, the Codex hook-trust notice, and the checks. Close with the next step, which is part of the output `/start` was asked for: a first commit of these changes, made only if the user asks (`12`, or `/commit`); without existing code, installing the approved stack and scaffolding come after and are outside this skill, while with existing code the stack is already installed and the work continues on it.

## Client bindings

- Invocation: `/start` in Claude Code, `$start` in Codex. Questions are plain chat text in every client.
- When a client's sandbox blocks a step, such as `git remote add` writing `.git/config` or `skills add` writing `.agents/skills/`, retry that one command through the client's approval or escalation prompt, or give the user the exact command; never widen sandbox settings. A blocked command never ran (`04`).
- Non-interactive sessions, such as `claude -p` or `codex exec`, only report the progress state.
