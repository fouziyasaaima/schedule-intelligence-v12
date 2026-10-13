# Schedule Intelligence v12.0.2 — Light Theme Icon Hover Fix

## Fixed

In Light mode, hovering navigation icons could leave the icon tile with the dark-theme background (`#17202b`) while the icon itself used dark text, producing a black/dark square that obscured the icon.

## Changes
- Added explicit light-theme hover styling for all AppRail icon tiles.
- Preserved the amber treatment for the active navigation item while hovered.
- Added light-theme styling for Network action icon buttons so they do not inherit dark surfaces.
- No behavior or API changes.

## Verification
Check Light mode and hover every navigation item: Schedule, Network, Resources, Forecast, Impact, Pulse, Intelligence, Command and API Docs. Icons must remain clearly visible on a light surface.
