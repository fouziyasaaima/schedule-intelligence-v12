# v12.2.12 — PRMS + Gantt + Theme Hardening

- PRMS endpoint belongs to connector config; `/api/projects` is the safe fallback for legacy connections.
- PRMS token flow: POST token URL with bootstrap Bearer + ClientId/ClientSecret JSON; extract `accessToken`; use it for the configured API endpoint.
- Removed Docker Compose dependency on `PRMS_API_ENDPOINT`.
- Improved PRMS errors and one-time 401 token refresh.
- Added global theme bootstrap so direct `/api-docs` navigation honors light/dark preference before paint.
- Added full light-theme parity for API documentation, including code blocks, sidebar, endpoint cards and security panels.
- Gantt header viewport is structurally outside the vertical scrollport.
- Gantt row separators use neutral grey.
- Connector load/test/sync errors are surfaced instead of silently swallowed.
