# Schedule Intelligence v13.0.0 — BEYOND

MAC intent-driven scheduling, evidence validation, reversible change sets, unified PRMS hierarchy/resource mapping, and the Schedule Intelligence control plane.

## v13.0.0 — BEYOND

This major release upgrades MAC from a question/analysis assistant into an intent-driven scheduling engine. Users can provide natural-language scheduling requirements; MAC receives minimized project evidence, produces a bounded change set, validates task/resource references and schedule constraints, and keeps recommended changes separate from the live schedule until explicitly approved. Autonomous mode remains policy-gated.

### Safety contract

- Deterministic scheduling remains the source of truth.
- PRMS hierarchy (`E_ID_Dependance` / `E_Id`) is structural `parentId`, not a predecessor dependency.
- PRMS Events + Actions are merged into one project graph.
- Event resources use `E_Leader` + `Initial_Member`; Action resources use `ID_Member` + `AssignedTo`.
- Actual dates are read-only to MAC.
- Manual schedule anchors are preserved.
- AI proposals are confidence-gated, reference-validated and cycle-safe.
- Recommended change sets require explicit Apply; applied sets can be rolled back.
- AI provider keys and PRMS credentials remain server-side.
- AI calls are budget-gated and cached where safe.



Enterprise schedule intelligence with a deterministic Gantt, dependency network, resource intelligence, probabilistic forecast, scenarios, recovery recommendations and organization-scoped Developer API.

## Local-first deployment

The same Docker Compose architecture is intended for Docker Desktop and Linux/DigitalOcean. The browser uses a same-origin `/api` Next.js proxy to the internal API, which keeps HttpOnly sessions reliable across localhost and production.

See `START-HERE.md`, `BUILD-AND-DEPLOY.md` and `SMOKE-TEST.md`.

Product identity shown in the UI: **Schedule Intelligence**.

## Universal Connectors Studio · v12.2

Schedule Intelligence now includes a provider-neutral integration and synchronization layer. A connector can use OAuth 2.0, API key, Bearer token, Basic Auth, custom headers, inbound webhooks, scheduled polling, or explicit user-defined REST operations.

The connector never assumes the external application's schema. Users define the read operations, write operations, field mappings, identity mapping, synchronization direction, target project, and conflict behavior. Write-back is opt-in and requires an explicit POST/PUT/PATCH/DELETE operation plus a successful write validation before it can be used by outbound task synchronization.

Google Sheets is a first-class connector: authorize the Google account, browse accessible spreadsheets, select a worksheet, preview live values, detect header columns, map those columns to SI task fields, import rows into a target project, and optionally write configured task fields back to the selected sheet. The Google connector uses the Sheets scope plus Drive metadata read-only access for spreadsheet discovery. Microsoft 365/Graph keeps the OAuth/base-URL preset, while proprietary systems use the same Generic REST connector. Connector secrets are encrypted with `CONNECTOR_ENCRYPTION_KEY` and are never returned to the browser.


## Connector Studio 2.0 · v12.2

The integration layer now follows a two-lane model: first-class connectors hide protocol details behind **Connect → Discover → Preview → Map → Validate → Sync**, while Universal REST/OpenAPI connectors provide a guided contract builder for proprietary applications. OpenAPI JSON contracts can be imported into explicit operations, real API responses can be discovered before mapping, and read/write capabilities remain independently gated. Google Sheets keeps its first-class account browser, live worksheet preview, header detection and field mapping.

The connector boundary is intentionally stronger than a simple API client: credentials are encrypted, destinations are SSRF-guarded, external identities are persisted, write operations require explicit configuration and testing, synchronization runs are recorded, and failures surface through the application's notification system.

## Beyond Thinking responsive contract

The Gantt context is persistent while task/timeline data scrolls, the application chrome remains visible, and the workspace uses a device matrix for desktop, tablet and phone widths. Narrow screens preserve the schedule's two-pane nature through controlled horizontal scrolling rather than crushing date controls and task names into unusable columns. Connector Studio, Intelligence, Resource Orbit, Network and modal surfaces are also hardened for touch-sized viewports.


## v12.2.7 Connector Intelligence

The universal connector supports configurable API-key placement/prefix, bearer header customization, encrypted custom headers/query parameters, per-operation request settings, bounded page/cursor pagination, and base-URL connection testing while retaining native Google/Microsoft experiences.

## v12.2.5 OAuth setup fix

First-class Google Sheets and Microsoft 365 connectors now collect the OAuth client ID/secret during connection setup and display the exact redirect URI to register with the provider. The UI supports a configurable `NEXT_PUBLIC_APP_URL` so OAuth redirect URIs remain stable in Docker and production.


## Connector OAuth smoke test
See `CONNECTOR-OAUTH-SMOKE-12.2.5.md` for Google Sheets, Microsoft 365 / Excel, REST OAuth and negative-path verification.
