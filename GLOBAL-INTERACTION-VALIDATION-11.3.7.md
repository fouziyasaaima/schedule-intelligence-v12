# Schedule Intelligence v11.3.7 — Global Interaction Validation & Notification

## Product rule
No meaningful user action should fail silently. Every API-backed operation communicates processing through its existing busy state and then success, warning/validation, or failure through contextual UI and the global notification center.

## Global layer
- Application-wide notification center.
- Success notifications for API mutations with action-aware labels.
- Validation/server-error notifications for failed API requests.
- Network and timeout notifications.
- Notifications are capped at four visible items and auto-dismiss; errors remain longer.
- Existing local error panels remain where they provide richer context.

## Coverage
The interaction contract applies across Gantt/task editing, dependencies, schedule recomputation, Monte Carlo/forecast, impact, recovery, scenarios, resources, history, project/task mutations, and future connector import/sync/publish flows.

## Large-data visualization principle
Visualization surfaces should aggregate and progressively disclose large datasets rather than rendering unbounded raw data. Network, Pulse, Resource Orbit and Monte Carlo should expose summary signals first, then drill down to the material drivers. Loading, empty, stale, partial-data and error states must be explicit.

## Architecture rule
UI validation improves user feedback, but the API remains authoritative for scheduling, dependency integrity, authorization and data validation.
