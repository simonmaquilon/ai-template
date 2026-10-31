# Interface

Read before changing user-facing interfaces, client state, components, styles, tokens, color modes, or non-trivial copy, and before operating an agent-operated browser session.

- Detect the affected scope's framework, rendering model, state, routing, data loading, and design-system conventions from manifests, configuration, and source, and load only the UI skills of the selected stack.
- Consult `.docs/product.md` for users, journeys, and principles and `.docs/design.md` for typography, layout, and accessibility before altering a user-facing surface.
- Before creating or redesigning UI, put hierarchy, layout, interaction, and required states in the specification and settle material design decisions; for a small refinement, name the identity, content, behavior, and conventions to preserve, and never redesign implicitly.
- Keep route and screen entrypoints to orchestration, respect the framework's server-client boundaries, and keep state ownership explicit; never mutate inputs another component owns, and derive loading, error, and computed state from its authoritative source.
- Choose, in order, existing project components, framework or design-system primitives, semantic native elements, and custom code, taking the first that satisfies behavior, accessibility, contracts, and design.
- Give components strict typed input, output, and event contracts, and keep reusable visual components free of direct API or route dependencies unless they own that integration.
- Preserve keyboard, focus, loading, error, empty, disabled, responsive, and assistive-technology behavior.
- Route user-visible copy through the project's i18n system and keep every locale synchronized; without one, follow the established convention and add no localization infrastructure without approval.
- Declare each token the `.docs/design.md` frontmatter can hold there first, then implement it in the official styling pipeline; use semantic tokens instead of literals, define new tokens for every supported color mode, use hydration-safe patterns for runtime-selected modes, and avoid ad-hoc spacing, sizes, and color overrides.
- Meet the accessibility standard, level, and exceptions `.docs/design.md` adopts in every mode and state; when criteria are missing, find applicable guidance and record the adopted criteria in `.docs/design.md` for an implementation, or report the gap for an audit.
- Back visual audits and changes with concrete evidence: the rendered element and its token or property, or the owning component and style source.
- Before completing a UI change, critique every affected surface with the configured design-review capability, or without one against `.docs/design.md` and the specification, reporting the gap, plus a technical audit of accessibility, responsiveness, themes, performance, and integrity when it delivers a complete screen or flow.
- Combine critique and audit findings before correcting, apply only in-scope ones, and when they need refinement run a scoped polish pass that keeps identity, content, behavior, and the design system.
- Batch visual inspection across surfaces, sizes, states, and color modes into one round, confirm corrections in at most one more, reuse still-valid evidence, and rerun the affected checks.
- Before closing a change to a web surface, observe it in the running application through the agent-operated browser capability when `.docs/plan.md` records its adoption, stating route, state, and viewport; otherwise report the gap.
- Launch agent-operated browser sessions through the repository's launcher, against non-production data and test accounts whose credentials are not secrets, and close them and their browser processes before closing the task.
- Keep repository-managed browser downloads in an ignored tool directory under `.temp/`, except the code a sandbox-exempt launcher runs, which stays in a per-user cache, and preserve system browser installations.
