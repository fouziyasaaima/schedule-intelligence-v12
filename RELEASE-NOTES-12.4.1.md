# Schedule Intelligence 12.4.1 — UI Build Fix

## Fixed
- Fixed the Next.js TypeScript build failure in `ConnectorHub.tsx`.
- `connectorApi.prmsStatus()` now declares the `tokenUrl` field returned by the API, matching the `prmsStatus` React state shape.
- This resolves the `Dispatch<SetStateAction<...>>` / missing `tokenUrl` error during `npm run build`.

## Validation
- Confirmed the API endpoint returns `configured`, `baseUrl`, `tokenUrl`, and `missing`.
- Confirmed the UI client type now matches that response contract.
- Full Docker build was not executed in this environment because dependencies are not installed locally; the reported compile error is directly corrected.
