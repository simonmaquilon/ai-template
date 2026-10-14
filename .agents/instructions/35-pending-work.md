# Pending Work

Read before answering questions about registered pending work, or recording, updating, moving, or closing a pending item.

- Keep the detail of all registered pending work in the single ephemeral register `BACKLOG.md`, including planned requirements, open decisions, unfinished implementation, defects, testing gaps, and security or maintenance actions; never use it as a completed-task archive.
- Give each item a stable, non-reused identifier, type, actual state, responsible party when known, concrete detail, open decisions, completion criteria, and evidence references, scaled to the item; mark unknown facts as undecided.
- Other documents carry only identifiers, brief labels, and links for pending items, never a second copy of their requirements, decisions, action details, or mutable state.
- Keep current delivered facts and verified historical records in the documents that `21-document-maintenance.md` assigns; link their evidence from the pending register rather than moving or duplicating it.
- Keep confirmed decisions needed by unfinished implementation in the pending entry; answering a question does not complete the feature that still needs to be built and verified.
- Developers must manage their execution board and task history in an external task-management tool rather than `BACKLOG.md`; apply `03-approval-boundaries.md` to any external integration or write.
- Reuse an existing item when another document describes the same pending work, preserving domain identifiers as aliases and combining its complementary evidence instead of creating duplicate entries.
- When moving an existing item, preserve its identifiers, metadata, confirmed decisions, proposals, and evidence, and verify its central entry and incoming links before removing the old detail.
- Preserve imported domain states and distinguish proposals from confirmed decisions under `03-approval-boundaries.md`; relocation never approves, resolves, or starts an item.
- Begin a pending-work query with `BACKLOG.md`; consult linked source or verification evidence when a claim about delivered behavior needs checking.
- Before removing completed work, verify its completion criteria, document the delivered behavior in `.readme/`, and update the owning primary references under `21-document-maintenance.md`.
- Remove completed entries and their index rows; replace incoming references with durable documentation or remove obsolete references, never retain a closed entry solely for its history or anchor.
- After a partial delivery, remove the documented completed-task detail while retaining unresolved work and confirmed decisions still needed for the remaining implementation.
- When no pending entries remain, leave `BACKLOG.md` empty and retain the file path for future work.
- Create register headings and entry structure only when recording real pending work, never placeholder tasks or a row stating that there are none.
- Apply `08-storage-and-secrets.md` to register content and evidence; reference private evidence when necessary.
