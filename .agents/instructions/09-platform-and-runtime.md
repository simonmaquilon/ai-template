# Platform and Runtime

Read before changing runtime configuration, environments, deployment, external I/O, background work, caches, telemetry, or hot paths.

- Discover the runtime and tools from `.docs/stack.md` and deployment targets and environments from `.docs/plan.md`, then from manifests, infrastructure files, and documentation, and for runtime work the critical flows, dependencies, failure modes, budgets, and existing signals.
- Treat platform bindings and types as generated artifacts, use configured local emulators or documented environments instead of hard-coded platform behavior or invented substitutes, and validate configuration with a supported dry-run or check command.
- Deploy only to an environment the user names, verify the deployed behavior through the checks `.docs/plan.md` records, and when verification fails recover through its recovery approach instead of deploying more changes.
- When a change introduces state that needs an explicit apply step in a persistent, shared, or remote environment the request did not authorize, make that apply an open decision of the request.
- Bound external and asynchronous work with timeouts and cancellation; retry only transient failures of safe or idempotent operations with bounded attempts and the established delay, honoring dependencies' retry and rate-limit signals.
- Preserve causal error context for operators while returning stable, actionable, non-sensitive failures to callers.
- Give background work an explicit lifecycle owner and keep graceful shutdown, and apply bounded concurrency, backpressure, limits, degradation, or isolation where bursts or downstream failures can exhaust capacity.
- Derive cache keys from every input and authorization scope that affects the result, define freshness and invalidation against the source, make miss, stale, and failure behavior explicit, and never let cached state authorize a write.
- Emit logs, metrics, and traces through project conventions with stable names and correlation context, without sensitive values, unbounded cardinality, or behavior-changing instrumentation, and keep health checks light, deterministic, and non-destructive.
- Measure performance on representative workloads against a baseline or budget in `.docs/plan.md` before optimizing, and report the method and any regression.
- Test the applicable timeout, cancellation, retry, cache, partial-failure, outage, recovery, and resource-limit behavior.
