# Schedule Intelligence 16.0.1 — Gantt Row Parity Fix

## Fix
- Fixed left Task Grid and right Timeline row desynchronization during vertical scrolling.
- Sidebar and timeline now apply shared scroll position in `useLayoutEffect` before paint.
- Removed sticky positioning from pane headers that could create competing scroll coordinate systems.
- Removed `content-visibility:auto` from absolutely positioned timeline rows/bars to prevent stale or incorrect row painting after scrolling.
- Timeline grid height is now explicitly tied to the task row count.
- Task rows and timeline rows retain the same 40px coordinate contract.

## Result
For every visible task index `i`, the left row and right Gantt row occupy the same vertical coordinate, including after scrolling.
