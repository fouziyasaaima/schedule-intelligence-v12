# Schedule Intelligence v12.5.0 — Project Graph + MAC Autopilot

## What changed

### Unified Project Graph
- One task graph now drives hierarchical Gantt rendering and the relationship network.
- `parentId` is structural hierarchy only; it is never treated as a predecessor.
- Network view renders parent/child structure and scheduling dependencies as separate relationship types.
- IDs are first-class: imported external IDs such as `E1293` and `A1260` are shown in the task grid, timeline bars, network nodes and details. Non-imported tasks receive a stable `SI-xxxxxx` display ID.

### PRMS hierarchy and resources
- Events and Actions are fetched and merged using the established PRMS C# behavior.
- Event `E_ID_Dependance` maps to event `parentId`.
- Action `E_Id` maps to its event `parentId`.
- Event `E_Leader` is the PRMS member/resource identity and `Initial_Member` is a fallback display name.
- Action `ID_Member` is the PRMS member/resource identity and `AssignedTo` is a fallback display name.
- If an SI Resource is already linked to the PRMS member identity, the SI Resource master name remains authoritative.
- Event resource assignments are role `LEAD`; Action assignments are role `ASSIGNEE`.

### Summary scheduling
- Parent expected dates are derived from descendants.
- Parent actual start is derived from descendants.
- Parent actual end remains open while any descendant is still open.
- Summary propagation is recursive through the complete hierarchy.

### MAC Schedule Autopilot
- MAC can analyze the complete imported project graph, including hierarchy, task semantics, dates, dependencies, progress and resource assignments.
- Three modes: Analyze whole project, Generate change plan, Run autonomous schedule.
- AI proposals are structured, confidence-gated and validated before application.
- Autonomous mode can create high-confidence scheduling dependencies and optimize expected dates.
- Resource reassignment is separately gated and disabled by default.
- Actual/source-owned dates are never modified by MAC.
- Hierarchy is never rewritten by MAC.
- Dependency cycles are rejected; failed autonomous applications roll back their changes.
- Every autonomous run creates a schedule snapshot and a persistent run record.
- Latest autonomous run can be rolled back from MAC history.
- AI provider keys remain server-side; connector credentials remain encrypted server-side.
- Task names/descriptions are redacted for obvious email/phone/URL patterns before schedule reasoning. External IDs and connector payloads are not sent to the model; internal task/resource references are pseudonymous.
- AI usage remains behind per-request, daily and monthly cost gates.

### Import → AI flow
When autonomous scheduling is explicitly enabled in MAC Studio, opening an imported project automatically performs:

`Import → Normalize → Build Graph → Analyze → Propose → Validate → Apply → Recompute → Refresh Gantt`

The deterministic scheduler remains the source of schedule truth; MAC is the reasoning/proposal layer.

## Safety defaults
- Autonomous scheduling: OFF by default.
- Auto dependency application: OFF by default.
- Auto expected-date optimization: OFF by default.
- Resource reassignment: OFF by default.
- Actual dates: protected.
- Rollback: latest applied autonomous run only.

## Validation
- Modified TypeScript/TSX files pass syntax/transpile validation in the release environment.
- Full Docker dependency installation/build is not performed in this sandbox when external package installation is unavailable. Run the target Docker build before production deployment.
