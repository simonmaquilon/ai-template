# Pending Work

Read before answering about, recording, updating, moving, or closing pending work in `.docs/backlog.md`.

- Keep all registered pending work in the ephemeral register `.docs/backlog.md`: planned requirements, registered open decisions, unfinished implementation, testing gaps, and risks or maintenance that need a decision or work; never use it as an archive.
- Record defects in delivered behavior in `.docs/bugs.md` and vulnerabilities in `.docs/security.md`, never in `.docs/backlog.md`; a defect in undelivered work stays in its entry, and an item that depends on a bug or vulnerability links its identifier.
- Give each item a type, actual state, responsible party when known, detail, open decisions, completion criteria, and evidence references, scaled to the item, and mark unknown facts as undecided.
- Identify each item with an uppercase type prefix and a four-digit sequence, such as `FEAT-0001`, keeping an existing domain identifier; take the next number above the highest used in the register's history and the domain registers, and never reuse one.
- With the first item, give the register a title, an index table with each item's identifier, label, and section link, and one section per item headed by its identifier; add no introductions, placeholders, samples, or empty-state rows.
- Keep in the entry every confirmed decision the unfinished work still needs, separated from proposals; answering a question or delivering part of an item does not complete it, and recording or moving it never approves or starts it.
- Never record execution boards or task history in `.docs/backlog.md`; integrating with or writing to the team's external board needs approval.
- Reuse an existing item when another document describes the same work, keeping its identifiers as aliases and merging evidence; when moving one, keep its identifiers, metadata, decisions, and evidence, and verify its links before removing the old detail.
- Before removing completed work, verify its completion criteria and record the delivered facts in their owning documents, then remove the entry and its index row and repoint or remove incoming references; after a partial delivery, remove only the delivered detail.
- When no entries remain, leave `.docs/backlog.md` empty and keep the file; keep secrets out of entries and reference private evidence instead.
