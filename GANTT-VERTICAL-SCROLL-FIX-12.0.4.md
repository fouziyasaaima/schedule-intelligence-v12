# Schedule Intelligence v12.0.4 — Gantt Vertical Scroll Stabilization

## Fixed
The Gantt and task list could appear to jump or fight each other when vertical scrolling was driven by arrow keys or synchronized scroll events.

## Changes
- Added guarded bidirectional vertical-scroll synchronization so programmatic synchronization does not re-trigger the opposite pane.
- Added deterministic Arrow Up/Down and Page Up/Page Down row-based scrolling to both task list and Gantt timeline.
- Added Home/End handling for predictable vertical navigation.
- Prevented arrow-key scrolling from bubbling into the browser page when the Gantt/task list has focus.
- Added focusable, labelled scroll surfaces for keyboard accessibility.
- Preserved horizontal timeline scrolling independently from vertical row synchronization.

## Result
Task rows and timeline rows remain synchronized while vertical movement is stable and predictable on desktop, tablet, and mobile.
