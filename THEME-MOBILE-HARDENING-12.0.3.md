# Schedule Intelligence v12.0.3 — Theme & Mobile Hardening

## Scope
Application-wide light/dark theme parity and mobile responsiveness.

## Theme contract
Interactive surfaces are checked for normal, hover, active, selected, disabled, loading, success, warning and error states. Light-mode equivalents were added for navigation, Gantt, dependency UI, Network, Pulse, Resource Orbit, Forecast/Monte Carlo, Impact, Recovery, Intelligence, API documentation controls, dialogs and notifications.

## Mobile contract
- Navigation rail becomes a full-height drawer and no longer consumes content width.
- Schedule workspace stacks task list above the horizontally scrollable Gantt timeline.
- Intelligence, Pulse, Network and Resource Orbit reflow for narrow screens.
- Forecast, Impact, Recovery and dependency composers fit within the viewport.
- Command palette and notifications remain within viewport bounds.
- Touch targets are kept usable on coarse pointers.
- Next.js viewport metadata uses device width and safe-area support.

## Large-data behavior retained
Server-side aggregation and Gantt containment from v11.4 remain unchanged.
