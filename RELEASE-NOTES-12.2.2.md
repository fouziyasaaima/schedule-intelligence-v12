# Schedule Intelligence v12.2.3 — Connector OAuth Reliability

## Fixed
- First-class Google Sheets and Microsoft 365 connection creation no longer blocks on OAuth client credentials. Provider OAuth setup is completed after creation.
- OAuth authorization opens a popup synchronously before the API request, preventing browser popup blockers from silently stopping the flow.
- The current browser origin is persisted as the exact OAuth callback URI before authorization, preventing stale build-time redirect URIs from causing `redirect_uri_mismatch`.
- Existing connectors can repair their callback URI without recreation.
- OAuth callback failures now render a human-readable error page and notify the parent Schedule Intelligence window.
- Microsoft 365 default delegated scopes now include `User.Read`, `Files.ReadWrite`, and `offline_access`.
- Provider-neutral messaging replaces Google-only authorization messaging.

## Security
- OAuth client secrets remain encrypted at rest and are never returned by the connector API.
- OAuth state remains short-lived and single-use.
- OAuth endpoints and redirect URIs are validated before use.

## Provider coverage
- Google Sheets — Authorization Code OAuth, spreadsheet discovery, worksheet preview, mapping, import/write-back.
- Microsoft 365 / Excel — Authorization Code OAuth, workbook discovery, worksheet preview, mapping, import/write-back.
- REST / OpenAPI — API key, bearer, basic, OAuth Authorization Code, OAuth Client Credentials, contract discovery, mapping, controlled writes.
- Proprietary API — same universal REST contract and security boundary.
