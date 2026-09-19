# PRMS Connector 12.2.9

The PRMS provider performs a server-side two-stage authentication flow.

1. POST `PRMS_TOKEN_URL` with `Authorization: Bearer PRMS_BEARER_TOKEN`.
2. JSON body: `{ "ClientId": PRMS_CLIENT_ID, "ClientSecret": PRMS_CLIENT_SECRET }`.
3. Extract `accessToken` from the JSON response.
4. Call the configured relative PRMS endpoint with `Authorization: Bearer <accessToken>`.
5. Cache the returned token in API memory. JWT `exp` is honored when available; otherwise `PRMS_TOKEN_CACHE_SECONDS` is used. A 401 causes one token refresh and one retry.

The bootstrap bearer token and client credentials never leave the API process. The returned access token is not persisted in the connector database.

## Local Google OAuth

The callback is served through the UI `/api` rewrite and reaches the API route at `/v1/connectors/oauth/callback`. The exact browser origin is used for the redirect URI. Google requires an exact redirect URI match; `http://localhost:<port>/api/v1/connectors/oauth/callback` is valid for local development, but it must be registered on the Google Web application OAuth client.

The Google APIs used by the native connector are Drive file metadata and Sheets. Enable both APIs in the Google Cloud project and configure the OAuth consent screen/scopes as required by the Google project.
