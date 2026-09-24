# Schedule Intelligence v13 — Docker notes

## Stable PostgreSQL volume

v13 uses a fixed Docker volume named `pg_data`, independent of the Compose project/version name.

If this machine already has the data volume, start normally:

```powershell
docker compose up -d
```

For a fresh machine, create it once:

```powershell
docker volume create pg_data
docker compose up -d
```

Do **not** run `docker compose down -v` if you want to preserve PostgreSQL data. The `-v` flag is specifically intended to remove Compose-managed volumes.

## Port isolation

The demo defaults remain isolated from common earlier builds:

- UI: `3010`
- API: `4010`
- Mailpit: `8026`

If a port is occupied, change only the host side of the mapping in `.env`/Compose rather than changing the internal service ports.
