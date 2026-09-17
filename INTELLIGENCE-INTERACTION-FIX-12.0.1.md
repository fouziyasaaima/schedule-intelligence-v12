# v12.0.1 — Intelligence Interaction Fix

Fixed cross-view navigation so Intelligence, Forecast/Monte Carlo, Network, Pulse, Impact and Resource views do not leave stale overlays mounted.

## Changes
- Selecting a rail view now closes incompatible overlays before opening the requested view.
- Intelligence forecast area now has an explicit **Run/Open Monte Carlo** action.
- Intelligence hotspot selection returns the user to the schedule with the selected task.
- Top Forecast action reliably opens Monte Carlo even after visiting Intelligence.
- Preserved existing server-side intelligence aggregation and v12.0 functionality.
