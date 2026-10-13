# Schedule Intelligence 14.0.0 — MAC Adaptive Scheduling

Major release based on 13.1.0. Existing hierarchy, timeline editing, PRMS write-back, resource orbit, dependency engine, snapshots, scenarios, forecasting, connectors and MAC capabilities are retained.

## Tier 1 — Observe
MAC receives project-scoped, minimized scheduling evidence and deterministic schedule signals.

## Tier 2 — Diagnose
MAC explains schedule risks and causes using evidence references. It must not invent project facts.

## Tier 3 — Recommend
MAC produces a minimal, reversible change set for dependencies, expected dates and project resources.

## Tier 4 — Execute
Only the server-side policy gate can apply a validated change set. Autonomous execution remains opt-in, snapshot-backed and protected from actual/source-owned date changes.

## Major hardening
- MAC schedule planning now receives only resources assigned to the selected project.
- Hierarchy `parentRef` remains structural and is never treated as a predecessor.
- Planner instructions explicitly separate observation, diagnosis, recommendation and execution.
- LLM output remains non-authoritative; server validation and deterministic scheduling remain the source of truth.
- Existing cost ceilings, token ceilings, caching and minimized context remain active.
- Existing project-scoped Resource Orbit and PRMS resource identity mapping remain intact.
- Docker continues using the external stable `pg_data` volume.

## Important
This release does not silently change actual/source-owned dates.
