# Schedule Intelligence 16.2.0 — MAC Intelligence Workspace

## Purpose
16.2.0 turns MAC from a stacked AI panel into a functional scheduling workspace while retaining the existing deterministic scheduling and reversible-autopilot foundations.

## UX
- Fixed MAC header and project identity.
- Single vertical scroll surface for the complete MAC workspace.
- No horizontal scrolling for normal MAC content.
- Fixed Ask MAC composer at the bottom of the workspace.
- User questions remain visible in chronological conversation order, followed by MAC answers.
- Automatic scroll to the newest interaction.
- Copy action on MAC answers.
- Evidence-confidence display when supplied by MAC.
- Project-scoped conversation status.
- Dark/light theme-safe controls.
- Responsive behavior for smaller screens.

## Intelligence interaction
- Follow-up questions receive the recent MAC conversation as contextual input while the deterministic project evidence remains authoritative.
- Resource names are used for human-readable answers; internal resource references remain implementation-only.
- Existing evidence package, insights, task drill-down, Autopilot, schedule history, apply and rollback flows are retained.

## Safety
MAC remains evidence-first. The model is not treated as the schedule source of truth. Autonomous execution remains behind the server-side scheduling policy and validation gates.

## Version
16.2.0
