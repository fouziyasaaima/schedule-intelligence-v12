# Schedule Intelligence v17.4.0 — Functional Scheduling Cockpit

## Purpose

v17.4.0 turns the Resource Orbit **Schedule** mode from an intelligence/visualization surface into an actionable scheduling workspace.

## Functional changes

- **Needs Scheduling** is now actionable and derived from the complete project task list, not only the 80-item materiality window.
- **All Work** searches the full project task list while rendering only a bounded visible slice.
- Clicking a work item opens **Schedule Work**.
- Schedule Work supports:
  - start date
  - finish date
  - project resource assignment
  - resource units
  - save/recompute through the existing task and assignment APIs
- Resource pressure remains clickable and opens the resource detail workflow.
- Added **Schedule with MAC** directly to the Scheduling Hub.
- MAC can:
  - analyze and create a reviewable recommendation
  - apply the recommendation
  - run the existing autonomous planner when the server-side MAC policy permits it
- After a scheduling change, the main Gantt workspace is refreshed through the existing `onScheduleChanged` callback.
- Large-data mode remains materiality-first while preserving access to the complete task universe through search and All Work.
- The previous SheetJS TypeScript `!ref` / autofilter build error remains fixed.
- UI/API release version is aligned to **17.4.0**.

## Existing backend capabilities reused

The release uses the existing:

- task PATCH scheduling mutation
- resource assignment mutation
- project resource leveling
- MAC schedule recommendation/apply APIs
- dependency-safe schedule recomputation
- PRMS connector write-back protections

No new database migration is required for this release.

## Validation performed in packaging environment

- TypeScript/TSX syntax transpilation check passed for the changed UI components.
- JSON package manifests parse successfully.
- Source-level review confirmed the existing MAC scheduling endpoints are present and wired into the new Scheduling Hub.

A full Next.js/Docker production build should still be run in the deployment environment because this packaging environment does not contain the project's npm dependencies.
