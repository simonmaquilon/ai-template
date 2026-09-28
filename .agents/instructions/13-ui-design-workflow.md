# UI Design Workflow

Read before creating, redesigning, auditing, or changing UI or UX.

- Consult `DESIGN.md` for project aesthetic principles, typography, and layout standards before altering any user-facing surface.
- Back visual audits and changes with concrete evidence: for existing web UI identify the exact rendered element and the style token or property; for new or non-web UI identify the owning component and style source; state acceptance criteria for an audit, and specify a change's criteria under `30-change-specification.md`.
- Validate rendered UI through the verification `17-validation-policy.md` and `18-testing-and-coverage.md` select for the change; derive accessibility standards, conformance level, target sizes, and applicable exceptions from `DESIGN.md` and relevant skills, and check contrast, spacing, and interaction states against those criteria within that verification.
- When accessibility criteria are missing, identify applicable guidance through relevant skills and official standards. For an authorized implementation, resolve material acceptance decisions under `03-approval-boundaries.md` and record adopted criteria in `DESIGN.md`; for an audit or diagnosis-only request, report the missing criteria and validation impact without editing project intent.
- Maintain visual hierarchy and design system consistency; avoid arbitrary ad-hoc margins, font sizes, or color overrides.
