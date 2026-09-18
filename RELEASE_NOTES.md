# Schedule Intelligence v12.2.4 — UI Build Gate Fix

## Build fix

This release preserves the v12.2.x Connector Studio and OAuth hardening while fixing a Next.js static-build failure caused by `useSearchParams()` pages without explicit Suspense boundaries.

Affected routes:
- `/accept-invitation`
- `/reset-password`
- `/verify-email`

Each route now isolates `useSearchParams()` inside a component rendered beneath `<Suspense>`, allowing safe static prerendering in the Next.js 15 build pipeline.

The connector/OAuth implementation from v12.2.3 is retained unchanged.

# v11.3.4 — Docker / Prisma Bootstrap Integrity

## Fixed

- Fixed API restart loop caused by Prisma refusing the dependency-pair unique constraint during Docker bootstrap.
- Dependency normalization continues to run before schema synchronization.
- Local Docker bootstrap now uses `prisma db push --accept-data-loss` after normalization.
- Existing PostgreSQL volume is preserved; no volume deletion is required.

## Preserved from v11.3.3

- Monte Carlo forecast-origin integrity fix.
- Canonical CPM baseline before Monte Carlo simulation.
- Dependency-pair uniqueness invariant.
- FS / SS / FF / SF dependency support.
- Unified Gantt coordinate/header/row alignment.
- Enterprise session/API-key authentication and email verification flows.

## Deployment note

For production, use versioned Prisma migrations with `prisma migrate deploy`. This local Docker distribution uses `db push` because it has no baseline migration for the core schema.


## v11.4.0 — Large Dataset Intelligence
- Added 300-task developer seed project with dependencies, milestones, resources and assignments.
- Network overview now automatically focuses large graphs on critical/high-connectivity tasks and the selected task neighborhood.
- Resource Orbit uses one project-level aggregation request instead of one workload request per resource.
- Gantt rows use browser containment/content-visibility to reduce off-screen rendering cost.
- Monte Carlo remains aggregate-first: histogram, percentiles and top simulation-derived risk attribution instead of individual simulation paths.
- Impact and Pulse continue to expose bounded top signals while backend calculations operate on the full project.

## v12.0.0 — Schedule Intelligence Engine
- Added Decision Cockpit / Intelligence Hub.
- Added server-side material-signal aggregation endpoint.
- Added drill-down from material task hotspots into the Gantt selection.
- Added unified health, target, critical-path, execution and resource signals.
- Preserved large-data visualization strategy from v11.4.
- Preserved global no-silent-failure notification behavior.
