# Confirmations and Operational Limits

Read before sensitive or write actions.

- Git writes only with explicit instruction; reads allowed.
- An explicit request to implement or modify something is sufficient approval for in-scope source, data, documentation, instruction, test, and generated-reference changes.
- Ask before editing only when the request is materially ambiguous or the proposed solution expands scope, changes architecture, or requires an unrequested dependency or technology decision.
- Ask before implementing any decision the request leaves open that changes visible behavior, scope, architecture, data, or a contract; use the client's interactive question mechanism when it exists and a numbered question otherwise, then stop until answered.
- Batch the open decisions of a request into a single round instead of asking them one at a time.
- Never apply an assumed default for such a decision and never defer its confirmation to the closing report or to a note like applied by default, confirmable.
- Before making an unrequested introduction, replacement, removal, bypass, or abandonment of a library, framework, established project technology, or technical approach, explain the reason, impact, and alternatives and wait for consent; a request that explicitly names the exact change is already consent for that change.
- Confirm before: deploys, destructive data/infra operations, process or service stops, changes to global guidelines, destructive/remote Git operations, sensitive tooling/automation changes, PRs, or unrequested remote actions.
- An internal instruction does not authorize silently expanding a user's requested scope; describe the conflict and ask before any extra action unless it is a required validation or generated-reference refresh.
- Required validation or generated-reference refreshes named by an owner instruction do not need extra confirmation.
