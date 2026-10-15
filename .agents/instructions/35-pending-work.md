# Pending Work

Read before answering questions about registered pending work, or recording, updating, moving, or closing a pending item.

- Keep the detail of all registered pending work in the single ephemeral register `BACKLOG.md`, including planned requirements, registered open decisions, which are not a request's open decisions under `03-approval-boundaries.md`, unfinished implementation, testing gaps, and risks or maintenance actions that need a decision or work; never use it as a completed-task archive.
- Record defects in delivered behavior in `BUGS.md` and vulnerabilities and advisories in `SECURITY.md` under `21-document-maintenance.md`, never in `BACKLOG.md`; a defect in work not yet delivered stays in that work's pending entry, and a pending item that depends on a bug or vulnerability links its identifier.
- Give each item a type, actual state, responsible party when known, concrete detail, open decisions, completion criteria, and evidence references, scaled to the item; mark unknown facts as undecided.
- Identify each item with an uppercase type prefix and a four-digit sequence, such as `FEAT-0001`, keeping the domain identifier when the item already has one; take the next number above the highest that prefix has used in the register's version history and in the domain registers, and never reuse one.
- When recording the first item, give the register a title, an index table with one row per item holding its identifier, a brief label, and a link to its section, and one section per item headed by its identifier; never add introductions, placeholder rows, sample entries, or a row stating that there are none.
- Other documents carry only identifiers, brief labels, and links for pending items, never a second copy of their requirements, decisions, action details, mutable state, or of this lifecycle.
- Keep current delivered facts and verified historical records in the documents that `21-document-maintenance.md` assigns; link their evidence from the pending register rather than moving or duplicating it.
- Keep in the entry every confirmed decision that unfinished work still needs, distinguished from proposals under `03-approval-boundaries.md`.
- An answered question or a partial delivery does not complete an item, and recording or moving it never approves, resolves, or starts it.
- Never record execution boards or task history in `BACKLOG.md`; they belong to the team's external task-management tool, and any integration with it or write to it requires approval under `03-approval-boundaries.md`.
- Reuse an existing item when another document describes the same pending work, preserving its domain identifiers as aliases and its imported states, and combining complementary evidence instead of creating duplicate entries.
- When moving an existing item, preserve its identifiers, metadata, decisions, proposals, and evidence, and verify its central entry and incoming links before removing the old detail.
- Begin a pending-work query with `BACKLOG.md`; consult linked source or verification evidence when a claim about delivered behavior needs checking.
- Before removing completed work, verify its completion criteria and record the delivered facts in their owning documents under `21-document-maintenance.md`, including `.readme/` only when the item changed operational, architectural, setup, or troubleshooting detail that `.readme/` owns.
- Then remove the entry and its index row, and replace each incoming reference with a link to the durable documentation or remove it; never keep a closed entry only to preserve an anchor.
- After a partial delivery, record the delivered part the same way and remove only its detail.
- When no pending entries remain, leave `BACKLOG.md` empty and keep the file.
- Apply `08-storage-and-secrets.md` to register content and evidence; reference private evidence when necessary.
