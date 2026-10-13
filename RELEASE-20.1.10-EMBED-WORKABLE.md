# Schedule Intelligence 20.1.10 — Embedded Schedule & Resource Usability Fix

## Purpose
Make the embedded project session fully usable for schedule operations and Resource Orbit without weakening the signed project boundary.

## Changes
- Embedded project authority remains the signed `sie_` token project.
- Organization-owned resources are no longer incorrectly treated as project-owned objects by the embedded scope guard.
- Resource assignment continues to require the target task to belong to the signed embedded project and the resource to belong to the same organization.
- Resource workload in embedded mode is filtered to assignments whose tasks belong to the signed embedded project, preventing cross-project workload disclosure.
- Project-scoped schedule endpoints continue to be canonicalized to the signed SI project before route handlers execute.
- Full functional embedded scopes remain available for tasks, dependencies, resources, schedule and forecast; connector/admin access remains excluded.
- Version bumped to 20.1.10.

## Security
The fix does not disable `EMBED_PROJECT_SCOPE`. A Project A embed token cannot mutate or read Project B task/dependency/schedule data. Organization resources can be used by Project A because resources are organization-owned; their embedded workload view is restricted to Project A assignments.
