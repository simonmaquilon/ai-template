# Independent Verification

Read for a risk change, and when a criterion reaches the fix-cycle limit.

- Obtain one independent verification for every risk change, and for any change when a criterion reaches the fix-cycle limit.
- Run it at the strong tier in a fresh context that holds only the specification, the diff, and access to the repository and its checks; it receives no implementation reasoning and returns fix directives without editing.
- When the client offers no isolated strong-tier subagent or fresh session, report the missing verification as a validation gap; never run it in the working session.
- Run it once per change, after the fix loop first ends with success, or earlier at the cycle limit.
- Include the task-diff security review in its scope.
- Feed its in-scope directives back into the fix loop under the same limits without verifying the result again, and report the rest as findings; directives obtained at the cycle limit inform the report, and applying them needs the user's decision.
