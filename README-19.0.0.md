# Schedule Intelligence 19.0.0

## Hybrid Autonomous Scheduling Engine

This release is based on Schedule Intelligence v18.1.1 and advances the product toward a deterministic scheduling core with an optional MAC intelligence/action layer.

### Core principles
- SI scheduling never depends on MAC availability.
- Invalid schedule mutations are transactionally rejected and rolled back.
- Start Date/Time + Duration are first-class scheduling inputs.
- General Schedule Excel export is one simple user-facing sheet.
- Advanced SISF remains available separately for technical workflows.
- MAC is contextual across the major SI modules but does not own the deterministic schedule calculation.
- Large schedules are summarized/materialized before MAC reasoning so the authoritative graph remains in SI.
- PRMS publishing remains independently usable and continues to ask for the explicit destination Project ID.

### Version
UI, API package metadata, Docker UI build argument and API health/readiness now report/use **19.0.0**.

### Docker
Run from this directory:

```powershell
docker compose build --no-cache
docker compose up -d
```

Then verify:

```powershell
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 ui
```

The API readiness endpoint is available through the API container and reports the release version.
