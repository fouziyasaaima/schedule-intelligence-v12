# Schedule Intelligence v12.1.4 — Google Sheets First-Class Connector

## What changed

- Google Sheets is now a first-class connector instead of a generic REST preset.
- OAuth Authorization Code flow requests offline access and persists refresh-token/expiry metadata.
- Expired Google access tokens are refreshed automatically when a refresh token is available.
- Google Drive metadata is used to browse spreadsheets available to the authorized account.
- Google Sheets metadata is loaded to show worksheets/tabs and grid dimensions.
- Users can preview real worksheet values using A1 ranges.
- The first worksheet row can be treated as the header row.
- Detected headers can be mapped directly to Schedule Intelligence task fields.
- Selected spreadsheet, worksheet, range and header-row configuration is persisted in the connector JSON configuration; no schema migration is required.
- Google Sheet synchronization imports mapped rows into the selected SI project and preserves external identity.
- Optional `resourceExternalId` mapping can resolve a previously imported resource and create the task assignment.
- Google connector testing validates the selected spreadsheet/worksheet instead of requiring a generic REST operation.
- Existing generic REST, Microsoft 365 and proprietary connector flows remain available.

## Google Cloud scopes

The Google preset uses:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.metadata.readonly`

The Drive metadata scope is needed to browse spreadsheet files; the Sheets scope is used to inspect and read worksheet values.

## Local callback

The UI defaults the OAuth redirect URI to:

`http://localhost:3000/api/v1/connectors/oauth/callback`

For the production deployment, replace this with the public Schedule Intelligence callback URL and register that exact URI in Google Cloud.
