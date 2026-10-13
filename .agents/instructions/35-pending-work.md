# Pending Work

Read before answering questions about registered pending work, or recording, updating, moving, or closing a pending item.

- Keep the detail of all registered pending work in the single central register `BACKLOG.md`, including planned requirements, open decisions, unfinished implementation, defects, testing gaps, and security or maintenance actions.
- Give each item a stable identifier, type, actual state, responsible party when known, concrete detail, open decisions, completion criteria, and evidence references, scaled to the item; mark unknown facts as undecided.
- Other documents carry only identifiers, brief labels, and links for pending items, never a second copy of their requirements, decisions, action details, or mutable state.
- Keep current delivered facts and verified historical records in the documents that `21-document-maintenance.md` assigns; link their evidence from the pending register rather than moving or duplicating it.
- Reuse an existing item when another document describes the same pending work, preserving domain identifiers as aliases and combining its complementary evidence instead of creating duplicate entries.
- When moving an existing item, preserve its identifiers, metadata, confirmed decisions, proposals, and evidence, and verify its central entry and incoming links before removing the old detail.
- Preserve imported domain states and distinguish proposals from confirmed decisions under `03-approval-boundaries.md`; relocation never approves, resolves, or starts an item.
- Begin a pending-work query with `BACKLOG.md`; consult linked source or verification evidence when a claim about delivered behavior needs checking.
- On completion, update the central state and link the verified acceptance evidence; update the owning documents for delivered facts under `21-document-maintenance.md`.
- Retain closed entries and their evidence references in the central register when needed to preserve stable links and the history of work recorded there.
- Apply `08-storage-and-secrets.md` to register content and evidence; reference private evidence when necessary.
