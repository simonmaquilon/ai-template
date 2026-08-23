# UI Theming and Tokens

Read when changing theme entrypoints, design tokens, colors, or color modes.

- Declare theme tokens and customizations inside the project's official styling pipeline and theme configuration.
- Use existing semantic tokens instead of hardcoded literal colors (hex/rgb), unless explicitly required by `DESIGN.md`.
- Define new tokens across every color mode declared supported by `DESIGN.md`, with clear semantic roles for text, backgrounds, borders, and interactive states.
- When SSR or runtime-selected modes are supported, use hydration-safe patterns for light, dark, and system preferences.
- Ensure accessible contrast ratios (WCAG) across every supported color mode and interaction state.
- Validate theme modifications across every supported color mode before completing changes; do not introduce an unsupported mode implicitly.
