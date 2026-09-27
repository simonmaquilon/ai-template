# Language and Naming

Read when naming files or symbols, writing comments, scripts, commits or documentation, or handling user-visible copy.

- Keep source and documentation filenames, identifiers, types, database entities, comments, operational messages, and commits in English.
- Test case titles and other developer-facing descriptive text are not operational messages: keep them in the language the suite already uses.
- Write new or revised comments and operational messages in English in existing files; preserve unrelated content and report remaining divergence instead of expanding scope into a full translation.
- Preserve existing names when renaming is outside the authorized scope, and report remaining language divergence.
- Preserve language keywords, external API names, imported symbols, and required filenames; language conventions do not override external requirements or user-visible localization.
- Author `.readme/` documentation, root `README.md`, `PRODUCT.md`, `DESIGN.md`, `PLAN.md`, `TESTS.md`, and `BUGS.md` in Spanish.
- Author `SECURITY.md`, `AGENTS.md`, and every file under `.agents/instructions/` in English.
- Match the user's detected language for all conversation and responses.
- When the project has an i18n system, route user-visible copy through it and keep every supported locale synchronized; otherwise follow the established copy convention and do not introduce localization infrastructure without approval.
- Adhere strictly to domain terminology defined in `PRODUCT.md`; do not invent synonyms for business models.
