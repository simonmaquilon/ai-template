# Language and Naming

Read when naming symbols, writing commits/docs, or handling user-visible copy.

- Write all code, identifiers, database entities, and commits in English; author `.readme/` documentation and root `README.md` in Spanish; keep `PRODUCT.md`, `DESIGN.md`, `PLAN.md`, and `SECURITY.md` in one established project language.
- Match the user's detected language for all conversation and responses.
- When the project has an i18n system, route user-visible copy through it and keep every supported locale synchronized; otherwise follow the established copy convention and do not introduce localization infrastructure without approval.
- Adhere strictly to domain terminology defined in `PRODUCT.md`; do not invent synonyms for business models.
- Match existing public API contracts and schemas unless performing an explicit migration.
