# UI Design Workflow

Read before creating, redesigning, auditing, or changing UI or UX.

- Consult `DESIGN.md` for project aesthetic principles, typography, and layout standards before altering any user-facing surface.
- Back visual audits and changes with concrete evidence: for existing web UI identify the exact DOM element and CSS token or property; for new or non-web UI identify the owning component and style source; always state acceptance criteria.
- Validate rendered UI in its applicable runtime under `17-validation-policy.md` and `18-testing-and-coverage.md`; for web UI verify WCAG contrast, touch targets of at least 44x44px, spacing rhythm, and hover, focus, and disabled states.
- Maintain visual hierarchy and design system consistency; avoid arbitrary ad-hoc margins, font sizes, or color overrides.
