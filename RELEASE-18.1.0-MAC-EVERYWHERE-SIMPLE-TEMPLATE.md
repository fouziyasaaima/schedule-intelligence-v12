# Schedule Intelligence 18.1.0 — MAC Everywhere + Simple Schedule Template

## User-facing changes
- MAC is visibly available in every navigation module through a persistent contextual MAC bar and topbar action.
- MAC context changes with Schedule, Network, Resources, Pulse, Forecast, Impact, Intelligence and Connectors.
- MAC command failures caused by invalid/unsafe scheduling requests are returned as explicit rejected requests with a clear explanation and no schedule mutation.
- MAC conversation remains auto-scrolled to the latest response and the input stays visible in the panel.
- SI Simple Schedule Template is now a single-sheet workbook. Users primarily provide Task Name, Parent, Start, Duration, End (optional), Predecessor, Resource, Owner, Priority, Status, % Complete and Notes.
- End is intended to be calculated by SI from Start + Duration.

## Internal scheduling contract
- AI proposals remain subject to deterministic validation.
- Invalid dependency graphs, invalid date ranges, actual-date edits and resource-capacity violations are rejected before application.
- Actionable MAC commands use the same validated schedule planner and snapshot/rollback path.
