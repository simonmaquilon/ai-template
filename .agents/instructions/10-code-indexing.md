# Code Indexing

Read before locating, reading, or changing code for any implementation, fix, refactor, review, or question about existing behavior, and before managing index state.

- Detect configured indexes through narrow checks of repository-root metadata and the affected package or language boundaries.
- Load applicable code-discovery skills and use the repository's configured existing index as the mandatory first code-discovery capability when available; determine its identity and access methods from those skills and project configuration, never from an assumed product.
- Query the index for the affected behavior, symbols, files, callers, and dependencies before using text searches, recursive file discovery, file listings, or direct reads to locate or understand that code; this applies even when the requested change seems small or its target path is known.
- Follow applicable skills and configured tool guidance to access the index, including deferred tool discovery when supported; check documented available access methods before declaring the index unavailable.
- Keep tool-specific installation, commands, and query syntax in applicable skills, project configuration, `.readme/`, or the tool's own documentation; do not invent commands or initialize an index to satisfy this workflow.
- Read governing instructions and tool guidance before discovery; documentation, manifests, configuration, and other known non-indexed files may be read directly without a ceremonial index query.
- Use `02-change-workflow.md` for documentation reconciliation and follow-up discovery order.
- Accept verbatim current on-disk source returned by the index as already read; summaries and relationship graphs alone are not source evidence, and neither replaces runtime validation or tests.
- Do not reread fresh source or rerun equivalent text searches just to verify an index response; directly inspect only omitted content, stale files, ambiguous resolution, or a specific unresolved detail.
- Before trusting empty, irrelevant, or negative results, check available health, freshness, exclusions, and path/language coverage evidence; absence from the index does not prove absence from the repository.
- Allow scoped text search or direct reads for a stated remaining gap, non-indexed content, stale or incomplete results, no existing index, or an unavailable tool after checking supported access methods; briefly state the reason and target before falling back.
- For exhaustive usage sweeps, start with indexed relationships and supplement with scoped literal searches for references the graph cannot establish, including configuration, fixtures, translations, generated files, and documentation.
- Respect the documented index topology, including package- or language-scoped indexes when configured; query the indexes covering the affected scope and avoid creating redundant indexes.
- Use the configured non-destructive incremental sync, refresh, or watch mechanism to restore freshness; when results still contradict disk or exclusions change, consult the tool's recovery guidance before choosing a stronger recovery action.
- Keep index artifacts out of version control unless the tool documents otherwise.
- Treat index deletion, reinitialization, destructive or full rebuilding, and tool installation or removal as actions requiring approval under `03-approval-boundaries.md`; a documented non-destructive refresh does not require separate approval.
