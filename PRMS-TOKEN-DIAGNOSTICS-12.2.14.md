# PRMS Token Diagnostics 12.2.14

- Preserve the PRMS authentication contract: POST `PRMS_TOKEN_URL`, `Authorization: Bearer PRMS_BEARER_TOKEN`, JSON `{ ClientId, ClientSecret }`, extract `accessToken`.
- Include the exact configured token URL and a truncated, non-secret server response in PRMS token failures so 404/401/403/500 responses can be diagnosed without exposing credentials.
- Expose the configured token URL in the PRMS configuration status UI.
- No token, client secret, or bootstrap bearer value is returned to the browser.
