# Schedule Intelligence v12.2.0 — Connector Studio 2.0 + Beyond Thinking Responsive

## Major release

- Introduced Connector Studio 2.0 with a guided two-lane integration model.
- First-class Google Sheets flow remains account-centric: authorize → browse → worksheet → preview → map → sync.
- Added Universal REST/OpenAPI contract import from a JSON document URL.
- Added operation discovery against real external responses with field inference before mapping.
- Added explicit read/write contract UI and write-gate messaging.
- Added common integration journey language across connectors.
- Strengthened connector error visibility; no connector action intentionally swallows a meaningful failure.
- Preserved encrypted credential storage, tenant isolation, SSRF protection and external identity tracking.
- Kept sync history and write-back opt-in semantics.
- Hardened Gantt context/header persistence while the schedule data viewport scrolls.
- Added a responsive device matrix for desktop, tablet and phone layouts across schedule, connectors and overlays.
- Added touch-friendly controls and controlled horizontal overflow for dense Gantt data rather than destructive column compression.

## New API

- `POST /v1/connectors/:id/openapi/import`
- `POST /v1/connectors/:id/discover`

## Validation

The source tree was syntax-parsed with TypeScript 5.8.3. Docker Desktop remains the authoritative full build/runtime validation environment because this release is intentionally packaged without vendored `node_modules`.
