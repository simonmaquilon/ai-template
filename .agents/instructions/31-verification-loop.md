# Verification Loop

Read after implementing a change specified under `30-change-specification.md`, whenever one of its checks fails, and before reporting it complete.

- Verify every acceptance criterion through the check its specification names, with evidence observed after the last relevant edit under `17-validation-policy.md`; a criterion without passing evidence is unmet.
- Before editing to fix an unmet criterion, write a fix directive naming the criterion, the evidence as file and line or failing output, the confirmed cause or labeled hypothesis under `19-diagnosis-and-review.md`, the minimal fix, and the check to re-run.
- Apply only directives within the specification; report a finding outside it under `19-diagnosis-and-review.md` instead of fixing it.
- Report findings outside the specification that are only edge cases of the mechanism just fixed, for inputs or states no criterion names, grouped as a sign of over-correction, and recommend documenting the limit instead of widening the specification.
- A cycle is one directive applied and its check re-run; count cycles and repeated failures per criterion.
- End the loop with success when every criterion has passing evidence, every check `17-validation-policy.md` requires for the change passes, and the reviews `13-ui-design-workflow.md` and `32-security-review-workflow.md` require for it have run; add no criterion, improvement, or refactor beyond the specification, consistent with the closed scope of `02-change-workflow.md` and the simplest-solution rule of `14-code-authoring.md`.
- When the same failure —same check, same assertion or error, same location— follows two consecutive directives without a new confirmed cause, stop fixing that criterion and diagnose it under `19-diagnosis-and-review.md`; continue only with a new confirmed cause, which resets this count.
- Stop fixing a criterion after three cycles without passing evidence, even when each cycle found a new cause.
- When a directive would change a criterion, an affected contract, or the scope, stop the loop and re-enter the gate of `30-change-specification.md`.
- Never end the loop by weakening or bypassing tests, thresholds, or required checks; `17-validation-policy.md` and `18-testing-and-coverage.md` set those limits.
- A loop stopped without success leaves the change unvalidated: report each unmet criterion with its evidence, the directives tried, and the open hypothesis under `20-response-and-reporting.md`, and record the failure under `02-change-workflow.md`.
- Obtain an independent verification when the change touches an area that `22-security-and-trust-boundaries.md`, `23-data-integrity-and-migrations.md`, or `25-contracts-and-compatibility.md` governs, when a criterion has no automated check, or when a criterion reaches the cycle limit.
- The independent verifier starts from a fresh context holding only the specification, the diff, and access to the repository and its checks; it receives no implementation reasoning and returns fix directives without editing.
- Run at most one independent verification per change, at the UI review stage of `13-ui-design-workflow.md` after all other implementation checks pass, or for other changes after the loop first ends with success, or earlier when a criterion reaches the cycle limit, and feed its directives back into the loop under the same limits without verifying the result again; one obtained at the cycle limit informs the report, and applying its directives needs the user's decision under `03-approval-boundaries.md`.
- A prescribed review may combine isolated assessments into one independent verification round; each receives only the specification, diff, and repository access, and none receives another assessment's findings before synthesis.
- Run the verifier through the agent client's isolated sub-agent or fresh-session capability; when none is available, report the missing independent verification as a validation gap.
