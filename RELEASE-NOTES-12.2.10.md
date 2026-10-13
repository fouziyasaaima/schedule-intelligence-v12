# Schedule Intelligence 12.2.10

- Structural Gantt header fix: timeline header is outside the vertical scrollport and horizontally follows the task canvas.
- Gantt task-row separators changed from near-black to neutral grey.
- PRMS endpoint safely defaults to `/api/projects` and recovers older connectors missing `config.prms.endpoint`.
- PRMS create/update normalization keeps endpoint/method configuration consistent.
- Google OAuth popup errors now propagate to the parent UI and refresh connector health.
