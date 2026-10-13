# Schedule Intelligence 20.1.11 — Embedded Organization Resource Access

## Purpose
Embedded project sessions can discover organization-owned resources even when a resource has not yet been linked or assigned to the embedded project.

## Security model
- The embed token remains project-scoped for project data.
- Resource records are organization-owned, so `resources:read` may read the organization resource roster.
- Task assignments remain project-bound: the task must belong to the embed token project and the resource must belong to the same organization.
- Resource workload in embedded mode remains filtered to assignments for the embed token project.
- `EMBED_PROJECT_SCOPE` is not disabled for project/task/dependency access.

## Changes
- Embedded `GET /v1/resources` is allowed when `resources:read` is present.
- `GET /v1/projects/:id/resources` returns the organization resource roster with assignments filtered to the selected project.
- Resource intelligence uses the organization roster with project-filtered assignments.
