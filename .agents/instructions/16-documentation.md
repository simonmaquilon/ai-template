# Documentation Structure

Read when creating, locating, naming, renaming, relocating, or licensing project documentation.

- Keep all project documentation inside `.readme/` except for the root files explicitly allowed below.
- Allow documentation outside `.readme/` only for the root primary references (`README.md`, `PRODUCT.md`, `DESIGN.md`, `PLAN.md`, `SECURITY.md`), agent instructions under `.agents/`, and files whose canonical root location is required by an explicit request or approved tool or framework under `05-repo-layout.md`.
- Create a root `LICENSE` file only when explicitly requested; use the approved license and never infer licensing terms or ownership.
- Never place a `README.md` or any other explanatory document beside the code it describes; document that directory from its `.readme/` file instead.
- Name each `.readme/` file with a unique numeric prefix and the domain it governs; never reuse a prefix.
