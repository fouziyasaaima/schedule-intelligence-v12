# Schedule Intelligence v12.1.0 — Universal Connector & Sync Engine

## Included
- Organization-scoped Connector Manager.
- Generic REST connector with NONE, API key, Bearer, Basic, OAuth2-ready and custom-header authentication contracts.
- Encrypted connector secrets using AES-256-GCM.
- Explicit per-entity operation contracts for list/create/update/delete.
- Visual field mappings for project, task and resource canonical fields.
- Import synchronization with identity preservation via external IDs.
- Configurable outbound task update path: SI only writes back when the connector is BIDIRECTIONAL/EXPORT, a task update operation is explicitly configured, and a matching external identity exists.
- Inbound webhook receiver and webhook endpoint generation.
- Sync run history and visible failures.
- Connector UI integrated into the application rail.

## Safety
- No write endpoint is inferred.
- Connector credentials are never returned to the browser after save.
- Redirects are blocked for outbound connector calls.
- Tenant isolation is enforced.
- Add `CONNECTOR_ENCRYPTION_KEY` to production configuration.

## v12.1 direction
The framework is intentionally provider-neutral so Google Sheets, Microsoft 365/Graph, Jira, PRMS and proprietary REST APIs can use the same connection, discovery, mapping and sync infrastructure.

### OAuth and write validation
- Generic OAuth 2.0 authorization-code flow with encrypted access/refresh token storage.
- Explicit write-operation test endpoint so customers can validate their POST/PUT/PATCH/DELETE contract before enabling outbound sync.

- Scheduled polling sync (15m/30m/hourly/daily) and optional outbound webhook event channel.
- SSRF protections block absolute operation URLs and private/local destinations.

- Google Sheets and Microsoft 365 provider presets preconfigure OAuth endpoints/scopes and API base URLs; users still supply their own OAuth app credentials and resource endpoints.
- OAuth client-credentials flow obtains and caches access tokens.
