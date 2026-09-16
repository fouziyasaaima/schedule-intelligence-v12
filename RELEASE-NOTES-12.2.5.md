# Schedule Intelligence v12.2.5 — Connector Studio Release Candidate

## Release hardening
- Root-level Docker Compose entry point.
- Docker build contexts use explicit repository-root-relative paths.
- API and UI package versions aligned to 12.2.5.
- Preserves Connector Studio OAuth hardening and Next.js prerender fixes from v12.2.4.
- Intended to eliminate fragile `../../ui/...` Compose path resolution.

## Run
From the release root:

```powershell
docker compose build --no-cache
docker compose up -d
```
