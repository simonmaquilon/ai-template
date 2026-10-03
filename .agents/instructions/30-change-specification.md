# Change Specification

Read before the first edit of every implementation or code change, and whenever its acceptance criteria, affected contracts, or scope must change.

- Before the first edit, write a specification stating the objective, the acceptance criteria, the exclusions a reader could reasonably expect included, and the contracts and data the change affects.
- Scale the specification to the change: a single one-line criterion suffices for a trivial change, and the contracts, data, and preservation entries may state that none are affected.
- State each acceptance criterion as an observable outcome of a given input or state, never as an implementation step or an unverifiable quality judgment.
- Name for each criterion the check that will prove it —an automated test, a command, or a runtime observation with its route, state, and viewport— selected under `17-validation-policy.md` and `18-testing-and-coverage.md`.
- Identify the already-working behavior the change can affect, including the callers and consumers found during discovery under `02-change-workflow.md` and `10-code-indexing.md` and the fixes `BUGS.md` records for that area, and state each as a preservation criterion with its check unless another criterion explicitly replaces it; when nothing can be affected, state that nothing needs preserving.
- When the change extends or reorders preserved behavior, state its preservation criterion as the expected result after the change, not as the unchanged baseline, and test it as changed behavior.
- Derive criteria from the user's request, `PRODUCT.md`, the observable acceptance criteria of `DESIGN.md`, and the acceptance evidence of the `PLAN.md` phase being delivered; a criterion that contradicts them is an open decision, not a criterion.
- For a reported defect, specify the fix after its cause is established under `19-diagnosis-and-review.md`, and make the regression test that `18-testing-and-coverage.md` requires the check of its first criterion.
- Do not edit until every criterion names its check, no material decision remains open under `03-approval-boundaries.md`, and the specification contradicts none of its sources.
- With a compatible test harness, write the automated test for each new or changed behavior before implementing it and observe it fail for the expected reason; a test for preserved behavior must pass both before and after the change.
- Keep the specification in the conversation and create no separate specification file or register; record in the delivered `PLAN.md` phase only the acceptance evidence that decides its completion, under `21-document-maintenance.md`.
- Name the `TESTS.md` requirement or journey each criterion covers, when one exists, so the coverage update `18-testing-and-coverage.md` requires can cite it.
- When implementation or verification shows that a criterion, an affected contract, or the scope must change, stop editing the affected behavior and revise the specification before continuing.
- Ask under `03-approval-boundaries.md` before a revision that drops or weakens a criterion the user stated, widens the requested scope, or changes an externally observable contract; state every other revision before continuing.
