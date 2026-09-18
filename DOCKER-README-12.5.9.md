# Schedule Intelligence 12.5.9 — Docker test ports

This release intentionally uses fixed host ports so old `.env` values cannot override the Docker bindings:

- UI: `http://localhost:3010` -> container `3000`
- API: `http://localhost:4010` -> container `4000`
- Mailpit: `http://localhost:8026` -> container `8025`
- PostgreSQL: internal Docker network only
- PostgreSQL volume: external permanent Docker volume `pg_data`

Old version-specific Compose port variables are ignored by these bindings.

Do not use `docker compose down -v` because `pg_data` is persistent.
