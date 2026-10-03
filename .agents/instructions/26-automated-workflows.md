# Automated Workflows

Read when creating or changing continuous-integration, delivery, or scheduled automation configuration, or the checks, credentials, and dependencies it runs.

- Discover the configured automation platform, its workflow definitions, triggers, required checks, and target environments from the repository before changing any of them; never invent a platform, trigger, job, or runner.
- Keep workflow definitions, schedules, and continuous-integration configuration in their platform-owned locations.
- Have workflow definitions invoke repository-owned scripts or manifest commands under `06-commands-and-local-runtime.md` instead of inlining logic that cannot be reproduced locally.
- Treat adding, disabling, retriggering, or changing automation as a sensitive automation change under `03-approval-boundaries.md`.
- Apply the mandatory-check and bypass boundaries of `17-validation-policy.md` to workflow gates; removing, narrowing, or making a required check non-blocking requires explicit authorization.
- Configuring automation to deploy, mutate remote systems, or transform persisted data requires the same authorization as performing those actions under `09-runtime-and-deployment.md` and `23-data-integrity-and-migrations.md`.
- Supply credentials only through the platform's configured secret store under `08-storage-and-secrets.md`; never place secret values in workflow definitions, inputs, or run output.
- Pin the versions of reusable actions, images, runners, and tools a workflow depends on, and evaluate them under `07-dependencies-and-binaries.md`.
