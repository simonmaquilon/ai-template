# Frontend and Components

Read when touching user-facing interfaces, client routes, layouts, state, or visual components.

- Detect the affected scope's framework, rendering model, language, state, routing, data-loading, and design-system conventions from manifests, configuration, and source before editing.
- Load only the installed framework and UI skills applicable to the detected stack; never transfer conventions from another framework.
- Match established server-client boundaries and framework-owned locations.
- Keep route and screen entrypoints focused on orchestration; place presentation and business rules in the units defined by the active framework and owning domain.
- Keep state ownership explicit and data flow predictable; never mutate inputs owned by another component.
- Derive loading, error, and computed state from its authoritative source instead of duplicating it when practical.
- Selection order: existing project component -> framework or design-system primitive -> semantic native element -> custom implementation.
- Define strict input, output, and event contracts using the project's established type system.
- Keep reusable visual components independent from direct API or route dependencies unless they intentionally own that integration.
- Preserve keyboard, focus, loading, error, empty, disabled, responsive, and assistive-technology behavior.
- Verify component APIs and extension points against installed versions.
- Reuse established authorization, navigation, and asynchronous-state patterns.
