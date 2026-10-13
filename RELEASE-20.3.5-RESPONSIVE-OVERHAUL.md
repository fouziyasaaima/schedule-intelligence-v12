# Schedule Intelligence v20.3.5 — Responsive Workspace Overhaul

## Changes
- Reworked mobile navigation into a horizontally scrollable, touch-friendly bottom rail with safe-area support.
- Added mobile Task list / Gantt timeline switching so the core schedule is not squeezed into two unusably narrow columns.
- Preserved independent horizontal and vertical scrolling for the Gantt timeline.
- Added tablet and phone layout rules for connector forms, resource boards, summaries, dialogs, navigation, and embedded modules.
- Added viewport overflow guards and responsive form/table handling for narrow devices.
- Retained direct UI publishing on port 3000; no Caddy service is included.

## Validation
Build and device testing must be run against the target Docker environment. Test 320px, 360px, 375px, 390px, 430px, 768px, 1024px, and desktop widths, including touch scrolling, dialogs, embedded views, and the Gantt date editing flow.
