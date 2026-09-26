# Schedule Intelligence 12.5.2

## Stable Docker PostgreSQL Volume

- PostgreSQL now uses the fixed Docker named volume `pg_data`.
- The volume name is independent of the application/release version or Compose project folder.
- Future Schedule Intelligence releases should continue using `pg_data` so application upgrades do not create version-specific database volumes.
- No existing Docker volumes are deleted or migrated automatically by this release.

## Upgrade safety

Before first startup, identify the existing PostgreSQL volume that contains the desired data. Do not run `docker compose down -v` or `docker volume prune`.

If starting with a new database is intentional, Compose will create `pg_data` automatically.
