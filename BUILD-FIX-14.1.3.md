# Schedule Intelligence v14.1.3 — Build Fix

## Fixed
The API `src/mac-service.ts` contained literal `\\n` characters inserted into TypeScript source around the MAC resource-name resolution block. TypeScript reported these as TS1127/TS1434/TS1005 syntax errors.

The affected code has been restored to normal TypeScript line breaks. No scheduling, connector, database, or UI behavior was intentionally changed by this build fix.

## Docker
The Compose file uses the persistent external PostgreSQL volume:

`pg_data`

and exposes the application on:

- UI: `3010`
- API: `4010`
- Mailpit: `8026`

Do not run `docker compose down -v` if the persistent database must be retained.
