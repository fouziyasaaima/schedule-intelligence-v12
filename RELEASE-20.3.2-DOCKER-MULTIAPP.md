# Schedule Intelligence v20.3.2 — Docker Multi-App Ready

## Deployment model

v20.3.2 removes the bundled Caddy runtime from Schedule Intelligence. The application is now designed to run as an independent Docker Compose project behind a central Caddy shared by multiple applications on the Windows Server.

## Preserved

- v20.3.0 Integration Hub functionality
- Existing connector APIs
- REST/OpenAPI connectors
- OAuth/API-key/Bearer/Basic authentication
- Google Sheets integration
- Microsoft 365 integration
- PRMS integration
- Scheduled synchronization
- Incremental sync/cursors
- Webhook event queue
- Retry/dead-letter handling
- Connector health/events/conflict APIs

## Network model

- `si` is the private Schedule Intelligence network.
- `caddy_proxy` is an external shared Docker network.
- API and UI join both networks.
- PostgreSQL remains only on `si`.
- No SI service publishes ports in the base Compose file.
- A testing override exposes UI 3000 and API 4000 on localhost only.

## Windows Server deployment

1. Create the shared network once:

```powershell
docker network create caddy_proxy
```

2. Configure `.env` from `.env.example`.

3. Start SI:

```powershell
docker compose up -d --build
```

4. Configure the central Caddy to route your SI hostname to the SI UI/API containers.

## Testing

```powershell
docker compose -f docker-compose.yml -f docker-compose.testing.yml up -d --build
```

Then open `http://localhost:3000`.

## Important

Do not publish 80/443 from this Compose project. The central Caddy project owns those ports for all applications on the server.
