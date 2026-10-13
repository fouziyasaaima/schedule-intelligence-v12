# Schedule Intelligence v20.3.3 — Readability & Responsive Layout

## Changes
- Increased the global UI base font size from 14px to 15px.
- Added responsive layout overrides for tablet and mobile widths.
- Improved small-screen top bar, navigation rail, toolbars, modal sizing, form grids, and embedded module navigation.
- Added safe max-width behavior for media and form controls.
- Used dynamic viewport height (`100dvh`) for mobile browser chrome.
- Added reduced-motion support for users who prefer less animation.

## Notes
- Gantt/timeline data retains horizontal scrolling where its dense time axis cannot fit a narrow screen; this avoids shrinking the timeline into unreadable content.
- This is a CSS-focused patch. Validate with `npm run build` and test at mobile widths (320px, 375px, 390px, 430px), tablet widths, and desktop.


## Docker deployment note
This package is configured to run without Caddy. The UI is published directly on ${SI_UI_PORT:-3000}; PostgreSQL and API remain on the internal Docker network.
