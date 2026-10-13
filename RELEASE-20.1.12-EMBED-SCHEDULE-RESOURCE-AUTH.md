# Schedule Intelligence 20.1.12 — Embedded Schedule/Resource Authorization Fix

## Purpose
Make embedded mode fully usable for schedule operations and organization-shared resources without weakening project isolation.

## Changes
- Shared resources are organization-owned and are no longer subjected to generic project-object ownership checks.
- Resource workload remains filtered to the signed embed project.
- Project/task/dependency/assignment objects remain project-isolated.
- Resource leveling now includes the organization resource roster, with assignment data filtered to the embedded project.
- The embed token remains the authoritative project and organization boundary.
