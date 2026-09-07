# Runtime Reliability and Observability

Read before changing external I/O, background work, retries, queues, schedules, caches, health checks, runtime telemetry, resource-sensitive paths, or performance-critical behavior.

- Identify critical flows, external dependencies, failure modes, availability expectations, performance or resource budgets, and existing operational signals from primary references, configuration, and source before editing.
- Bound external and asynchronous work with supported timeouts and cancellation; do not allow requests, tasks, locks, or resource acquisition to wait indefinitely.
- Retry only transient failures for operations that are safe or idempotent, using bounded attempts and the established delay strategy; when none exists, derive it from authoritative dependency guarantees and documentation.
- Honor retry and rate-limit signals from dependencies, and do not amplify permanent failures or downstream overload.
- Preserve causal error context for operators while returning stable, actionable, and non-sensitive failures to callers under `08-storage-and-secrets.md`.
- Give background work an explicit lifecycle owner; await it, persist it durably, or attach it to the platform-supported execution context, and preserve graceful shutdown or interruption behavior.
- Apply bounded concurrency, backpressure, resource limits, safe degradation, or isolation when bursts or downstream failures can exhaust shared capacity.
- Derive cache keys from every input and authorization scope that affects the result, and define freshness and invalidation against the authoritative source.
- Make cache miss, stale-read, and failure behavior explicit, and never treat cached state as authority for a write.
- Emit logs, metrics, and traces through established project conventions with stable event names and correlation context; avoid sensitive values, unbounded cardinality, duplicate noise, and instrumentation that materially changes business behavior, timing, or reliability.
- Keep health and readiness checks lightweight, deterministic, non-destructive, and representative of whether the process can safely receive work.
- Measure performance with representative workloads before optimizing, compare results with a baseline or budget recorded in `PLAN.md` under `21-document-maintenance.md`, and report methodology and material regressions.
- Test applicable timeout, cancellation, retry, cache isolation and invalidation, partial-failure, dependency-outage, recovery, and resource-limit behavior under `18-testing-and-coverage.md` and `17-validation-policy.md`.
