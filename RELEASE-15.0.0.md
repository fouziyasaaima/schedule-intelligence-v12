# Schedule Intelligence 15.0.0 — Resource & Time Intelligence

Major release built directly on **14.1.3 COMPLETE-MAC-RESOURCE-UX-BUILD-FIXED**.

## Tiered intelligence

- **Tier 1 — Observe:** deterministic schedule facts, project-scoped resources, hierarchy, dependencies, capacity and execution signals.
- **Tier 2 — Diagnose:** MAC explains schedule pressure using only supplied project evidence.
- **Tier 3 — Recommend:** MAC accepts an explicit scheduling intent and proposes a minimal, reversible change set.
- **Tier 4 — Execute:** server-side policy gates validate proposals before any dependency/date/resource change can be applied. Actual/source-owned dates remain protected.

## Schedule model

- Parent/summary date edits propagate through the complete descendant hierarchy.
- Child date edits re-derive all ancestor ranges automatically.
- Dragging task bars and start/end handles updates the same backend schedule mutation path.
- PRMS write-back is attempted for every changed hierarchy row; connector rejection triggers compensating rollback.
- Existing dependency scheduling remains deterministic and separate from hierarchy containment.

## Resource Intelligence

Resource Orbit is now a **capacity system**, not a people directory:

- PERSON, EQUIPMENT, FACILITY, VEHICLE, MATERIAL, TEAM and OTHER.
- Capacity hours/day, capacity units, unit label and availability percentage.
- Project membership is first-class, so newly created resources can belong to the selected project even before assignment.
- Imported PRMS resources remain project-scoped.
- Equipment/facility capacity can be modeled as multiple concurrent units.
- Resource pressure is based on overlapping assignment windows and available capacity rather than a simple organization-wide roster.
- MAC receives resource names, type and capacity evidence while internal resource identifiers remain hidden from user-facing answers.

## Multi-scale Gantt

The timeline can now be visualized at:

- Hourly
- Daily
- Weekly
- Monthly
- Yearly

Drag operations snap to the selected scale; hourly edits preserve time-of-day values.

## AI / MAC

- User questions are treated as explicit intent, not generic prompts.
- MAC must answer from project evidence and explicitly report when evidence is insufficient.
- Resource names are used in responses instead of Resource-* references or internal IDs.
- MAC answers are displayed immediately above the question box for a conversational flow.
- Autonomous scheduling remains opt-in and is still constrained by deterministic validation, cost policy and reversible change sets.

## Export & UX

- CSV, Excel, PDF, JSON and browser print remain available.
- Print uses an isolated print frame to avoid the empty/new-tab print failure mode.
- Visible application version is `15.0.0`.
- Dark/light Gantt surfaces receive explicit styling for timeline, scrolling and scale controls.
- Responsive resource creation supports different resource types and capacity models.

## Data / deployment

- Docker continues using the stable external `pg_data` volume.
- The release does not introduce a versioned database volume name.
- Prisma schema synchronization adds the resource capacity/project-membership fields with safe defaults for existing records.

## Important operational note

Build verification was performed at source/syntax level in this environment. Docker itself is not installed in the packaging environment, so the final Docker image build must still be run on the deployment machine with `docker compose build` before promotion.
