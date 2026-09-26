# Schedule Intelligence 19.0.4 — Interactive Intelligence + Duration UX

## Changes

- Duration in Task Details is now scale-aware:
  - Hour scale: hours/minutes
  - Day scale: hours/days
  - Week scale: days/weeks
  - Month scale: days/months
  - Year scale: days/years
- The selected Gantt timeline scale now drives the Task Details duration presentation.
- Pulse health, Critical Path, Target Risk, Progress, Dependency Pressure, Schedule Horizon, Attention Needed and Critical Chain are clickable.
- Pulse drill-down opens a focused detail surface with affected tasks.
- Critical Chain opens the Schedule Network and selects the critical task context.
- Schedule Intelligence decision and signal cards are clickable and show focused detail.
- Existing hotspot and resource drill-down actions remain functional.
- Forecast action remains directly actionable without triggering the parent decision detail.
- Version is unified to 19.0.4 across UI/API/Docker configuration and export/template filenames.
- Existing MAC-optional SI Core architecture is retained.

## Build note

Source-level TypeScript was checked with the available compiler parser. Full Docker/npm build was not executed in the packaging environment because project dependencies are not installed there.
