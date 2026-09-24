# Connector OAuth Smoke Test — v12.2.3

This release hardens the first-class OAuth path for Google Sheets and Microsoft 365 / Excel, plus universal REST OAuth.

## Local Docker callback

Open the application from exactly one browser origin and keep that origin consistent:

`http://localhost:3000`

The callback shown by Connector Studio will be:

`http://localhost:3000/api/v1/connectors/oauth/callback`

Do not switch between `localhost` and `127.0.0.1` during an OAuth test unless both redirect URIs are registered with the provider.

## Google Sheets

1. Connector Studio → Connect application → Google Sheets.
2. Create the connection. OAuth credentials are no longer required to create the connector.
3. Open the connection → Overview → Provider OAuth setup.
4. Enter the Google Web OAuth client ID and client secret.
5. Copy the exact redirect URI displayed by SI into the Google OAuth client.
6. Save OAuth setup.
7. Click Connect account. The popup is opened synchronously to avoid browser popup blocking.
8. Complete Google consent.
9. The popup reports success/failure and closes; the parent window refreshes the connector state.
10. Open Data → Refresh and confirm spreadsheets are listed.

## Microsoft 365 / Excel

1. Connector Studio → Connect application → Microsoft 365 / Excel.
2. Create the connection.
3. Overview → Provider OAuth setup.
4. Enter the Microsoft Entra Application (client) ID and client secret.
5. Register the exact displayed redirect URI under the application's **Web** redirect URIs.
6. Save OAuth setup.
7. Click Connect account and complete Microsoft consent.
8. Open Data → Refresh and confirm `.xlsx` workbooks are listed.

Default delegated scopes in v12.2.3:

`User.Read Files.ReadWrite offline_access`

## Universal REST / Proprietary API

Validate each auth mode separately:

- API key
- Bearer token
- Basic authentication
- OAuth 2.0 Authorization Code
- OAuth 2.0 Client Credentials
- Custom headers

For Authorization Code OAuth, verify that the provider's redirect URI exactly matches the URI configured in the connector.

## Negative tests

- Deny provider consent → the popup displays a readable error and the parent shows an error notification.
- Remove/alter the provider redirect URI → provider error is visible; no silent failure.
- Block browser popups → SI reports that the authorization window was blocked.
- Save an existing connector from `127.0.0.1` while it was created on `localhost` → SI updates the stored callback to the current browser origin before authorization; the provider console must still contain that exact URI.
- Missing client secret → Connect account remains unavailable until OAuth setup is completed.

## Security checks

- Client secrets are encrypted at rest.
- Connector GET responses do not return encrypted secret material.
- OAuth state is short-lived and single-use.
- OAuth endpoints and configured redirect/token URLs are validated.
- External API writes remain disabled unless explicitly configured, mapped and tested.
