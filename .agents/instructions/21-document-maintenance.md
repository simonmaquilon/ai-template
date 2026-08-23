# Document Maintenance

Read before editing `README.md`, `PRODUCT.md`, `DESIGN.md`, `PLAN.md`, `SECURITY.md`, or any document under `.readme/`, and before closing any change that touched product source code or product configuration.

- Classify each changed fact as product intent, observable design, execution plan or status, delivered public usage, security or maintenance evidence, or detailed operation; update only the matching document owners.
- Keep one authoritative home for each mutable fact and link or summarize it elsewhere instead of duplicating it.
- Keep `PRODUCT.md` limited to product purpose, scope, actors, permissions, rules, invariants, public contracts, success criteria, product risks, and unresolved product decisions.
- Keep `DESIGN.md` limited to intended experience, visual and interaction rules, accessibility, supported states, and observable acceptance criteria.
- Keep `PLAN.md` limited to technical decisions, ownership, phases, delivery dependencies, validation strategy, verified status, technical or delivery risks, and acceptance evidence; never use it to override product or design.
- Keep `SECURITY.md` limited to the auditable security and maintenance register defined by its schema, including verification evidence and remediation history.
- Keep `README.md` as the concise public entrypoint with verified setup, commands, architecture summary, and links to deeper documentation.
- Keep `.readme/` for durable operational, architectural, tooling, setup, and troubleshooting details derived from delivered source and configuration, never task narration or investigation history.
- Update affected documents in the same authorized change whenever their owning facts change; the change is incomplete while any document still describes the previous state.
- Treat every change to product source code, product configuration, commands, public contracts, dependencies, or runtime and deployment settings as a documentation trigger, and resolve it inside that same change instead of deferring it.
- Ground each claim in applicable authoritative evidence: primary references for intended behavior, source and configuration for delivered behavior, and the repository code index plus direct source validation for structural claims; label planned or unverified behavior explicitly.
- Execute a published command only when it is safe and in scope; for destructive, remote, credentialed, or environment-specific commands use supported dry-run or static validation and state what was not executed unless explicitly authorized.
- When multiple documents are affected, update upstream intent first (`PRODUCT.md`, `DESIGN.md`), execution decisions second (`PLAN.md`), and delivered or operational records last (`SECURITY.md`, `.readme/`, `README.md`).
- Preserve history only where the document schema requires it, such as `PLAN.md` progress and `SECURITY.md`; every other document describes the current truth.
- Review all candidate documents after each implementation; update only affected documents and report unrelated drift instead of modifying it without direction.
- Before closing, reread all affected documents and reconcile terminology, links, commands, versions, statuses, ownership, acceptance criteria, and evidence.
