# PRMS Endpoint Fix — 12.2.11

PRMS API endpoints are connector configuration, not a required environment variable.

Examples: `/api/portfolios`, `/api/projects`, `/api/events`.

The API uses `PRMS_API_BASE_URL` as the base URL and the endpoint saved on the PRMS connector. The obsolete `PRMS_API_ENDPOINT` dependency has been removed.
