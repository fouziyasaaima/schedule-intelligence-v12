# Schedule Intelligence v14.1.2

## Gantt split-pane rendering fix

### Fixed
- Prevented timeline horizontal grid lines from painting through the left Task Grid during vertical scrolling.
- Added explicit stacking contexts for the Task Grid and Timeline panes.
- Made Task Grid backgrounds opaque so transparent signal-row backgrounds cannot reveal timeline layers underneath.
- Hardened light-mode Task Grid rendering with an explicit opaque surface.
- Preserved dependency SVG and Gantt-bar layering inside the Timeline pane.
- Added a visual pane boundary between the Task Grid and Timeline.

### Result
The Gantt now treats the left Task Grid and right Timeline as isolated rendering surfaces. Scrolling vertically must move task rows without allowing timeline grid lines, dependency SVG content, or timeline backgrounds to bleed into the task columns.
