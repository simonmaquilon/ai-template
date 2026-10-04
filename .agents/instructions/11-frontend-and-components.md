# Frontend and Components

Read when touching user-facing interfaces, client routes, layouts, state, or visual components.

- Detect the affected scope's framework, rendering model, language, state, routing, data-loading, and design-system conventions from manifests, configuration, and source before editing.
- Load only the framework and UI skills applicable to the selected stack under `04-sources-and-skills.md`, or to the approved target versions that `STACK.md` records for new work; never transfer conventions from an unrelated framework.
- Match established server-client boundaries and framework-owned locations.
- Keep route and screen entrypoints focused on orchestration; place presentation and business rules in the units defined by the active framework and owning domain.
- Keep state ownership explicit and data flow predictable; never mutate inputs owned by another component.
- Derive loading, error, and computed state from its authoritative source; duplicate it only when the framework or a measured constraint requires it, and keep the source authoritative.
- Evaluate existing project components, framework or design-system primitives, semantic native elements, and custom implementations in that order; choose the first option that satisfies behavior, accessibility, contracts, and design, and skip incompatible options.
- Define strict input, output, and event contracts using the project's established type system.
- Keep reusable visual components independent from direct API or route dependencies unless they intentionally own that integration.
- Preserve keyboard, focus, loading, error, empty, disabled, responsive, and assistive-technology behavior under `13-ui-design-workflow.md`.
- Reuse established authorization, navigation, and asynchronous-state patterns.
