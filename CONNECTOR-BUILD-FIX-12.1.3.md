# Connector Build Fix — v12.1.3

This release fixes the TypeScript `TS18046: data is of type unknown` failures in the connector OAuth token exchanges.

## Fixes
- Treat OAuth token responses as validated JSON objects instead of accessing `Response.json()` as an implicit object.
- Validate `access_token` before storing it.
- Block redirects from OAuth token endpoints.
- Apply the same SSRF/private-network protection to OAuth token endpoints as connector API endpoints.
- Reuse the generated encrypted credential ciphertext rather than encrypting the same token twice.
- Align API and UI package versions to `12.1.3`.

## Docker validation
Build from the package root with:

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps
```

Do not use `docker compose down -v`; the existing PostgreSQL volume should be preserved.
