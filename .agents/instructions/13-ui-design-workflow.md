# UI Design Workflow

Read before creating, redesigning, auditing, or changing UI or UX.

- Consult `PRODUCT.md` for intended users and journeys and `DESIGN.md` for aesthetic principles, typography, and layout standards before altering any user-facing surface.
- Before creating or redesigning UI, record hierarchy, layout, interaction, and required states in the change specification under `30-change-specification.md`; resolve material design decisions under `03-approval-boundaries.md` before editing.
- For a small refinement, identify the existing identity, content, behavior, and design-system conventions to preserve in that specification; do not introduce a redesign implicitly.
- Back visual audits and changes with concrete evidence: for existing web UI identify the exact rendered element and the style token or property; for new or non-web UI identify the owning component and style source; state acceptance criteria for an audit, and specify a change's criteria under `30-change-specification.md`.
- Apply the configured immediate and end-of-turn design detectors during implementation; they supplement, never replace, the reviews and validation below.
- Before completing every implementation task that changes UI, including styles and user-visible text, perform one scoped design critique covering every affected surface through the configured skill or review capability selected under `04-sources-and-skills.md`.
- When the task delivers a new or modified complete screen or user flow, as its acceptance criteria define, also perform a technical UI audit covering applicable accessibility, responsive behavior, themes, performance, and implementation integrity on those surfaces.
- Follow each review capability's prescribed assessment method and obtain any authorization it requires under `03-approval-boundaries.md`; a task without UI changes does not trigger these reviews.
- When `31-verification-loop.md` requires an independent verification, the critique's isolated assessments are that verification, provided they satisfy its evidence and fresh-context requirements.
- Combine critique and audit findings before correcting them; apply only in-scope fix directives through `31-verification-loop.md` and report out-of-scope findings under `19-diagnosis-and-review.md`.
- When those findings require visual refinement, perform a scoped polish pass that preserves the specified identity, content, behavior, and design system; it must not introduce an unrequested redesign or additional features.
- Batch visual inspection across affected surfaces and representative supported sizes and states into one review round, then confirm corrections in at most one further visual round; reuse still-valid evidence and do not restart full critiques or audits to chase improvements.
- After corrections, rerun affected mandatory checks under `17-validation-policy.md` and `18-testing-and-coverage.md`; the visual-round limit does not waive them or allow closing with unmet criteria.
- Validate rendered UI through the verification those files select; derive accessibility standards, conformance level, target sizes, and applicable exceptions from `DESIGN.md` and relevant skills, and check contrast, spacing, and interaction states against those criteria.
- When accessibility criteria are missing, identify applicable guidance through relevant skills and official standards. For an authorized implementation, resolve material acceptance decisions under `03-approval-boundaries.md` and record adopted criteria in `DESIGN.md`; for an audit or diagnosis-only request, report the missing criteria and validation impact without editing project intent.
- When a required review capability or evidence cannot be obtained, follow `04-sources-and-skills.md` and `17-validation-policy.md` and report the incomplete review; do not claim it ran or that the change is fully validated.
- Maintain visual hierarchy and design system consistency; avoid arbitrary ad-hoc margins, font sizes, or color overrides.
