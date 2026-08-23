# Code Indexing

Read before exploring architecture, querying symbol relationships, or managing index state.

- Prefer the repository's configured code-indexing tool over text search for structural discovery, symbol graphs, call paths, and impact analysis.
- Detect the active tool from its index directory, ignore file, or registered MCP server or CLI instead of assuming a specific product.
- Keep tool-specific installation, commands, and query surface in `.readme/` and the tool's own documentation, never in this file.
- Keep exactly one index per repository, resolved from the repository root and never scoped to a branch or subdirectory.
- Keep the index fresh through the tool's incremental sync or watch mode, and rebuild explicitly when a query contradicts the working tree.
- Check index health and evidence-path coverage before trusting an empty or negative result.
- Always validate conclusions against the source files on disk; the index locates code, it does not prove behavior.
- Rebuild from scratch after changing index exclusions, because incremental updates leave nodes of newly ignored files behind.
- Keep index artifacts out of version control unless the tool documents otherwise.
- Fall back to text search and direct file reads when no index exists or the tool is unavailable, and disclose the fallback.
- Treat index deletion, reinitialization, and tool installation or removal as actions requiring approval under `03-approval-boundaries.md`.
